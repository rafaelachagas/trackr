'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

/**
 * Persiste a seleção de contas de anúncio.
 * Roda no servidor com service role — o write client-side em `configuracoes`
 * falhava silenciosamente (RLS/anon), então só uma conta persistia. Aqui é garantido.
 * IDs vêm sem o prefixo "act_".
 */
export async function salvarContasAnuncio(ids: string[]) {
  // dedup + limpa prefixo act_ por segurança
  const limpos = Array.from(new Set(ids.map((id) => id.replace('act_', '').trim()).filter(Boolean)))

  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: 'meta_ad_account_ids', valor: JSON.stringify(limpos), updated_at: new Date().toISOString() },
    { onConflict: 'chave' }
  )
  if (error) return { success: false, error: error.message }

  // Mantém o campo legado (single) apontando para a primeira conta
  await supabaseAdmin.from('configuracoes').upsert(
    { chave: 'meta_ad_account_id', valor: limpos[0] ?? '', updated_at: new Date().toISOString() },
    { onConflict: 'chave' }
  )

  revalidatePath('/data-sources/ad-accounts')
  return { success: true, contas: limpos }
}

export async function desconectarContaMeta() {
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    [
      { chave: 'meta_access_token', valor: '', updated_at: now },
      { chave: 'meta_user_name', valor: '', updated_at: now },
      { chave: 'meta_ad_account_ids', valor: '[]', updated_at: now },
      { chave: 'meta_ad_account_id', valor: '', updated_at: now },
    ],
    { onConflict: 'chave' }
  )
  if (error) return { success: false, error: error.message }
  revalidatePath('/data-sources/ad-accounts')
  return { success: true }
}
