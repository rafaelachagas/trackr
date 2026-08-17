import { NextRequest, NextResponse } from 'next/server'
import { RASTREADOR_URL, RASTREADOR_APIKEY, extrairPageId } from '@/lib/rastreador'

export const maxDuration = 120

function fetchTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const pageId = extrairPageId(body?.page_id || body?.url || '')
  if (!pageId) {
    return NextResponse.json({ error: 'Cole o link da Biblioteca de Anúncios (ou o ID da página).' }, { status: 400 })
  }
  if (!RASTREADOR_APIKEY) {
    return NextResponse.json({ error: 'RASTREADOR_APIKEY não configurada no ambiente do site.' }, { status: 500 })
  }
  const alvo = `${RASTREADOR_URL}/scrape?page_id=${pageId}&key=${encodeURIComponent(RASTREADOR_APIKEY)}`
  try {
    const r = await fetchTimeout(alvo, 115000)
    const j = await r.json().catch(() => null)
    if (!j) return NextResponse.json({ error: 'Resposta inválida do scraper.' }, { status: 502 })
    return NextResponse.json(j)
  } catch (err) {
    console.error('[rastreador/scrape]', err)
    return NextResponse.json(
      { error: 'Não consegui falar com o scraper na VPS. Confira se o serviço está no ar e se a porta 8081 está aberta no firewall.' },
      { status: 502 }
    )
  }
}
