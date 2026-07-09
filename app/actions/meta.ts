'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

/**
 * Resolve o org_id ativo. A tabela `configuracoes` tem org_id NOT NULL — sem ele
 * o upsert de uma chave nova quebra ("null value in column org_id").
 * Usa a org do usuário logado; cai para a primeira org (single-tenant).
 */
async function resolveOrgId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabaseAdmin
        .from('organization_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      if (data?.org_id) return data.org_id
    }
  } catch {}
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()
  return org?.id ?? null
}

/**
 * Persiste a seleção de contas de anúncio.
 * Roda no servidor com service role — o write client-side em `configuracoes`
 * falhava silenciosamente, então só uma conta persistia. Aqui é garantido.
 * IDs vêm sem o prefixo "act_".
 */
export async function salvarContasAnuncio(ids: string[]) {
  const org_id = await resolveOrgId()
  if (!org_id) return { success: false, error: 'Organização não encontrada. Faça login novamente.' }

  // dedup + limpa prefixo act_ por segurança
  const limpos = Array.from(new Set(ids.map((id) => id.replace('act_', '').trim()).filter(Boolean)))
  const now = new Date().toISOString()

  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    [
      { chave: 'meta_ad_account_ids', valor: JSON.stringify(limpos), org_id, updated_at: now },
      // Mantém o campo legado (single) apontando para a primeira conta
      { chave: 'meta_ad_account_id', valor: limpos[0] ?? '', org_id, updated_at: now },
    ],
    { onConflict: 'chave' }
  )
  if (error) return { success: false, error: error.message }

  revalidatePath('/data-sources/ad-accounts')
  return { success: true, contas: limpos }
}

export async function desconectarContaMeta() {
  const org_id = await resolveOrgId()
  if (!org_id) return { success: false, error: 'Organização não encontrada. Faça login novamente.' }

  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    [
      { chave: 'meta_access_token', valor: '', org_id, updated_at: now },
      { chave: 'meta_user_name', valor: '', org_id, updated_at: now },
      { chave: 'meta_ad_account_ids', valor: '[]', org_id, updated_at: now },
      { chave: 'meta_ad_account_id', valor: '', org_id, updated_at: now },
    ],
    { onConflict: 'chave' }
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/data-sources/ad-accounts')
  return { success: true }
}
