'use strict'

/**
 * Rastreador de Anúncios — serviço de scraping da Biblioteca de Anúncios da Meta.
 * Roda na VPS (Docker) e é chamado pelo The Track em POST /scrape.
 *
 * Estratégia: abre a URL da biblioteca num Chromium (Playwright), intercepta as
 * respostas GraphQL da própria página (onde vêm os anúncios estruturados),
 * rola pra carregar mais e normaliza os criativos. É o jeito mais robusto porque
 * não depende do HTML (que a Meta muda toda hora).
 *
 * Autenticação: header `x-api-key` == process.env.SCRAPER_APIKEY.
 */

const express = require('express')
const { chromium } = require('playwright')

const PORT = process.env.PORT || 8081
const APIKEY = process.env.SCRAPER_APIKEY || ''
const HEADLESS = process.env.HEADLESS !== 'false'

const app = express()
app.use(express.json({ limit: '2mb' }))

let browser = null
async function getBrowser() {
  if (browser && browser.isConnected()) return browser
  browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  })
  return browser
}

// —— Utilidades de parsing ——————————————————————————————————————————————
function tentarJSON(txt) {
  // Meta às vezes prefixa com "for (;;);" e às vezes manda vários JSON por linha.
  const out = []
  const limpo = txt.replace(/^for \(;;\);/, '').trim()
  try { out.push(JSON.parse(limpo)); return out } catch (_) {}
  for (const linha of limpo.split('\n')) {
    const l = linha.trim()
    if (!l) continue
    try { out.push(JSON.parse(l)) } catch (_) {}
  }
  return out
}

// Acha recursivamente qualquer objeto que pareça um "nó de anúncio" da biblioteca.
function coletarAnuncios(raiz, achados) {
  if (!raiz || typeof raiz !== 'object') return
  if (Array.isArray(raiz)) { for (const it of raiz) coletarAnuncios(it, achados); return }
  const temId = raiz.ad_archive_id || raiz.adArchiveID || raiz.adArchiveId
  const snap = raiz.snapshot || (raiz.collated_results && raiz.collated_results[0] && raiz.collated_results[0].snapshot)
  if (temId && snap) achados.push(raiz)
  for (const k of Object.keys(raiz)) coletarAnuncios(raiz[k], achados)
}

function primeiro(...vals) { for (const v of vals) if (v !== undefined && v !== null && v !== '') return v; return null }

function normalizar(node) {
  const snap = node.snapshot || (node.collated_results && node.collated_results[0] && node.collated_results[0].snapshot) || {}
  const videos = snap.videos || []
  const images = snap.images || []
  const cards = snap.cards || []
  const v0 = videos[0] || {}
  const i0 = images[0] || {}
  const c0 = cards[0] || {}

  const start = primeiro(node.start_date, node.startDate, snap.creation_time)
  const startMs = start ? Number(start) * (String(start).length <= 10 ? 1000 : 1) : null
  const diasAtivo = startMs ? Math.max(0, Math.floor((Date.now() - startMs) / 86400000)) : null
  const id = primeiro(node.ad_archive_id, node.adArchiveID, node.adArchiveId)

  const videoUrl = primeiro(v0.video_hd_url, v0.video_sd_url, c0.video_hd_url, c0.video_sd_url)
  const imageUrl = primeiro(i0.original_image_url, i0.resized_image_url, v0.video_preview_image_url, c0.original_image_url, snap.creative_thumb_url)

  return {
    ad_archive_id: id ? String(id) : null,
    page_name: primeiro(snap.page_name, node.page_name),
    page_id: primeiro(snap.page_id, node.page_id),
    headline: primeiro(snap.title, c0.title, snap.link_description),
    body: primeiro(snap.body && (snap.body.text || snap.body.markup), c0.body && c0.body.text),
    cta_text: primeiro(snap.cta_text, c0.cta_text),
    link_url: primeiro(snap.link_url, c0.link_url),
    media_type: videoUrl ? 'video' : (imageUrl ? 'image' : 'unknown'),
    video_url: videoUrl,
    image_url: imageUrl,
    start_date: startMs ? new Date(startMs).toISOString() : null,
    dias_ativo: diasAtivo,
    copias: primeiro(node.collation_count, node.collationCount, 1),
    is_active: primeiro(node.is_active, snap.is_active, true),
    snapshot_url: id ? `https://www.facebook.com/ads/library/?id=${id}` : null,
  }
}

