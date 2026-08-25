'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import { enviarWhatsapp } from '@/lib/whatsapp-send'
import { EVOLUTION_APIKEY } from '@/lib/whatsapp'

export interface AlertaLog {
  id: string
  tipo: string
  titulo: string | null
  mensagem: string | null
  severidade: string
  enviado_whatsapp: boolean
  visto: boolean
  criado_em: string
}

export async function listarAlertas(limite = 40) {
  try {
    const { data, error } = await supabaseAdmin
      .from('alertas_log')
      .select('id, tipo, titulo, mensagem, severidade, enviado_whatsapp, visto, criado_em')
      .order('criado_em', { ascending: false }).limit(limite)
    if (error) throw error
    return { success: true, data: (data ?? []) as AlertaLog[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as AlertaLog[] }
  }
}

export async function marcarAlertasVistos(ids?: string[]) {
  try {
    let q = supabaseAdmin.from('alertas_log').update({ visto: true }).eq('visto', false)
    if (ids && ids.length) q = q.in('id', ids)
    const { error } = await q
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export interface ConfigAlertas {
  numeros: string[]
  ativo: boolean
  ctrDrop: number
  cpmRise: number
  minImpr: number
  anomaliaPct: number
}

const PADRAO: ConfigAlertas = { numeros: [], ativo: false, ctrDrop: 0.25, cpmRise: 0.30, minImpr: 1000, anomaliaPct: 0.5 }

async function lerJson(chave: string): Promise<any | null> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', chave).maybeSingle()
  if (!data?.valor) return null
  try { return typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor } catch { return null }
}

export async function getConfigAlertas(): Promise<{ success: boolean; data: ConfigAlertas }> {
  try {
    const whats = (await lerJson('alertas_whatsapp')) ?? {}
    const cfg = (await lerJson('alertas_config')) ?? {}
    return {
      success: true,
      data: {
        numeros: Array.isArray(whats.numeros) ? whats.numeros : [],
        ativo: !!whats.ativo,
        ctrDrop: Number(cfg.ctrDrop) || PADRAO.ctrDrop,
        cpmRise: Number(cfg.cpmRise) || PADRAO.cpmRise,
        minImpr: Number(cfg.minImpr) || PADRAO.minImpr,
        anomaliaPct: Number(cfg.anomaliaPct) || PADRAO.anomaliaPct,
      },
    }
  } catch {
    return { success: true, data: PADRAO }
  }
}

export async function salvarConfigAlertas(cfg: ConfigAlertas) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const numeros = (cfg.numeros ?? []).map((n) => String(n).replace(/\D/g, '')).filter((n) => n.length >= 8)
    const whats = { numeros, ativo: !!cfg.ativo }
    const conf = {
      ctrDrop: Number(cfg.ctrDrop) || PADRAO.ctrDrop,
      cpmRise: Number(cfg.cpmRise) || PADRAO.cpmRise,
      minImpr: Number(cfg.minImpr) || PADRAO.minImpr,
      anomaliaPct: Number(cfg.anomaliaPct) || PADRAO.anomaliaPct,
    }
    const now = new Date().toISOString()
    const { error: e1 } = await supabaseAdmin.from('configuracoes').upsert(
      { chave: 'alertas_whatsapp', valor: JSON.stringify(whats), org_id: orgId, updated_at: now }, { onConflict: 'chave' })
    if (e1) throw e1
    const { error: e2 } = await supabaseAdmin.from('configuracoes').upsert(
      { chave: 'alertas_config', valor: JSON.stringify(conf), org_id: orgId, updated_at: now }, { onConflict: 'chave' })
    if (e2) throw e2
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// "Ligado" no toggle só grava a preferência — não prova que o envio funciona
// (chave do Evolution errada, instância caída, número não é do WhatsApp etc.
// falham em silêncio dentro de broadcastAlerta). Este botão dispara uma
// mensagem de teste de verdade pra cada número salvo e reporta o resultado.
export async function testarWhatsapp(): Promise<{ success: boolean; error?: string; enviados: number; total: number }> {
  if (!EVOLUTION_APIKEY) {
    return { success: false, error: 'EVOLUTION_APIKEY não configurada no servidor — o envio nunca vai funcionar até isso ser corrigido.', enviados: 0, total: 0 }
  }
  const whats = (await lerJson('alertas_whatsapp')) ?? {}
  const numeros: string[] = Array.isArray(whats.numeros) ? whats.numeros : []
  if (!numeros.length) {
    return { success: false, error: 'Nenhum número salvo pra testar.', enviados: 0, total: 0 }
  }
  let ok = 0
  for (const n of numeros) {
    if (await enviarWhatsapp(n, '✅ Teste de alerta — The Track. Se você recebeu essa mensagem, o envio de alertas por WhatsApp está funcionando.')) ok++
  }
  if (ok === 0) {
    return { success: false, error: 'Nenhuma mensagem foi entregue — confira se a instância do WhatsApp está conectada e se os números estão corretos.', enviados: 0, total: numeros.length }
  }
  return { success: true, enviados: ok, total: numeros.length }
}
