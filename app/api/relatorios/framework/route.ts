import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPeriodoDatas, calcularRoas, calcularAcao } from '@/lib/utils'
import { FrameworkCriativo } from '@/types'

export async function GET(request: NextRequest) {
  const criatvoFiltro = request.nextUrl.searchParams.get('criativo')

  const periodos = {
    '7d': getPeriodoDatas('7d'),
    '3d': getPeriodoDatas('3d'),
    '1d': getPeriodoDatas('1d'),
  }

  const { inicio: fim } = getPeriodoDatas('1d')
  const fimComum = new Date().toISOString()

  // Buscar dados dos 3 períodos em paralelo
  const [vendas7d, gastos7d, vendas3d, gastos3d, vendas1d, gastos1d] = await Promise.all([
    supabaseAdmin
      .from('vendas')
      .select('criativo, valor')
      .eq('status', 'approved')
      .gte('data', periodos['7d'].inicio)
      .lte('data', fimComum)
      .not('criativo', 'is', null),
    supabaseAdmin
      .from('gastos')
      .select('criativo, valor_gasto')
      .gte('data', periodos['7d'].inicio.split('T')[0])
      .lte('data', fimComum.split('T')[0])
      .not('criativo', 'is', null),
    supabaseAdmin
      .from('vendas')
      .select('criativo, valor')
      .eq('status', 'approved')
      .gte('data', periodos['3d'].inicio)
      .lte('data', fimComum)
      .not('criativo', 'is', null),
    supabaseAdmin
      .from('gastos')
      .select('criativo, valor_gasto')
      .gte('data', periodos['3d'].inicio.split('T')[0])
      .lte('data', fimComum.split('T')[0])
      .not('criativo', 'is', null),
    supabaseAdmin
      .from('vendas')
      .select('criativo, valor')
      .eq('status', 'approved')
      .gte('data', periodos['1d'].inicio)
      .lte('data', fimComum)
      .not('criativo', 'is', null),
    supabaseAdmin
      .from('gastos')
      .select('criativo, valor_gasto')
      .gte('data', periodos['1d'].inicio.split('T')[0])
      .lte('data', fimComum.split('T')[0])
      .not('criativo', 'is', null),
  ])

  // Coletar todos os criativos únicos
  const todosCriativos = new Set([
    ...(vendas7d.data ?? []).map((v) => v.criativo),
    ...(gastos7d.data ?? []).map((g) => g.criativo),
  ].filter(Boolean) as string[])

  if (criatvoFiltro) {
    todosCriativos.clear()
    todosCriativos.add(criatvoFiltro)
  }

  const resultado: FrameworkCriativo[] = []

  for (const criativo of todosCriativos) {
    const aggr = (data: Array<{ criativo: string; valor?: number; valor_gasto?: number }> | null, campo: 'valor' | 'valor_gasto') =>
      (data ?? []).filter((d) => d.criativo === criativo).reduce((acc, d) => acc + (d[campo] || 0), 0)

    const receita7d = aggr(vendas7d.data, 'valor')
    const gasto7d = aggr(gastos7d.data, 'valor_gasto')
    const receita3d = aggr(vendas3d.data, 'valor')
    const gasto3d = aggr(gastos3d.data, 'valor_gasto')
    const receita1d = aggr(vendas1d.data, 'valor')
    const gasto1d = aggr(gastos1d.data, 'valor_gasto')

    const r7d = gasto7d > 0 ? calcularRoas(receita7d, gasto7d) : null
    const r3d = gasto3d > 0 ? calcularRoas(receita3d, gasto3d) : null
    const r1d = gasto1d > 0 ? calcularRoas(receita1d, gasto1d) : null

    const vendas7dCount = (vendas7d.data ?? []).filter((v) => v.criativo === criativo).length

    resultado.push({
      criativo,
      roas_7d: r7d,
      roas_3d: r3d,
      roas_1d: r1d,
      positivo_7d: r7d !== null && r7d >= 1.0,
      positivo_3d: r3d !== null && r3d >= 1.0,
      positivo_1d: r1d !== null && r1d >= 1.0,
      acao: calcularAcao(r7d, r3d, r1d),
      receita_7d: receita7d,
      gasto_7d: gasto7d,
      vendas_7d: vendas7dCount,
    })
  }

  resultado.sort((a, b) => (b.roas_7d ?? 0) - (a.roas_7d ?? 0))

  return NextResponse.json(resultado)
}
