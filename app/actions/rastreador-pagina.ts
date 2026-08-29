'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import { capturarPaginaCore, acharVslUrl, acharVslUrls, linkProxyVsl, detectarAbTeste, htmlParaTexto, extrairHeadline, detectarPrecos, detectarStack, atualizarDiarioAb, lerDiarioConcorrente, BUCKET_PRINTS, type ResultadoCaptura, type EventoDiario } from '@/lib/vigia-pagina'

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
export interface VslCandidata { url: string; origem: string; download: string; peso?: number }
export async function listarVslsConcorrente(bibliotecaId: string): Promise<{ success: boolean; itens: VslCandidata[]; error?: string }> {
  try {
    const { data: ultima } = await supabaseAdmin
      .from('rastreador_paginas_hist').select('html')
      .eq('biblioteca_id', bibliotecaId).order('capturado_em', { ascending: false }).limit(1).maybeSingle()
    if (!ultima?.html) return { success: false, itens: [], error: 'Ainda não capturei a página desse concorrente — o vigia roda de hora em hora, ou clique em Capturar/versionar.' }
    const achados = await acharVslUrls(ultima.html)
    if (!achados.length) return { success: false, itens: [], error: 'Não achei vídeo reproduzível nessa página (player pode carregar o vídeo só depois de interação).' }
    // Download via proxy assinado do próprio site — IP da VPS e chave nunca
    // aparecem no navegador.
    const itens = achados.map((a) => ({ ...a, download: linkProxyVsl(a.url) }))
    return { success: true, itens }
  } catch (e: any) {
    return { success: false, itens: [], error: e.message }
  }
}

// ---- Analisador de páginas avulsas (sem precisar rastrear o concorrente) ----
// Mesmo arsenal do rastreador, mas pra qualquer URL colada na hora.
export interface AnalisePaginaAvulsa {
  titulo: string | null
  headline: string | null
  precos: string[]
  stack: { id: string; label: string }[]
  videos: (VslCandidata & { peso?: number })[]
  abVturb: boolean   // true = as variantes vêm de um teste A/B nativo da VTurb
}

export async function analisarPaginaAvulsa(url: string): Promise<{ success: boolean; data?: AnalisePaginaAvulsa; error?: string }> {
  try {
    if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Cole uma URL completa (com https://).' }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    let html = ''
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' } })
      if (!r.ok) return { success: false, error: `A página respondeu ${r.status}.` }
      html = await r.text()
    } finally { clearTimeout(t) }
    const { titulo, texto } = htmlParaTexto(html)
    const achados = await acharVslUrls(html)
    return {
      success: true,
      data: {
        titulo,
        headline: extrairHeadline(html),
        precos: detectarPrecos(texto),
        stack: detectarStack(html),
        videos: achados.map((a) => ({ ...a, download: linkProxyVsl(a.url) })),
        abVturb: achados.some((a) => a.origem === 'vturb-ab'),
      },
    }
  } catch (e: any) {
    return { success: false, error: e?.name === 'AbortError' ? 'A página demorou demais para responder.' : e.message }
  }
}

