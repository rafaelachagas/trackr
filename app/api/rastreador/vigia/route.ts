import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { capturarPaginaCore, urlDominante, atualizarDiarioAb, coletarVariacoes } from '@/lib/vigia-pagina'
import { registrarAlerta } from '@/lib/alertas'
import { broadcastAlerta } from '@/lib/whatsapp-send'

// Vigia de páginas 24/7 — roda de hora em hora (vercel.json) e, pra cada
// concorrente rastreado com landing_url cadastrada:
//   1. Recaptura a página de vendas e versiona se mudou (headline, vídeo,
//      preços, design/estrutura) → alerta no painel + WhatsApp.
//   2. Compara a URL de destino dominante dos anúncios entre os dois últimos
//      snapshots → se trocaram de página/funil, alerta também.
// Só leitura nas páginas dos concorrentes; escrita apenas nas tabelas do
// rastreador. Se nada mudou, não grava nem alerta nada.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: bibs, error } = await supabaseAdmin
    .from('rastreador_bibliotecas')
    .select('id, org_id, page_id, page_name, nome_custom, landing_url')
    .eq('ativo', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados: any[] = []
  for (const b of bibs ?? []) {
    const nome = b.nome_custom?.trim() || b.page_name?.trim() || `Página ${b.page_id}`
    const r: any = { biblioteca: nome }

    // Sem landing_url cadastrada? Adota a URL de destino dominante dos
    // anúncios do último snapshot — o vigia começa a trabalhar sozinho.
    if (!b.landing_url) {
      try {
        const { data: ultimo } = await supabaseAdmin
          .from('rastreador_snapshots').select('criativos')
          .eq('biblioteca_id', b.id).order('puxado_em', { ascending: false }).limit(1).maybeSingle()
        const dominante = urlDominante((ultimo as any)?.criativos ?? [])
        if (dominante) {
          await supabaseAdmin.from('rastreador_bibliotecas').update({ landing_url: dominante }).eq('id', b.id)
          b.landing_url = dominante
          r.landingAdotada = dominante
        }
      } catch { /* segue sem página */ }
    }

    // ---- 1) Página de vendas: recaptura + diff ----
    if (b.landing_url) {
      try {
        const cap = await capturarPaginaCore(b.org_id, b.id)
        r.pagina = cap.success ? (cap.mudou ? 'mudou' : 'igual') : `erro: ${cap.error}`
        if (cap.success && cap.mudou && cap.resumo && cap.resumo !== 'Primeira captura da página.') {
          const { novo } = await registrarAlerta({
            orgId: b.org_id,
            tipo: 'pagina_mudou',
            chave: `${b.id}:${cap.hash}`,
            titulo: `${nome} mudou a página de vendas`,
            mensagem: cap.resumo,
            severidade: 'atencao',
            enviarWhats: false,
          }).catch(() => ({ novo: false }))
          if (novo) {
            await broadcastAlerta(
              `🎥 *${nome} mudou a página de vendas*\n\n${cap.resumo}\n\n${cap.url}\n\nAs versões (antes/depois) estão no Rastreador → Inteligência.`
            ).catch(() => {})
          }
        }
        // Diário de teste A/B: lê o estado do split VTurb e registra
        // eventos (início, nova rodada, ajuste de peso e — o principal —
        // teste encerrado quando sobra 1 vencedora a 100%).
        try {
          const html = await fetch(b.landing_url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } }).then((x) => x.text())
          const ev = await atualizarDiarioAb(b.org_id, b.id, html, new Date().toISOString(), b.landing_url)
          if (ev) {
            r.diario = ev.tipo
            const { novo } = await registrarAlerta({
              orgId: b.org_id, tipo: 'pagina_mudou', chave: `${b.id}:ab:${ev.em}`,
              titulo: `${nome}: ${ev.titulo}`, mensagem: ev.detalhe, severidade: 'atencao', enviarWhats: false,
            }).catch(() => ({ novo: false }))
            if (novo && ev.tipo === 'ab_encerrado') {
              await broadcastAlerta(`🏆 *${nome} encerrou um teste A/B*\n\n${ev.detalhe}\n\nO vídeo vencedor está no diário do concorrente (Rastreador → Inteligência → Página & VSL).`).catch(() => {})
            }
          }
        } catch { /* diário A/B é best-effort */ }

        // Variações da página (prints) — acumula o que estiver no ar agora. O
        // A/B rotaciona por tempo, então cada rodada horária pode pegar uma
        // variante nova que vai pra galeria.
        try {
          const cv = await coletarVariacoes(b.org_id, b.id, b.landing_url, new Date().toISOString(), 4)
          if (cv.novas > 0) r.variacoesNovas = cv.novas
        } catch { /* best-effort */ }
      } catch (e: any) {
        r.pagina = `erro: ${e.message}`
      }
    } else {
      r.pagina = 'sem landing_url'
    }

    // ---- 2) URL de destino dominante dos anúncios (trocaram de funil?) ----
    try {
      const { data: snaps } = await supabaseAdmin
        .from('rastreador_snapshots').select('criativos, puxado_em')
        .eq('biblioteca_id', b.id).order('puxado_em', { ascending: false }).limit(2)
      if (snaps && snaps.length === 2) {
        const atual = urlDominante((snaps[0] as any).criativos ?? [])
        const anterior = urlDominante((snaps[1] as any).criativos ?? [])
        r.urlAnuncios = atual
        if (atual && anterior && atual !== anterior) {
          const { novo } = await registrarAlerta({
            orgId: b.org_id,
            tipo: 'pagina_url',
            chave: `${b.id}:${atual}`,
            titulo: `${nome} trocou a URL de destino dos anúncios`,
            mensagem: `Antes: ${anterior} · Agora: ${atual}`,
            severidade: 'atencao',
            enviarWhats: false,
          }).catch(() => ({ novo: false }))
          if (novo) {
            await broadcastAlerta(
              `🔀 *${nome} trocou a URL de destino dos anúncios*\n\nAntes: ${anterior}\nAgora: ${atual}\n\nPode ser página nova, funil novo ou teste A/B.`
            ).catch(() => {})
          }
        }
      }
    } catch { /* snapshot indisponível não derruba a rodada */ }

    resultados.push(r)
  }

  return NextResponse.json({ ok: true, processadas: resultados.length, resultados })
}
