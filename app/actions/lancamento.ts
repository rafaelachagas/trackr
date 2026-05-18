'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export async function adicionarVenda(payload: {
  data: string
  criativo: string
  produto: string
  valor: number
}) {
  const { error } = await supabaseAdmin.from('vendas').insert({
    data: `${payload.data}T12:00:00`,
    criativo: payload.criativo,
    produto: payload.produto,
    valor: payload.valor,
    valor_liquido: payload.valor,
    status: 'approved',
    tipo: 'front',
    transaction_id: `manual_${Date.now()}`,
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
}) {
  const { error } = await supabaseAdmin.from('gastos').upsert({
    data: payload.data,
    criativo: payload.criativo,
    ad_name: `${payload.criativo}_manual_${Date.now()}`,
    campaign_name: payload.campanha ?? null,
    valor_gasto: payload.valor_gasto,
    impressions: 0,
    clicks: 0,
  }, { onConflict: 'ad_name' })
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
    .limit(200)
  if (error) return { success: false, data: [] }
  return { success: true, data: data ?? [] }
}

export async function listarGastosManuais() {
  const { data, error } = await supabaseAdmin
    .from('gastos')
    .select('id, data, criativo, campaign_name, valor_gasto')
    .is('ad_id', null)
    .order('data', { ascending: false })
    .limit(200)
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
