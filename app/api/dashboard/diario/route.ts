import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPeriodoDatas, calcularRoas } from '@/lib/utils'
import { PeriodoDashboard, RoasDiario } from '@/types'
import { eachDayOfInterval, format, parseISO } from 'date-fns'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const periodo = (searchParams.get('periodo') ?? '30d') as PeriodoDashboard
  const criativo = searchParams.get('criativo')

  const { inicio, fim } = getPeriodoDatas(periodo)

  let queryVendas = supabaseAdmin
    .from('vendas')
    .select('data, valor')
    .eq('status', 'approved')
    .gte('data', inicio)
    .lte('data', fim)

  if (criativo) queryVendas = queryVendas.eq('criativo', criativo)

  let queryGastos = supabaseAdmin
    .from('gastos')
    .select('data, valor_gasto')
    .gte('data', inicio.split('T')[0])
    .lte('data', fim.split('T')[0])

  if (criativo) queryGastos = queryGastos.eq('criativo', criativo)

  const [{ data: vendas }, { data: gastos }] = await Promise.all([queryVendas, queryGastos])

  // Gerar todos os dias do período
  const dias = eachDayOfInterval({ start: parseISO(inicio), end: parseISO(fim) })

  const resultado: RoasDiario[] = dias.map((dia) => {
    const dataStr = format(dia, 'yyyy-MM-dd')

    const receita = (vendas ?? [])
      .filter((v) => v.data.startsWith(dataStr))
      .reduce((acc, v) => acc + (v.valor || 0), 0)

    const gasto = (gastos ?? [])
      .filter((g) => g.data === dataStr)
      .reduce((acc, g) => acc + (g.valor_gasto || 0), 0)

    const vendasDia = (vendas ?? []).filter((v) => v.data.startsWith(dataStr)).length

    return {
      data: dataStr,
      receita,
      gasto,
      roas: calcularRoas(receita, gasto),
      vendas: vendasDia,
    }
  })

  return NextResponse.json(resultado)
}
