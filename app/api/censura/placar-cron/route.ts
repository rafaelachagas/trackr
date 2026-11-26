import { NextRequest, NextResponse } from 'next/server'
import { placarRodando, passoPlacar } from '@/lib/censura-placar'

// Fase 4: continua o placar que estiver rodando (cada caso é uma IA de ~40 s).
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const ini = Date.now()
  try {
    const p = await placarRodando()
    if (!p) return NextResponse.json({ ok: true, rodando: false })
    const r = await passoPlacar(p.id, ini + 280_000)
    return NextResponse.json({ ok: true, status: r?.status, feitos: r?.resultados?.length, total: r?.casos?.length, acertos: r?.acertos })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
