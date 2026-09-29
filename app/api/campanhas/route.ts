import { NextRequest, NextResponse } from 'next/server'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import { listarCampanhas, lerLog } from '@/lib/meta-campanhas'

// Página /campaigns: campanhas da Meta com gasto ao vivo + vendas do período.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const hoje = format(toZonedTime(new Date(), 'America/Sao_Paulo'), 'yyyy-MM-dd')
  const data = /^\d{4}-\d{2}-\d{2}$/
  const ini = data.test(sp.get('d_inicio') ?? '') ? sp.get('d_inicio')! : hoje
  const fim = data.test(sp.get('d_fim') ?? '') ? sp.get('d_fim')! : hoje
  try {
    const [res, log] = await Promise.all([listarCampanhas(ini, fim), lerLog()])
    return NextResponse.json({ ...res, log: log.slice(0, 50), periodo: { ini, fim } })
  } catch (e) {
    console.error('[campanhas]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
