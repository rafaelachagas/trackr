// Núcleo do capturador/vigia de páginas de vendas do concorrente.
// Sem 'use server' e sem resolveOrgId: recebe o orgId de fora, então serve
// tanto pra server action (sessão do usuário) quanto pro cron do vigia.

import { supabaseAdmin } from '@/lib/supabase'
import { hashTexto } from '@/lib/llm'
import { RASTREADOR_URL, RASTREADOR_APIKEY } from '@/lib/rastreador'

// Bucket público onde ficam os prints (screenshot real) de cada versão da
// página. Caminho determinístico: <bibliotecaId>/<conteudo_hash>.jpg — assim a
// UI acha o print só com os campos que a tabela já tem, sem coluna nova.
export const BUCKET_PRINTS = 'rastreador-prints'
let bucketOk = false
async function garantirBucket() {
  if (bucketOk) return
  try {
    const { data } = await supabaseAdmin.storage.getBucket(BUCKET_PRINTS)
    if (!data) await supabaseAdmin.storage.createBucket(BUCKET_PRINTS, { public: true })
    bucketOk = true
  } catch {
    try { await supabaseAdmin.storage.createBucket(BUCKET_PRINTS, { public: true }); bucketOk = true } catch { /* segue sem print */ }
  }
}

// Fotografa a página via Chromium da VPS (endpoint /screenshot do scraper) e
// sobe pro Storage. Falha aqui nunca derruba a captura — o print é um extra.
async function salvarPrint(bibliotecaId: string, hash: string, url: string): Promise<string | null> {
  try {
    if (!RASTREADOR_APIKEY) return null
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 60000)
    let buf: ArrayBuffer
    try {
      const r = await fetch(`${RASTREADOR_URL}/screenshot?url=${encodeURIComponent(url)}&key=${encodeURIComponent(RASTREADOR_APIKEY)}`, {
        signal: ctrl.signal, cache: 'no-store',
      })
      if (!r.ok) return null
      buf = await r.arrayBuffer()
    } finally { clearTimeout(t) }
    if (!buf || buf.byteLength < 1000) return null
    await garantirBucket()
    const caminho = `${bibliotecaId}/${hash}.jpg`
    const { error } = await supabaseAdmin.storage.from(BUCKET_PRINTS)
      .upload(caminho, buf, { contentType: 'image/jpeg', upsert: true })
    if (error) return null
    return supabaseAdmin.storage.from(BUCKET_PRINTS).getPublicUrl(caminho).data.publicUrl
  } catch {
    return null
  }
}

