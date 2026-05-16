import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPeriodoDatas, calcularRoas, calcularAcao } from '@/lib/utils'
import { PeriodoDashboard, RoasPorCriativo } from '@/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const periodo = (searchParams.get('periodo') ?? '7d') as PeriodoDashboard
  const dataInicio = searchParams.get('data_inicio') ?? undefined
  const dataFim = searchParams.get('data_fim') ?? undefined

  const { inicio, fim } = getPeriodoDatas(periodo, dataInicio, dataFim)

  // Buscar vendas aprovadas com criativo
  const { data: vendas, error: erroVendas } = await supabaseAdmin
    .from('vendas')
    .select('criativo, valor, tipo')
    .eq('status', 'approved')
    .gte('data', inicio)
    .lte('data', fim)
    .not('criativo', 'is', null)

  if (erroVendas) {
    return NextResponse.json({ error: erroVendas.message }, { status: 500 })
  }

  // Buscar gastos por criativo
  const { data: gastos, error: erroGastos } = await supabaseAdmin
    .from('gastos')
    .select('criativo, valor_gasto')
    .gte('data', inicio.split('T')[0])
    .lte('data', fim.split('T')[0])
    .not('criativo', 'is', null)

  if (erroGastos) {
    return NextResponse.json({ error: erroGastos.message }, { status: 500 })
  }

  // Buscar ROAS dos sub-períodos para framework
  const { inicio: inicio3d } = getPeriodoDatas('3d')
  const { inicio: inicio1d } = getPeriodoDatas('1d')

  const [{ data: vendas3d }, { data: gastos3d }, { data: vendas1d }, { data: gastos1d }] =
    await Promise.all([
      supabaseAdmin
        .from('vendas')
        .select('criativo, valor')
        .eq('status', 'approved')
        .gte('data', inicio3d)
        .lte('data', fim)
        .not('criativo', 'is', null),
      supabaseAdmin
        .from('gastos')
        .select('criativo, valor_gasto')
        .gte('data', inicio3d.split('T')[0])
        .lte('data', fim.split('T')[0])
        .not('criativo', 'is', null),
      supabaseAdmin
        .from('vendas')
        .select('criativo, valor')
        .eq('status', 'approved')
        .gte('data', inicio1d)
        .lte('data', fim)
        .not('criativo', 'is', null),
      supabaseAdmin
        .from('gastos')
        .select('criativo, valor_gasto')
        .gte('data', inicio1d.split('T')[0])
        .lte('data', fim.split('T')[0])
        .not('criativo', 'is', null),
    ])

  // Agregar dados por criativo
  const criativos = new Set([
    ...(vendas ?? []).map((v) => v.criativo),
    ...(gastos ?? []).map((g) => g.criativo),
  ].filter(Boolean) as string[])

  const resultado: RoasPorCriativo[] = []

  for (const criativo of criativos) {
    const vendasCriativo = (vendas ?? []).filter((v) => v.criativo === criativo)
    const gastosCriativo = (gastos ?? []).filter((g) => g.criativo === criativo)

    const receita = vendasCriativo.reduce((acc, v) => acc + (v.valor || 0), 0)
    const gasto = gastosCriativo.reduce((acc, g) => acc + (g.valor_gasto || 0), 0)
    const vendasFront = vendasCriativo.filter((v) => v.tipo === 'front').length
    const vendasUpsell = vendasCriativo.filter((v) => v.tipo === 'upsell').length

    // ROAS sub-períodos
    const r3d = calcularRoasDePeriodo(vendas3d, gastos3d, criativo)
    const r1d = calcularRoasDePeriodo(vendas1d, gastos1d, criativo)
    const r7d = calcularRoas(receita, gasto)

    resultado.push({
      criativo,
      vendas: vendasFront,
      upsells: vendasUpsell,
      receita,
      gasto,
      roas: r7d,
      acao: calcularAcao(r7d, r3d, r1d),
    })
  }

  // Ordenar por receita desc
  resultado.sort((a, b) => b.receita - a.receita)

  return NextResponse.json(resultado)
}

function calcularRoasDePeriodo(
  vendas: Array<{ criativo: string; valor: number }> | null,
  gastos: Array<{ criativo: string; valor_gasto: number }> | null,
  criativo: string
): number {
  const receita = (vendas ?? [])
    .filter((v) => v.criativo === criativo)
    .reduce((acc, v) => acc + (v.valor || 0), 0)
  const gasto = (gastos ?? [])
    .filter((g) => g.criativo === criativo)
    .reduce((acc, g) => acc + (g.valor_gasto || 0), 0)
  return calcularRoas(receita, gasto)
}
