'use server'

import { supabaseAdmin } from '@/lib/supabase'


export async function getDashboardData(product: string, startDate: string, endDate: string) {
  try {
    let queryVendas = supabaseAdmin.from('vendas').select('valor, data, tipo, produto').like('transaction_id', 'manual_%')
    let queryGastos = supabaseAdmin.from('gastos').select('valor_gasto, data').is('ad_id', null)

    if (product !== 'Qualquer') {
      queryVendas = queryVendas.eq('produto', product)
    }

    if (startDate) {
      queryVendas = queryVendas.gte('data', startDate)
      queryGastos = queryGastos.gte('data', startDate)
    }
    if (endDate) {
      queryVendas = queryVendas.lte('data', endDate)
      queryGastos = queryGastos.lte('data', endDate)
    }

    const [vendasRes, gastosRes, produtosRes] = await Promise.all([
      queryVendas,
      queryGastos,
      supabaseAdmin.from('produtos_mapeamento').select('nome_produto, tipo').eq('ativo', true),
    ])

    if (vendasRes.error) throw vendasRes.error
    if (gastosRes.error) throw gastosRes.error

    // Mapa produto -> tipo para classificar vendas sem tipo definido
    const produtoTipoMap = new Map<string, string>()
    for (const p of (produtosRes.data ?? [])) {
      produtoTipoMap.set(p.nome_produto, p.tipo)
    }

    const vendas = vendasRes.data || []
    const totalRevenue = vendas.reduce((acc, v) => acc + Number(v.valor), 0)
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
