'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'

// Afazeres — lista de tarefas do The Track, guardada em `configuracoes` como JSON
// (afazeres_<orgId>), sem tabela nova. Persiste por organização (todos veem a
// mesma lista, some do localStorage do exemplo).

export type SecaoAfazer = 'urgente' | 'andamento' | 'planejado' | 'rotina'
export type PrioridadeAfazer = 'alta' | 'media' | 'baixa' | 'rotina'

export interface Afazer {
  id: string
  titulo: string
  descricao?: string
  secao: SecaoAfazer
  prioridade: PrioridadeAfazer
  prazo?: string        // texto livre, ex.: "Até sexta"
  feito: boolean
  criadoEm: string
}

async function ler(orgId: string): Promise<Afazer[]> {
  try {
    const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', `afazeres_${orgId}`).maybeSingle()
    return data?.valor ? JSON.parse(data.valor) : []
  } catch { return [] }
}
async function gravar(orgId: string, itens: Afazer[]) {
  await supabaseAdmin.from('configuracoes').upsert(
    { chave: `afazeres_${orgId}`, valor: JSON.stringify(itens.slice(0, 500)), org_id: orgId, updated_at: new Date().toISOString() },
    { onConflict: 'chave' })
}

export async function listarAfazeres(): Promise<{ success: boolean; data: Afazer[] }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: [] }
  return { success: true, data: await ler(orgId) }
}

export async function adicionarAfazer(input: {
  titulo: string; descricao?: string; secao: SecaoAfazer; prioridade: PrioridadeAfazer; prazo?: string
}): Promise<{ success: boolean; data?: Afazer[]; error?: string }> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    if (!input.titulo?.trim()) return { success: false, error: 'O título é obrigatório.' }
    const itens = await ler(orgId)
    itens.unshift({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      titulo: input.titulo.trim(),
      descricao: input.descricao?.trim() || undefined,
      secao: input.secao,
      prioridade: input.prioridade,
      prazo: input.prazo?.trim() || undefined,
      feito: false,
      criadoEm: new Date().toISOString(),
    })
    await gravar(orgId, itens)
    return { success: true, data: itens }
  } catch (e: any) { return { success: false, error: e.message } }
}

export async function atualizarAfazer(id: string, patch: Partial<Omit<Afazer, 'id' | 'criadoEm'>>): Promise<{ success: boolean; data: Afazer[] }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: [] }
  const itens = await ler(orgId)
  const it = itens.find((x) => x.id === id)
  if (it) {
    if (patch.titulo !== undefined) it.titulo = patch.titulo.trim()
    if (patch.descricao !== undefined) it.descricao = patch.descricao?.trim() || undefined
    if (patch.secao !== undefined) it.secao = patch.secao
    if (patch.prioridade !== undefined) it.prioridade = patch.prioridade
    if (patch.prazo !== undefined) it.prazo = patch.prazo?.trim() || undefined
    if (patch.feito !== undefined) it.feito = patch.feito
    await gravar(orgId, itens)
  }
  return { success: true, data: itens }
}

export async function alternarAfazer(id: string): Promise<{ success: boolean; data: Afazer[] }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: [] }
  const itens = await ler(orgId)
  const it = itens.find((x) => x.id === id)
  if (it) { it.feito = !it.feito; await gravar(orgId, itens) }
  return { success: true, data: itens }
}

export async function removerAfazer(id: string): Promise<{ success: boolean; data: Afazer[] }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: [] }
  const itens = (await ler(orgId)).filter((x) => x.id !== id)
  await gravar(orgId, itens)
  return { success: true, data: itens }
}
