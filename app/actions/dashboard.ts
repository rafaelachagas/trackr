'use server'

import { supabaseAdmin } from '@/lib/supabase'


export async function getDashboardData(product: string, startDate: string, endDate: string) {
  try {
    // Faturamento vem das vendas REAIS da Hotmart (aprovadas). Os lançamentos
    // manuais (transaction_id 'manual_%') continuam no banco, mas ficam de fora
    // daqui para não contar a mesma venda duas vezes.
    // Paginação: o PostgREST corta em 1000 linhas por request; sem isso a soma
    // sairia subestimada em períodos com muitas vendas.
    async function fetchVendasReais() {
      const todas: { valor: number; valor_liquido: number | null; data: string; tipo: string | null; produto: string | null }[] = []
      for (let offset = 0; ; offset += 1000) {
        let q = supabaseAdmin
          .from('vendas')
          .select('valor, valor_liquido, data, tipo, produto')
          .eq('status', 'approved')
          .not('transaction_id', 'like', 'manual_%')
          .range(offset, offset + 999)
        if (product !== 'Qualquer') q = q.eq('produto', product)
        if (startDate) q = q.gte('data', startDate)
        if (endDate) q = q.lte('data', endDate)
        const { data, error } = await q
        if (error) throw error
        if (!data || data.length === 0) break
        todas.push(...(data as any))
        if (data.length < 1000) break
      }
      return todas
    }

    let queryGastos = supabaseAdmin.from('gastos').select('valor_gasto, data').is('ad_id', null)
    if (startDate) queryGastos = queryGastos.gte('data', startDate)
    if (endDate) queryGastos = queryGastos.lte('data', endDate)

    const [vendas, gastosRes, produtosRes] = await Promise.all([
      fetchVendasReais(),
      queryGastos,
      supabaseAdmin.from('produtos_mapeamento').select('nome_produto, tipo').eq('ativo', true),
    ])

    if (gastosRes.error) throw gastosRes.error

    // Mapa produto -> tipo para classificar vendas sem tipo definido
    const produtoTipoMap = new Map<string, string>()
    for (const p of (produtosRes.data ?? [])) {
      produtoTipoMap.set(p.nome_produto, p.tipo)
    }
    // Faturamento LÍQUIDO: usa valor_liquido (comissão do produtor = o que a Hotmart
    // mostra como "Receita Líquida"). Fallback para valor bruto se o líquido não
    // estiver preenchido (venda ainda não reconciliada via /sales/commissions).
    const totalRevenue = vendas.reduce((acc, v) => acc + Number(v.valor_liquido ?? v.valor), 0)
    const totalSpend = (gastosRes.data || []).reduce((acc, g) => acc + Number(g.valor_gasto), 0)
    const salesCount = vendas.length
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    // Resolve tipo via mapeamento quando o campo está nulo
    const vendasComTipo = vendas.map((v: any) => ({
      ...v,
      tipo: v.tipo ?? produtoTipoMap.get(v.produto) ?? 'front',
    }))

    return {
      success: true,
      metrics: {
        revenue: totalRevenue,
        spend: totalSpend,
        roas: roas,
        salesCount: salesCount
      },
      vendas: vendasComTipo,
      gastos: gastosRes.data
    }
  } catch (error: any) {
    console.error('Error in getDashboardData action:', error)
    return { success: false, error: error.message }
  }
}

export async function fetchActiveProducts() {
  const { data, error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .select('nome_produto')
    .eq('ativo', true)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data.map(p => p.nome_produto) }
}
