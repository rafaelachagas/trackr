'use server'

import { supabaseAdmin } from '@/lib/supabase'

async function resolveOrgId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  return data?.id ?? null
}

export interface BibliotecaRastreada {
  id: string
  page_id: string
  page_name: string | null
  link: string | null
  freq_dias: number | null
  ativo: boolean
  ultima_puxada: string | null
  created_at: string
}

export async function listarBibliotecas() {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_bibliotecas')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return { success: true, data: (data ?? []) as BibliotecaRastreada[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as BibliotecaRastreada[] }
  }
}

export async function salvarBiblioteca(pageId: string, pageName: string | null, link: string | null, freqDias: number | null) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const { error } = await supabaseAdmin
      .from('rastreador_bibliotecas')
      .upsert(
        { org_id: orgId, page_id: pageId, page_name: pageName, link, freq_dias: freqDias, ativo: true },
        { onConflict: 'org_id,page_id' }
      )
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function definirAgendamento(id: string, freqDias: number | null) {
  try {
    const { error } = await supabaseAdmin
      .from('rastreador_bibliotecas').update({ freq_dias: freqDias }).eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function removerBiblioteca(id: string) {
  try {
    const { error } = await supabaseAdmin.from('rastreador_bibliotecas').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Transcrições — cache por anúncio (ad_archive_id).
export async function salvarTranscricao(adArchiveId: string, videoUrl: string | null, texto: string) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const { error } = await supabaseAdmin
      .from('rastreador_transcricoes')
      .upsert({ org_id: orgId, ad_archive_id: adArchiveId, video_url: videoUrl, texto }, { onConflict: 'org_id,ad_archive_id' })
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function getTranscricoes(adIds: string[]) {
  try {
    if (!adIds.length) return { success: true, data: {} as Record<string, string> }
    const { data, error } = await supabaseAdmin
      .from('rastreador_transcricoes')
      .select('ad_archive_id, texto')
      .in('ad_archive_id', adIds)
    if (error) throw error
    const map: Record<string, string> = {}
    for (const r of data ?? []) if (r.ad_archive_id && r.texto) map[r.ad_archive_id] = r.texto
    return { success: true, data: map }
  } catch (e: any) {
    return { success: false, error: e.message, data: {} as Record<string, string> }
  }
}
