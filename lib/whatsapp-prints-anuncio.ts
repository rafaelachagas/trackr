// Prints do rascunho montado pelo bot (lib/whatsapp-subir-anuncio): campanha,
// conjuntos e anúncios, como imagem no WhatsApp.
//
// A Vercel não abre navegador, então quem fotografa é o Chromium da VPS do
// rastreador (POST /screenshot-html). O que vai na foto é LIDO DE VOLTA da Meta
// depois de criado — não o que o bot pretendia mandar —, então o print é a prova
// do que de fato ficou salvo lá. A parte "anúncio" usa as prévias oficiais da
// Meta (/{ad}/previews), que abrem sem login.

import { RASTREADOR_URL, RASTREADOR_APIKEY } from '@/lib/rastreador'
import { EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY } from '@/lib/whatsapp'
import { fetchTimeout } from '@/lib/whatsapp-grupos'

const META = 'https://graph.facebook.com/v25.0'

// Rótulos em português, como aparecem no gerenciador.
const OBJETIVO: Record<string, string> = { OUTCOME_SALES: 'Vendas' }
const META_DESEMPENHO: Record<string, string> = {
  VALUE: 'Maximizar o valor das conversões',
  OFFSITE_CONVERSIONS: 'Maximizar o número de conversões',
  LINK_CLICKS: 'Maximizar cliques no link',
  LANDING_PAGE_VIEWS: 'Maximizar visualizações da página de destino',
}
const LANCE: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: 'Volume mais alto / maior valor (sem limite)',
  COST_CAP: 'Meta de custo por resultado',
  LOWEST_COST_WITH_BID_CAP: 'Limite de lance',
  LOWEST_COST_WITH_MIN_ROAS: 'Meta de ROAS',
}
const EVENTO: Record<string, string> = { PURCHASE: 'Compra', INITIATED_CHECKOUT: 'Finalização de compra iniciada', LEAD: 'Lead' }
const CTA: Record<string, string> = {
  LEARN_MORE: 'Saiba mais', SHOP_NOW: 'Comprar agora', BUY_NOW: 'Comprar', ORDER_NOW: 'Pedir agora',
  SIGN_UP: 'Cadastre-se', SUBSCRIBE: 'Assinar', GET_OFFER: 'Obter oferta', SEE_MORE: 'Ver mais',
  WATCH_MORE: 'Assistir mais', APPLY_NOW: 'Candidate-se', CONTACT_US: 'Fale conosco',
}
const MELHORIA: Record<string, string> = {
  standard_enhancements: 'Melhorias padrão', advantage_plus_creative: 'Advantage+ criativo',
  enhance_cta: 'CTA aprimorado', text_optimizations: 'Otimização de texto', inline_comment: 'Comentário em destaque',
  site_extensions: 'Extensões de site', show_destination_blurbs: 'Destaques do destino', product_extensions: 'Extensões de produto',
  product_browsing: 'Navegação de produtos', ads_with_benefits: 'Anúncios com benefícios', creative_stickers: 'Figurinhas',
  video_auto_crop: 'Corte automático de vídeo', video_filtering: 'Filtros de vídeo', video_uncrop: 'Expandir vídeo',
  image_touchups: 'Retoques de imagem', image_brightness_and_contrast: 'Brilho e contraste', music: 'Música',
}
const PREVIAS: [string, string][] = [
  ['INSTAGRAM_STANDARD', 'Feed do Instagram'],
  ['INSTAGRAM_REELS', 'Reels do Instagram'],
  ['MOBILE_FEED_STANDARD', 'Feed do Facebook'],
]

async function g(path: string, tk: string): Promise<any> {
  const r = await fetchTimeout(`${META}/${path}${path.includes('?') ? '&' : '?'}access_token=${tk}`, { cache: 'no-store' }, 30000)
  const j = await r.json()
  if (j.error) throw new Error(j.error.error_user_msg || j.error.message)
  return j
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const dinheiro = (cents: unknown, moeda: string) => cents == null || cents === '' ? null
  : (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'BRL' })

