'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import { capturarPaginaCore, acharVslUrl, BUCKET_PRINTS, type ResultadoCaptura } from '@/lib/vigia-pagina'

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
