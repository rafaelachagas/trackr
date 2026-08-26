import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { formatInTimeZone } from 'date-fns-tz'
import { spRangeISO } from '@/lib/utils'

// Análise de Funil — linha por dia, igual à planilha: gasto/tráfego da Meta
// (filtrado pelas campanhas do funil, se houver) × vendas por produto (front /
// orderbumps / upsells do cadastro) × reembolsos × observações. Só LEITURA —
// nada aqui escreve em vendas nem gastos.

export const dynamic = 'force-dynamic'
const TZ = 'America/Sao_Paulo'

export interface DiaFunil {
  data: string
  investimento: number
  imposto: number
  impressoes: number
  cliques: number
  lpViews: number
  checkouts: number
  vendasFront: number
  fatFront: number          // líquido (imputado quando falta valor_liquido)
  fatFunil: number
  vendasTotais: number
  orderbumps: Record<string, { qtd: number; fat: number }>
  upsells: Record<string, { qtd: number; fat: number }>
  reembolsos: number
  reembolsoValor: number
  obs: string
}

type VendaRow = { produto: string | null; valor: number; valor_liquido: number | null; data: string; status: string }
type GastoRow = { data: string; valor_gasto: number; impressions: number | null; clicks: number | null; lp_views: number | null; checkouts?: number | null }

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
    const funilId = sp.get('funil_id')
    const dInicio = sp.get('d_inicio')
    const dFim = sp.get('d_fim')
    if (!funilId || !dInicio || !dFim) {
      return NextResponse.json({ error: 'funil_id, d_inicio e d_fim são obrigatórios' }, { status: 400 })
    }

    const { data: funil, error: errFunil } = await supabaseAdmin.from('funis').select('*').eq('id', funilId).maybeSingle()
    if (errFunil) {
      const precisaSql = errFunil.code === 'PGRST205'
      return NextResponse.json({ error: precisaSql ? 'Rode o supabase_funil.sql no Supabase.' : errFunil.message, precisaSql }, { status: 400 })
    }
    if (!funil) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })

    const orderbumps: string[] = Array.isArray(funil.orderbumps) ? funil.orderbumps : []
    const upsells: string[] = Array.isArray(funil.upsells) ? funil.upsells : []
    const campanhas: string[] = Array.isArray(funil.campanhas) ? funil.campanhas : []

    // ---------- Gastos (gastos.data é DATE puro — yyyy-MM-dd direto) ----------
    let checkoutsDisponivel = true
    let gastos: GastoRow[]
    const buildGastos = (cols: string) => (from: number, to: number) => {
      let q = supabaseAdmin.from('gastos').select(cols)
        .gte('data', dInicio).lte('data', dFim)
        .not('ad_id', 'is', null)
      if (campanhas.length) q = q.in('campaign_name', campanhas)
      return q.range(from, to)
    }
    try {
      gastos = await fetchAll<GastoRow>(buildGastos('data, valor_gasto, impressions, clicks, lp_views, checkouts'))
    } catch {
      checkoutsDisponivel = false
      gastos = await fetchAll<GastoRow>(buildGastos('data, valor_gasto, impressions, clicks, lp_views'))
    }

    // Imposto diário da Meta (mapa salvo pelo sync) — mesma fonte da Visão
    // Geral. Com filtro de campanhas, entra proporcional ao gasto do funil no
    // dia (o imposto é da conta inteira, não por campanha).
    let impostoPorDia: Record<string, number> = {}
    try {
      const { data: cfgImp } = await supabaseAdmin
        .from('configuracoes').select('valor').eq('chave', 'meta_imposto_diario').maybeSingle()
      impostoPorDia = JSON.parse(cfgImp?.valor || '{}')
    } catch {}
    let gastoTotalPorDia: Map<string, number> | null = null
    if (campanhas.length) {
      gastoTotalPorDia = new Map()
      const todos = await fetchAll<{ data: string; valor_gasto: number }>((from, to) =>
        supabaseAdmin.from('gastos').select('data, valor_gasto')
          .gte('data', dInicio).lte('data', dFim).not('ad_id', 'is', null).range(from, to)
      )
      for (const g of todos) gastoTotalPorDia.set(g.data, (gastoTotalPorDia.get(g.data) ?? 0) + (Number(g.valor_gasto) || 0))
    }

    // ---------- Vendas (data é timestamp — bordas do dia em SP) ----------
    // Exclui as manuais (transaction_id 'manual_%') — mesma regra da Visão
    // Geral (app/actions/dashboard.ts), senão o faturamento das duas telas
    // diverge e vira caça-fantasma.
    const { desde, ate } = spRangeISO(dInicio, dFim)
    const vendas = await fetchAll<VendaRow>((from, to) =>
      supabaseAdmin.from('vendas')
        .select('produto, valor, valor_liquido, data, status')
        .in('status', ['approved', 'refunded', 'chargeback'])
        .not('transaction_id', 'like', 'manual_%')
        .gte('data', desde).lte('data', ate)
        .range(from, to)
    )

    // Razão líquido/bruto global do período (imputação pras linhas sem líquido).
    let liq = 0, bruto = 0
    for (const v of vendas) if (v.status === 'approved' && v.valor_liquido != null) { liq += Number(v.valor_liquido) || 0; bruto += Number(v.valor) || 0 }
    const ratio = bruto > 0 ? liq / bruto : 1
    const liquido = (v: VendaRow) => (v.valor_liquido != null ? Number(v.valor_liquido) || 0 : (Number(v.valor) || 0) * ratio)

    // ---------- Observações ----------
    let obsDisponivel = true
    const obsPorDia: Record<string, string> = {}
    try {
      const { data: obs, error } = await supabaseAdmin
        .from('funil_observacoes').select('data, texto')
        .eq('funil_id', funilId).gte('data', dInicio).lte('data', dFim)
      if (error) throw error
      for (const o of obs ?? []) obsPorDia[o.data] = o.texto
    } catch { obsDisponivel = false }

    // ---------- Monta os dias ----------
    const dias = new Map<string, DiaFunil>()
    function diaDe(data: string): DiaFunil {
      let d = dias.get(data)
      if (!d) {
        d = {
          data, investimento: 0, imposto: 0, impressoes: 0, cliques: 0, lpViews: 0, checkouts: 0,
          vendasFront: 0, fatFront: 0, fatFunil: 0, vendasTotais: 0,
          orderbumps: Object.fromEntries(orderbumps.map((o) => [o, { qtd: 0, fat: 0 }])),
          upsells: Object.fromEntries(upsells.map((u) => [u, { qtd: 0, fat: 0 }])),
          reembolsos: 0, reembolsoValor: 0, obs: obsPorDia[data] ?? '',
        }
        dias.set(data, d)
      }
      return d
    }

    // Todos os dias do range aparecem, mesmo zerados (igual à planilha).
    for (let dt = new Date(`${dInicio}T12:00:00Z`); ; dt.setUTCDate(dt.getUTCDate() + 1)) {
      const s = dt.toISOString().slice(0, 10)
      if (s > dFim) break
      diaDe(s)
    }

    for (const g of gastos) {
      const d = diaDe(g.data)
      d.investimento += Number(g.valor_gasto) || 0
      d.impressoes += Number(g.impressions) || 0
      d.cliques += Number(g.clicks) || 0
      d.lpViews += Number(g.lp_views) || 0
      d.checkouts += Number(g.checkouts) || 0
    }

    for (const d of dias.values()) {
      const impostoDia = Number(impostoPorDia[d.data]) || 0
      if (!impostoDia) continue
      if (gastoTotalPorDia) {
        const total = gastoTotalPorDia.get(d.data) ?? 0
        d.imposto = total > 0 ? impostoDia * (d.investimento / total) : 0
      } else {
        d.imposto = impostoDia
      }
    }

    for (const v of vendas) {
      const diaSP = formatInTimeZone(new Date(v.data), TZ, 'yyyy-MM-dd')
      if (diaSP < dInicio || diaSP > dFim) continue
      const d = diaDe(diaSP)
      if (v.status !== 'approved') {
        // Reembolso/chargeback conta no funil só se o produto pertence a ele.
        if (v.produto === funil.produto_front || orderbumps.includes(v.produto ?? '') || upsells.includes(v.produto ?? '')) {
          d.reembolsos += 1
          d.reembolsoValor += liquido(v)
        }
        continue
      }
      if (v.produto === funil.produto_front) {
        d.vendasFront += 1
        d.fatFront += liquido(v)
        d.fatFunil += liquido(v)
        d.vendasTotais += 1
      } else if (orderbumps.includes(v.produto ?? '')) {
        const o = d.orderbumps[v.produto!]
        o.qtd += 1; o.fat += liquido(v)
        d.fatFunil += liquido(v); d.vendasTotais += 1
      } else if (upsells.includes(v.produto ?? '')) {
        const u = d.upsells[v.produto!]
        u.qtd += 1; u.fat += liquido(v)
        d.fatFunil += liquido(v); d.vendasTotais += 1
      }
    }

    const linhas = [...dias.values()].sort((a, b) => a.data.localeCompare(b.data))
    return NextResponse.json({
      dias: linhas,
      funil: { id: funil.id, nome: funil.nome, vsl_id: funil.vsl_id ?? null, produto_front: funil.produto_front, orderbumps, upsells, campanhas },
      checkoutsDisponivel,
      obsDisponivel,
    })
  } catch (e: any) {
    console.error('[funil/diario]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
