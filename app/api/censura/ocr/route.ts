import { NextRequest, NextResponse } from 'next/server'
import { RAIZ_CENSURA, MetaProjeto, idValido, lerJsonStorage } from '@/lib/censura-projetos'
import { BUCKET_CRIATIVOS } from '@/lib/criativos'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import type { LeituraVideo } from '@/lib/censura-ocr'

// Leitura do texto escrito no vídeo inteiro (OCR na VPS), salva em
// censura/<id>/ocr.json. O editor busca nela na hora ("Achar no vídeo").
// GET  ?p=           → {leitura | null}
// POST {projId}      → {job}
// GET  ?p=&job=      → {status, feito?, total?, erro?}
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const arquivo = (id: string) => `${RAIZ_CENSURA}/${id}/ocr.json`

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('p') || ''
  const job = req.nextUrl.searchParams.get('job') || ''
  if (!idValido(id)) return NextResponse.json({ error: 'projeto inválido' }, { status: 400 })
  if (!job) {
    const leitura = await lerJsonStorage<LeituraVideo>(arquivo(id))
    return NextResponse.json({ leitura: leitura ?? null })
  }
  if (!/^[a-f0-9]{32}$/.test(job)) return NextResponse.json({ error: 'job inválido' }, { status: 400 })
  try {
    const r = await fetch(`${TRANSCRITOR_URL}/censor_status?job=${job}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
    const j = await r.json().catch(() => null)
    if (!j) return NextResponse.json({ status: 'rodando' })
    if (j.status === 'pronto') return NextResponse.json({ status: 'pronto' })
    if (j.status === 'erro' || j.error) return NextResponse.json({ status: 'erro', erro: j.erro || j.error })
    return NextResponse.json({ status: j.status === 'na_fila' ? 'na_fila' : 'rodando', feito: j.feito ?? 0, total: j.total ?? 0 })
  } catch {
    return NextResponse.json({ status: 'rodando' })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const id = String(b.projId || '')
    if (!idValido(id)) return NextResponse.json({ error: 'projeto inválido' }, { status: 400 })
    const meta = await lerJsonStorage<MetaProjeto>(`${RAIZ_CENSURA}/${id}/meta.json`)
    if (!meta) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 })
    const r = await fetch(`${TRANSCRITOR_URL}/censor_ocr?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ bucket: BUCKET_CRIATIVOS, path: meta.video, out_path: arquivo(id) }),
      signal: AbortSignal.timeout(30000),
    })
    const j = await r.json().catch(() => null)
    if (!j?.job_id) return NextResponse.json({ error: j?.error || `O servidor de vídeo não respondeu (${r.status}).` }, { status: 502 })
    return NextResponse.json({ job: j.job_id })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
