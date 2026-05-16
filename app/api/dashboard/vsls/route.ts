import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPeriodoDatas } from '@/lib/utils'
import { PeriodoDashboard, RoasPorVsl } from '@/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const periodo = (searchParams.get('periodo') ?? '7d') as PeriodoDashboard
  const dataInicio = searchParams.get('data_inicio') ?? undefined
  const dataFim = searchParams.get('data_fim') ?? undefined

  const { inicio, fim } = getPeriodoDatas(periodo, dataInicio, dataFim)

  const { data: vendas, error } = await supabaseAdmin
    .from('vendas')
    .select('vsl, valor, tipo')
    .eq('status', 'approved')
    .gte('data', inicio)
    .lte('data', fim)
    .not('vsl', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const vsls = new Set((vendas ?? []).map((v) => v.vsl).filter(Boolean) as string[])
  const resultado: RoasPorVsl[] = []

  for (const vsl of vsls) {
    const vendasVsl = (vendas ?? []).filter((v) => v.vsl === vsl)
    const receita = vendasVsl.reduce((acc, v) => acc + (v.valor || 0), 0)
    const totalVendas = vendasVsl.filter((v) => v.tipo === 'front').length

    resultado.push({
      vsl,
      vendas: totalVendas,
      receita,
      rpv: totalVendas > 0 ? receita / totalVendas : 0,
      conversao_pct: 0, // Calculado se tivermos dados de plays do VTurb
    })
  }

  resultado.sort((a, b) => b.receita - a.receita)

  return NextResponse.json(resultado)
}