export async function detectarAbAvulso(url: string): Promise<{ success: boolean; data?: AbDetectado; error?: string }> {
  try {
    if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Cole uma URL completa (com https://).' }
    const r = await detectarAbTeste(url, 6)
    const visitasOk = Math.max(r.rodadas - r.erros, 1)
    const somaPeso = r.videos.reduce((s, v) => s + (v.peso ?? 0), 0)
    return {
      success: true,
      data: {
        rodadas: r.rodadas,
        erros: r.erros,
        abVturb: r.abVturb,
        // A/B da VTurb: % vem do peso exato. Split server-side: da frequência.
        videos: r.videos.map((v) => ({
          url: v.url, origem: v.origem, download: linkProxyVsl(v.url), vezes: v.vezes, peso: v.peso,
          pct: r.abVturb && somaPeso > 0 ? ((v.peso ?? 0) / somaPeso) * 100 : (v.vezes / visitasOk) * 100,
        })),
        headlines: r.headlines.map((h) => ({ ...h, pct: (h.vezes / visitasOk) * 100 })),
      },
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Caça o teste A/B do concorrente: visita a página ao vivo várias vezes como
// visitante novo e devolve as variantes de vídeo/headline com a proporção.
export interface AbDetectado {
  rodadas: number
  erros: number
  abVturb: boolean
  videos: (VslCandidata & { vezes: number; pct: number })[]
  headlines: { texto: string; vezes: number; pct: number }[]
}
export async function detectarAbVslConcorrente(bibliotecaId: string): Promise<{ success: boolean; data?: AbDetectado; error?: string }> {
  try {
    const { data: bib } = await supabaseAdmin
      .from('rastreador_bibliotecas').select('landing_url').eq('id', bibliotecaId).maybeSingle()
    if (!bib?.landing_url) return { success: false, error: 'Sem URL de página cadastrada — o vigia adota uma sozinho na próxima rodada, ou cole no campo acima.' }
    const r = await detectarAbTeste(bib.landing_url, 6)
    const visitasOk = Math.max(r.rodadas - r.erros, 1)
    const somaPeso = r.videos.reduce((s, v) => s + (v.peso ?? 0), 0)
    return {
      success: true,
      data: {
        rodadas: r.rodadas,
        erros: r.erros,
        abVturb: r.abVturb,
        videos: r.videos.map((v) => ({
          url: v.url, origem: v.origem, download: linkProxyVsl(v.url), vezes: v.vezes, peso: v.peso,
          pct: r.abVturb && somaPeso > 0 ? ((v.peso ?? 0) / somaPeso) * 100 : (v.vezes / visitasOk) * 100,
        })),
        headlines: r.headlines.map((h) => ({ ...h, pct: (h.vezes / visitasOk) * 100 })),
      },
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Resolve a escolha feita no "modo seleção" da página salva (clique em cima
// do vídeo): url direta vem pronta; vturb vem como URL do player.js, que a
// gente busca pra extrair a mídia. Devolve o item já com download assinado.
export async function resolverEscolhaVsl(escolha: { tipo: string; valor: string }): Promise<{ success: boolean; item?: VslCandidata; error?: string }> {
  try {
    if (escolha.tipo === 'url' && /^https?:\/\//i.test(escolha.valor)) {
      return { success: true, item: { url: escolha.valor, origem: 'html', download: linkProxyVsl(escolha.valor) } }
    }
    if (escolha.tipo === 'vturb' && /^https:\/\/scripts\.converteai\.net\//i.test(escolha.valor)) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 15000)
      const r = await fetch(escolha.valor, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } }).finally(() => clearTimeout(t))
      if (!r.ok) return { success: false, error: `Player respondeu ${r.status}.` }
      const js = await r.text()
      const media = js.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/i)
      if (!media) return { success: false, error: 'Não achei a mídia dentro desse player.' }
      return { success: true, item: { url: media[1], origem: 'vturb', download: linkProxyVsl(media[1]) } }
    }
    return { success: false, error: 'Escolha inválida.' }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Diário do concorrente (eventos de teste A/B). listarDiario só lê; o
// atualizar visita a página ao vivo e registra evento se algo mudou (o vigia
// faz isso de hora em hora sozinho — o botão é pra quem quer checar na hora).
export async function listarDiarioConcorrente(bibliotecaId: string): Promise<{ success: boolean; data: EventoDiario[] }> {
  try {
    return { success: true, data: await lerDiarioConcorrente(bibliotecaId) }
  } catch {
    return { success: true, data: [] }
  }
}

export async function atualizarDiarioConcorrente(bibliotecaId: string): Promise<{ success: boolean; evento?: EventoDiario | null; data: EventoDiario[]; error?: string }> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const { data: bib } = await supabaseAdmin.from('rastreador_bibliotecas').select('landing_url').eq('id', bibliotecaId).maybeSingle()
    if (!bib?.landing_url) return { success: false, data: [], error: 'Sem URL de página cadastrada ainda.' }
    const html = await fetch(bib.landing_url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } }).then((r) => r.text())
    const evento = await atualizarDiarioAb(orgId, bibliotecaId, html, new Date().toISOString())
    return { success: true, evento, data: await lerDiarioConcorrente(bibliotecaId) }
  } catch (e: any) {
    return { success: false, data: [], error: e.message }
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
