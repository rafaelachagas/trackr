import { NextRequest, NextResponse } from 'next/server'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'

// Transcrição em CPU é demorada — dá folga no tempo de execução.
export const maxDuration = 300

function fetchTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const videoUrl: string = body?.video_url || ''
  if (!videoUrl) {
    return NextResponse.json({ error: 'Este criativo não tem vídeo pra transcrever.' }, { status: 400 })
  }
  const alvo = `${TRANSCRITOR_URL}/transcribe?video_url=${encodeURIComponent(videoUrl)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`
  try {
    const r = await fetchTimeout(alvo, 290000)
    const j = await r.json().catch(() => null)
    if (!j) return NextResponse.json({ error: 'Resposta inválida do transcritor.' }, { status: 502 })
    return NextResponse.json(j)
  } catch (err) {
    console.error('[rastreador/transcrever]', err)
    return NextResponse.json(
      { error: 'Não consegui falar com o transcritor na VPS. Confira se o serviço está no ar (porta 8082).' },
      { status: 502 }
    )
  }
}
