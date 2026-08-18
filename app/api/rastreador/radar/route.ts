import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { RASTREADOR_URL, RASTREADOR_APIKEY } from '@/lib/rastreador'

// Radar de novos concorrentes: para cada termo/nicho cadastrado, busca
// anúncios novos na Meta Ad Library (via VPS) e registra páginas que ainda
// NÃO estão na sua lista de tracking. Roda via cron ou botão manual.
//
// OBS: depende do VPS expor um endpoint de busca por palavra
// (GET /search?q=...). Se ainda não existir, a rota retorna
// { ok:false, precisaSetup:true } sem quebrar nada.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function fetchTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t))
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  // Aceita cron (secret) OU chamada logada do app (sem secret configurado exige nada).
  if (secret && auth !== `Bearer ${secret}` && key !== secret && request.nextUrl.searchParams.get('manual') !== '1') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!RASTREADOR_APIKEY) return NextResponse.json({ error: 'RASTREADOR_APIKEY não configurada' }, { status: 500 })

  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const orgId = org?.id
  if (!orgId) return NextResponse.json({ error: 'org não encontrada' }, { status: 500 })

  const { data: termos } = await supabaseAdmin
    .from('rastreador_radar_termos').select('*').eq('org_id', orgId).eq('ativo', true)
  if (!termos || termos.length === 0) return NextResponse.json({ ok: true, achados: 0, msg: 'Nenhum termo ativo.' })

  // Páginas que já estão sendo rastreadas (pra não sugerir de novo).
  const { data: jaTrack } = await supabaseAdmin.from('rastreador_bibliotecas').select('page_id').eq('org_id', orgId)
  const conhecidos = new Set((jaTrack ?? []).map((b: any) => String(b.page_id)))

  let inseridos = 0
  let precisaSetup = false
  const resultados: any[] = []

  for (const termo of termos) {
    try {
      const url = `${RASTREADOR_URL}/search?q=${encodeURIComponent(termo.termo)}&country=${encodeURIComponent(termo.pais || 'BR')}&key=${encodeURIComponent(RASTREADOR_APIKEY)}`
      const r = await fetchTimeout(url, 60000)
      if (r.status === 404) { precisaSetup = true; resultados.push({ termo: termo.termo, ok: false, motivo: 'VPS sem /search' }); continue }
      const j = await r.json().catch(() => null)
      // Formato esperado: { paginas: [{ page_id, page_name, amostra, qtd }] }
      const paginas: any[] = j?.paginas ?? j?.pages ?? (Array.isArray(j) ? j : [])
      if (!Array.isArray(paginas)) { resultados.push({ termo: termo.termo, ok: false, motivo: 'resposta inesperada' }); continue }

      let novosDoTermo = 0
      for (const p of paginas) {
        const pageId = String(p?.page_id ?? p?.id ?? '').trim()
        if (!pageId || conhecidos.has(pageId)) continue
        const { error } = await supabaseAdmin.from('rastreador_radar_achados').upsert({
          org_id: orgId, termo_id: termo.id, page_id: pageId,
          page_name: p?.page_name ?? p?.name ?? null,
          amostra_texto: (p?.amostra ?? p?.headline ?? p?.body ?? null)?.toString().slice(0, 300) ?? null,
          qtd_anuncios: Number(p?.qtd ?? p?.count ?? 0) || 0,
          status: 'novo',
        }, { onConflict: 'org_id,page_id', ignoreDuplicates: true })
        if (!error) { inseridos++; novosDoTermo++ }
      }
      await supabaseAdmin.from('rastreador_radar_termos').update({ ultima_busca: new Date().toISOString() }).eq('id', termo.id)
      resultados.push({ termo: termo.termo, ok: true, novos: novosDoTermo })
    } catch (e: any) {
      resultados.push({ termo: termo.termo, ok: false, motivo: e.message })
    }
  }

  return NextResponse.json({ ok: !precisaSetup, precisaSetup, achados: inseridos, resultados })
}
