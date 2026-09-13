import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import { BUCKET_CRIATIVOS, RAIZ_BROLL, MARCADOR, nomeSeguro } from '@/lib/criativos'

// Monta o criativo. Aqui a gente só resolve QUAIS arquivos entram (o roteiro
// fala em nomes; o Storage fala em caminhos) e manda pra VPS, que faz o vídeo
// em segundo plano. O navegador acompanha pelo status.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const FORMATOS: Record<string, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '4:5': { w: 1080, h: 1350 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
}

export async function POST(req: Request) {
  try {
    const { roteiro, locucaoPath, formato, estilo, fontePath } = await req.json()
    if (!roteiro?.trim()) return NextResponse.json({ error: 'sem roteiro' }, { status: 400 })
    if (!locucaoPath) return NextResponse.json({ error: 'sem locução' }, { status: 400 })
    if (!TRANSCRITOR_URL || !TRANSCRITOR_APIKEY) {
      return NextResponse.json({ error: 'servidor de vídeo não configurado' }, { status: 500 })
    }

    // Biblioteca inteira: o roteiro pode citar qualquer clipe ou pasta.
    const { data: pastasRaw } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS).list(RAIZ_BROLL, { limit: 1000 })
    const clipes: Record<string, string> = {}
    const pastas: Record<string, string[]> = {}
    for (const p of (pastasRaw || []).filter((x) => !x.id)) {
      const { data: itens } = await supabaseAdmin.storage
        .from(BUCKET_CRIATIVOS).list(`${RAIZ_BROLL}/${p.name}`, { limit: 1000 })
      const caminhos: string[] = []
      for (const i of (itens || []).filter((x) => x.id && x.name !== MARCADOR)) {
        const caminho = `${RAIZ_BROLL}/${p.name}/${i.name}`
        caminhos.push(caminho)
        // Referência por nome no roteiro é sem extensão.
        clipes[i.name.replace(/\.[^.]+$/, '')] = caminho
      }
      pastas[p.name] = caminhos
    }

    const fmt = FORMATOS[formato] || FORMATOS['9:16']
    const outputPath = `saida/${randomUUID()}.mp4`

    let resp: Response
    try {
      resp = await fetch(`${TRANSCRITOR_URL}/assemble?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bucket: BUCKET_CRIATIVOS,
          locucao_path: locucaoPath,
          output_path: outputPath,
          roteiro,
          estilo: estilo || 'palavra',
          largura: fmt.w,
          altura: fmt.h,
          fonte_path: fontePath || null,
          clipes,
          pastas,
        }),
      })
    } catch {
      return NextResponse.json(
        { error: 'o servidor de vídeo não respondeu — a VPS pode estar fora do ar' },
        { status: 503 },
      )
    }

    const j = await resp.json().catch(() => ({} as any))
    if (!resp.ok || j?.error || !j?.job_id) {
      return NextResponse.json({ error: j?.error || 'falha ao iniciar a montagem' }, { status: 502 })
    }
    return NextResponse.json({ jobId: j.job_id, outputPath })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const job = searchParams.get('job')
  const outputPath = searchParams.get('outputPath')
  if (!job) return NextResponse.json({ error: 'job ausente' }, { status: 400 })

  const r = await fetch(
    `${TRANSCRITOR_URL}/assemble_status?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}&job=${encodeURIComponent(job)}`,
    { signal: AbortSignal.timeout(20_000), cache: 'no-store' },
  ).catch(() => null)
  if (!r) return NextResponse.json({ error: 'servidor de vídeo fora do ar' }, { status: 503 })
  const j = await r.json().catch(() => ({} as any))

  // Pronto: devolve um link assinado pro navegador baixar direto do Storage.
  if (j?.status === 'pronto' && outputPath) {
    const { data } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS).createSignedUrl(outputPath, 3600)
    return NextResponse.json({ ...j, url: data?.signedUrl })
  }
  return NextResponse.json(j)
}
