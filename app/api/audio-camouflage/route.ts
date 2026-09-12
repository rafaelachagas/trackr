import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import { BUCKET } from './sign-upload/route'

// Orquestra o processamento: o MP4 já está no Storage (input_path). Chama a VPS
// (server-side, HTTP ok) só com os PATHS + parâmetros; a VPS baixa do Storage,
// roda o ffmpeg e sobe o resultado. Devolve uma URL assinada de DOWNLOAD já com
// o nome de saída (o mesmo do arquivo original — sem sufixo).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

type Params = {
  pitch_steps: number
  time_stretch: number
  noise_volume: number
  eq_gain_db: number
  reverb_wet: number
}

export async function POST(req: Request) {
  try {
    const { inputPath, originalName, params } = (await req.json()) as {
      inputPath: string
      originalName?: string
      params: Params
    }
    if (!inputPath) return NextResponse.json({ error: 'inputPath ausente' }, { status: 400 })
    if (!TRANSCRITOR_URL) return NextResponse.json({ error: 'serviço de processamento não configurado' }, { status: 500 })

    const id = inputPath.split('/').pop() || inputPath
    const outputPath = `out/${id}`

    // Nome de saída = nome original, .mp4 (sem sufixo — não expõe o processamento).
    const stem = String(originalName || 'video').replace(/\.[^./\\]+$/, '') || 'video'
    const downloadName = `${stem}.mp4`

    const resp = await fetch(`${TRANSCRITOR_URL}/audio_camouflage?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bucket: BUCKET,
        input_path: inputPath,
        output_path: outputPath,
        pitch_steps: params?.pitch_steps,
        time_stretch: params?.time_stretch,
        noise_volume: params?.noise_volume,
        eq_gain_db: params?.eq_gain_db,
        reverb_wet: params?.reverb_wet,
      }),
    })
    const j = await resp.json().catch(() => ({} as any))
    if (!resp.ok || j?.error) {
      return NextResponse.json({ error: j?.error || 'falha no processamento do áudio' }, { status: 502 })
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(outputPath, 3600, { download: downloadName })
    if (error || !data) return NextResponse.json({ error: error?.message || 'falha ao gerar download' }, { status: 500 })

    return NextResponse.json({ url: data.signedUrl, downloadName })
  } catch (e) {
    return NextResponse.json({ error: `erro: ${e}` }, { status: 500 })
  }
}
