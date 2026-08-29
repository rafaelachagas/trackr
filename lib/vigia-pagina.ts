// Núcleo do capturador/vigia de páginas de vendas do concorrente.
// Sem 'use server' e sem resolveOrgId: recebe o orgId de fora, então serve
// tanto pra server action (sessão do usuário) quanto pro cron do vigia.

import { createHmac } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { hashTexto, lerTextoDaImagem } from '@/lib/llm'
import { RASTREADOR_URL, RASTREADOR_APIKEY } from '@/lib/rastreador'

// Assinatura HMAC pros links de download de VSL — o navegador só vê
// /api/rastreador/vsl-download?u=...&t=..., nunca o IP da VPS nem a chave.
// Segredo: a service key do Supabase (só existe no servidor).
export function assinarVslUrl(url: string): string {
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY || 'thetrack'
  return createHmac('sha256', segredo).update(url).digest('hex').slice(0, 24)
}

export function linkProxyVsl(url: string): string {
  return `/api/rastreador/vsl-download?u=${encodeURIComponent(url)}&t=${assinarVslUrl(url)}`
}

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

// Textos de h1/h2 que NÃO são headline de verdade (rodapé, menu, jurídico).
// Sem isso o extrator pegava "Termos, Privacidade e Aviso de Resultados" como
// se fosse a promessa principal da página.
const HEADLINE_LIXO = /termos|privacidade|pol[ií]tica|cookies?|direitos reservados|copyright|©|aviso (de|legal)|todos os direitos|menu|navega|rodap[eé]|suporte|contato|faq|d[uú]vidas frequentes/i

// Primeira headline visível (h1; cai pro h2 se não houver h1), pulando lixo
// de rodapé/jurídico. Devolve null se só houver texto boilerplate — aí o
// chamador tenta o OCR da imagem de headline (extrairHeadlinePagina).
export function extrairHeadline(html: string): string | null {
  const candidatos: string[] = []
  for (const tag of ['h1', 'h2']) {
    for (const m of html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))) {
      const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (t) candidatos.push(t)
    }
  }
  // Prefere o 1º que pareça marketing (não-lixo e com um tamanho de frase).
  for (const t of candidatos) {
    if (!HEADLINE_LIXO.test(t) && t.length >= 12) return t.slice(0, 300)
  }
  for (const t of candidatos) {
    if (!HEADLINE_LIXO.test(t)) return t.slice(0, 300)
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

async function baixarTexto(url: string, ms = 15000): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } }).finally(() => clearTimeout(t))
    return r.ok ? await r.text() : null
  } catch { return null }
}

// Extrai o m3u8/mp4 de um player VTurb. O player.js "raiz" às vezes redireciona
// pra notfound.js; a config real com a mídia mora em players/<id>/v4/player.js.
async function midiaDoPlayerVturb(oid: string, playerId: string): Promise<string | null> {
  for (const u of [
    `https://scripts.converteai.net/${oid}/players/${playerId}/v4/player.js`,
    `https://scripts.converteai.net/${oid}/players/${playerId}/player.js`,
  ]) {
    const js = await baixarTexto(u)
    const m = js?.match(/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/i)
    if (m) return m[1]
  }
  return null
}