// —— Scrape ————————————————————————————————————————————————————————————
async function scrape(url, { maxScrolls = 12, debug = false } = {}) {
  const b = await getBrowser()
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  const nodes = []
  let primeiraRaiz = null
  const debugUrls = []
  let respostasComAd = 0
  let graphqlCount = 0
  let amostraTexto = null

  page.on('response', async (res) => {
    try {
      const u = res.url()
      const ct = res.headers()['content-type'] || ''
      if (u.includes('graphql')) graphqlCount++
      // Rede mais ampla: qualquer resposta JSON/graphql/ads que tenha marcador de anúncio.
      if (!u.includes('graphql') && !u.includes('/ads/') && !ct.includes('json')) return
      const txt = await res.text()
      if (!txt) return
      const idx = txt.search(/ad_archive_id|adArchiveID|"snapshot"|collationCount/)
      if (idx < 0) return
      respostasComAd++
      if (debug && debugUrls.length < 25) debugUrls.push(u.slice(0, 100))
      // Guarda um trecho cru em volta do 1º anúncio pra eu calibrar o extrator.
      if (debug && !amostraTexto) amostraTexto = txt.slice(Math.max(0, idx - 200), idx + 2500)
      for (const obj of tentarJSON(txt)) {
        if (!primeiraRaiz) primeiraRaiz = obj
        coletarAnuncios(obj, nodes)
      }
    } catch (_) {}
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})

  // Dispensa o aviso de cookies (vários rótulos/idiomas) que bloqueia o carregamento.
  for (const rotulo of ['Permitir todos os cookies', 'Recusar cookies opcionais', 'Allow all cookies', 'Decline optional cookies', 'Aceitar tudo', 'Only allow essential cookies']) {
    try {
      const btn = page.getByRole('button', { name: rotulo })
      if (await btn.count()) { await btn.first().click({ timeout: 2000 }); break }
    } catch (_) {}
  }
  await page.waitForTimeout(4000)

  // Rola pra disparar a paginação (lazy-load) e junta mais anúncios.
  for (let i = 0; i < maxScrolls; i++) {
    await page.mouse.wheel(0, 4000)
    await page.waitForTimeout(1500)
  }

  // FONTE PRINCIPAL: dados SSR embutidos nos <script type="application/json"> do
  // HTML (a Meta renderiza a 1ª leva de anúncios ali). Varre todos e extrai os nós.
  let scriptsComAd = 0
  try {
    const blobs = await page.$$eval('script[type="application/json"]', (els) => els.map((e) => e.textContent || ''))
    for (const s of blobs) {
      if (!s || (!s.includes('ad_archive') && !s.includes('adArchiveID') && !s.includes('"snapshot"'))) continue
      scriptsComAd++
      try { coletarAnuncios(JSON.parse(s), nodes) } catch (_) {}
    }
  } catch (_) {}

  // Diagnóstico (só em debug): pra onde foi, o que apareceu, quantas respostas de anúncio.
  let diag = null
  if (debug) {
    diag = {
      final_url: page.url(),
      title: await page.title().catch(() => null),
      respostas_com_ad: respostasComAd,
      graphql_count: graphqlCount,
      scripts_com_ad: scriptsComAd,
      nodes_coletados: nodes.length,
      urls_capturadas: debugUrls,
      amostra_texto: amostraTexto,
      body_inicio: await page.evaluate(() => document.body ? document.body.innerText.slice(0, 300) : '').catch(() => ''),
    }
  }

  await ctx.close()

  // Dedup por ad_archive_id.
  const vistos = new Set()
  const criativos = []
  for (const n of nodes) {
    const c = normalizar(n)
    if (!c.ad_archive_id || vistos.has(c.ad_archive_id)) continue
    vistos.add(c.ad_archive_id)
    criativos.push(c)
  }

  const idades = criativos.map((c) => c.dias_ativo).filter((d) => d != null)
  const copiasTotais = criativos.reduce((a, c) => a + (Number(c.copias) || 0), 0)
  const stats = {
    encontrados: criativos.length,
    duplicacoes: Math.max(0, copiasTotais - criativos.length),
    idade_media_dias: idades.length ? Math.round(idades.reduce((a, d) => a + d, 0) / idades.length) : null,
  }

  const resp = { ok: true, stats, criativos }
  if (debug) { resp.raw_amostra = primeiraRaiz; resp.diag = diag }
  return resp
}

