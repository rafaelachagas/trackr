import { NextRequest, NextResponse } from 'next/server'
import { enviarSaudeHoraria } from '@/lib/whatsapp-saude'

// De hora em hora (vercel.json): saúde dos criativos em cada grupo com /start-saude.
// A janela de horário (8h–23h de SP) é checada dentro — a Vercel agenda em UTC.
// ?forcar=1 manda mesmo fora da janela (teste).
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const resultado = await enviarSaudeHoraria(req.nextUrl.searchParams.get('forcar') === '1')
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e) {
    console.error('[whatsapp/saude-cron]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