// Acha TODAS as URLs reproduzíveis de vídeo embutidas numa página:
//  - mp4/m3u8 cravados no HTML
//  - players VTurb normais (scripts.converteai.net/<oid>/players/<id>/...)
//  - testes A/B da VTurb (scripts.converteai.net/<oid>/ab-test/<id>/player.js):
//    o script do A/B lista as variantes (children) com peso; resolvemos a
//    mídia de CADA uma — é assim que a gente pega as duas VSLs do split.
export async function acharVslUrls(html: string): Promise<{ url: string; origem: string; peso?: number }[]> {
  const achados: { url: string; origem: string; peso?: number }[] = []
  const vistos = new Set<string>()
  const add = (url: string, origem: string, peso?: number) => {
    if (vistos.has(url)) return
    vistos.add(url)
    achados.push({ url, origem, peso })
  }

  for (const m of html.matchAll(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)(?:\?[^"']*)?)["']/gi)) {
    const u = m[1]
    if (/thumb|poster|preview|\.jpg|\.png/i.test(u)) continue
    add(u, 'html')
  }

  // 1) Testes A/B (embed dedicado) — precisa vir antes pra rotular como ab.
  const abTests = new Set<string>()
  for (const m of html.matchAll(/https?:\/\/scripts\.converteai\.net\/([a-z0-9-]+)\/ab-test\/([a-f0-9]{10,})/gi)) {
    abTests.add(`${m[1]}::${m[2]}`)
  }
  for (const key of [...abTests].slice(0, 3)) {
    const [oid, abId] = key.split('::')
    const js = await baixarTexto(`https://scripts.converteai.net/${oid}/ab-test/${abId}/player.js`)
    if (!js) continue
    // children:[{id:"<variantId>",step:5,weight:50,config:{...,id:"<mediaKey>"...
    // Cada variante é um player: resolvemos players/<variantId>/v4/player.js.
    const variantes = [...js.matchAll(/id:"([a-f0-9]{20,})",step:\d+,weight:(\d+)/g)]
    for (const v of variantes.slice(0, 6)) {
      const media = await midiaDoPlayerVturb(oid, v[1])
      if (media) add(media, 'vturb-ab', Number(v[2]))
    }
  }

  // 2) Players VTurb normais.
  const players = new Set<string>()
  for (const m of html.matchAll(/scripts\.converteai\.net\/([a-z0-9-]+)\/players\/([a-f0-9-]{10,})/gi)) {
    players.add(`${m[1]}::${m[2]}`)
  }
  for (const m of html.matchAll(/<vturb-smartplayer[^>]*id="(?:vid[-_])?([a-f0-9]{10,})"/gi)) {
    // sem oid no atributo; tenta casar com algum oid já visto
    const oid = [...abTests, ...players][0]?.split('::')[0]
    if (oid) players.add(`${oid}::${m[1]}`)
  }
  for (const key of [...players].slice(0, 5)) {
    const [oid, pid] = key.split('::')
    const media = await midiaDoPlayerVturb(oid, pid)
    if (media) add(media, 'vturb')
  }

  return achados.slice(0, 8)
}

// Compat: o primeiro vídeo achado (usado pelo caminho "um clique").
export async function acharVslUrl(html: string): Promise<{ url: string; origem: string } | null> {
  const todos = await acharVslUrls(html)
  return todos[0] ?? null
}

// ---- Detector de teste A/B ----
// Visita a página N vezes como visitante novo (sem cookie, UA variado) e
// registra o que muda entre as visitas: vídeo servido e headline. Se o
// concorrente roda split test (server-side ou VTurb A/B), as variantes
// aparecem com a proporção aproximada do sorteio.
export interface ResultadoAb {
  rodadas: number
  videos: { url: string; origem: string; vezes: number; peso?: number }[]
  headlines: { texto: string; vezes: number }[]
  erros: number
  abVturb: boolean   // variantes vieram do split nativo da VTurb (peso exato)
}

const UAS_AB = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
]

export async function detectarAbTeste(url: string, rodadas = 6): Promise<ResultadoAb> {
  // Atalho: se a página usa A/B NATIVO da VTurb, as variantes e os pesos exatos
  // já vêm do código — não precisa sortear por visitas (e sortear daria errado,
  // já que TODAS as variantes aparecem em toda visita).
  const html0 = await baixarTexto(url, 15000)
  if (html0) {
    const vids = await acharVslUrls(html0)
    if (vids.some((v) => v.origem === 'vturb-ab')) {
      const somaPeso = vids.reduce((s, v) => s + (v.peso ?? 0), 0) || 1
      return {
        rodadas: 1,
        abVturb: true,
        // "vezes" aqui carrega o peso proporcional (0..rodadas) só p/ compat;
        // a UI usa o peso direto.
        videos: vids.filter((v) => v.origem === 'vturb-ab').map((v) => ({ url: v.url, origem: v.origem, vezes: 0, peso: v.peso })).sort((a, b) => (b.peso ?? 0) - (a.peso ?? 0)),
        headlines: [],
        erros: 0,
      }
    }
  }

  const videos = new Map<string, { url: string; origem: string; vezes: number }>()
  const headlines = new Map<string, number>()
  let erros = html0 ? 0 : 1
  for (let i = 0; i < rodadas; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 12000)
      const r = await fetch(url, {
        signal: ctrl.signal, cache: 'no-store',
        headers: { 'User-Agent': UAS_AB[i % UAS_AB.length], 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      }).finally(() => clearTimeout(t))
      if (!r.ok) { erros++; continue }
      const html = await r.text()
      const h = extrairHeadline(html)
      if (h) headlines.set(h, (headlines.get(h) ?? 0) + 1)
      // Split server-side: pega só o mp4/m3u8 cravado no HTML desta visita
      // (resolver players aqui traria as mesmas variantes toda vez).
      for (const m of html.matchAll(/["'](https?:\/\/[^"']+\.(?:mp4|m3u8)(?:\?[^"']*)?)["']/gi)) {
        const u = m[1]
        if (/thumb|poster|preview|\.jpg|\.png/i.test(u)) continue
        const cur = videos.get(u)
        if (cur) cur.vezes++
        else videos.set(u, { url: u, origem: 'html', vezes: 1 })
      }
      await new Promise((res) => setTimeout(res, 400))
    } catch { erros++ }
  }
  return {
    rodadas,
    abVturb: false,
    videos: [...videos.values()].sort((a, b) => b.vezes - a.vezes),
    headlines: [...headlines.entries()].map(([texto, vezes]) => ({ texto, vezes })).sort((a, b) => b.vezes - a.vezes),
    erros,
  }
}

