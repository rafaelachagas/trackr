'use server'

import { supabaseAdmin } from '@/lib/supabase'
import {
  CONFIG_KEY, DEFAULT_WPP_CONFIG, parseWppConfig, WppConfig,
  EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY,
} from '@/lib/whatsapp'

export async function getWhatsappConfig(): Promise<WppConfig> {
  const { data } = await supabaseAdmin
    .from('configuracoes')
    .select('valor')
    .eq('chave', CONFIG_KEY)
    .maybeSingle()
  return parseWppConfig(data?.valor)
}

export async function saveWhatsappConfig(config: WppConfig): Promise<{ success: boolean; error?: string }> {
  // Sanitiza minimamente
  const limpo: WppConfig = {
    commands: (config.commands ?? []).map((c) => ({
      id: c.id,
      trigger: (c.trigger ?? '').trim().toLowerCase(),
      enabled: !!c.enabled,
      blocks: Array.isArray(c.blocks) ? c.blocks : [],
      header: c.header ?? '',
      footer: c.footer ?? '',
    })).filter((c) => c.trigger),
    groups: (config.groups ?? []).map((g) => ({
      jid: g.jid,
      name: g.name ?? '',
      enabled: !!g.enabled,
      allowedBlocks: Array.isArray(g.allowedBlocks) ? g.allowedBlocks : [],
    })),
  }
  const { error } = await supabaseAdmin
    .from('configuracoes')
    .upsert({ chave: CONFIG_KEY, valor: JSON.stringify(limpo) }, { onConflict: 'chave' })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export interface GrupoWpp { jid: string; name: string }

// Lista os grupos em que o número está (via Evolution). Fonte pra escolher
// quais grupos o bot atende e as permissões de cada um.
export async function listWhatsappGroups(): Promise<{ groups: GrupoWpp[]; error?: string }> {
  if (!EVOLUTION_APIKEY) return { groups: [], error: 'EVOLUTION_APIKEY não configurada' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    const res = await fetch(
      `${EVOLUTION_URL}/group/fetchAllGroups/${EVOLUTION_INSTANCE}?getParticipants=false`,
      { headers: { apikey: EVOLUTION_APIKEY }, signal: ctrl.signal, cache: 'no-store' }
    ).finally(() => clearTimeout(t))
    if (!res.ok) return { groups: [], error: `Evolution ${res.status}` }
    const data = await res.json()
    const arr = Array.isArray(data) ? data : (data?.groups ?? [])
    const groups: GrupoWpp[] = arr
      .filter((g: any) => g?.id?.endsWith?.('@g.us'))
      .map((g: any) => ({ jid: g.id, name: g.subject ?? g.id }))
    return { groups }
  } catch (e: any) {
    return { groups: [], error: e?.message ?? String(e) }
  }
}
