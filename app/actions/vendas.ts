'use server'

import { supabaseAdmin } from '@/lib/supabase'

// Busca upsells sem criativo e tenta vincular ao front do mesmo email (janela 48h)
// Só reprocessa upsells RECENTES (30 dias) — sem isso a lista de órfãos só
// cresce (chegou a 5.877 em todo o histórico) e o loop sequencial de N+1
// queries fazia a página Sales levar minutos pra carregar. Upsell antigo que
// nunca achou o front não vai achar depois — não adianta reprocessar pra sempre.
export async function reprocessarUpsellsSemCriativo() {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: upsells } = await supabaseAdmin
    .from('vendas')
    .select('id, buyer_email, data')
    .eq('tipo', 'upsell')
    .not('buyer_email', 'is', null)
    .or('criativo.is.null,fase.is.null')
    .gte('data', desde)
    .limit(500)

  if (!upsells || upsells.length === 0) return

  // Busca os fronts candidatos de TODOS os e-mails de uma vez (1 query em vez
  // de N) e casa em memória pela janela de 48h — mesmo resultado, sem N+1.
  const emails = [...new Set(upsells.map((u) => u.buyer_email).filter(Boolean))]
  const janelaMin = new Date(Math.min(...upsells.map((u) => new Date(u.data).getTime())) - 48 * 60 * 60 * 1000).toISOString()
  const { data: fronts } = await supabaseAdmin
    .from('vendas')
    .select('id, buyer_email, criativo, fase, campanha, sck, vsl, data')
    .eq('tipo', 'front')
    .in('buyer_email', emails)
    .gte('data', janelaMin)
    .order('data', { ascending: false })

  const frontsPorEmail = new Map<string, typeof fronts>()
  for (const f of fronts ?? []) {
    if (!frontsPorEmail.has(f.buyer_email!)) frontsPorEmail.set(f.buyer_email!, [])
    frontsPorEmail.get(f.buyer_email!)!.push(f)
  }

  for (const upsell of upsells) {
    if (!upsell.buyer_email) continue
    const janela = new Date(upsell.data).getTime() - 48 * 60 * 60 * 1000
    const front = (frontsPorEmail.get(upsell.buyer_email) ?? []).find(
      (f) => new Date(f.data).getTime() >= janela && new Date(f.data).getTime() <= new Date(upsell.data).getTime()
    )
    if (front?.criativo) {
      await supabaseAdmin
        .from('vendas')
        .update({
          venda_front_id: front.id,
          criativo: front.criativo,
          fase: front.fase,
          campanha: front.campanha,
          sck: front.sck,
          vsl: front.vsl,
          atribuicao_manual: true,
        })
        .eq('id', upsell.id)
    }
  }
}

export async function getVendasStats(
  startDate: string,
  endDate: string,
  produto?: string
) {
  try {
    // Vendas REAIS aprovadas (exclui lançamentos manuais). Pagina para somar a
    // receita sem o corte de 1000 linhas do PostgREST.
    let approvedCount = 0
    let totalRevenue = 0
    for (let offset = 0; ; offset += 1000) {
      let query = supabaseAdmin
        .from('vendas')
        .select('valor, valor_liquido', { count: 'exact' })
        .eq('status', 'approved')
        .not('transaction_id', 'like', 'manual_%')
        .gte('data', startDate)
        .lte('data', endDate)
        .range(offset, offset + 999)

      if (produto && produto !== 'Qualquer') {
        query = query.ilike('produto', `%${produto}%`)
      }

      const { data, error, count } = await query
      if (error) return { success: false, error: error.message }
      if (count != null) approvedCount = count
      const rows = data ?? []
      totalRevenue += rows.reduce((acc, v) => acc + (v.valor_liquido ?? v.valor ?? 0), 0)
      if (rows.length < 1000) break
    }

    return { success: true, approvedCount, totalRevenue }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function getVendas(
  startDate: string,
  endDate: string,
  produto?: string,
  status?: string,
  page = 1,
  pageSize = 50
) {
  try {
    // Histórico de transações REAIS da Hotmart (exclui lançamentos manuais).
    let query = supabaseAdmin
      .from('vendas')
      .select('*', { count: 'exact' })
      .not('transaction_id', 'like', 'manual_%')
      .gte('data', startDate)
      .lte('data', endDate)
      .order('data', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (produto && produto !== 'Qualquer') {
      query = query.ilike('produto', `%${produto}%`)
    }

    if (status && status !== 'todos') {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) return { success: false, error: error.message }

    return { success: true, data, count }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
