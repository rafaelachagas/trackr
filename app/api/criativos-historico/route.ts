import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export interface HistoricoCriativo {
  criativo: string
  gasto_total: number
  receita_total: number
  roas: number | null
  vendas: number
}

export async function GET() {
  const [{ data: gastos }, { data: vendas }] = await Promise.all([
    supabaseAdmin
      .from('gastos')
      .select('criativo, valor_gasto')
      .is('ad_id', null)
      .not('criativo', 'is', null),
    supabaseAdmin
      .from('vendas')
      .select('criativo, valor')
      .eq('status', 'approved')
      .like('transaction_id', 'manual_%')
      .not('criativo', 'is', null),
  ])

  const gastoMap = new Map<string, number>()
  for (const g of gastos ?? []) {
    gastoMap.set(g.criativo, (gastoMap.get(g.criativo) ?? 0) + Number(g.valor_gasto))
  }

  const receitaMap = new Map<string, number>()
  const vendasMap = new Map<string, number>()
  for (const v of vendas ?? []) {
    receitaMap.set(v.criativo, (receitaMap.get(v.criativo) ?? 0) + Number(v.valor))
    vendasMap.set(v.criativo, (vendasMap.get(v.criativo) ?? 0) + 1)
  }

  const criativos = new Set([...gastoMap.keys(), ...receitaMap.keys()])
  const resultado: HistoricoCriativo[] = []

  for (const criativo of criativos) {
    const gasto = gastoMap.get(criativo) ?? 0
    const receita = receitaMap.get(criativo) ?? 0
    resultado.push({
      criativo,
      gasto_total: gasto,
      receita_total: receita,
      roas: gasto > 0 ? receita / gasto : null,
      vendas: vendasMap.get(criativo) ?? 0,
    })
  }

  resultado.sort((a, b) => b.receita_total - a.receita_total)

  return NextResponse.json({ criativos: resultado })
}
