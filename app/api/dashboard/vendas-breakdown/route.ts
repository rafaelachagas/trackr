import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { toZonedTime } from 'date-fns-tz'
import { subDays, format } from 'date-fns'
import { spRangeISO, extrairCriativoCompleto } from '@/lib/utils'
import { classificarTipo } from '@/lib/classificar'

const TIMEZONE = 'America/Sao_Paulo'

// Quebras de venda pro overview e pra aba Vendas × Criativos, no período:
//  - porProduto: contagem + receita líquida por produto
//  - tipo: front/upsell + % de conversão de upsell
//  - porPagamento: front/upsell por método (só daqui pra frente — ver coluna nova)
//  - porCriativo: front, upsell, reembolsos por criativo
export interface ProdutoBreak { produto: string; count: number; receita: number }
export interface PagamentoBreak { metodo: string; front: number; upsell: number; total: number }
export interface CriativoBreak {
  criativo: string; codigo: string | null; fase: string | null
  front: number; upsell: number; reembolsoCount: number; reembolsoValor: number
  // Timing do reembolso (só preenche em reembolsos com data_reembolso capturada —
  // daqui pra frente): quantos aconteceram em ≤24h / ≤48h / ≤7d, quantos têm
  // timing conhecido, e a mediana de horas até o reembolso.
  reemb24: number; reemb48: number; reemb7d: number; reembTiming: number; medHorasReemb: number | null
}
export interface VendasBreakdown {
  porProduto: ProdutoBreak[]
  tipo: { front: number; upsell: number; outro: number; conversaoUpsellPct: number }
  porPagamento: PagamentoBreak[]
  pagamentoDisponivel: boolean
  porCriativo: CriativoBreak[]
}

