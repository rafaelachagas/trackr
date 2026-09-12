import { NextResponse } from 'next/server'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import { BUCKET } from './sign-upload/route'

// Inicia a camuflagem: o criativo já está no Storage (inputPath). Chama a VPS
// (server-side, HTTP ok) só com os PATHS + opções; lá o ffmpeg roda em segundo
// plano. Esta rota responde na hora com o job_id — quem espera é o navegador,
// consultando /api/audio-camouflage/status. Um vídeo grande com reencode passa
// muito do tempo limite de uma função serverless.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Opcoes = {
  intensity: number
  entry_layer: boolean
  exit_layer: boolean
  invisible_shield: boolean
  pulses: boolean
  chroma: boolean
  safe_context: boolean
  audio_shield: boolean
  white_audio: boolean
  voice_mask: boolean
  voice_mask_level: 'leve' | 'medio' | 'pesado'
}

const IMAGEM = /\.(jpe?g|png|webp|gif)$/i

export async function POST(req: Request) {
  try {
    const { inputPath, originalName, ctaPath, options } = (await req.json()) as {
      inputPath: string
      originalName?: string
      ctaPath?: string | null
      options: Opcoes
    }
    if (!inputPath) return NextResponse.json({ error: 'inputPath ausente' }, { status: 400 })
    if (!TRANSCRITOR_URL) return NextResponse.json({ error: 'serviço de processamento não configurado' }, { status: 500 })

    const nome = String(originalName || 'criativo')
    const ehImagem = IMAGEM.test(nome) || IMAGEM.test(inputPath)
    const ext = ehImagem ? (nome.match(IMAGEM)?.[0] || '.jpg').toLowerCase() : '.mp4'

    const id = inputPath.split('/').pop() || inputPath
    const outputPath = `out/${id.replace(/\.[^./\\]+$/, '')}${ext}`

    // Nome de saída = nome original (sem sufixo — não expõe o processamento).
    const stem = nome.replace(/\.[^./\\]+$/, '') || 'criativo'
    const downloadName = `${stem}${ext}`

    const resp = await fetch(`${TRANSCRITOR_URL}/camouflage?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bucket: BUCKET,
        input_path: inputPath,
        output_path: outputPath,
        cta_path: ctaPath || null,
        kind: ehImagem ? 'image' : 'video',
        async: true,
        intensity: options?.intensity,
        entry_layer: options?.entry_layer,
        exit_layer: options?.exit_layer,
        invisible_shield: options?.invisible_shield,
        pulses: options?.pulses,
        chroma: options?.chroma,
        safe_context: options?.safe_context,
        audio_shield: options?.audio_shield,
        white_audio: options?.white_audio,
        voice_mask: options?.voice_mask,
        voice_mask_level: options?.voice_mask_level,
      }),
    })
    const j = await resp.json().catch(() => ({} as any))
    if (!resp.ok || j?.error || !j?.job_id) {
      return NextResponse.json({ error: j?.error || 'falha ao iniciar o processamento' }, { status: 502 })
    }

    return NextResponse.json({ jobId: j.job_id, outputPath, downloadName, kind: ehImagem ? 'image' : 'video' })
  } catch (e) {
    return NextResponse.json({ error: `erro: ${e}` }, { status: 500 })
  }
}
