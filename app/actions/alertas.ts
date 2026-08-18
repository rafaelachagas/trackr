'use server'

import { supabaseAdmin } from '@/lib/supabase'

async function resolveOrgId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  return data?.id ?? null
}

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
