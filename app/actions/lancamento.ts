'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function adicionarVenda(payload: {
  data: string
  criativo: string
  produto: string
  valor: number
  org_id: string
}) {
  // Trava: não permite duplicata de criativo+produto no mesmo dia
  const { data: existente } = await supabaseAdmin
    .from('vendas')
    .select('id')
    .like('transaction_id', 'manual_%')
    .eq('criativo', payload.criativo)
    .eq('produto', payload.produto)
    .gte('data', `${payload.data}T00:00:00`)
    .lte('data', `${payload.data}T23:59:59`)
    .limit(1)
    .single()

  if (existente) {
    return { success: false, error: `Já existe um lançamento de "${payload.produto}" para este criativo nesta data.` }
  }

  const { error } = await supabaseAdmin.from('vendas').insert({
    data: `${payload.data}T12:00:00`,
    criativo: payload.criativo,
    produto: payload.produto,
    valor: payload.valor,
    valor_liquido: payload.valor,
    status: 'approved',
    tipo: 'front',
    transaction_id: `manual_${Date.now()}`,
    org_id: payload.org_id,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true }
}

export async function adicionarGasto(payload: {
  data: string
  criativo: string
  campanha?: string
  valor_gasto: number
  org_id: string
}) {
  // Trava: não permite duplicata de criativo no mesmo dia
  const { data: existente } = await supabaseAdmin
    .from('gastos')
    .select('id')
    .is('ad_id', null)
    .eq('criativo', payload.criativo)
    .eq('data', payload.data)
    .limit(1)
    .single()

  if (existente) {
    return { success: false, error: `Já existe um gasto lançado para este criativo nesta data.` }
  }

  const { error } = await supabaseAdmin.from('gastos').insert({
    data: payload.data,
    criativo: payload.criativo,
    ad_name: `${payload.criativo}_manual_${Date.now()}`,
    campaign_name: payload.campanha ?? null,
    valor_gasto: payload.valor_gasto,
    impressions: 0,
    clicks: 0,
    org_id: payload.org_id,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true }
}

export async function editarVenda(id: string, payload: { valor: number; produto: string; data: string }) {
  const { error } = await supabaseAdmin
    .from('vendas')
    .update({ valor: payload.valor, valor_liquido: payload.valor, produto: payload.produto, data: `${payload.data}T12:00:00` })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true }
}

export async function editarGasto(id: string, payload: { valor_gasto: number; data: string }) {
  const { error } = await supabaseAdmin
    .from('gastos')
    .update({ valor_gasto: payload.valor_gasto, data: payload.data })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true }
}

export async function listarVendasManuais() {
  const { data, error } = await supabaseAdmin
    .from('vendas')
    .select('id, data, criativo, produto, valor')
    .like('transaction_id', 'manual_%')
    .order('data', { ascending: false })
    .limit(5000)
  if (error) return { success: false, data: [] }
  return { success: true, data: data ?? [] }
}

export async function listarGastosManuais() {
  const { data, error } = await supabaseAdmin
    .from('gastos')
    .select('id, data, criativo, campaign_name, valor_gasto')
    .is('ad_id', null)
    .order('data', { ascending: false })
    .limit(5000)
  if (error) return { success: false, data: [] }
  return { success: true, data: data ?? [] }
}

export async function deletarVenda(id: string) {
  const { error } = await supabaseAdmin.from('vendas').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deletarGasto(id: string) {
  const { error } = await supabaseAdmin.from('gastos').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function limparTodasVendas() {
  const { error } = await supabaseAdmin.from('vendas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function limparTodosGastos() {
  const { error } = await supabaseAdmin.from('gastos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function getProdutos() {
  const { data } = await supabaseAdmin
    .from('produtos_mapeamento')
    .select('nome_produto')
    .order('nome_produto')
  return data?.map(p => p.nome_produto) ?? []
}
