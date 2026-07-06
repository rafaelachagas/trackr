'use server'

import { supabaseAdmin } from '@/lib/supabase'

// Busca upsells sem criativo e tenta vincular ao front do mesmo email (janela 48h)
export async function reprocessarUpsellsSemCriativo() {
  // Busca upsells sem criativo OU sem fase (para completar atribuição parcial)
  const { data: upsells } = await supabaseAdmin
    .from('vendas')
    .select('id, buyer_email, data')
    .eq('tipo', 'upsell')
    .not('buyer_email', 'is', null)
    .or('criativo.is.null,fase.is.null')

  if (!upsells || upsells.length === 0) return

  for (const upsell of upsells) {
    const janela = new Date(new Date(upsell.data).getTime() - 48 * 60 * 60 * 1000).toISOString()

    const { data: front } = await supabaseAdmin
      .from('vendas')
      .select('id, criativo, fase, campanha, sck, vsl')
      .eq('buyer_email', upsell.buyer_email)
      .eq('tipo', 'front')
      .gte('data', janela)
      .order('data', { ascending: false })
      .limit(1)
      .single()

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
