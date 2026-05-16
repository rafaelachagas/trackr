'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { startOfDay, endOfDay, subDays, format } from 'date-fns'

export async function getDashboardData(product: string, startDate: string, endDate: string) {
  try {
    let queryVendas = supabaseAdmin.from('vendas').select('valor, data, tipo')
    let queryGastos = supabaseAdmin.from('gastos').select('valor_gasto, data')

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

    const [vendasRes, gastosRes] = await Promise.all([queryVendas, queryGastos])

    if (vendasRes.error) throw vendasRes.error
    if (gastosRes.error) throw gastosRes.error

    const totalRevenue = (vendasRes.data || []).reduce((acc, v) => acc + Number(v.valor), 0)
    const totalSpend = (gastosRes.data || []).reduce((acc, g) => acc + Number(g.valor_gasto), 0)
    const salesCount = (vendasRes.data || []).length
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    return {
      success: true,
      metrics: {
        revenue: totalRevenue,
        spend: totalSpend,
        roas: roas,
        salesCount: salesCount
      },
      vendas: vendasRes.data,
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
