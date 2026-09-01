import { NextRequest, NextResponse } from 'next/server'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'

// Lista os vídeos mais virais de um perfil (TikTok/Instagram/YouTube). Proxy pro
// transcritor da VPS (/perfil), que usa yt-dlp pra extrair views e ordenar.

export const dynamic = 'force-dynamic'
export const maxDuration = 200

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const url: string = (body?.url || '').trim()
  const igCookie: string = (body?.ig_cookie || '').trim()
  const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 50)
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Cole a URL do perfil (com https://).' }, { status: 400 })
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 190000)
    const extra = igCookie ? `&ig_cookie=${encodeURIComponent(igCookie)}` : ''
    const r = await fetch(`${TRANSCRITOR_URL}/perfil?url=${encodeURIComponent(url)}&limit=${limit}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}${extra}`, {
      signal: ctrl.signal, cache: 'no-store',
    }).finally(() => clearTimeout(t))
    const j = await r.json().catch(() => null)
    if (!j) return NextResponse.json({ error: 'Resposta inválida do serviço.' }, { status: 502 })
    if (j.error) return NextResponse.json({ error: j.error }, { status: 502 })
    return NextResponse.json(j)
  } catch (e: any) {
    return NextResponse.json({ error: e?.name === 'AbortError' ? 'O perfil demorou demais (timeout).' : 'Não consegui falar com o serviço na VPS.' }, { status: 502 })
  }
}
