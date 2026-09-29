import { NextRequest, NextResponse } from 'next/server'
import { enviarSaudeHoraria } from '@/lib/whatsapp-saude'

// De hora em hora (vercel.json): saúde dos criativos em cada grupo com /start-saude.
// Toda hora, 24h por dia.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const resultado = await enviarSaudeHoraria()
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e) {
    console.error('[whatsapp/saude-cron]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
