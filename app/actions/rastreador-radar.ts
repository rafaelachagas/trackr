'use server'

import { supabaseAdmin } from '@/lib/supabase'

async function resolveOrgId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  return data?.id ?? null
}

export interface RadarTermo {
  id: string
  termo: string
  pais: string
  ativo: boolean
  ultima_busca: string | null
  criado_em: string
}

export interface RadarAchado {
  id: string
  termo_id: string | null
  page_id: string
  page_name: string | null
  amostra_texto: string | null
  qtd_anuncios: number
  status: string
  achado_em: string
}

export async function listarRadarTermos() {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_radar_termos').select('*').order('criado_em', { ascending: false })
    if (error) throw error
    return { success: true, data: (data ?? []) as RadarTermo[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as RadarTermo[] }
  }
}

export async function salvarRadarTermo(termo: string, pais = 'BR') {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const t = (termo || '').trim()
    if (t.length < 2) return { success: false, error: 'Termo muito curto.' }
    const { error } = await supabaseAdmin.from('rastreador_radar_termos').insert({ org_id: orgId, termo: t, pais })
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function removerRadarTermo(id: string) {
  try {
    const { error } = await supabaseAdmin.from('rastreador_radar_termos').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function listarRadarAchados(status?: string) {
  try {
    let q = supabaseAdmin
      .from('rastreador_radar_achados')
      .select('id, termo_id, page_id, page_name, amostra_texto, qtd_anuncios, status, achado_em')
      .order('achado_em', { ascending: false }).limit(100)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) throw error
    return { success: true, data: (data ?? []) as RadarAchado[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as RadarAchado[] }
  }
}

// Marca um achado como ignorado ou adicionado (quando o usuário decide).
export async function atualizarRadarAchado(id: string, status: 'novo' | 'ignorado' | 'adicionado') {
  try {
    const { error } = await supabaseAdmin.from('rastreador_radar_achados').update({ status }).eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
