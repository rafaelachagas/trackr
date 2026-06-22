'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export type Criativo = {
  id: string
  nome: string
  prefixo: string
  tipo_campanha: string
  objetivo: string
  fase: string | null
  campaign_name: string
  status: 'ativo' | 'pausado'
  link_anuncio: string | null
  thumbnail_url: string | null
  created_at: string
}

export type NovoCriativo = {
  nome: string
  prefixo: string
  tipo_campanha: string
  objetivo: string
  fase: string | null
  link_anuncio?: string | null
  thumbnail_url?: string | null
}

function buildCampaignName(prefixo: string, tipo: string, objetivo: string, fase: string | null) {
  const parts = [`[${prefixo}]`, `[${tipo}]`, `[${objetivo}]`, '[F]']
  if (fase) parts.push(`[${fase}]`)
  return parts.join('')
}

export async function listarCriativos() {
  const { data, error } = await supabaseAdmin
    .from('criativos')
    .select('*')
    .order('status', { ascending: true })
    .order('nome', { ascending: true })
  if (error) return { success: false, data: [] as Criativo[] }
  return { success: true, data: (data ?? []) as Criativo[] }
}

export async function listarCriativosAtivos() {
  const { data, error } = await supabaseAdmin
    .from('criativos')
    .select('nome, campaign_name, fase')
    .eq('status', 'ativo')
    .order('nome')
  if (error) return []
  return data ?? []
}

export async function criarCriativo(payload: NovoCriativo) {
  const campaign_name = buildCampaignName(payload.prefixo, payload.tipo_campanha, payload.objetivo, payload.fase)
  const { error } = await supabaseAdmin.from('criativos').insert({
    nome: payload.nome,
    prefixo: payload.prefixo,
    tipo_campanha: payload.tipo_campanha,
    objetivo: payload.objetivo,
    fase: payload.fase ?? null,
    campaign_name,
    link_anuncio: payload.link_anuncio || null,
    thumbnail_url: payload.thumbnail_url || null,
    status: 'ativo',
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/criativos')
  revalidatePath('/lancamento')
  return { success: true }
}

export async function editarCriativo(id: string, payload: NovoCriativo) {
  const campaign_name = buildCampaignName(payload.prefixo, payload.tipo_campanha, payload.objetivo, payload.fase)
  const { error } = await supabaseAdmin.from('criativos').update({
    nome: payload.nome,
    prefixo: payload.prefixo,
    tipo_campanha: payload.tipo_campanha,
    objetivo: payload.objetivo,
    fase: payload.fase ?? null,
    campaign_name,
    link_anuncio: payload.link_anuncio || null,
    thumbnail_url: payload.thumbnail_url || null,
  }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/criativos')
  revalidatePath('/lancamento')
  return { success: true }
}

export async function toggleStatusCriativo(id: string, novoStatus: 'ativo' | 'pausado') {
  const { error } = await supabaseAdmin.from('criativos').update({ status: novoStatus }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/criativos')
  return { success: true }
}

export async function deletarCriativo(id: string) {
  const { error } = await supabaseAdmin.from('criativos').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/criativos')
  revalidatePath('/lancamento')
  return { success: true }
}
