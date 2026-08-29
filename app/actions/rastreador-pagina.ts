'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import { capturarPaginaCore, acharVslUrl, acharVslUrls, BUCKET_PRINTS, type ResultadoCaptura } from '@/lib/vigia-pagina'

// Captura a página-alvo (landing_url) de uma biblioteca e versiona se mudou.
// O trabalho pesado mora em lib/vigia-pagina.ts (compartilhado com o cron do
// vigia 24/7); aqui só resolvemos a organização da sessão.
export async function capturarPagina(bibliotecaId: string, urlOverride?: string): Promise<ResultadoCaptura> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    return await capturarPaginaCore(orgId, bibliotecaId, urlOverride)
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Acha a URL reproduzível da VSL na última versão salva da página do
// concorrente (mp4/m3u8 direto ou resolvendo o player VTurb). O cliente usa
// essa URL na fila de transcrição (/api/rastreador/transcrever).
export async function acharVslConcorrente(bibliotecaId: string): Promise<{ success: boolean; url?: string; origem?: string; error?: string }> {
  try {
    const { data: ultima } = await supabaseAdmin
      .from('rastreador_paginas_hist').select('html')
      .eq('biblioteca_id', bibliotecaId).order('capturado_em', { ascending: false }).limit(1).maybeSingle()
    if (!ultima?.html) return { success: false, error: 'Ainda não capturei a página desse concorrente — o vigia roda de hora em hora, ou clique em Capturar/versionar.' }
    const vsl = await acharVslUrl(ultima.html)
    if (!vsl) return { success: false, error: 'Não achei vídeo reproduzível nessa página (player pode carregar o vídeo só depois de interação).' }
    return { success: true, url: vsl.url, origem: vsl.origem }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Lista TODOS os vídeos achados na última versão salva da página (pro
// seletor: o usuário escolhe qual transcrever/baixar quando há mais de um).
export interface VslCandidata { url: string; origem: string; download: string }
export async function listarVslsConcorrente(bibliotecaId: string): Promise<{ success: boolean; itens: VslCandidata[]; error?: string }> {
  try {
    const { data: ultima } = await supabaseAdmin
      .from('rastreador_paginas_hist').select('html')
      .eq('biblioteca_id', bibliotecaId).order('capturado_em', { ascending: false }).limit(1).maybeSingle()
    if (!ultima?.html) return { success: false, itens: [], error: 'Ainda não capturei a página desse concorrente — o vigia roda de hora em hora, ou clique em Capturar/versionar.' }
    const achados = await acharVslUrls(ultima.html)
    if (!achados.length) return { success: false, itens: [], error: 'Não achei vídeo reproduzível nessa página (player pode carregar o vídeo só depois de interação).' }
    const { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } = await import('@/lib/transcritor')
    const itens = achados.map((a) => ({
      ...a,
      download: a.url.toLowerCase().includes('.m3u8')
        ? `${TRANSCRITOR_URL}/download?video_url=${encodeURIComponent(a.url)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`
        : a.url,
    }))
    return { success: true, itens }
  } catch (e: any) {
    return { success: false, itens: [], error: e.message }
  }
}

// Monta o link de download da VSL do concorrente como .mp4. Vídeo mp4 direto
// baixa da fonte; m3u8 (streaming VTurb) passa pelo /download do transcritor
// na VPS, que remonta o arquivo com ffmpeg. O link carrega a chave da VPS —
// ok pro uso interno do painel, não é pra compartilhar por aí.
export async function linkDownloadVsl(bibliotecaId: string): Promise<{ success: boolean; url?: string; error?: string }> {
  const achado = await acharVslConcorrente(bibliotecaId)
  if (!achado.success || !achado.url) return { success: false, error: achado.error }
  if (!achado.url.toLowerCase().includes('.m3u8')) return { success: true, url: achado.url }
  const { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } = await import('@/lib/transcritor')
  return { success: true, url: `${TRANSCRITOR_URL}/download?video_url=${encodeURIComponent(achado.url)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}` }
}

export interface VersaoPagina {
  id: string
  url: string
  titulo: string | null
  precos: string[]
  stack: { id: string; label: string }[] | null
  resumo_mudanca: string | null
  capturado_em: string
  print_url: string | null
}

export async function listarVersoesPagina(bibliotecaId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_paginas_hist')
      .select('id, url, titulo, precos, stack, resumo_mudanca, capturado_em, conteudo_hash')
      .eq('biblioteca_id', bibliotecaId).order('capturado_em', { ascending: false }).limit(40)
    if (error) throw error
    // O print (se existir) mora no Storage num caminho determinístico
    // <bibId>/<hash>.jpg — a URL pública é derivável sem consultar nada; a UI
    // esconde a imagem se o arquivo não existir (onError).
    const versoes = (data ?? []).map((v: any) => ({
      ...v,
      print_url: v.conteudo_hash
        ? supabaseAdmin.storage.from(BUCKET_PRINTS).getPublicUrl(`${bibliotecaId}/${v.conteudo_hash}.jpg`).data.publicUrl
        : null,
    }))
    return { success: true, data: versoes as VersaoPagina[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as VersaoPagina[] }
  }
}
