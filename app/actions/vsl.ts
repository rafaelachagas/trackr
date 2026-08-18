'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

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

export interface VSL {
  id: string
  nome: string
  vturb_player_id: string
  vturb_player_name: string | null
  video_duration: number | null
  landing_url: string | null
  campanhas: string[]           // ids de campanha; [] = todas
  ativo: boolean
  created_at: string
}

export interface CampanhaMeta { id: string; nome: string }

export async function listarVSLs() {
  try {
    const { data, error } = await supabaseAdmin
      .from('vsls').select('*').order('created_at', { ascending: false })
    if (error) throw error
    const vsls = (data ?? []).map((v: any) => ({
      ...v,
      campanhas: Array.isArray(v.campanhas) ? v.campanhas : [],
    })) as VSL[]
    return { success: true, data: vsls }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as VSL[] }
  }
}

export async function salvarVSL(input: {
  id?: string
  nome: string
  vturb_player_id: string
  vturb_player_name?: string | null
  video_duration?: number | null
  landing_url?: string | null
  campanhas: string[]
}) {
  try {
    const org_id = await resolveOrgId()
    if (!org_id) return { success: false, error: 'Organização não encontrada.' }
    if (!input.nome?.trim()) return { success: false, error: 'Dê um nome ao VSL.' }
    if (!input.vturb_player_id) return { success: false, error: 'Escolha o player da VTurb.' }

    const row = {
      org_id,
      nome: input.nome.trim(),
      vturb_player_id: input.vturb_player_id,
      vturb_player_name: input.vturb_player_name ?? null,
      video_duration: input.video_duration ?? null,
      landing_url: input.landing_url?.trim() || null,
      campanhas: input.campanhas ?? [],
      ativo: true,
    }
    const { error } = input.id
      ? await supabaseAdmin.from('vsls').update(row).eq('id', input.id)
      : await supabaseAdmin.from('vsls').upsert(row, { onConflict: 'org_id,vturb_player_id' })
    if (error) throw error
    revalidatePath('/data-sources/vturb')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function removerVSL(id: string) {
  try {
    const { error } = await supabaseAdmin.from('vsls').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/data-sources/vturb')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Lista as campanhas da Meta (distintas) a partir dos gastos já sincronizados,
// pra o usuário mapear no cadastro de VSL. Pagina pra não cortar em 1000.
export async function listarCampanhasMeta() {
  try {
    const mapa = new Map<string, string>()
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabaseAdmin
        .from('gastos')
        .select('campaign_id, campaign_name')
        .not('campaign_id', 'is', null)
        .range(off, off + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const g of data) {
        const id = String((g as any).campaign_id ?? '').trim()
        if (id && !mapa.has(id)) mapa.set(id, String((g as any).campaign_name ?? id))
      }
      if (data.length < 1000) break
    }
    const campanhas = [...mapa.entries()].map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
    return { success: true, data: campanhas as CampanhaMeta[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as CampanhaMeta[] }
  }
}
