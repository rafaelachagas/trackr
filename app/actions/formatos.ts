'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'

// O que o usuário acrescenta ao catálogo de formatos: referências salvas,
// anotações e a marca de "já testei". Guardado em `configuracoes` como JSON
// (formatos_<orgId>), sem tabela nova — o catálogo em si é código.
//
// Nada aqui apaga formato: se amanhã o catálogo crescer, o que você anotou
// continua onde estava, porque a chave é o id do formato.

export interface Referencia {
  id: string
  url: string
  nota?: string
  salvoEm: string
}

export interface DadosFormato {
  referencias: Referencia[]
  anotacoes?: string
  testado?: boolean
  favorito?: boolean
  // Transcrição de cada exemplo, pela chave do arquivo no Storage. Guardada
  // porque transcrever custa minutos de VPS: a segunda vez tem que ser grátis.
  transcricoes?: Record<string, string>
}

export type MapaFormatos = Record<string, DadosFormato>

const LIMITE_REFS = 60

async function ler(orgId: string): Promise<MapaFormatos> {
  try {
    const { data } = await supabaseAdmin.from('configuracoes')
      .select('valor').eq('chave', `formatos_${orgId}`).maybeSingle()
    return data?.valor ? JSON.parse(data.valor) : {}
  } catch { return {} }
}

async function gravar(orgId: string, mapa: MapaFormatos) {
  await supabaseAdmin.from('configuracoes').upsert(
    {
      chave: `formatos_${orgId}`,
      valor: JSON.stringify(mapa),
      org_id: orgId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'chave' })
}

function vazio(): DadosFormato {
  return { referencias: [] }
}

export async function listarFormatos(): Promise<{ success: boolean; data: MapaFormatos }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, data: {} }
  return { success: true, data: await ler(orgId) }
}

export async function salvarReferencia(
  formatoId: string, url: string, nota?: string,
): Promise<{ success: boolean; data?: MapaFormatos; error?: string }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false, error: 'sessão expirada' }
  const limpo = (url || '').trim()
  // Link é o conteúdo aqui: salvar texto solto enche a lista de coisa que não
  // abre, e aí ninguém mais confia na lista.
  if (!/^https?:\/\/\S+$/i.test(limpo)) return { success: false, error: 'cole um link começando com http' }

  const mapa = await ler(orgId)
  const atual = mapa[formatoId] || vazio()
  if (atual.referencias.some((r) => r.url === limpo)) {
    return { success: false, error: 'esse link já está salvo neste formato' }
  }
  atual.referencias = [
    { id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`, url: limpo, nota: (nota || '').trim() || undefined, salvoEm: new Date().toISOString() },
    ...atual.referencias,
  ].slice(0, LIMITE_REFS)
  mapa[formatoId] = atual
  await gravar(orgId, mapa)
  return { success: true, data: mapa }
}

export async function removerReferencia(
  formatoId: string, refId: string,
): Promise<{ success: boolean; data?: MapaFormatos }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false }
  const mapa = await ler(orgId)
  const atual = mapa[formatoId]
  if (!atual) return { success: true, data: mapa }
  atual.referencias = atual.referencias.filter((r) => r.id !== refId)
  mapa[formatoId] = atual
  await gravar(orgId, mapa)
  return { success: true, data: mapa }
}

export async function salvarTranscricao(
  formatoId: string, caminho: string, texto: string,
): Promise<{ success: boolean; data?: MapaFormatos }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false }
  const mapa = await ler(orgId)
  const atual = mapa[formatoId] || vazio()
  atual.transcricoes = { ...(atual.transcricoes || {}), [caminho]: texto.slice(0, 20000) }
  mapa[formatoId] = atual
  await gravar(orgId, mapa)
  return { success: true, data: mapa }
}

export async function atualizarFormato(
  formatoId: string, campos: { anotacoes?: string; testado?: boolean; favorito?: boolean },
): Promise<{ success: boolean; data?: MapaFormatos }> {
  const orgId = await resolveOrgId()
  if (!orgId) return { success: false }
  const mapa = await ler(orgId)
  const atual = mapa[formatoId] || vazio()
  if (campos.anotacoes !== undefined) atual.anotacoes = campos.anotacoes.slice(0, 4000)
  if (campos.testado !== undefined) atual.testado = campos.testado
  if (campos.favorito !== undefined) atual.favorito = campos.favorito
  mapa[formatoId] = atual
  await gravar(orgId, mapa)
  return { success: true, data: mapa }
}
