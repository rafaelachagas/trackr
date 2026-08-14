import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export interface HistoricoCriativo {
  criativo: string
  gasto_total: number
  receita_total: number
  roas: number | null
  vendas: number
}

// Paginação: o PostgREST corta em 1000 linhas por request. O histórico é geral
// (sem filtro de data), então gastos/vendas manuais passam MUITO de 1000 — sem
// isso, criativos sumiam da lista e os totais saíam parciais.
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const todas: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    todas.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return todas
}

// HISTÓRICO AUTOMÁTICO (todo o período), reconciliado com o painel V2:
//   - GASTO: gastos REAIS da Meta (ad_id IS NOT NULL), agrupados pelo código
//     do criativo (ad12, ad54...) extraído no sync.
//   - RECEITA: vendas REAIS da Hotmart (não-manuais) com código de anúncio no
//     sck (criativo != null) — mesmo universo do V2. Faturamento LÍQUIDO
//     (valor_liquido, fallback valor), pra o ROAS bater com o painel automático.
// Sem filtro de data e sem filtro de "ativos": é o acumulado geral, incluindo
// criativo já pausado.
export async function GET() {
  const [gastos, vendas] = await Promise.all([
    fetchAll<{ criativo: string; valor_gasto: number }>((from, to) =>
      supabaseAdmin
        .from('gastos')
        .select('criativo, valor_gasto')
        .not('ad_id', 'is', null)
        .not('criativo', 'is', null)
        .range(from, to)
    ),
    fetchAll<{ criativo: string; valor: number; valor_liquido: number | null }>((from, to) =>
      supabaseAdmin
        .from('vendas')
        .select('criativo, valor, valor_liquido')
        .eq('status', 'approved')
        .not('transaction_id', 'like', 'manual_%')
        .not('criativo', 'is', null)
        .range(from, to)
    ),
  ])

  const gastoMap = new Map<string, number>()
  for (const g of gastos ?? []) {
    gastoMap.set(g.criativo, (gastoMap.get(g.criativo) ?? 0) + Number(g.valor_gasto))
  }

  const receitaMap = new Map<string, number>()
  const vendasMap = new Map<string, number>()
  for (const v of vendas ?? []) {
    receitaMap.set(v.criativo, (receitaMap.get(v.criativo) ?? 0) + Number(v.valor_liquido ?? v.valor))
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
