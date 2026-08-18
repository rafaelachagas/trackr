import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { RASTREADOR_URL, RASTREADOR_APIKEY } from '@/lib/rastreador'

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

      await supabaseAdmin.from('rastreador_snapshots').insert({
        biblioteca_id: b.id,
        total: j.stats?.encontrados ?? (j.criativos?.length ?? 0),
        duplicacoes: j.stats?.duplicacoes ?? 0,
        idade_media: j.stats?.idade_media_dias ?? null,
        criativos: j.criativos ?? [],
      })
      await supabaseAdmin.from('rastreador_bibliotecas')
        .update({ ultima_puxada: new Date().toISOString(), page_name: j.criativos?.[0]?.page_name ?? b.page_name })
        .eq('id', b.id)
      resultados.push({ page_id: b.page_id, ok: true, total: j.stats?.encontrados ?? 0 })
    } catch (e: any) {
      resultados.push({ page_id: b.page_id, ok: false, erro: e.message })
    }
  }

  return NextResponse.json({ ok: true, processadas: resultados.length, resultados })
}
