import { NextRequest, NextResponse } from 'next/server'
import { assinarVslUrl } from '@/lib/vigia-pagina'

// Download da mídia de um story do Instagram pela nossa origem: busca no CDN
// (fbcdn) no servidor e repassa com content-disposition attachment, forçando o
// navegador a SALVAR (o 302 direto pro CDN só abriria a mídia). Só aceita URLs
// assinadas (HMAC gerado no servidor), então não vira proxy aberto.

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  const t = req.nextUrl.searchParams.get('t') || ''
  if (!/^https?:\/\//i.test(u)) return NextResponse.json({ error: 'url inválida' }, { status: 400 })
  if (!t || t !== assinarVslUrl(u)) return NextResponse.json({ error: 'link inválido ou expirado' }, { status: 403 })

  try {
    const r = await fetch(u, { cache: 'no-store' })
    if (!r.ok || !r.body) return NextResponse.json({ error: `CDN respondeu ${r.status}` }, { status: 502 })
    const ct = r.headers.get('content-type') || 'application/octet-stream'
    const ext = ct.includes('image') ? 'jpg' : ct.includes('mp4') || ct.includes('video') ? 'mp4' : 'bin'
    const headers = new Headers({
      'content-type': ct,
      'content-disposition': `attachment; filename=story-${Date.now()}.${ext}`,
      'cache-control': 'no-store',
    })
    const len = r.headers.get('content-length')
    if (len) headers.set('content-length', len)
    return new NextResponse(r.body, { status: 200, headers })
  } catch (e: any) {
    return NextResponse.json({ error: `Falha no download: ${e.message}` }, { status: 502 })
  }
}
