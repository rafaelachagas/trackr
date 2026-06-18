import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  // Start of the month 2 months ago = 3 months total (e.g. April, May, June when today is June)
  const hoje = new Date()
  const dataInicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 2, 1))
    .toISOString()
    .slice(0, 10)

  let page = 0
  const pageSize = 10000
  const mapa: Record<string, number> = {}

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('gastos')
      .select('data, valor_gasto')
      .gte('data', dataInicio)
      .order('data', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.error('[gastos-mensais]', error)
      return NextResponse.json({ gastos: [], error: error.message }, { status: 500 })
    }

    for (const g of data ?? []) {
      const mes = (g.data as string).slice(0, 7)
      mapa[mes] = (mapa[mes] ?? 0) + (g.valor_gasto ?? 0)
    }

    if (!data || data.length < pageSize) break
    page++
    if (page > 20) break // safety
  }

  const gastos = Object.entries(mapa)
    .map(([mes, total]) => ({ mes, total }))
    .sort((a, b) => b.mes.localeCompare(a.mes))
    .slice(0, 3)

  return NextResponse.json({ gastos, debug: { dataInicio, pages: page + 1 } })
}
