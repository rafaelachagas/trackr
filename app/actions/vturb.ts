'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { mascararToken } from '@/lib/vturb'

const CHAVE = 'vturb_api_key'

async function resolveOrgId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabaseAdmin
        .from('organization_members').select('org_id').eq('user_id', user.id).limit(1).single()
      if (data?.org_id) return data.org_id
    }
  } catch {}
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  return org?.id ?? null
}

// Status da conexão (sem devolver o token em claro — só a máscara).
export async function getVturbStatus() {
  try {
    const { data } = await supabaseAdmin
      .from('configuracoes').select('valor, updated_at').eq('chave', CHAVE).maybeSingle()
    const token = data?.valor?.toString().trim() ?? ''
    return {
      success: true,
      conectado: !!token,
      mascara: token ? mascararToken(token) : null,
      atualizadoEm: data?.updated_at ?? null,
    }
  } catch (e: any) {
    return { success: false, error: e.message, conectado: false, mascara: null, atualizadoEm: null }
  }
}

export async function salvarVturbKey(key: string) {
  const org_id = await resolveOrgId()
  if (!org_id) return { success: false, error: 'Organização não encontrada. Faça login novamente.' }
  const token = (key || '').trim()
  if (token.length < 20) return { success: false, error: 'Chave inválida — cole a API Key completa da VTurb.' }

  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: CHAVE, valor: token, org_id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' }
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/data-sources/vturb')
  return { success: true }
}

export async function removerVturbKey() {
  const { error } = await supabaseAdmin.from('configuracoes').delete().eq('chave', CHAVE)
  if (error) return { success: false, error: error.message }
  revalidatePath('/data-sources/vturb')
  return { success: true }
}
