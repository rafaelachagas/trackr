'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'

async function getActiveOrgId(): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabaseAdmin
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  return data?.org_id ?? null
}

export interface SimulacaoResumo {
  id: string
  nome: string
  dados: any
  created_at: string
}

export async function listarSimulacoes(): Promise<SimulacaoResumo[]> {
  const org_id = await getActiveOrgId()
  if (!org_id) return []
  const { data, error } = await supabaseAdmin
    .from('simulacoes_funil')
    .select('id, nome, dados, created_at')
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as SimulacaoResumo[]
}

export async function salvarSimulacao(nome: string, dados: any, id?: string): Promise<{ success: boolean; id?: string; error?: string }> {
  const org_id = await getActiveOrgId()
  if (!org_id) return { success: false, error: 'Organização não encontrada. Faça login novamente.' }
  const nomeLimpo = (nome ?? '').trim() || 'Sem nome'
  if (id) {
    const { error } = await supabaseAdmin
      .from('simulacoes_funil')
      .update({ nome: nomeLimpo, dados, updated_at: new Date().toISOString() })
      .eq('id', id).eq('org_id', org_id)
    if (error) return { success: false, error: error.message }
    return { success: true, id }
  }
  const { data, error } = await supabaseAdmin
    .from('simulacoes_funil')
    .insert({ org_id, nome: nomeLimpo, dados })
    .select('id').single()
  if (error) return { success: false, error: error.message }
  return { success: true, id: data?.id }
}

export async function deletarSimulacao(id: string): Promise<{ success: boolean; error?: string }> {
  const org_id = await getActiveOrgId()
  if (!org_id) return { success: false, error: 'Organização não encontrada.' }
  const { error } = await supabaseAdmin
    .from('simulacoes_funil')
    .delete().eq('id', id).eq('org_id', org_id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