// Extrai texto legível de um HTML (sem libs): remove script/style e tags.
export function htmlParaTexto(html: string): { titulo: string | null; texto: string } {
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

// Primeira headline visível (h1; cai pro h2 se não houver h1).
export function extrairHeadline(html: string): string | null {
  for (const tag of ['h1', 'h2']) {
    const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    if (m) {
      const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (t) return t.slice(0, 300)
    }
  }
  return null
}

// IDs/URLs de vídeo embutidos (VTurb, YouTube, Vimeo, mp4 direto).
export function extrairVideos(html: string): string[] {
  const ids = new Set<string>()
  for (const m of html.matchAll(/scripts\.converteai\.net\/[a-z0-9-]+\/players\/([a-f0-9-]{10,})/gi)) ids.add(`vturb:${m[1]}`)
  for (const m of html.matchAll(/vturb[^"'\s]*\/players?\/([a-f0-9-]{10,})/gi)) ids.add(`vturb:${m[1]}`)
  for (const m of html.matchAll(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/gi)) ids.add(`youtube:${m[1]}`)
  for (const m of html.matchAll(/player\.vimeo\.com\/video\/(\d+)/gi)) ids.add(`vimeo:${m[1]}`)
  for (const m of html.matchAll(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8))["']/gi)) ids.add(`arquivo:${m[1].split('/').pop()}`)
  return [...ids].slice(0, 10)
}

// Detecta preços no texto (R$ 97, 12x de 9,70, R$1.997,00...).
export function detectarPrecos(texto: string): string[] {
  const rx = /(?:R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?)|(?:\d{1,2}x\s?(?:de\s?)?R?\$?\s?\d{1,3}(?:,\d{2})?)/gi
  const achados = (texto.match(rx) ?? []).map((s) => s.replace(/\s+/g, ' ').trim())
  return [...new Set(achados)].slice(0, 25)
}

// Detecta o "stack" da página (ferramentas) por assinatura nos scripts/HTML.
const ASSINATURAS: { id: string; label: string; rx: RegExp }[] = [
  { id: 'vturb', label: 'VTurb', rx: /vturb|converteai|scripts\.converteai|player\.vturb/i },
  { id: 'hotmart', label: 'Hotmart', rx: /hotmart|hmg\.hotmart|checkout\.hotmart|pay\.hotmart/i },
  { id: 'kiwify', label: 'Kiwify', rx: /kiwify/i },
  { id: 'eduzz', label: 'Eduzz', rx: /eduzz|myeduzz/i },
  { id: 'meta_pixel', label: 'Pixel Meta', rx: /fbevents\.js|connect\.facebook\.net\/[^"']*\/fbevents|\bfbq\(/i },
  { id: 'google', label: 'Google/GTM', rx: /googletagmanager|gtag\/js|google-analytics/i },
  { id: 'tiktok_pixel', label: 'Pixel TikTok', rx: /analytics\.tiktok\.com|ttq\.load/i },
  { id: 'escassez', label: 'Escassez', rx: /provely|useproof|\bfomo\b|notifica[çc][aã]o de compra|scarcity/i },
  { id: 'typebot', label: 'Typebot', rx: /typebot/i },
  { id: 'manychat', label: 'ManyChat', rx: /manychat/i },
]
export function detectarStack(html: string): { id: string; label: string }[] {
  return ASSINATURAS.filter((a) => a.rx.test(html)).map(({ id, label }) => ({ id, label }))
}

interface Anterior {
  texto: string | null
  precos: string[]
  titulo: string | null
  headline: string | null
  videos: string[]
}

function resumirMudanca(anterior: Anterior | null, atual: { texto: string; precos: string[]; titulo: string | null; headline: string | null; videos: string[] }): string {
  if (!anterior) return 'Primeira captura da página.'
  const partes: string[] = []

  // Headline (h1) — a mudança mais reveladora.
  if (anterior.headline && atual.headline && anterior.headline !== atual.headline) {
    partes.push(`Headline mudou: "${anterior.headline.slice(0, 90)}" → "${atual.headline.slice(0, 90)}"`)
  } else if (!anterior.headline && atual.headline) {
    partes.push(`Headline nova: "${atual.headline.slice(0, 120)}"`)
  }
  if (anterior.titulo && atual.titulo && anterior.titulo !== atual.titulo) {
    partes.push(`Título da aba mudou: "${anterior.titulo.slice(0, 60)}" → "${atual.titulo.slice(0, 60)}"`)
  }

  // Vídeo trocado/adicionado/removido.
  const vAntes = new Set(anterior.videos)
  const vAgora = new Set(atual.videos)
  const vNovos = atual.videos.filter((v) => !vAntes.has(v))
  const vSairam = anterior.videos.filter((v) => !vAgora.has(v))
  if (vNovos.length && vSairam.length) partes.push('Vídeo TROCADO (o player mudou)')
  else if (vNovos.length) partes.push('Vídeo novo na página')
  else if (vSairam.length) partes.push('Vídeo removido da página')

  // Preços.
  const antes = new Set(anterior.precos ?? [])
  const agora = new Set(atual.precos)
  const novos = atual.precos.filter((p) => !antes.has(p))
  const sumiram = (anterior.precos ?? []).filter((p) => !agora.has(p))
  if (novos.length) partes.push(`Preços novos: ${novos.join(', ')}`)
  if (sumiram.length) partes.push(`Preços que sumiram: ${sumiram.join(', ')}`)

  const dTam = atual.texto.length - (anterior.texto?.length ?? 0)
  if (Math.abs(dTam) > 200) partes.push(`Conteúdo ${dTam > 0 ? 'aumentou' : 'diminuiu'} ~${Math.abs(dTam)} caracteres`)
  return partes.length ? partes.join(' · ') : 'Mudança detectada no conteúdo da página.'
}

export interface ResultadoCaptura {
  success: boolean
  error?: string
  mudou?: boolean
  resumo?: string
  precos?: string[]
  stack?: { id: string; label: string }[]
  hash?: string
  url?: string
  printUrl?: string
}

// Captura a página-alvo (landing_url) de uma biblioteca e versiona se mudou.
export async function capturarPaginaCore(orgId: string, bibliotecaId: string, urlOverride?: string): Promise<ResultadoCaptura> {
  try {
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
    const stack = detectarStack(html)
    const headline = extrairHeadline(html)
    const videos = extrairVideos(html)
    const hash = hashTexto(texto)

    // Injeta <base> pra imagens/CSS relativos resolverem quando reabrirmos o HTML salvo.
    let htmlSalvar = html
    if (!/<base\s/i.test(htmlSalvar)) {
      htmlSalvar = htmlSalvar.replace(/<head([^>]*)>/i, `<head$1><base href="${url}">`)
    }
    htmlSalvar = htmlSalvar.slice(0, 900000) // ~900 KB de teto por versão

    // Última versão salva (o html guardado serve de base pro diff de headline/vídeo).
    const { data: ultima } = await supabaseAdmin
      .from('rastreador_paginas_hist').select('conteudo_hash, texto, precos, titulo, html')
      .eq('biblioteca_id', bibliotecaId).order('capturado_em', { ascending: false }).limit(1).maybeSingle()

    if (ultima && ultima.conteudo_hash === hash) {
      return { success: true, mudou: false, url }
    }

    const anterior: Anterior | null = ultima ? {
      texto: ultima.texto,
      precos: (ultima.precos as string[]) ?? [],
      titulo: ultima.titulo ?? null,
      headline: ultima.html ? extrairHeadline(ultima.html) : null,
      videos: ultima.html ? extrairVideos(ultima.html) : [],
    } : null
    const resumo = resumirMudanca(anterior, { texto, precos, titulo, headline, videos })

    const { error } = await supabaseAdmin.from('rastreador_paginas_hist').insert({
      org_id: orgId, biblioteca_id: bibliotecaId, url, titulo,
      conteudo_hash: hash, texto: texto.slice(0, 20000), precos, resumo_mudanca: resumo,
      html: htmlSalvar, stack,
    })
    if (error) throw error

    // Print real da página (Chromium na VPS) — best-effort, nunca bloqueia.
    const printUrl = await salvarPrint(bibliotecaId, hash, url)

    return { success: true, mudou: true, resumo, precos, stack, hash, url, printUrl: printUrl ?? undefined }
  } catch (e: any) {
    return { success: false, error: e?.name === 'AbortError' ? 'A página demorou demais para responder.' : e.message }
  }
}

// Acha a URL REPRODUZÍVEL da VSL embutida numa página (pra transcrever).
// 1º tenta mp4/m3u8 direto no HTML; se só houver player VTurb, busca o
// player.js/embed do converteai e extrai a mídia de lá.
export async function acharVslUrl(html: string): Promise<{ url: string; origem: string } | null> {
  // mp4/m3u8 cravados no HTML.
  for (const m of html.matchAll(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)(?:\?[^"']*)?)["']/gi)) {
    const u = m[1]
    if (/thumb|poster|preview|\.jpg|\.png/i.test(u)) continue
    return { url: u, origem: 'html' }
  }
  // Player VTurb: o script do player aponta pra mídia no CDN do converteai.
  const players = new Set<string>()
  for (const m of html.matchAll(/https?:\/\/scripts\.converteai\.net\/[a-z0-9-]+\/players\/[a-f0-9-]{10,}\/[\w./-]*player\.js/gi)) players.add(m[0])
  for (const m of html.matchAll(/https?:\/\/scripts\.converteai\.net\/[a-z0-9-]+\/players\/[a-f0-9-]{10,}/gi)) players.add(`${m[0]}/player.js`)
  for (const pj of [...players].slice(0, 3)) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 15000)
      const r = await fetch(pj, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } }).finally(() => clearTimeout(t))
      if (!r.ok) continue
      const js = await r.text()
      const media = js.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/i)
      if (media) return { url: media[1], origem: 'vturb' }
    } catch { /* tenta o próximo player */ }
  }
  return null
}

// URL de destino dominante entre os criativos de um snapshot (a "página de
// vendas dos anúncios"). Normaliza tirando querystring/UTM pra comparar.
export function urlDominante(criativos: any[]): string | null {
  const cont = new Map<string, number>()
  for (const c of criativos ?? []) {
    const raw = c?.link_url
    if (!raw || typeof raw !== 'string') continue
    let norm = raw
    try { const u = new URL(raw); norm = `${u.origin}${u.pathname}`.replace(/\/$/, '') } catch {}
    cont.set(norm, (cont.get(norm) ?? 0) + 1)
  }
  let melhor: string | null = null, n = 0
  for (const [u, c] of cont) if (c > n) { melhor = u; n = c }
  return melhor
}
