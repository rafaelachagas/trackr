'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { hashTexto } from '@/lib/llm'

async function resolveOrgId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  return data?.id ?? null
}

// Extrai texto legível de um HTML (sem libs): remove script/style e tags.
function htmlParaTexto(html: string): { titulo: string | null; texto: string } {
  const tituloMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const titulo = tituloMatch ? tituloMatch[1].trim().slice(0, 200) : null
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  return { titulo, texto }
}

// Detecta preços no texto (R$ 97, 12x de 9,70, R$1.997,00...).
function detectarPrecos(texto: string): string[] {
  const rx = /(?:R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?)|(?:\d{1,2}x\s?(?:de\s?)?R?\$?\s?\d{1,3}(?:,\d{2})?)/gi
  const achados = (texto.match(rx) ?? []).map((s) => s.replace(/\s+/g, ' ').trim())
  return [...new Set(achados)].slice(0, 25)
}

function resumirMudanca(anterior: { texto: string | null; precos: string[] } | null, atualTexto: string, atualPrecos: string[]): string {
  if (!anterior) return 'Primeira captura da página.'
  const partes: string[] = []
  const antes = new Set(anterior.precos ?? [])
  const agora = new Set(atualPrecos)
  const novos = atualPrecos.filter((p) => !antes.has(p))
  const sumiram = (anterior.precos ?? []).filter((p) => !agora.has(p))
  if (novos.length) partes.push(`Preços novos: ${novos.join(', ')}`)
  if (sumiram.length) partes.push(`Preços que sumiram: ${sumiram.join(', ')}`)
  const dTam = atualTexto.length - (anterior.texto?.length ?? 0)
  if (Math.abs(dTam) > 200) partes.push(`Conteúdo ${dTam > 0 ? 'aumentou' : 'diminuiu'} ~${Math.abs(dTam)} caracteres`)
  return partes.length ? partes.join(' · ') : 'Mudança detectada no conteúdo da página.'
}

// Captura a página-alvo (landing_url) de uma biblioteca e versiona se mudou.
export async function capturarPagina(bibliotecaId: string, urlOverride?: string) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')

    const { data: bib } = await supabaseAdmin
      .from('rastreador_bibliotecas').select('landing_url').eq('id', bibliotecaId).maybeSingle()
    const url = (urlOverride || bib?.landing_url || '').trim()
    if (!url) return { success: false, error: 'Cadastre a URL da página de vendas do concorrente primeiro.' }

    // Se veio override, salva como landing_url oficial.
    if (urlOverride && urlOverride.trim()) {
      await supabaseAdmin.from('rastreador_bibliotecas').update({ landing_url: urlOverride.trim() }).eq('id', bibliotecaId)
    }

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    let html = ''
    try {
      const r = await fetch(url, {
        signal: ctrl.signal, cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheTrackBot/1.0)' },
      })
      if (!r.ok) return { success: false, error: `A página respondeu ${r.status}.` }
      html = await r.text()
    } finally { clearTimeout(t) }

    const { titulo, texto } = htmlParaTexto(html)
    const precos = detectarPrecos(texto)
    const hash = hashTexto(texto)

    // Última versão salva.
    const { data: ultima } = await supabaseAdmin
      .from('rastreador_paginas_hist').select('conteudo_hash, texto, precos')
      .eq('biblioteca_id', bibliotecaId).order('capturado_em', { ascending: false }).limit(1).maybeSingle()

    if (ultima && ultima.conteudo_hash === hash) {
      return { success: true, mudou: false }
    }

    const resumo = resumirMudanca(
      ultima ? { texto: ultima.texto, precos: (ultima.precos as string[]) ?? [] } : null, texto, precos)

    const { error } = await supabaseAdmin.from('rastreador_paginas_hist').insert({
      org_id: orgId, biblioteca_id: bibliotecaId, url, titulo,
      conteudo_hash: hash, texto: texto.slice(0, 20000), precos, resumo_mudanca: resumo,
    })
    if (error) throw error
    return { success: true, mudou: true, resumo, precos }
  } catch (e: any) {
    return { success: false, error: e?.name === 'AbortError' ? 'A página demorou demais para responder.' : e.message }
  }
}

export interface VersaoPagina {
  id: string
  url: string
  titulo: string | null
  precos: string[]
  resumo_mudanca: string | null
  capturado_em: string
}

export async function listarVersoesPagina(bibliotecaId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_paginas_hist')
      .select('id, url, titulo, precos, resumo_mudanca, capturado_em')
      .eq('biblioteca_id', bibliotecaId).order('capturado_em', { ascending: false }).limit(40)
    if (error) throw error
    return { success: true, data: (data ?? []) as VersaoPagina[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as VersaoPagina[] }
  }
}
