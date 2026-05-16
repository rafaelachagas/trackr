import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPeriodoDatas, calcularRoas } from '@/lib/utils'
import { PeriodoDashboard, CombinacaoCriativoVsl } from '@/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const periodo = (searchParams.get('periodo') ?? '7d') as PeriodoDashboard
  const { inicio, fim } = getPeriodoDatas(periodo)

  const { data: vendas, error } = await supabaseAdmin
    .from('vendas')
    .select('criativo, vsl, valor, tipo')
    .eq('status', 'approved')
    .gte('data', inicio)
    .lte('data', fim)
    .not('criativo', 'is', null)
    .not('vsl', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: gastos } = await supabaseAdmin
    .from('gastos')
    .select('criativo, valor_gasto')
    .gte('data', inicio.split('T')[0])
    .lte('data', fim.split('T')[0])

  // Agregar por criativo + vsl
  const combinacoesMap = new Map<string, CombinacaoCriativoVsl>()

  for (const venda of vendas ?? []) {
    const chave = `${venda.criativo}|${venda.vsl}`
    const existing = combinacoesMap.get(chave)
    if (existing) {
      existing.receita += venda.valor || 0
      if (venda.tipo === 'front') existing.vendas++
      else existing.upsells++
    } else {
      combinacoesMap.set(chave, {
        criativo: venda.criativo,
        vsl: venda.vsl,
        vendas: venda.tipo === 'front' ? 1 : 0,
        upsells: venda.tipo === 'upsell' ? 1 : 0,
        receita: venda.valor || 0,
        gasto: 0,
        roas: 0,
      })
    }
  }

  // Adicionar gastos por criativo
  for (const [, combo] of combinacoesMap) {
    const gastosCriativo = (gastos ?? [])
      .filter((g) => g.criativo === combo.criativo)
      .reduce((acc, g) => acc + (g.valor_gasto || 0), 0)
    combo.gasto = gastosCriativo
    combo.roas = calcularRoas(combo.receita, combo.gasto)
  }

  const resultado = Array.from(combinacoesMap.values()).sort((a, b) => b.receita - a.receita)

  return NextResponse.json(resultado)
}
