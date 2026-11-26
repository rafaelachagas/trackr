import { NextRequest, NextResponse } from 'next/server'
import { gerarPropostas, avisarNoWhatsApp } from '@/lib/censura-revisor'

// Fase 3: toda segunda o revisor lê a semana e manda propostas no WhatsApp do
// dono. Nada muda na biblioteca sem "aprovar".
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  try {
    const ps = await gerarPropostas()
    await avisarNoWhatsApp(ps)
    return NextResponse.json({ ok: true, propostas: ps.length })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