// ——— HTML ——————————————————————————————————————————————————————————————————

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f0f2f5;color:#1c2b33;padding:20px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.nivel{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#65676b}
.pausado{font-size:11px;font-weight:700;background:#fff3cd;color:#8a6100;border-radius:999px;padding:3px 10px}
.card{background:#fff;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.12);padding:16px 18px;margin-bottom:12px}
.nome{font-size:17px;font-weight:700;margin-bottom:12px;word-break:break-all}
.sec{font-size:12px;font-weight:700;color:#65676b;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px}
.linha{display:flex;gap:12px;padding:7px 0;border-top:1px solid #eef0f2;font-size:14px}
.linha:first-of-type{border-top:0}
.k{width:230px;flex-shrink:0;color:#65676b}
.v{flex:1;font-weight:600;word-break:break-word;white-space:pre-wrap}
.off{display:inline-block;font-size:12px;background:#eef0f2;border-radius:6px;padding:3px 8px;margin:0 6px 6px 0;font-weight:600}
.off:before{content:"⏻ ";color:#c0392b}
.prev{display:flex;gap:16px;align-items:flex-start;flex-wrap:nowrap}
.prev figure{background:#fff;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.12);padding:10px}
.prev figcaption{font-size:12px;font-weight:700;color:#65676b;margin-bottom:8px;text-transform:uppercase}
.prev iframe{border:0;display:block;width:340px!important;height:640px!important}
.ativo{font-size:11px;font-weight:700;background:#d4f5dd;color:#1e7b34;border-radius:999px;padding:3px 10px}
`

function pagina(corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${corpo}</body></html>`
}

// Selo do topo: reflete o status real lido da Meta (não o que o bot pretendia).
const selo = (status: string[]) => status.every((x) => x === 'PAUSED')
  ? '<span class="pausado">PAUSADO</span>' : '<span class="ativo">ATIVO</span>'

const linha = (k: string, v: string | null | undefined) => v ? `<div class="linha"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>` : ''

function publico(t: any): string {
  if (!t) return '—'
  const paises = t.geo_locations?.countries?.join(', ') || '—'
  const gen = !t.genders?.length ? 'Todos os gêneros' : t.genders.includes(1) && t.genders.includes(2) ? 'Todos os gêneros' : t.genders.includes(2) ? 'Mulheres' : 'Homens'
  const adv = t.targeting_automation?.advantage_audience === 1 ? ' · Público Advantage+ ligado' : ''
  return `${paises} · ${t.age_min ?? 18}-${t.age_max ?? 65}${(t.age_max ?? 65) >= 65 ? '+' : ''} anos · ${gen}${adv}`
}

function posicionamentos(t: any): string {
  const p = t?.publisher_platforms
  return p?.length ? `Manual: ${p.join(', ')}` : 'Advantage+ (automático)'
}

function atribuicao(a: any[] | undefined): string | null {
  if (!a?.length) return null
  return a.map((x) => `${x.window_days} dia${x.window_days > 1 ? 's' : ''} após ${x.event_type === 'CLICK_THROUGH' ? 'clique' : 'visualização'}`).join(' + ')
}

// ——— leitura da Meta + render ——————————————————————————————————————————————

interface Alvo { campanhas: { id: string }[]; conjuntos: { id: string }[]; anuncios: { id: string }[] }

async function printar(html: string, width: number, waitMs = 2500): Promise<Buffer> {
  if (!RASTREADOR_APIKEY) throw new Error('RASTREADOR_APIKEY não configurada na Vercel')
  const r = await fetchTimeout(`${RASTREADOR_URL}/screenshot-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': RASTREADOR_APIKEY },
    body: JSON.stringify({ html, width, wait_ms: waitMs }),
  }, 90000)
  if (r.status === 404) throw new Error('a VPS ainda não tem o /screenshot-html — rode `bash ~/trackr/deploy-vps.sh rastreador`')
  if (!r.ok) throw new Error(`VPS respondeu ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  return Buffer.from(await r.arrayBuffer())
}

async function enviarImagem(to: string, img: Buffer, legenda: string) {
  const r = await fetchTimeout(`${EVOLUTION_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
    body: JSON.stringify({ number: to, mediatype: 'image', mimetype: 'image/jpeg', fileName: 'print.jpg', caption: legenda, media: img.toString('base64') }),
  }, 60000)
  if (!r.ok) throw new Error(`Evolution não enviou a imagem (${r.status})`)
}

async function htmlCampanhas(alvo: Alvo, moeda: string, tk: string): Promise<string> {
  const cards: string[] = []
  const status: string[] = []
  for (const { id } of alvo.campanhas) {
    const c = await g(`${id}?fields=name,status,objective,buying_type,daily_budget,lifetime_budget,bid_strategy,special_ad_categories`, tk)
    status.push(c.status)
    const cbo = !!(c.daily_budget || c.lifetime_budget)
    cards.push(`<div class="card"><div class="nome">${esc(c.name)}</div>
      ${linha('Status', c.status === 'PAUSED' ? 'Pausada' : c.status)}
      ${linha('Objetivo', OBJETIVO[c.objective] ?? c.objective)}
      ${linha('Tipo de compra', c.buying_type === 'AUCTION' ? 'Leilão' : c.buying_type)}
      ${linha('Orçamento', cbo ? `CBO (Advantage+ orçamento da campanha) · ${dinheiro(c.daily_budget, moeda) ?? dinheiro(c.lifetime_budget, moeda)}${c.daily_budget ? '/dia' : ' total'}` : 'ABO (orçamento nos conjuntos)')}
      ${cbo ? linha('Estratégia de lance', LANCE[c.bid_strategy] ?? c.bid_strategy) : ''}
      ${linha('Categorias especiais', c.special_ad_categories?.length ? c.special_ad_categories.join(', ') : 'Nenhuma')}
    </div>`)
  }
  return pagina(`<div class="top"><span class="nivel">Campanha${cards.length > 1 ? 's' : ''}</span>${selo(status)}</div>${cards.join('')}`)
}

async function htmlConjuntos(alvo: Alvo, moeda: string, tk: string): Promise<string> {
  const cards: string[] = []
  const status: string[] = []
  const pixels = new Map<string, string>()
  for (const { id } of alvo.conjuntos) {
    const a = await g(`${id}?fields=name,status,campaign{name},optimization_goal,billing_event,bid_strategy,promoted_object,targeting,daily_budget,daily_min_spend_target,daily_spend_cap,attribution_spec,destination_type`, tk)
    status.push(a.status)
    const px = a.promoted_object?.pixel_id
    if (px && !pixels.has(px)) pixels.set(px, (await g(`${px}?fields=name`, tk).catch(() => null))?.name ?? px)
    cards.push(`<div class="card"><div class="nome">${esc(a.name)} <span style="font-weight:400;color:#65676b;font-size:13px">· ${esc(a.campaign?.name)}</span></div>
      ${linha('Status', a.status === 'PAUSED' ? 'Pausado' : a.status)}
      <div class="sec">Conversão</div>
      ${linha('Local da conversão', 'Site')}
      ${linha('Meta de desempenho', META_DESEMPENHO[a.optimization_goal] ?? a.optimization_goal)}
      ${linha('Pixel', px ? `${pixels.get(px)} (${px})` : '—')}
      ${linha('Evento de conversão', EVENTO[a.promoted_object?.custom_event_type] ?? a.promoted_object?.custom_event_type)}
      ${linha('Modelo de atribuição', atribuicao(a.attribution_spec))}
      <div class="sec">Orçamento</div>
      ${linha('Orçamento do conjunto', dinheiro(a.daily_budget, moeda) ? `${dinheiro(a.daily_budget, moeda)}/dia` : 'Da campanha (CBO)')}
      ${linha('Gasto mínimo diário', dinheiro(a.daily_min_spend_target, moeda))}
      ${linha('Limite de gasto diário', dinheiro(a.daily_spend_cap, moeda))}
      ${a.daily_budget ? linha('Estratégia de lance', LANCE[a.bid_strategy] ?? a.bid_strategy) : ''}
      <div class="sec">Público e posicionamento</div>
      ${linha('Público', publico(a.targeting))}
      ${linha('Posicionamentos', posicionamentos(a.targeting))}
    </div>`)
  }
  return pagina(`<div class="top"><span class="nivel">Conjunto${cards.length > 1 ? 's' : ''} de anúncios</span>${selo(status)}</div>${cards.join('')}`)
}

async function htmlAnuncio(adId: string, tk: string): Promise<{ html: string; nome: string }> {
  const ad = await g(`${adId}?fields=name,status,creative{object_story_spec,degrees_of_freedom_spec,contextual_multi_ads}`, tk)
  const oss = ad.creative?.object_story_spec ?? {}
  const d = oss.video_data ?? oss.link_data ?? {}
  const link = d.call_to_action?.value?.link ?? d.link
  const [pagina_, ig] = await Promise.all([
    oss.page_id ? g(`${oss.page_id}?fields=name`, tk).catch(() => null) : null,
    oss.instagram_user_id ? g(`${oss.instagram_user_id}?fields=username`, tk).catch(() => null) : null,
  ])
  const feats = ad.creative?.degrees_of_freedom_spec?.creative_features_spec ?? {}
  const desligadas = Object.entries(feats).filter(([, v]: any) => v?.enroll_status === 'OPT_OUT').map(([k]) => MELHORIA[k] ?? k)
  const ligadas = Object.entries(feats).filter(([, v]: any) => v?.enroll_status === 'OPT_IN').map(([k]) => MELHORIA[k] ?? k)
  const multi = ad.creative?.contextual_multi_ads?.enroll_status

  const previas: string[] = []
  for (const [fmt, rotulo] of PREVIAS) {
    const p = await g(`${adId}/previews?ad_format=${fmt}`, tk).catch(() => null)
    const body: string | undefined = p?.data?.[0]?.body
    if (body) previas.push(`<figure><figcaption>${esc(rotulo)}</figcaption>${body}</figure>`)
  }

  const corpo = `<div class="top"><span class="nivel">Anúncio</span>${selo([ad.status])}</div>
  <div class="card"><div class="nome">${esc(ad.name)}</div>
    ${linha('Identidade', [pagina_?.name && `Facebook: ${pagina_.name}`, ig?.username && `Instagram: @${ig.username}`].filter(Boolean).join(' · ') || '—')}
    ${linha('Formato', oss.video_data ? 'Vídeo único' : 'Imagem única')}
    ${linha('Texto principal', d.message || '(vazio)')}
    ${linha('Título', d.title ?? d.name ?? '(vazio)')}
    ${linha('Chamada para ação', CTA[d.call_to_action?.type] ?? d.call_to_action?.type)}
    ${linha('URL do site (com sck)', link)}
    <div class="sec">Melhorias automáticas da Meta</div>
    <div style="padding-top:4px">${desligadas.map((x) => `<span class="off">${esc(x)}</span>`).join('')}${multi === 'OPT_OUT' ? '<span class="off">Anúncios de vários anunciantes</span>' : ''}</div>
    ${ligadas.length || multi === 'OPT_IN' ? `<div class="linha" style="color:#c0392b"><div class="k">⚠ Ainda ligadas</div><div class="v">${esc([...ligadas, ...(multi === 'OPT_IN' ? ['Anúncios de vários anunciantes'] : [])].join(', '))}</div></div>` : ''}
  </div>
  ${previas.length ? `<div class="prev">${previas.join('')}</div>` : ''}`
  return { html: pagina(corpo), nome: ad.name }
}

// HTML de cada print (campanha, conjuntos e até 8 anúncios — mais que isso vira
// spam; o resto está no link de prévia do resumo).
export async function htmlsDoRascunho(alvo: Alvo, moeda: string, tk: string) {
  const out: { legenda: string; html: string; width: number; waitMs: number }[] = [
    { legenda: '📸 Campanha', html: await htmlCampanhas(alvo, moeda, tk), width: 860, waitMs: 1500 },
    { legenda: '📸 Conjuntos', html: await htmlConjuntos(alvo, moeda, tk), width: 860, waitMs: 1500 },
  ]
  for (const { id } of alvo.anuncios.slice(0, 8)) {
    const { html, nome } = await htmlAnuncio(id, tk)
    out.push({ legenda: `📸 ${nome}`, html, width: 1500, waitMs: 9000 })
  }
  return out
}

/** Gera e manda os prints. Não lança: devolve o erro pra quem chamou avisar. */
export async function enviarPrintsRascunho(to: string, alvo: Alvo, moeda: string, tk: string): Promise<string | null> {
  try {
    for (const p of await htmlsDoRascunho(alvo, moeda, tk)) {
      await enviarImagem(to, await printar(p.html, p.width, p.waitMs), p.legenda)
    }
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
