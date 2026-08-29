import { NextRequest, NextResponse } from 'next/server'
import { assinarVslUrl } from '@/lib/vigia-pagina'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'

// Proxy de download de VSL — o navegador baixa de www.thetrack.com.br, sem
// nunca ver o IP da VPS nem a chave. Só aceita URLs assinadas (HMAC gerado
// no servidor pelas actions), então não vira proxy aberto pra terceiros.
//   mp4 direto  → 302 pra fonte (CDN do concorrente, sem custo nosso)
//   m3u8 (HLS)  → VPS remonta em .mp4 (ffmpeg) e a resposta é repassada aqui

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  const t = req.nextUrl.searchParams.get('t') || ''
  if (!/^https?:\/\//i.test(u)) return NextResponse.json({ error: 'url inválida' }, { status: 400 })
  if (!t || t !== assinarVslUrl(u)) return NextResponse.json({ error: 'link inválido ou expirado' }, { status: 403 })

  // mp4/webm direto: redireciona pro arquivo na origem.
  if (!u.toLowerCase().includes('.m3u8')) {
    return NextResponse.redirect(u, 302)
  }

  // m3u8: a VPS junta os segmentos num .mp4 e a gente repassa o stream.
  try {
    const alvo = `${TRANSCRITOR_URL}/download?video_url=${encodeURIComponent(u)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`
    const r = await fetch(alvo, { cache: 'no-store' })
    if (!r.ok || !r.body) {
      const j = await r.json().catch(() => null)
      return NextResponse.json({ error: j?.error || `VPS respondeu ${r.status}` }, { status: 502 })
    }
    const headers = new Headers({
      'content-type': 'video/mp4',
      'content-disposition': 'attachment; filename=vsl-concorrente.mp4',
      'cache-control': 'no-store',
    })
    const len = r.headers.get('content-length')
    if (len) headers.set('content-length', len)
    return new NextResponse(r.body, { status: 200, headers })
  } catch (e: any) {
    return NextResponse.json({ error: `Não consegui falar com a VPS: ${e.message}` }, { status: 502 })
  }
}
