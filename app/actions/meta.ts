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

/**
 * Salva a alíquota do imposto sobre gastos em anúncios (Meta), em %.
 * Aplicada só às contas BRL, no momento do sync (ver lib/meta-fatores).
 * Aceita vírgula ou ponto ("13,83" / "13.83"). Zero desliga o imposto.
 */
export async function salvarImpostoMeta(aliquota: string) {
  const org_id = await resolveOrgId()
  if (!org_id) return { success: false, error: 'Organização não encontrada. Faça login novamente.' }

  const pct = parseFloat(String(aliquota).replace(',', '.'))
  if (isNaN(pct) || pct < 0 || pct > 100) {
    return { success: false, error: 'Alíquota inválida — use um número entre 0 e 100 (ex: 13,83).' }
  }

  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: 'meta_imposto_pct', valor: String(pct), org_id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' }
  )
  if (error) return { success: false, error: error.message }

  revalidatePath('/data-sources/ad-accounts')
  return { success: true, pct }
}

/**
 * Conecta a Meta colando um token manualmente (System User vitalício ou token
 * estendido do Graph Explorer). Alternativa ao "Entrar com Facebook" (OAuth) —
 * útil quando o OAuth falha ou quando se quer um token que não expira.
 * Valida o token na Meta, salva e devolve nome + contas pra seleção.
 */
export async function conectarMetaComToken(tokenRaw: string) {
  const token = (tokenRaw ?? '').trim()
  if (!token) return { success: false, error: 'Cole um token antes de conectar.' }
  const org_id = await resolveOrgId()
  if (!org_id) return { success: false, error: 'Organização não encontrada. Faça login novamente.' }

  const V = 'https://graph.facebook.com/v25.0'
  try {
    const me = await fetch(`${V}/me?fields=name&access_token=${encodeURIComponent(token)}`).then((r) => r.json())
    if (me?.error) return { success: false, error: `Token inválido: ${me.error.message}` }

    const accRes = await fetch(`${V}/me/adaccounts?fields=id,name,currency,account_status&limit=500&access_token=${encodeURIComponent(token)}`).then((r) => r.json())
    if (accRes?.error) return { success: false, error: `Erro ao listar contas: ${accRes.error.message}` }
    const accounts = (accRes?.data ?? []).map((a: any) => ({ id: a.id, name: a.name, currency: a.currency, account_status: a.account_status }))

    const now = new Date().toISOString()
    const { error } = await supabaseAdmin.from('configuracoes').upsert(
      [
        { chave: 'meta_access_token', valor: token, org_id, updated_at: now },
        { chave: 'meta_user_name', valor: me?.name || 'Token manual', org_id, updated_at: now },
      ],
      { onConflict: 'chave' }
    )
    if (error) return { success: false, error: error.message }

    revalidatePath('/data-sources/ad-accounts')
    return { success: true, userName: me?.name || '', accounts }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) }
  }
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
