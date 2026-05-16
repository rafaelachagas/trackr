'use server'

import { supabaseAdmin } from '@/lib/supabase'

export async function getVendas(
  startDate: string,
  endDate: string,
  produto?: string,
  status?: string,
  page = 1,
  pageSize = 50
) {
  try {
    let query = supabaseAdmin
      .from('vendas')
      .select('*', { count: 'exact' })
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
