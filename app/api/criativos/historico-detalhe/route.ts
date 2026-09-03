import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

const TZ = 'America/Sao_Paulo'

export interface MesCriativo { mes: string; gasto: number; receita: number; vendas: number; roas: number | null }
export interface HistoricoDetalhe {
  codigo: string
  total: { gasto: number; receita: number; vendas: number; roas: number | null }
  meses: MesCriativo[]
  primeiraVenda: string | null
  ultimaVenda: string | null
}

async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const todas: T[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build(off, off + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    todas.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return todas
}

// Mês (yyyy-MM em SP) de uma data. Gasto vem como DATE puro (yyyy-MM-dd); venda
// como timestamp — converte pro fuso de SP antes de cortar o mês.
const mesDe = (d: string, ehData: boolean) => ehData ? d.slice(0, 7) : format(toZonedTime(new Date(d), TZ), 'yyyy-MM')

// Histórico de UM criativo (pelo código, ex.: ad12) — gasto Meta × receita
// Hotmart automática (não-manual), acumulado e por mês, todo o período.
export async function GET(req: NextRequest) {
  const codigo = (req.nextUrl.searchParams.get('codigo') || '').trim()
  if (!codigo) return NextResponse.json({ error: 'codigo ausente' }, { status: 400 })

  const [gastos, vendas] = await Promise.all([
    fetchAll<{ data: string; valor_gasto: number }>((from, to) =>
      supabaseAdmin.from('gastos').select('data, valor_gasto')
        .eq('criativo', codigo).not('ad_id', 'is', null).range(from, to)
    ),
    fetchAll<{ data: string; valor: number; valor_liquido: number | null }>((from, to) =>
      supabaseAdmin.from('vendas').select('data, valor, valor_liquido')
        .eq('criativo', codigo).eq('status', 'approved')
        .not('transaction_id', 'like', 'manual_%').range(from, to)
    ),
  ])

  const meses = new Map<string, MesCriativo>()
  const get = (m: string) => {
    let x = meses.get(m); if (!x) { x = { mes: m, gasto: 0, receita: 0, vendas: 0, roas: null }; meses.set(m, x) } return x
  }
  let totGasto = 0, totReceita = 0, totVendas = 0
  for (const g of gastos) { const v = Number(g.valor_gasto) || 0; get(mesDe(g.data, true)).gasto += v; totGasto += v }
  let primeira: string | null = null, ultima: string | null = null
  for (const s of vendas) {
    const rec = Number(s.valor_liquido ?? s.valor) || 0
    const m = get(mesDe(s.data, false)); m.receita += rec; m.vendas++
    totReceita += rec; totVendas++
    if (!primeira || s.data < primeira) primeira = s.data
    if (!ultima || s.data > ultima) ultima = s.data
  }
  const lista = [...meses.values()].map((m) => ({ ...m, roas: m.gasto > 0 ? m.receita / m.gasto : null }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  const out: HistoricoDetalhe = {
    codigo,
    total: { gasto: totGasto, receita: totReceita, vendas: totVendas, roas: totGasto > 0 ? totReceita / totGasto : null },
    meses: lista,
    primeiraVenda: primeira,
    ultimaVenda: ultima,
  }
  return NextResponse.json(out)
}
