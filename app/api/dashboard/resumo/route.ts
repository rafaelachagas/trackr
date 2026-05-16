import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPeriodoDatas, calcularRoas } from '@/lib/utils'
import { PeriodoDashboard, ResumoDashboard } from '@/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const periodo = (searchParams.get('periodo') ?? '7d') as PeriodoDashboard
  const dataInicio = searchParams.get('data_inicio') ?? undefined
  const dataFim = searchParams.get('data_fim') ?? undefined
  const criativo = searchParams.get('criativo')
  const vsl = searchParams.get('vsl')

  const { inicio, fim } = getPeriodoDatas(periodo, dataInicio, dataFim)

  // Query de vendas aprovadas
  let queryVendas = supabaseAdmin
    .from('vendas')
    .select('valor, tipo, criativo, vsl')
    .eq('status', 'approved')
    .gte('data', inicio)
    .lte('data', fim)

  if (criativo) queryVendas = queryVendas.eq('criativo', criativo)
  if (vsl) queryVendas = queryVendas.eq('vsl', vsl)

  const { data: vendas, error: erroVendas } = await queryVendas

  if (erroVendas) {
    return NextResponse.json({ error: erroVendas.message }, { status: 500 })
  }

  // Query de gastos
  let queryGastos = supabaseAdmin
    .from('gastos')
    .select('valor_gasto, criativo')
    .gte('data', inicio.split('T')[0])
    .lte('data', fim.split('T')[0])

  if (criativo) queryGastos = queryGastos.eq('criativo', criativo)

  const { data: gastos, error: erroGastos } = await queryGastos

  if (erroGastos) {
    return NextResponse.json({ error: erroGastos.message }, { status: 500 })
  }

  // Calcular métricas
  const vendasAprovadas = vendas ?? []
  const gastosData = gastos ?? []

  const fronts = vendasAprovadas.filter((v) => v.tipo === 'front')
  const upsells = vendasAprovadas.filter((v) => v.tipo === 'upsell')

  const receita_total = vendasAprovadas.reduce((acc, v) => acc + (v.valor || 0), 0)
  const gasto_total = gastosData.reduce((acc, g) => acc + (g.valor_gasto || 0), 0)
  const total_vendas = fronts.length
  const total_upsells = upsells.length

  const resumo: ResumoDashboard = {
    receita_total,
    gasto_total,
    lucro: receita_total - gasto_total,
    roas: calcularRoas(receita_total, gasto_total),
    total_vendas,
    total_upsells,
    ticket_medio: total_vendas > 0 ? receita_total / (total_vendas + total_upsells) : 0,
    taxa_upsell: total_vendas > 0 ? (total_upsells / total_vendas) * 100 : 0,
  }

  return NextResponse.json(resumo)
}
