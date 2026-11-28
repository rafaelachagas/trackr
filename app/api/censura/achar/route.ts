import { NextRequest, NextResponse } from 'next/server'
import { RAIZ_CENSURA, MetaProjeto, idValido, lerJsonStorage } from '@/lib/censura-projetos'
import { BUCKET_CRIATIVOS } from '@/lib/criativos'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'

// "Achar no vídeo" do Editor de Censura: a VPS lê (OCR) os quadros perto de
// quando as palavras são faladas e devolve onde o texto aparece escrito.
// POST {projId, texto, ini, fim} → {job}
// GET  ?job=                     → {status, resultado?, erro?}
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const id = String(b.projId || '')
    if (!idValido(id)) return NextResponse.json({ error: 'projeto inválido' }, { status: 400 })
    const texto = String(b.texto || '').trim().slice(0, 200)
    const ini = Number(b.ini), fim = Number(b.fim)
    if (!texto || !Number.isFinite(ini) || !Number.isFinite(fim) || fim <= ini) {
      return NextResponse.json({ error: 'Selecione as palavras na transcrição.' }, { status: 400 })
    }
    const meta = await lerJsonStorage<MetaProjeto>(`${RAIZ_CENSURA}/${id}/meta.json`)
    if (!meta) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 })
    const r = await fetch(`${TRANSCRITOR_URL}/censor_achar?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ bucket: BUCKET_CRIATIVOS, path: meta.video, texto, ini, fim }),
      signal: AbortSignal.timeout(30000),
    })
    const j = await r.json().catch(() => null)
    if (!j?.job_id) return NextResponse.json({ error: j?.error || `O servidor de vídeo não respondeu (${r.status}).` }, { status: 502 })
    return NextResponse.json({ job: j.job_id })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const job = req.nextUrl.searchParams.get('job') || ''
  if (!/^[a-f0-9]{32}$/.test(job)) return NextResponse.json({ error: 'job inválido' }, { status: 400 })
  try {
    const r = await fetch(`${TRANSCRITOR_URL}/censor_status?job=${job}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
    const j = await r.json().catch(() => null)
    if (!j) return NextResponse.json({ status: 'rodando' })
    if (j.status === 'pronto') return NextResponse.json({ status: 'pronto', resultado: j.resultado })
    if (j.status === 'erro' || j.error) return NextResponse.json({ status: 'erro', erro: j.erro || j.error })
    return NextResponse.json({ status: 'rodando' })
  } catch {
    return NextResponse.json({ status: 'rodando' })
  }
}