// ---- Diário do concorrente: estado do teste A/B ao longo do tempo ----
// Guardado em configuracoes: ab_estado_<bibId> (último snapshot) e
// ab_diario_<bibId> (linha do tempo de eventos). Sem tabela nova.

export interface VarianteAb { chave: string; url: string; peso: number }
export interface EstadoAb { variantes: VarianteAb[]; em: string; ctas?: string[]; headline?: string; headlines?: string[] }

// Headline da página. 1º tenta texto (h1/h2). Se não houver texto legível mas
// existir uma imagem de destaque (og:image), lê com OCR pela IA (Gemini).
export async function extrairHeadlinePagina(html: string): Promise<string | null> {
  const txt = extrairHeadline(html)
  if (txt) return txt
  // Sem headline em texto — tenta OCR da og:image (a "capa" da página).
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  if (og?.[1]) {
    const r = await lerTextoDaImagem(og[1])
    if (r.ok && r.texto && r.texto !== '—') return `[imagem] ${r.texto.slice(0, 300)}`
  }
  return null
}

// ---- Headlines em teste (renderizadas via browser da VPS) ----
// A headline desses funis (GreatPages/Elementor) costuma ser uma IMAGEM injetada
// por JS — não existe no HTML cru. Pra pegá-la (e descobrir se há VÁRIAS rodando
// em teste A/B de página), pedimos ao Chromium da VPS pra abrir a página em N
// sessões novas e devolver as imagens do topo de cada uma. Agrupamos as sessões
// por "impressão digital" (quais imagens vieram) → cada grupo é uma variante.

interface SessaoRender { imgs: { src: string; top: number; w: number; h: number }[]; htext: string }

async function renderSessoesVps(url: string, n = 6): Promise<SessaoRender[]> {
  if (!RASTREADOR_APIKEY) return []
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 120000)
    const r = await fetch(`${RASTREADOR_URL}/render?url=${encodeURIComponent(url)}&key=${encodeURIComponent(RASTREADOR_APIKEY)}&n=${n}`, {
      signal: ctrl.signal, cache: 'no-store',
    }).finally(() => clearTimeout(t))
    if (!r.ok) return []
    const j = await r.json()
    return Array.isArray(j?.sessoes) ? j.sessoes : []
  } catch { return [] }
}

export interface HeadlineVariante {
  texto: string          // texto lido (OCR da imagem ou h1/h2)
  imagem: string | null  // imagem da headline (se for imagem)
  vezes: number          // em quantas sessões apareceu
  pct: number            // proporção entre as variantes
}

// A imagem "headline" de uma sessão: a maior imagem larga do topo que não seja
// o thumbnail do player de vídeo. Heurística simples e robusta entre builders.
function imagemHeadline(s: SessaoRender): string | null {
  const cand = s.imgs
    .filter((im) => im.w >= 180 && !/thumb|poster|player|vturb|converteai|logo|favicon/i.test(im.src))
    .sort((a, b) => a.top - b.top || b.w * b.h - a.w * a.h)
  return cand[0]?.src ?? null
}

export interface DebugHeadlines {
  sessoes: number
  imgsTopo: number          // imagens no topo somando todas as sessões
  htextVisto: number        // sessões que trouxeram h1/h2 em texto
  candidatasImg: number     // imagens-headline distintas encontradas
  ocrTentado: number
  ocrFalhou: number
  amostraImg?: string       // 1ª imagem-headline (pra inspeção)
  motivo?: string           // por que veio vazio, em português
}

