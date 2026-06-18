import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  // Pull 3 full months back from today (e.g. April 1 when today is June)
  const hoje = new Date()
  const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1)
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('gastos')
    .select('data, valor_gasto')
    .gte('data', dataInicio)
    .order('data', { ascending: false })
    .limit(100000)

  if (error) {
    console.error('[gastos-mensais]', error)
    return NextResponse.json({ gastos: [], error: error.message }, { status: 500 })
  }

  const mapa: Record<string, number> = {}
  for (const g of data ?? []) {
    const mes = (g.data as string).slice(0, 7)
    mapa[mes] = (mapa[mes] ?? 0) + (g.valor_gasto ?? 0)
  }

  const gastos = Object.entries(mapa)
    .map(([mes, total]) => ({ mes, total }))
    .sort((a, b) => b.mes.localeCompare(a.mes))
    .slice(0, 3)

  return NextResponse.json({ gastos, debug: { dataInicio, totalRows: data?.length ?? 0 } })
}