type Aprovada = { produto: string | null; tipo: string | null; criativo: string | null; sck: string | null; fase: string | null; valor: number; valor_liquido: number | null; metodo_pagamento?: string | null }
type Reemb = { criativo: string | null; sck: string | null; fase: string | null; valor: number; valor_liquido: number | null; data?: string | null; data_reembolso?: string | null }

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

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const agora = toZonedTime(new Date(), TIMEZONE)
    const dInicio = sp.get('d_inicio') ?? format(subDays(agora, 6), 'yyyy-MM-dd')
    const dFim = sp.get('d_fim') ?? format(agora, 'yyyy-MM-dd')
    // ISO (UTC) das bordas do dia em SP — evita puxar vendas da noite anterior.
    const { desde, ate } = spRangeISO(dInicio, dFim)

    // Vendas aprovadas (não-manuais). Tenta com metodo_pagamento; se a coluna
    // ainda não existe (SQL não rodado), refaz sem ela — o resto não quebra.
    let pagamentoDisponivel = true
    let aprovadas: Aprovada[]
    try {
      aprovadas = await fetchAll<Aprovada>((from, to) =>
        supabaseAdmin
          .from('vendas')
          .select('produto, tipo, criativo, sck, fase, valor, valor_liquido, metodo_pagamento')
          .eq('status', 'approved')
          .not('transaction_id', 'like', 'manual_%')
          .gte('data', desde).lte('data', ate)
          .range(from, to)
      )
    } catch {
      pagamentoDisponivel = false
      aprovadas = await fetchAll<Aprovada>((from, to) =>
        supabaseAdmin
          .from('vendas')
          .select('produto, tipo, criativo, sck, fase, valor, valor_liquido')
          .eq('status', 'approved')
          .not('transaction_id', 'like', 'manual_%')
          .gte('data', desde).lte('data', ate)
          .range(from, to)
      )
    }

    // Tenta com data_reembolso (timing); se a coluna não existe ainda, refaz sem.
    let reembolsos: Reemb[]
    try {
      reembolsos = await fetchAll<Reemb>((from, to) =>
        supabaseAdmin
          .from('vendas')
          .select('criativo, sck, fase, valor, valor_liquido, data, data_reembolso')
          .in('status', ['refunded', 'chargeback'])
          .not('transaction_id', 'like', 'manual_%')
          .gte('data', desde).lte('data', ate)
          .range(from, to)
      )
    } catch {
      reembolsos = await fetchAll<Reemb>((from, to) =>
        supabaseAdmin
          .from('vendas')
          .select('criativo, sck, fase, valor, valor_liquido')
          .in('status', ['refunded', 'chargeback'])
          .not('transaction_id', 'like', 'manual_%')
          .gte('data', desde).lte('data', ate)
          .range(from, to)
      )
    }

    const { data: mapeamentos } = await supabaseAdmin
      .from('produtos_mapeamento').select('nome_produto, tipo').eq('ativo', true)

    // Líquido com imputação: linhas sem valor_liquido (não reconciliadas via
    // /sales/commissions) não somam o BRUTO (inflava os reembolsos antigos ~5×);
    // usam a razão líquido/bruto observada no próprio conjunto. Ver dashboard.ts.
    function ratioOf(rows: { valor: number; valor_liquido: number | null }[]) {
      let l = 0, b = 0
      for (const r of rows) if (r.valor_liquido != null) { l += Number(r.valor_liquido) || 0; b += Number(r.valor) || 0 }
      return b > 0 ? l / b : 1
    }
    const ratioAprov = ratioOf(aprovadas)
    const ratioReemb = ratioOf(reembolsos)
    const liqCom = (v: { valor: number; valor_liquido: number | null }, ratio: number) =>
      v.valor_liquido != null ? (Number(v.valor_liquido) || 0) : (Number(v.valor) || 0) * ratio
    const liq = (v: { valor: number; valor_liquido: number | null }) => liqCom(v, ratioAprov)
    const liqR = (v: { valor: number; valor_liquido: number | null }) => liqCom(v, ratioReemb)

    // Por produto
    const prodMap = new Map<string, ProdutoBreak>()
    // Por pagamento × funil
    const pagMap = new Map<string, PagamentoBreak>()
    // Por criativo
    const criMap = new Map<string, CriativoBreak>()
    const novoCri = (nome: string, codigo: string | null, fase: string | null): CriativoBreak => ({
      criativo: nome, codigo, fase, front: 0, upsell: 0, reembolsoCount: 0, reembolsoValor: 0,
      reemb24: 0, reemb48: 0, reemb7d: 0, reembTiming: 0, medHorasReemb: null,
    })
    let front = 0, upsell = 0, outro = 0

    for (const v of aprovadas) {
      const tipo = classificarTipo(v.produto, mapeamentos)
      if (tipo === 'front') front++; else if (tipo === 'upsell') upsell++; else outro++

      const prod = v.produto ?? 'Desconhecido'
      const p = prodMap.get(prod) ?? { produto: prod, count: 0, receita: 0 }
      p.count++; p.receita += liq(v)
      prodMap.set(prod, p)

      // Funil de pagamento e por-criativo só olham front/upsell (outros ficam de fora).
      if (tipo === 'front' || tipo === 'upsell') {
        const metodo = (v.metodo_pagamento ?? '').trim() || 'Não informado'
        const pg = pagMap.get(metodo) ?? { metodo, front: 0, upsell: 0, total: 0 }
        if (tipo === 'upsell') pg.upsell++; else pg.front++
        pg.total++
        pagMap.set(metodo, pg)

        // agrupa pelo NOME COMPLETO do criativo (parte 3 do sck); cai no código
        // reduzido só se não houver sck descritivo (ex.: import manual antigo).
        const nome = extrairCriativoCompleto(v.sck) || v.criativo
        if (nome) {
          const c = criMap.get(nome) ?? novoCri(nome, v.criativo, v.fase)
          if (!c.fase && v.fase) c.fase = v.fase
          if (!c.codigo && v.criativo) c.codigo = v.criativo
          if (tipo === 'upsell') c.upsell++; else c.front++
          criMap.set(nome, c)
        }
      }
    }

    // horas até o reembolso, por criativo (só das que têm data_reembolso)
    const horasReemb = new Map<string, number[]>()
    for (const r of reembolsos) {
      const nome = extrairCriativoCompleto(r.sck) || r.criativo
      if (!nome) continue
      const c = criMap.get(nome) ?? novoCri(nome, r.criativo, r.fase)
      if (!c.fase && r.fase) c.fase = r.fase
      c.reembolsoCount++; c.reembolsoValor += liqR(r)
      if (r.data && r.data_reembolso) {
        const h = (new Date(r.data_reembolso).getTime() - new Date(r.data).getTime()) / 3_600_000
        if (h >= 0 && h < 24 * 400) { // ignora lixo (negativo ou > ~1 ano)
          c.reembTiming++
          if (h <= 24) c.reemb24++
          if (h <= 48) c.reemb48++
          if (h <= 24 * 7) c.reemb7d++
          const arr = horasReemb.get(nome) ?? []; arr.push(h); horasReemb.set(nome, arr)
        }
      }
      criMap.set(nome, c)
    }
    // mediana de horas até reembolsar
    for (const [nome, arr] of horasReemb) {
      const c = criMap.get(nome); if (!c) continue
      arr.sort((a, b) => a - b)
      const m = arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2
      c.medHorasReemb = m
    }

    const out: VendasBreakdown = {
      porProduto: [...prodMap.values()].sort((a, b) => b.count - a.count),
      tipo: { front, upsell, outro, conversaoUpsellPct: front > 0 ? (upsell / front) * 100 : 0 },
      porPagamento: [...pagMap.values()].sort((a, b) => b.total - a.total),
      pagamentoDisponivel,
      porCriativo: [...criMap.values()].sort((a, b) => b.front - a.front),
    }
    return NextResponse.json(out)
  } catch (err) {
    console.error('[vendas-breakdown]', err)
    return NextResponse.json({ error: `Erro interno: ${err}` }, { status: 500 })
  }
}