// Detecta quantas headlines o concorrente está testando, lendo o texto de cada
// uma (OCR pela IA quando é imagem). Renderiza a página em N sessões novas.
export async function headlinesEmTeste(url: string, n = 6): Promise<{ variantes: HeadlineVariante[]; sessoes: number; debug: DebugHeadlines }> {
  const sessoes = await renderSessoesVps(url, n)
  const dbg: DebugHeadlines = { sessoes: sessoes.length, imgsTopo: 0, htextVisto: 0, candidatasImg: 0, ocrTentado: 0, ocrFalhou: 0 }
  for (const s of sessoes) { dbg.imgsTopo += s.imgs.length; if (s.htext) dbg.htextVisto++ }
  if (!sessoes.length) { dbg.motivo = 'O render da VPS não retornou nenhuma sessão (endpoint fora do ar, timeout ou página bloqueou o robô).'; return { variantes: [], sessoes: 0, debug: dbg } }

  // Agrupa sessões por variante. A "chave" da variante é a imagem-headline
  // (ou, se não houver imagem, o texto do h1/h2). Sessões iguais somam.
  const grupos = new Map<string, { imagem: string | null; htext: string; vezes: number }>()
  for (const s of sessoes) {
    const img = imagemHeadline(s)
    const chave = img || s.htext || '∅'
    if (chave === '∅') continue
    const g = grupos.get(chave)
    if (g) g.vezes++
    else grupos.set(chave, { imagem: img, htext: s.htext, vezes: 1 })
  }

  dbg.candidatasImg = [...grupos.values()].filter((g) => g.imagem).length
  dbg.amostraImg = [...grupos.values()].find((g) => g.imagem)?.imagem ?? undefined

  // Para cada variante distinta, lê o texto (OCR da imagem, senão o h1/h2).
  const variantes: HeadlineVariante[] = []
  const totalSessoes = sessoes.length
  for (const g of [...grupos.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 6)) {
    let texto = g.htext
    if (g.imagem) {
      dbg.ocrTentado++
      const ocr = await lerTextoDaImagem(g.imagem)
      if (ocr.ok && ocr.texto && ocr.texto !== '—') texto = ocr.texto.replace(/\s+/g, ' ').trim()
      else dbg.ocrFalhou++
    }
    if (!texto) continue
    variantes.push({ texto: texto.slice(0, 400), imagem: g.imagem, vezes: g.vezes, pct: Math.round((g.vezes / totalSessoes) * 100) })
  }
  if (!variantes.length) {
    dbg.motivo = dbg.imgsTopo === 0 && dbg.htextVisto === 0
      ? 'O render abriu a página mas não achou imagem no topo nem headline em texto (headline pode estar dentro do vídeo).'
      : dbg.ocrTentado > 0 && dbg.ocrFalhou === dbg.ocrTentado
        ? 'Achou a imagem da headline, mas a IA (OCR) não leu texto nela.'
        : 'Achou conteúdo no topo, mas nada que parecesse headline legível.'
  }
  return { variantes, sessoes: totalSessoes, debug: dbg }
}

// CTAs/ofertas testadas dentro do config do A/B da VTurb (callActions.content).
function extrairCtasAb(js: string): string[] {
  const out = new Set<string>()
  for (const m of js.matchAll(/content:"((?:[^"\\]|\\.)*)"/g)) {
    const t = m[1].replace(/\\"/g, '"').trim()
    // Filtra só o que parece copy de botão/oferta (tem letra e tamanho razoável).
    if (t.length >= 4 && t.length <= 120 && /[a-zà-ú]/i.test(t)) out.add(t)
  }
  return [...out].slice(0, 20)
}
export interface EventoDiario {
  em: string                 // ISO
  tipo: 'ab_inicio' | 'ab_rodada' | 'ab_peso' | 'ab_encerrado' | 'ab_sumiu' | 'headline' | 'oferta'
  titulo: string
  detalhe: string
}

