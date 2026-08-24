'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'

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
  // produtos_mapeamento.org_id é NOT NULL — sem isso o insert falha
  // ("null value in column org_id") pra QUALQUER produto novo.
  const orgId = await resolveOrgId()
  const { data, error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .insert([{ nome_produto: nome, tipo: tipo, org_id: orgId }])
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
