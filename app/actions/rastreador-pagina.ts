'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import { capturarPaginaCore, type ResultadoCaptura } from '@/lib/vigia-pagina'

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

export interface VersaoPagina {
  id: string
  url: string
  titulo: string | null
  precos: string[]
  stack: { id: string; label: string }[] | null
  resumo_mudanca: string | null
  capturado_em: string
}

export async function listarVersoesPagina(bibliotecaId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_paginas_hist')
      .select('id, url, titulo, precos, stack, resumo_mudanca, capturado_em')
      .eq('biblioteca_id', bibliotecaId).order('capturado_em', { ascending: false }).limit(40)
    if (error) throw error
    return { success: true, data: (data ?? []) as VersaoPagina[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as VersaoPagina[] }
  }
}
