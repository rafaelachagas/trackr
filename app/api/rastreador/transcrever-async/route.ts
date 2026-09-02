import { NextRequest, NextResponse } from 'next/server'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import { supabaseAdmin } from '@/lib/supabase'

async function cookieInstagramSalvo(): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'instagram_sessionid').maybeSingle()
    return (data?.valor || '').toString().trim()
  } catch { return '' }
}

// Transcrição assíncrona pra VSLs longas (a síncrona estoura os 5 min do
// site). POST {video_url} inicia o job na VPS e devolve {job_id}; GET ?id=
// consulta o status até sair {status:'ok', texto}.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function fetchTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const videoUrl: string = body?.video_url || ''
  // Cookie do Instagram (sessionid) — só necessário pra transcrever conteúdo de
  // perfil privado/logado. TikTok/YouTube não usam.
  let igCookie: string = body?.ig_cookie || ''
  if (!videoUrl) return NextResponse.json({ error: 'video_url ausente.' }, { status: 400 })
  // Vídeo do Instagram sem cookie no corpo → usa o cookie guardado no servidor.
  if (!igCookie && /instagram\.com/i.test(videoUrl)) igCookie = await cookieInstagramSalvo()
  try {
    const extra = igCookie ? `&ig_cookie=${encodeURIComponent(igCookie)}` : ''
    const r = await fetchTimeout(`${TRANSCRITOR_URL}/transcribe_async?video_url=${encodeURIComponent(videoUrl)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}${extra}`, 30000)
    const j = await r.json().catch(() => null)
    if (!j?.job_id) return NextResponse.json({ error: j?.error || 'Transcritor na VPS ainda não tem o modo assíncrono — rode o rebuild do vps-transcritor.' }, { status: 502 })
    return NextResponse.json(j)
  } catch {
    return NextResponse.json({ error: 'Não consegui falar com o transcritor na VPS (porta 8082).' }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id ausente.' }, { status: 400 })
  try {
    const r = await fetchTimeout(`${TRANSCRITOR_URL}/result?id=${encodeURIComponent(id)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, 20000)
    const j = await r.json().catch(() => null)
    if (!j) return NextResponse.json({ error: 'Resposta inválida do transcritor.' }, { status: 502 })
    return NextResponse.json(j, { status: r.ok ? 200 : r.status })
  } catch {
    return NextResponse.json({ error: 'Não consegui falar com o transcritor na VPS (porta 8082).' }, { status: 502 })
  }
}
