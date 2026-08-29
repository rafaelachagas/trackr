import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'
import { spRangeISO } from '@/lib/utils'

// Funil de Conversão (Meta Ads) — bloco do overview. Conta inteira (não amarrado
// a um funil cadastrado), respeitando o período da Visão Geral. Só LEITURA.
// Etapas: Cliques → Visitas de Página → Checkouts (IC) → Vendas iniciadas →
// Vendas aprovadas. Cliques/LPV/IC vêm da Meta (gastos); as vendas vêm da
// Hotmart (vendas) — os dois só se encontram aqui, na leitura.

export const dynamic = 'force-dynamic'
const TZ = 'America/Sao_Paulo'

export interface FunilMeta {
  cliques: number
  lpViews: number
  checkouts: number
  vendasIniciadas: number   // pedidos gerados (pago ou pix gerado, mesmo que expirado/reembolsado)
  vendasAprovadas: number   // pedidos que foram pagos ao menos uma vez
  checkoutsDisponivel: boolean
}

type GastoRow = { clicks: number | null; lp_views: number | null; checkouts?: number | null }
type VendaRow = { status: string }

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

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const dInicio = sp.get('d_inicio')
    const dFim = sp.get('d_fim')
    if (!dInicio || !dFim) {
      return NextResponse.json({ error: 'd_inicio e d_fim são obrigatórios' }, { status: 400 })
    }

    // ---- Meta (gastos.data é DATE puro — yyyy-MM-dd direto; só linhas de anúncio) ----
    let checkoutsDisponivel = true
    let gastos: GastoRow[]
    const buildGastos = (cols: string) => (from: number, to: number) =>
      supabaseAdmin.from('gastos').select(cols)
        .gte('data', dInicio).lte('data', dFim)
        .not('ad_id', 'is', null)
        .range(from, to)
    try {
      gastos = await fetchAll<GastoRow>(buildGastos('clicks, lp_views, checkouts'))
    } catch {
      checkoutsDisponivel = false
      gastos = await fetchAll<GastoRow>(buildGastos('clicks, lp_views'))
    }

    let cliques = 0, lpViews = 0, checkouts = 0
    for (const g of gastos) {
      cliques += Number(g.clicks) || 0
      lpViews += Number(g.lp_views) || 0
      checkouts += Number(g.checkouts) || 0
    }

    // ---- Vendas (data é timestamp; bordas do dia em SP; exclui manuais) ----
    const { desde, ate } = spRangeISO(dInicio, dFim)
    // 'cancelled'/'expired' = pedido gerado mas não pago (pix que expirou,
    // checkout abandonado) — é a "venda iniciada" que não virou "aprovada".
    const NAO_PAGO = new Set(['expired', 'cancelled'])
    const vendas = await fetchAll<VendaRow>((from, to) =>
      supabaseAdmin.from('vendas')
        .select('status, data')
        .in('status', ['approved', 'refunded', 'chargeback', 'expired', 'cancelled'])
        .not('transaction_id', 'like', 'manual_%')
        .gte('data', desde).lte('data', ate)
        .range(from, to)
    )
    // spRangeISO dá folga nas bordas (fuso) — reconfirma o dia em SP.
    let vendasIniciadas = 0, vendasAprovadas = 0
    for (const v of vendas as (VendaRow & { data: string })[]) {
      const diaSP = formatInTimeZone(new Date(v.data), TZ, 'yyyy-MM-dd')
      if (diaSP < dInicio || diaSP > dFim) continue
      // Todo pedido gerado conta como "iniciada" (inclui pix gerado/expirado).
      vendasIniciadas += 1
      // "Aprovada" = foi paga ao menos uma vez (approved/refunded/chargeback).
      if (!NAO_PAGO.has(v.status)) vendasAprovadas += 1
    }

    const out: FunilMeta = { cliques, lpViews, checkouts, vendasIniciadas, vendasAprovadas, checkoutsDisponivel }
    return NextResponse.json(out)
  } catch (e: any) {
    console.error('[dashboard/funil-meta]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
