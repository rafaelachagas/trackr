'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import { MODELO_PADRAO, parseModelo } from '@/lib/llm-models'

function mascarar(chave: string): string {
  const s = chave.trim()
  if (s.length <= 10) return '••••'
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}

export interface StatusLLM {
  modelo: string            // "provider:id"
  temAnthropic: boolean
  temGemini: boolean
  mascaraAnthropic: string | null
  mascaraGemini: string | null
}

export async function getStatusLLM(): Promise<{ success: boolean; data: StatusLLM }> {
  try {
    const [sel, a, g] = await Promise.all([
      supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'llm_modelo').maybeSingle(),
      supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'anthropic_api_key').maybeSingle(),
      supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'gemini_api_key').maybeSingle(),
    ])
    const aKey = a.data?.valor?.toString().trim() || ''
    const gKey = g.data?.valor?.toString().trim() || ''
    return {
      success: true,
      data: {
        modelo: sel.data?.valor?.toString().trim() || MODELO_PADRAO,
        temAnthropic: !!aKey, temGemini: !!gKey,
        mascaraAnthropic: aKey ? mascarar(aKey) : null,
        mascaraGemini: gKey ? mascarar(gKey) : null,
      },
    }
  } catch {
    return { success: true, data: { modelo: MODELO_PADRAO, temAnthropic: false, temGemini: false, mascaraAnthropic: null, mascaraGemini: null } }
  }
}

export async function salvarModeloLLM(selecao: string) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const { provider, id } = parseModelo(selecao)
    const valor = `${provider}:${id}`
    const { error } = await supabaseAdmin.from('configuracoes').upsert(
      { chave: 'llm_modelo', valor, org_id: orgId, updated_at: new Date().toISOString() }, { onConflict: 'chave' })
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// provider: 'anthropic' | 'gemini'
export async function salvarChaveLLM(provider: 'anthropic' | 'gemini', chave: string) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const token = (chave || '').trim()
    if (token.length < 10) return { success: false, error: 'Chave inválida — cole a chave completa.' }
    const nome = provider === 'gemini' ? 'gemini_api_key' : 'anthropic_api_key'
    const { error } = await supabaseAdmin.from('configuracoes').upsert(
      { chave: nome, valor: token, org_id: orgId, updated_at: new Date().toISOString() }, { onConflict: 'chave' })
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function removerChaveLLM(provider: 'anthropic' | 'gemini') {
  try {
    const nome = provider === 'gemini' ? 'gemini_api_key' : 'anthropic_api_key'
    const { error } = await supabaseAdmin.from('configuracoes').delete().eq('chave', nome)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
