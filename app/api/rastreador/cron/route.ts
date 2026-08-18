import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { RASTREADOR_URL, RASTREADOR_APIKEY } from '@/lib/rastreador'
import { registrarNovidade } from '@/app/actions/rastreador'
import { foldHistoricoAoVivo } from '@/app/actions/rastreador-intel'
import { registrarAlerta } from '@/lib/alertas'
import { CLASSIFICACAO_META } from '@/lib/rastreador-intel'

// Re-puxa automaticamente as bibliotecas agendadas e salva um snapshot pra
// acompanhar a evolução ao longo do tempo. Roda via cron (vercel.json).
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function fetchTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t))
}

export async function GET(request: NextRequest) {
  // Auth: Vercel cron manda o header; aceitamos também ?key=CRON_SECRET.
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!RASTREADOR_APIKEY) {
    return NextResponse.json({ error: 'RASTREADOR_APIKEY não configurada' }, { status: 500 })
  }

  const { data: bibs, error } = await supabaseAdmin
    .from('rastreador_bibliotecas')
    .select('*')
    .eq('ativo', true)
    .not('freq_dias', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agora = Date.now()
  const devidas = (bibs ?? []).filter((b: any) => {
    if (!b.ultima_puxada) return true
    const dias = (agora - new Date(b.ultima_puxada).getTime()) / 86400000
    return dias >= (b.freq_dias ?? 999)
  })

  const resultados: any[] = []
  for (const b of devidas) {
    try {
      const alvo = `${RASTREADOR_URL}/scrape?page_id=${b.page_id}&key=${encodeURIComponent(RASTREADOR_APIKEY)}`
      const r = await fetchTimeout(alvo, 115000)
      const j = await r.json().catch(() => null)
      if (!j || j.error) { resultados.push({ page_id: b.page_id, ok: false, erro: j?.error ?? 'sem resposta' }); continue }

      // Snapshot anterior (base pra detectar anúncios novos).
      const { data: anterior } = await supabaseAdmin
        .from('rastreador_snapshots').select('criativos')
        .eq('biblioteca_id', b.id).order('puxado_em', { ascending: false }).limit(1).maybeSingle()

      await supabaseAdmin.from('rastreador_snapshots').insert({
        biblioteca_id: b.id,
        total: j.stats?.encontrados ?? (j.criativos?.length ?? 0),
        duplicacoes: j.stats?.duplicacoes ?? 0,
        idade_media: j.stats?.idade_media_dias ?? null,
        criativos: j.criativos ?? [],
      })

      const nomeDisplay = (b.nome_custom?.trim() || b.page_name?.trim() || j.criativos?.[0]?.page_name || `Página ${b.page_id}`)
      await registrarNovidade(b.org_id, b.id, nomeDisplay, anterior?.criativos ?? null, j.criativos ?? [])

      // Atualiza o histórico por criativo e detecta o que saiu do ar.
      const fold = await foldHistoricoAoVivo(b.id, j.criativos ?? [])

      // Push no painel de novidade (anúncio novo do concorrente) via WhatsApp também.
      if (anterior && (fold.novos?.length ?? 0) > 0) {
        await registrarAlerta({
          orgId: b.org_id, tipo: 'concorrente_novo', chave: `${b.id}:${new Date().toISOString().slice(0, 10)}`,
          titulo: `${nomeDisplay} subiu ${fold.novos!.length} novo(s) anúncio(s)`,
          mensagem: `A biblioteca ${nomeDisplay} tem ${fold.novos!.length} criativo(s) novo(s) no ar. Vale conferir o ângulo.`,
          severidade: 'info',
        }).catch(() => {})
      }

      // Alerta de campeão removido: criativo que ficou 7+ dias no ar e saiu.
      if (anterior && (fold.removidos?.length ?? 0) > 0) {
        const { data: rows } = await supabaseAdmin
          .from('rastreador_criativos_hist')
          .select('ad_archive_id, headline, dias_no_ar, classificacao')
          .eq('biblioteca_id', b.id).in('ad_archive_id', fold.removidos!)
        for (const r of rows ?? []) {
          if ((r.dias_no_ar ?? 0) < 7) continue // não passou no teste: não alerta
          const cl = CLASSIFICACAO_META[(r.classificacao as keyof typeof CLASSIFICACAO_META)] ?? null
          const rotulo = cl ? cl.label : r.classificacao
          await registrarAlerta({
            orgId: b.org_id, tipo: 'concorrente_removido', chave: `${b.id}:${r.ad_archive_id}`,
            titulo: `${nomeDisplay} tirou um criativo do ar`,
            mensagem: `Um criativo "${rotulo}" ficou ${r.dias_no_ar} dias no ar e saiu${(r.headline ? `:\n"${String(r.headline).slice(0, 120)}"` : '.')}\nPode ser fadiga ou troca de estratégia.`,
            severidade: (r.dias_no_ar ?? 0) >= 30 ? 'atencao' : 'info',
          }).catch(() => {})
        }
      }

      await supabaseAdmin.from('rastreador_bibliotecas')
        .update({ ultima_puxada: new Date().toISOString(), page_name: j.criativos?.[0]?.page_name ?? b.page_name })
        .eq('id', b.id)
      resultados.push({ page_id: b.page_id, ok: true, total: j.stats?.encontrados ?? 0, novos: fold.novos?.length ?? 0, removidos: fold.removidos?.length ?? 0 })
    } catch (e: any) {
      resultados.push({ page_id: b.page_id, ok: false, erro: e.message })
    }
  }

  return NextResponse.json({ ok: true, processadas: resultados.length, resultados })
}