// A "chave" de uma variante é o id do vídeo no CDN (estável entre visitas),
// não a URL inteira. Ex.: .../<oid>/<mediaKey>/main.m3u8 → mediaKey.
function chaveVariante(url: string): string {
  const m = url.match(/converteai\.net\/[a-z0-9-]+\/([a-f0-9]{12,})\//i)
  return m ? m[1] : url
}

// Lê o estado A/B atual da página (só as variantes do split nativo VTurb).
export async function snapshotAb(html: string): Promise<VarianteAb[]> {
  const vids = await acharVslUrls(html)
  return vids
    .filter((v) => v.origem === 'vturb-ab')
    .map((v) => ({ chave: chaveVariante(v.url), url: v.url, peso: v.peso ?? 0 }))
    .sort((a, b) => a.chave.localeCompare(b.chave))
}

async function lerJson<T>(chave: string, fallback: T): Promise<T> {
  try {
    const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', chave).maybeSingle()
    return data?.valor ? JSON.parse(data.valor) : fallback
  } catch { return fallback }
}

async function gravarJson(orgId: string, chave: string, valor: any) {
  await supabaseAdmin.from('configuracoes').upsert(
    { chave, valor: JSON.stringify(valor), org_id: orgId, updated_at: new Date().toISOString() },
    { onConflict: 'chave' })
}

// Extrai as CTAs testadas dos scripts de A/B presentes no HTML.
async function ctasTestadas(html: string): Promise<string[]> {
  const out = new Set<string>()
  const abs = new Set<string>()
  for (const m of html.matchAll(/https?:\/\/scripts\.converteai\.net\/([a-z0-9-]+)\/ab-test\/([a-f0-9]{10,})/gi)) abs.add(`${m[1]}::${m[2]}`)
  for (const key of [...abs].slice(0, 3)) {
    const [oid, abId] = key.split('::')
    const js = await baixarTexto(`https://scripts.converteai.net/${oid}/ab-test/${abId}/player.js`)
    if (js) for (const c of extrairCtasAb(js)) out.add(c)
  }
  return [...out]
}

// Compara o estado A/B novo com o anterior e, se mudou, escreve no diário.
// Retorna o evento gerado (pra o vigia poder alertar no WhatsApp). Registra
// TAMBÉM mudança de headline e de ofertas/CTAs testadas (podem gerar vários
// eventos numa rodada; devolve o mais relevante).
export async function atualizarDiarioAb(orgId: string, bibId: string, html: string, agoraISO: string, url?: string): Promise<EventoDiario | null> {
  const atual = await snapshotAb(html)
  const estadoAnt = await lerJson<EstadoAb | null>(`ab_estado_${bibId}`, null)
  const antes = estadoAnt?.variantes ?? []
  const eventosExtras: EventoDiario[] = []

  // Headlines em teste — renderiza a página em várias sessões (via VPS) e lê o
  // texto de cada variante (OCR quando é imagem). É assim que pegamos o teste
  // A/B de headline desses funis (a headline é imagem injetada por JS, some do
  // HTML cru). Só roda quando temos a URL (o vigia e o botão passam).
  let headlinesAtual = estadoAnt?.headlines ?? []
  let headlineAtual = estadoAnt?.headline
  if (url) {
    try {
      const { variantes } = await headlinesEmTeste(url, 6)
      const textos = variantes.map((v) => v.texto)
      if (textos.length) {
        headlinesAtual = textos
        headlineAtual = textos[0]
        const antesSet = new Set((estadoAnt?.headlines ?? []).map((t) => t.slice(0, 60).toLowerCase()))
        const novas = textos.filter((t) => !antesSet.has(t.slice(0, 60).toLowerCase()))
        const primeiraVez = !estadoAnt?.headlines?.length
        if (textos.length > 1 && (primeiraVez || novas.length)) {
          eventosExtras.push({
            em: agoraISO, tipo: 'headline',
            titulo: `${textos.length} headlines em teste A/B`,
            detalhe: textos.map((t, i) => `${String.fromCharCode(65 + i)}) "${t.slice(0, 110)}"`).join('  ·  '),
          })
        } else if (textos.length === 1 && novas.length && !primeiraVez) {
          eventosExtras.push({ em: agoraISO, tipo: 'headline', titulo: 'Trocou a headline da página', detalhe: `Agora: "${textos[0].slice(0, 140)}"` })
        } else if (primeiraVez && textos.length === 1) {
          eventosExtras.push({ em: agoraISO, tipo: 'headline', titulo: 'Headline registrada', detalhe: `"${textos[0].slice(0, 160)}"` })
        }
      }
    } catch { /* render best-effort */ }
  } else {
    // Sem URL (compat): tenta só o texto/OCR do HTML cru.
    try {
      const hlNova = await extrairHeadlinePagina(html)
      if (hlNova && hlNova !== estadoAnt?.headline) {
        eventosExtras.push({
          em: agoraISO, tipo: 'headline',
          titulo: estadoAnt?.headline ? 'Trocou a headline da página' : 'Headline registrada',
          detalhe: estadoAnt?.headline ? `"${estadoAnt.headline.slice(0, 90)}" → "${hlNova.slice(0, 90)}"` : `"${hlNova.slice(0, 160)}"`,
        })
      }
      headlineAtual = hlNova ?? estadoAnt?.headline
    } catch { /* mantém */ }
  }

  // Ofertas/CTAs testadas no A/B.
  let ctasAtual = estadoAnt?.ctas ?? []
  try {
    const ctas = await ctasTestadas(html)
    if (ctas.length) {
      const antesSet = new Set(estadoAnt?.ctas ?? [])
      const novas = ctas.filter((c) => !antesSet.has(c))
      if (novas.length && estadoAnt?.ctas?.length) {
        eventosExtras.push({ em: agoraISO, tipo: 'oferta', titulo: 'Novas ofertas/CTAs em teste', detalhe: novas.slice(0, 5).map((c) => `"${c}"`).join(' · ') })
      }
      ctasAtual = ctas
    }
  } catch { /* mantém */ }

  const setAtual = new Set(atual.map((v) => v.chave))
  const setAntes = new Set(antes.map((v) => v.chave))
  const mesmoConjunto = atual.length === antes.length && atual.every((v) => setAntes.has(v.chave))

  let evento: EventoDiario | null = null
  const pesos = (vs: VarianteAb[]) => vs.map((v) => `${Math.round((v.peso / (vs.reduce((s, x) => s + x.peso, 0) || 1)) * 100)}%`).join(' / ')

  if (atual.length === 0 && antes.length > 1) {
    // Sumiu o A/B mas não sabemos a vencedora (página trocou de player).
    evento = { em: agoraISO, tipo: 'ab_sumiu', titulo: 'Teste A/B saiu da página', detalhe: `As ${antes.length} variantes não estão mais no player.` }
  } else if (antes.length > 1 && atual.length === 1) {
    // O caso que o usuário quer: definiu vencedora.
    evento = { em: agoraISO, tipo: 'ab_encerrado', titulo: '🏆 Teste A/B encerrado — vencedora definida', detalhe: `De ${antes.length} variantes sobrou 1 rodando a 100%. Esse é o vídeo que venceu o teste.` }
  } else if (antes.length === 0 && atual.length > 1) {
    evento = { em: agoraISO, tipo: 'ab_inicio', titulo: `Novo teste A/B iniciado (${atual.length} variantes)`, detalhe: `Pesos: ${pesos(atual)}.` }
  } else if (antes.length > 0 && !mesmoConjunto && atual.length > 1) {
    evento = { em: agoraISO, tipo: 'ab_rodada', titulo: `Nova rodada de teste A/B (${atual.length} variantes)`, detalhe: `As variantes mudaram — trocou pelo menos um vídeo do teste. Pesos: ${pesos(atual)}.` }
  } else if (mesmoConjunto && antes.length > 1 && pesos(antes) !== pesos(atual)) {
    evento = { em: agoraISO, tipo: 'ab_peso', titulo: 'Ajuste de peso no teste A/B', detalhe: `Mesmas variantes, nova divisão: ${pesos(antes)} → ${pesos(atual)}.` }
  }

  // Estado sempre atualizado (mesmo sem evento, pra pegar mudança futura).
  await gravarJson(orgId, `ab_estado_${bibId}`, { variantes: atual, em: agoraISO, ctas: ctasAtual, headline: headlineAtual, headlines: headlinesAtual } as EstadoAb)

  const todos = [...(evento ? [evento] : []), ...eventosExtras]
  if (todos.length) {
    const diario = await lerJson<EventoDiario[]>(`ab_diario_${bibId}`, [])
    diario.push(...todos)
    await gravarJson(orgId, `ab_diario_${bibId}`, diario.slice(-100))
  }
  // Prioriza o evento de A/B (encerramento é o mais relevante); senão o 1º extra.
  return evento ?? eventosExtras[0] ?? null
}

export async function lerDiarioConcorrente(bibId: string): Promise<EventoDiario[]> {
  const d = await lerJson<EventoDiario[]>(`ab_diario_${bibId}`, [])
  return [...d].reverse() // mais recente primeiro
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