// —— Rotas —————————————————————————————————————————————————————————————
app.get('/', (_req, res) => res.json({ ok: true, service: 'rastreador-scraper' }))

// Teste fácil: GET /scrape?page_id=NUMERO (só dígitos, à prova de terminal ruim).
// Monta a URL padrão da biblioteca a partir do page_id. Auth por ?key= ou header.
app.get('/scrape', async (req, res) => {
  const key = req.query.key || req.headers['x-api-key']
  if (APIKEY && key !== APIKEY) return res.status(401).json({ error: 'unauthorized' })
  const pageId = String(req.query.page_id || '').replace(/\D/g, '')
  if (!pageId) return res.status(400).json({ error: 'page_id ausente (só o número da página)' })
  const country = String(req.query.country || 'BR').replace(/[^A-Za-z]/g, '') || 'BR'
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${pageId}`
  try {
    const out = await scrape(url, { maxScrolls: Number(req.query.maxScrolls) || 12, debug: req.query.debug === '1' })
    res.json(out)
  } catch (err) {
    console.error('[scrape-get]', err)
    res.status(500).json({ error: String(err && err.message || err) })
  }
})

// Screenshot de página inteira (o "print" do vigia de páginas do The Track).
// GET /screenshot?url=https://...&key=APIKEY → image/jpeg (fullPage, qualidade 70).
app.get('/screenshot', async (req, res) => {
  const key = req.query.key || req.headers['x-api-key']
  if (APIKEY && key !== APIKEY) return res.status(401).json({ error: 'unauthorized' })
  const url = String(req.query.url || '')
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url inválida' })
  let ctx = null
  try {
    const b = await getBrowser()
    ctx = await b.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      viewport: { width: 1366, height: 900 },
      locale: 'pt-BR',
    })
    const page = await ctx.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(2500) // dá tempo de players/fontes/animações assentarem
    const buf = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 })
    res.set('Content-Type', 'image/jpeg').send(buf)
  } catch (err) {
    console.error('[screenshot]', err)
    res.status(500).json({ error: String(err && err.message || err) })
  } finally {
    if (ctx) await ctx.close().catch(() => {})
  }
})

// Amostrador de headlines (teste A/B de página): abre a página em N sessões
// NOVAS (contexto limpo, sem cookie/cache) e, em cada uma, deixa o JS do
// construtor (GreatPages/Elementor/etc.) rodar e injetar as imagens. A headline
// desses funis quase sempre é uma IMAGEM no topo — que NÃO existe no HTML cru,
// só aparece depois do JS. Devolve, por sessão, as imagens do topo em ordem;
// o The Track agrupa as sessões por "impressão digital" (quais imagens vieram)
// pra descobrir quantas variantes de headline estão rodando, e faz o OCR.
// GET /render?url=...&key=APIKEY&n=6
app.get('/render', async (req, res) => {
  const key = req.query.key || req.headers['x-api-key']
  if (APIKEY && key !== APIKEY) return res.status(401).json({ error: 'unauthorized' })
  const url = String(req.query.url || '')
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url inválida' })
  const n = Math.min(Math.max(Number(req.query.n) || 30, 1), 40)
  const ORCAMENTO_MS = 230000 // teto de tempo total do render (fica < maxDuration)
  const inicioMs = Date.now()

  const UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  ]

  // Coletor rodado NO NAVEGADOR — função real (passar string pro page.evaluate
  // NÃO chama a função, só a serializa; era por isso que voltava vazio).
  function coletor() {
    const out = []
    const push = (src, r, top) => {
      if (!src || src.indexOf('data:,') === 0) return
      if (r.width < 120 || r.height < 24) return
      if (top > 2000) return
      out.push({ src: src, top: Math.round(top), w: Math.round(r.width), h: Math.round(r.height) })
    }
    for (const im of Array.from(document.images || [])) {
      const r = im.getBoundingClientRect()
      push(im.currentSrc || im.src || '', r, r.top + (window.scrollY || 0))
    }
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect()
      const top = r.top + (window.scrollY || 0)
      if (r.width < 120 || r.height < 24 || top > 2000) continue
      const bg = window.getComputedStyle(el).backgroundImage || ''
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/)
      if (m && /\.(png|jpe?g|webp|gif)/i.test(m[1])) push(m[1], r, top)
    }
    let htext = ''
    for (const tag of ['h1', 'h2']) {
      const el = document.querySelector(tag)
      if (el && el.innerText && el.innerText.trim().length > 8) { htext = el.innerText.trim().slice(0, 300); break }
    }
    // Assinaturas de vídeo VTurb no DOM renderizado (pra pegar A/B de VSL
    // page-level: cada variante da página pode embutir um player diferente).
    const vids = []; const vseen = {}
    const outer = document.documentElement.innerHTML
    const rxv = /(?:scripts|cdn)\.converteai\.net\/([a-z0-9-]+)\/(?:players\/)?([a-f0-9]{16,})/gi
    let vm
    while ((vm = rxv.exec(outer))) { const kk = vm[1] + '/' + vm[2]; if (!vseen[kk]) { vseen[kk] = 1; vids.push(kk) } }
    const vistos = new Set(); const uniq = []
    out.sort((a, b) => a.top - b.top)
    for (const it of out) { if (vistos.has(it.src)) continue; vistos.add(it.src); uniq.push(it) }
    return { imgs: uniq.slice(0, 8), htext: htext, vids: vids.slice(0, 6) }
  }

  const sessoes = []
  let erros = 0
  const errosMsg = []
  try {
    const b = await getBrowser()
    for (let i = 0; i < n; i++) {
      if (Date.now() - inicioMs > ORCAMENTO_MS) break // respeita o teto de tempo
      let ctx = null
      try {
        ctx = await b.newContext({
          userAgent: UAS[i % UAS.length],
          viewport: { width: 1080, height: 1350 },
          locale: 'pt-BR',
          serviceWorkers: 'block',            // sem SW = sem cache de variante
          extraHTTPHeaders: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
          deviceScaleFactor: 1 + (i % 3) * 0.5, // varia o fingerprint entre sessões
        })
        // Zera qualquer storage antes de qualquer script rodar.
        await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear() } catch (e) {} })
        const page = await ctx.newPage()
        // Cache-buster único por sessão: derruba qualquer cache/CDN que estivesse
        // servindo sempre a mesma variante pro nosso IP.
        const sep = url.indexOf('?') >= 0 ? '&' : '?'
        const u = url + sep + '_ttab=' + i + '_' + Date.now()
        await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch((e) => { if (errosMsg.length < 8) errosMsg.push('goto: ' + e.message) })
        await page.waitForTimeout(3200) // settle: dá tempo do JS do A/B sortear e injetar
        await page.evaluate(() => window.scrollTo(0, 200)).catch(() => {})
        const r = await page.evaluate(coletor).catch((e) => { errosMsg.push('evaluate: ' + e.message); return { imgs: [], htext: '', vids: [] } })
        // Print do topo da página (viewport) — é o que o usuário quer ver.
        let shot = null
        try {
          const buf = await page.screenshot({ type: 'jpeg', quality: 55 })
          shot = 'data:image/jpeg;base64,' + buf.toString('base64')
        } catch (e) { errosMsg.push('shot: ' + e.message) }
        sessoes.push({ imgs: r.imgs || [], htext: r.htext || '', vids: r.vids || [], shot: shot })
      } catch (e) {
        erros++; errosMsg.push('sessao: ' + (e && e.message || e))
      } finally {
        if (ctx) await ctx.close().catch(() => {})
      }
    }
  } catch (err) {
    console.error('[render]', err)
    return res.status(500).json({ error: String(err && err.message || err), sessoes: sessoes, erros: erros, errosMsg: errosMsg.slice(0, 8) })
  }
  res.json({ ok: true, sessoes: sessoes, n: n, erros: erros, errosMsg: errosMsg.slice(0, 8) })
})

app.post('/scrape', async (req, res) => {
  if (APIKEY && req.headers['x-api-key'] !== APIKEY) return res.status(401).json({ error: 'unauthorized' })
  const { url, maxScrolls, debug } = req.body || {}
  if (!url || !/facebook\.com\/ads\/library/i.test(url)) return res.status(400).json({ error: 'url inválida (biblioteca de anúncios da Meta)' })
  try {
    const out = await scrape(url, { maxScrolls: Number(maxScrolls) || 12, debug: !!debug })
    res.json(out)
  } catch (err) {
    console.error('[scrape]', err)
    res.status(500).json({ error: String(err && err.message || err) })
  }
})

app.listen(PORT, () => console.log(`[rastreador-scraper] ouvindo na porta ${PORT}`))
