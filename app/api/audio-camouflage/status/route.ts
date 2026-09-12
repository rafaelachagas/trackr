import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import { BUCKET } from '../sign-upload/route'

// Consulta o job de camuflagem na VPS. Quando termina, já devolve a URL
// assinada de download com o nome de saída.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const job = searchParams.get('job') || ''
    const outputPath = searchParams.get('outputPath') || ''
    const downloadName = searchParams.get('downloadName') || 'criativo.mp4'
    if (!job) return NextResponse.json({ error: 'job ausente' }, { status: 400 })
    if (!outputPath.startsWith('out/')) return NextResponse.json({ error: 'outputPath inválido' }, { status: 400 })
    if (!TRANSCRITOR_URL) return NextResponse.json({ error: 'serviço de processamento não configurado' }, { status: 500 })

    const resp = await fetch(
      `${TRANSCRITOR_URL}/camouflage_status?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}&job=${encodeURIComponent(job)}`,
      { cache: 'no-store' },
    )
    const j = await resp.json().catch(() => ({} as any))
    if (!resp.ok || j?.error) {
      return NextResponse.json({ error: j?.error || 'falha ao consultar o processamento' }, { status: 502 })
    }
    if (j.status === 'erro') return NextResponse.json({ status: 'erro', error: j.erro || 'falha no processamento' })
    if (j.status !== 'pronto') return NextResponse.json({ status: 'rodando' })

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(outputPath, 3600, { download: downloadName })
    if (error || !data) return NextResponse.json({ error: error?.message || 'falha ao gerar download' }, { status: 500 })

    return NextResponse.json({ status: 'pronto', url: data.signedUrl, downloadName, tempos: j.tempos || null })
  } catch (e) {
    return NextResponse.json({ error: `erro: ${e}` }, { status: 500 })
  }
}
