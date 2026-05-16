'use server'

import { supabaseAdmin } from '@/lib/supabase'

export async function getProdutos() {
  const { data, error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar produtos:', error)
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

export async function addProduto(nome: string, tipo: 'front' | 'upsell') {
  const { data, error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .insert([{ nome_produto: nome, tipo: tipo }])
    .select()

  if (error) {
    console.error('Erro ao adicionar produto:', error)
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

export async function deleteProduto(id: string) {
  const { error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erro ao excluir produto:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}
