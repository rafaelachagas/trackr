import { NextRequest, NextResponse } from 'next/server'
import { enviarResumosDoDia } from '@/lib/whatsapp-resumo'

// Todo dia de manhã (vercel.json): resumo de ontem em cada grupo com /start-resumo.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const resultados = await enviarResumosDoDia()
    return NextResponse.json({ ok: true, resultados })
  } catch (e) {
    console.error('[whatsapp/resumo-cron]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
