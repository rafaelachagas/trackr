// Subir anúncio pelo WhatsApp — conversa no PRIVADO do dono com o bot.
//
//   "quero subir um anúncio" / "subir campanha" / "testar novos criativos"
//     → conta → (marcador da conta) → fase → URL da página → nomes dos anúncios
//     → criativo de cada um → texto → título → CTA → CBO/ABO → orçamento
//     → gasto mínimo → MONTA NA META, TUDO PAUSADO → resumo + links de prévia
//     → ajustes em texto livre (IA) → "publicar" + "SIM" ativa.
//
// NUNCA publica sozinho: campanha, conjuntos e anúncios nascem PAUSED e só viram
// ACTIVE com "publicar" seguido de "SIM" vindos do número do dono.
//
// O molde (pixel, evento, público, página/Instagram, janela de atribuição) é
// copiado da campanha mais recente da mesma fase na conta escolhida — ou da
// conta principal, se a conta é nova. As melhorias automáticas do Advantage+
// criativo (CTA melhorado, texto otimizado, extensões de site, destino, etc.)
// vão TODAS desligadas, igual às campanhas montadas à mão.
//
// Nomes e link com sck saem de lib/nomenclatura (o mesmo do Gerador de
// Nomenclatura) — é o que casa a venda com o gasto (lib/meta-chave.ts). Este
// módulo só escreve na Meta e em configuracoes; nunca em vendas/gastos.

import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY, mesmoNumero } from '@/lib/whatsapp'
import { fetchTimeout, enviarTexto } from '@/lib/whatsapp-grupos'
import { DONO_SAUDE } from '@/lib/whatsapp-saude'
import { chamarLLM, extrairJSON } from '@/lib/llm'
import { enviarPrintsRascunho } from '@/lib/whatsapp-prints-anuncio'
import { gerarNomenclatura, parseBase, slug, limparHpid, FASE_CFG, type Fase } from '@/lib/nomenclatura'

export const CHAVE_SUBIR = 'whatsapp_subir_anuncio'
const DONO = DONO_SAUDE
const META = 'https://graph.facebook.com/v25.0'
const META_VIDEO = 'https://graph-video.facebook.com/v25.0'
// Conta principal: molde de reserva quando a conta escolhida nunca rodou campanha.
const CONTA_PRINCIPAL = '1147900723247431'
// Sessão parada há mais que isso é esquecida (não prende o próximo "subir anúncio").
const SESSAO_TTL_MS = 24 * 3600 * 1000

const GATILHO = /\b(subir|criar|montar|lan[cç]ar)\b.*\b(an[uú]ncios?|campanhas?|criativos?|ads?)\b|\btestar\b.*\bcriativos?\b/i

// Melhorias do Advantage+ criativo — todas OPT_OUT. Lista = o que as campanhas
// montadas à mão já trazem desligado (lido da Meta em 09/10/2026).
const DOF_OPT_OUT = [
  'ads_with_benefits', 'advantage_plus_creative', 'creative_stickers', 'enhance_cta', 'inline_comment',
  'product_browsing', 'show_destination_blurbs', 'site_extensions', 'standard_enhancements',
  'text_optimizations', 'video_auto_crop', 'video_filtering', 'video_uncrop',
]
function degreesOfFreedom() {
  const f: Record<string, any> = {}
  for (const k of DOF_OPT_OUT) f[k] = { enroll_status: 'OPT_OUT' }
  f.product_extensions = { enroll_status: 'OPT_OUT', customizations: { pe_carousel: { enroll_status: 'OPT_OUT' } } }
  return { creative_features_spec: f }
}

export const CTAS: { tipo: string; label: string }[] = [
  { tipo: 'LEARN_MORE', label: 'Saiba mais' },
  { tipo: 'SHOP_NOW', label: 'Comprar agora' },
  { tipo: 'BUY_NOW', label: 'Comprar' },
  { tipo: 'ORDER_NOW', label: 'Pedir agora' },
  { tipo: 'SIGN_UP', label: 'Cadastre-se' },
  { tipo: 'SUBSCRIBE', label: 'Assinar' },
  { tipo: 'GET_OFFER', label: 'Obter oferta' },
  { tipo: 'SEE_MORE', label: 'Ver mais' },
  { tipo: 'WATCH_MORE', label: 'Assistir mais' },
  { tipo: 'APPLY_NOW', label: 'Candidate-se' },
  { tipo: 'CONTACT_US', label: 'Fale conosco' },
]
const ctaLabel = (t: string) => CTAS.find((c) => c.tipo === t)?.label ?? t

type Etapa =
  | 'conta' | 'marcador' | 'fase' | 'url' | 'nomes' | 'midia' | 'texto' | 'titulo' | 'cta'
  | 'estrutura' | 'orcamento' | 'minimo' | 'montando' | 'revisao' | 'confirmar' | 'publicando'

// isolado = 1 campanha, 1 conjunto por criativo (fase 01)
// por_campanha = 1 campanha por criativo (fases 02/03)
// junto = 1 campanha, 1 conjunto com todos
type Agrupamento = 'isolado' | 'por_campanha' | 'junto'

interface Midia { tipo: 'video' | 'imagem'; status: 'subindo' | 'ok' | 'erro'; video_id?: string; image_hash?: string; erro?: string }
interface AdRasc { codigo: string; slug: string; midia?: Midia }
interface Rascunho {
  campanhas: { id: string; nome: string }[]
  conjuntos: { id: string; nome: string }[]
  anuncios: { id: string; nome: string; link: string; preview?: string }[]
  molde: string
}
interface Sessao {
  etapa: Etapa
  atualizado: string
  ids: string[]                         // ids de mensagem já tratados (webhook repete)
  conta?: { id: string; nome: string; moeda: string }
  contasOpcoes?: { id: string; nome: string; moeda: string }[]
  marcador?: string
  fase?: Fase
  url?: string
  hpid?: string
  ads?: AdRasc[]
  texto?: string
  titulo?: string
  cta?: string
  estrutura?: 'CBO' | 'ABO'
  agrupamento?: Agrupamento
  orcamento?: number                    // na moeda da conta, por campanha (CBO) ou por conjunto (ABO)
  minimo?: number | null                // gasto mínimo diário por conjunto (só CBO)
  idadeMin?: number
  idadeMax?: number
  generos?: 'mulheres' | 'homens' | 'todos'
  rascunho?: Rascunho
}

// ——— estado ————————————————————————————————————————————————————————————————

async function lerSessao(): Promise<Sessao | null> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', CHAVE_SUBIR).maybeSingle()
  try {
    const v = typeof data?.valor === 'string' ? JSON.parse(data.valor) : data?.valor
    if (!v?.sessao) return null
    const s = v.sessao as Sessao
    if (Date.now() - Date.parse(s.atualizado) > SESSAO_TTL_MS && !s.rascunho) return null
    return s
  } catch {
    return null
  }
}

async function salvarSessao(s: Sessao | null) {
  if (s) s.atualizado = new Date().toISOString()
  // configuracoes.org_id é NOT NULL: inserir chave nova sem ele falha calado.
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: CHAVE_SUBIR, valor: JSON.stringify({ sessao: s }), org_id: org?.id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw new Error(error.message)
}

// Upload roda em paralelo à conversa: relê o estado e mexe só na mídia daquele ad.
async function atualizarMidia(codigo: string, midia: Midia) {
  const s = await lerSessao()
  const ad = s?.ads?.find((a) => a.codigo === codigo)
  if (!s || !ad) return
  ad.midia = midia
  await salvarSessao(s)
}

const responder = (t: string) => enviarTexto(DONO, t)

// ——— Meta ——————————————————————————————————————————————————————————————————

async function token(): Promise<string> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'meta_access_token').maybeSingle()
  const t = data?.valor?.toString().trim()
  if (!t) throw new Error('token da Meta não configurado (Fontes de dados › Contas de anúncio)')
  return t
}

function erroMeta(j: any): string {
  const e = j?.error
  return e ? (e.error_user_msg || e.error_user_title || e.message || JSON.stringify(e)) : 'resposta inesperada da Meta'
}

async function mGet(path: string, tk: string): Promise<any> {
  const r = await fetchTimeout(`${META}/${path}${path.includes('?') ? '&' : '?'}access_token=${tk}`, { cache: 'no-store' }, 30000)
  const j = await r.json()
  if (j.error) throw new Error(erroMeta(j))
  return j
}

async function mPost(path: string, params: Record<string, unknown>, tk: string): Promise<any> {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  body.set('access_token', tk)
  const r = await fetchTimeout(`${META}/${path}`, { method: 'POST', body }, 60000)
  const j = await r.json()
  if (j.error) throw new Error(erroMeta(j))
  return j
}

async function mDelete(id: string, tk: string) {
  await fetchTimeout(`${META}/${id}?access_token=${tk}`, { method: 'DELETE' }, 30000).catch(() => {})
}

type ContaOpcao = { id: string; nome: string; moeda: string }

async function listarContas(tk: string): Promise<ContaOpcao[]> {
  const j = await mGet('me/adaccounts?fields=name,account_id,currency,account_status&limit=200', tk)
  return (j.data ?? [])
    .filter((a: any) => a.account_status === 1)
    .map((a: any): ContaOpcao => ({ id: String(a.account_id), nome: String(a.name), moeda: String(a.currency || 'BRL') }))
    .sort((a: ContaOpcao, b: ContaOpcao) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
}

interface Molde {
  origem: string
  page_id: string
  instagram_user_id?: string
  adset: { optimization_goal: string; billing_event: string; promoted_object: any; targeting: any; attribution_spec?: any }
}

// Copia o "jeito" de uma campanha que já roda: pixel/evento, público,
// página/Instagram e atribuição. Só olha campanhas no padrão [IZ] (a conta pode
// ter campanha antiga de outro produto, com outro pixel). Ordem: mesma fase na
// conta → qualquer [IZ] na conta → mesma fase na principal → [IZ] na principal.
async function acharMolde(contaId: string, fase: Fase, tk: string): Promise<Molde> {
  const tentativas: [string, string][] = [[contaId, fase], [contaId, '[IZ]'], [CONTA_PRINCIPAL, fase], [CONTA_PRINCIPAL, '[IZ]']]
  for (const [conta, termo] of tentativas) {
    const filtro = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: termo }]))
    let camps: any[] = []
    try { camps = (await mGet(`act_${conta}/campaigns?fields=name,objective&limit=15&filtering=${filtro}`, tk)).data ?? [] } catch { continue }
    for (const c of camps.filter((x) => x.objective === 'OUTCOME_SALES' && String(x.name).includes('[IZ]'))) {
      let as: any, ad: any
      try {
        as = (await mGet(`${c.id}/adsets?fields=optimization_goal,billing_event,promoted_object,targeting,attribution_spec&limit=1`, tk)).data?.[0]
        ad = (await mGet(`${c.id}/ads?fields=creative{object_story_spec,instagram_user_id,actor_id}&limit=1`, tk)).data?.[0]
      } catch { continue }
      const oss = ad?.creative?.object_story_spec
      const page = oss?.page_id || ad?.creative?.actor_id
      if (!as?.promoted_object?.pixel_id || !page) continue
      const targeting = { ...as.targeting }
      delete targeting.age_range
      const promoted = { pixel_id: String(as.promoted_object.pixel_id), custom_event_type: as.promoted_object.custom_event_type || 'PURCHASE' }
      let origem = c.name
      if (conta !== contaId) {
        // Molde de outra conta: o pixel precisa estar compartilhado com esta.
        // Pixel errado = venda não otimiza (e outro produto ganha o sinal), então
        // nunca troca às cegas: só pelo único pixel "FPF" da conta, senão para.
        const px: any[] = (await mGet(`act_${contaId}/adspixels?fields=id,name&limit=50`, tk).catch(() => ({ data: [] }))).data ?? []
        if (!px.some((p) => String(p.id) === promoted.pixel_id)) {
          const fpf = px.filter((p) => /fpf/i.test(p.name || ''))
          if (fpf.length !== 1) {
            throw new Error(`o pixel do molde (${promoted.pixel_id}) não está compartilhado com essa conta`
              + (px.length ? `. Pixels dela: ${px.map((p) => p.name).join(', ')}` : '')
              + '. Compartilhe o pixel FPF com a conta no Gerenciador de Negócios e mande *refazer*.')
          }
          promoted.pixel_id = String(fpf[0].id)
          origem += ` — pixel trocado pro da conta: ${fpf[0].name}`
        }
        origem = `${c.name} (conta principal)${origem.includes('pixel trocado') ? origem.slice(c.name.length) : ''}`
      }
      return {
        origem,
        page_id: page,
        instagram_user_id: oss?.instagram_user_id || ad?.creative?.instagram_user_id,
        adset: {
          optimization_goal: as.optimization_goal, billing_event: as.billing_event || 'IMPRESSIONS',
          promoted_object: promoted, targeting, attribution_spec: as.attribution_spec,
        },
      }
    }
  }
  throw new Error('não achei nenhuma campanha [IZ] de vendas pra copiar pixel/público/página')
}

async function subirVideo(contaId: string, nome: string, fonte: { bytes?: Buffer; mime?: string; url?: string }, tk: string): Promise<string> {
  const fd = new FormData()
  fd.set('name', nome)
  fd.set('access_token', tk)
  if (fonte.url) fd.set('file_url', fonte.url)
  else fd.set('source', new Blob([new Uint8Array(fonte.bytes!)], { type: fonte.mime || 'video/mp4' }), `${nome}.mp4`)
  const r = await fetchTimeout(`${META_VIDEO}/act_${contaId}/advideos`, { method: 'POST', body: fd }, 280000)
  const j = await r.json()
  if (j.error || !j.id) throw new Error(erroMeta(j))
  return String(j.id)
}

async function subirImagem(contaId: string, bytes: Buffer, tk: string): Promise<string> {
  const j = await mPost(`act_${contaId}/adimages`, { bytes: bytes.toString('base64') }, tk)
  const img: any = Object.values(j.images ?? {})[0]
  if (!img?.hash) throw new Error('a Meta não devolveu o hash da imagem')
  return img.hash
}

// O criativo de vídeo exige capa: espera o processamento e pega a preferida.
async function capaDoVideo(videoId: string, tk: string): Promise<string> {
  for (let i = 0; i < 24; i++) {
    const v = await mGet(`${videoId}?fields=status`, tk).catch(() => null)
    const st = v?.status?.video_status
    if (st === 'error') throw new Error(`a Meta não conseguiu processar o vídeo ${videoId}`)
    const th = (await mGet(`${videoId}/thumbnails`, tk).catch(() => ({ data: [] }))).data ?? []
    const uri = (th.find((t: any) => t.is_preferred) ?? th[0])?.uri
    if (st === 'ready' && uri) return uri
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error(`o vídeo ${videoId} ainda está processando na Meta — tente de novo em alguns minutos ("refazer")`)
}

// ——— mídia do WhatsApp —————————————————————————————————————————————————————

function textoCru(msg: any): string {
  return String(msg?.conversation ?? msg?.extendedTextMessage?.text ?? '').trim()
}

function midiaDaMensagem(msg: any): { tipo: 'video' | 'imagem'; mime: string; legenda: string } | null {
  const doc = msg?.documentMessage ?? msg?.documentWithCaptionMessage?.message?.documentMessage
  if (msg?.videoMessage) return { tipo: 'video', mime: msg.videoMessage.mimetype || 'video/mp4', legenda: msg.videoMessage.caption || '' }
  if (msg?.imageMessage) return { tipo: 'imagem', mime: msg.imageMessage.mimetype || 'image/jpeg', legenda: msg.imageMessage.caption || '' }
  if (doc) {
    const mime = String(doc.mimetype || '')
    if (mime.startsWith('video/')) return { tipo: 'video', mime, legenda: doc.caption || doc.fileName || '' }
    if (mime.startsWith('image/')) return { tipo: 'imagem', mime, legenda: doc.caption || doc.fileName || '' }
  }
  return null
}

async function baixarDoWhatsapp(data: any): Promise<Buffer> {
  const r = await fetchTimeout(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
    body: JSON.stringify({ message: { key: data.key, message: data.message }, convertToMp4: false }),
  }, 120000)
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j?.base64) throw new Error(`a Evolution não devolveu o arquivo (${r.status})`)
  return Buffer.from(String(j.base64).replace(/^data:[^,]+,/, ''), 'base64')
}

// ——— nomes e estrutura ———————————————————————————————————————————————————————

interface PlanoCampanha {
  nome: string
  conjuntos: { nome: string; ads: { ad: AdRasc; nome: string; link: string }[] }[]
}

function plano(s: Sessao): PlanoCampanha[] {
  const fase = s.fase!
  const ads = s.ads ?? []
  const nom = (ad: AdRasc, cj: number, codes: string[]) => gerarNomenclatura({
    base: { codigo: ad.codigo, slug: ad.slug }, fase, conjunto: cj, marcador: s.marcador, adCodes: codes, lp: s.url, hpid: s.hpid,
  })
  const ag = s.agrupamento ?? 'isolado'
  if (ag === 'por_campanha') {
    return ads.map((ad) => {
      const n = nom(ad, 1, [ad.codigo])
      return { nome: n.campDisplay, conjuntos: [{ nome: n.cjDisplay, ads: [{ ad, nome: n.adName, link: n.link }] }] }
    })
  }
  const codes = ads.map((a) => a.codigo)
  const nomeCamp = nom(ads[0], 1, codes).campDisplay
  if (ag === 'junto') {
    return [{ nome: nomeCamp, conjuntos: [{ nome: 'CJ01', ads: ads.map((ad) => { const n = nom(ad, 1, codes); return { ad, nome: n.adName, link: n.link } }) }] }]
  }
  return [{
    nome: nomeCamp,
    conjuntos: ads.map((ad, i) => { const n = nom(ad, i + 1, codes); return { nome: n.cjDisplay, ads: [{ ad, nome: n.adName, link: n.link }] } }),
  }]
}

const moedaFmt = (v: number, moeda: string) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 })

function descreverAgrupamento(ag: Agrupamento): string {
  return ag === 'isolado' ? '1 campanha, cada criativo no seu próprio conjunto'
    : ag === 'por_campanha' ? '1 campanha por criativo' : '1 campanha, todos os criativos no mesmo conjunto'
}

// ——— montar / apagar / publicar ————————————————————————————————————————————

async function apagarRascunho(r: Rascunho | undefined, tk: string) {
  for (const c of r?.campanhas ?? []) await mDelete(c.id, tk)
}

async function montar(): Promise<void> {
  const s = await lerSessao()
  if (!s?.conta || !s.fase || !s.ads?.length) return
  const tk = await token()
  const conta = s.conta.id
  const criados: Rascunho = { campanhas: [], conjuntos: [], anuncios: [], molde: '' }
  try {
    // Espera uploads que ainda estejam subindo (até ~2 min).
    for (let i = 0; i < 24 && (await lerSessao())?.ads?.some((a) => a.midia?.status === 'subindo'); i++) {
      await new Promise((r) => setTimeout(r, 5000))
    }
    const atual = (await lerSessao()) ?? s
    const faltando = (atual.ads ?? []).filter((a) => a.midia?.status !== 'ok')
    if (faltando.length) throw new Error(`criativo sem arquivo na Meta: ${faltando.map((a) => `${a.codigo}${a.midia?.erro ? ` (${a.midia.erro})` : ''}`).join(', ')}`)

    const molde = await acharMolde(conta, atual.fase!, tk)
    criados.molde = molde.origem
    const targeting = { ...molde.adset.targeting }
    if (atual.idadeMin) targeting.age_min = atual.idadeMin
    if (atual.idadeMax) targeting.age_max = atual.idadeMax
    if (atual.generos === 'mulheres') targeting.genders = [2]
    else if (atual.generos === 'homens') targeting.genders = [1]
    else if (atual.generos === 'todos') delete targeting.genders

    const cbo = atual.estrutura !== 'ABO'
    const cents = (v: number) => Math.round(v * 100)
    const capas = new Map<string, string>()

    for (const camp of plano(atual)) {
      const c = await mPost(`act_${conta}/campaigns`, {
        name: camp.nome, objective: 'OUTCOME_SALES', status: 'PAUSED', buying_type: 'AUCTION',
        special_ad_categories: [],
        ...(cbo
          ? { daily_budget: cents(atual.orcamento!), bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }
          : { is_adset_budget_sharing_enabled: false }),
      }, tk)
      criados.campanhas.push({ id: c.id, nome: camp.nome })

      for (const cj of camp.conjuntos) {
        const a = await mPost(`act_${conta}/adsets`, {
          name: cj.nome, campaign_id: c.id, status: 'PAUSED',
          optimization_goal: molde.adset.optimization_goal, billing_event: molde.adset.billing_event,
          promoted_object: molde.adset.promoted_object, targeting, attribution_spec: molde.adset.attribution_spec,
          ...(cbo
            ? (atual.minimo ? { daily_min_spend_target: cents(atual.minimo) } : {})
            : { daily_budget: cents(atual.orcamento!), bid_strategy: 'LOWEST_COST_WITHOUT_CAP' }),
        }, tk)
        criados.conjuntos.push({ id: a.id, nome: `${camp.nome} › ${cj.nome}` })

        for (const item of cj.ads) {
          const m = item.ad.midia!
          const cta = { type: atual.cta || 'LEARN_MORE', value: { link: item.link } }
          let story: any
          if (m.tipo === 'video') {
            if (!capas.has(m.video_id!)) capas.set(m.video_id!, await capaDoVideo(m.video_id!, tk))
            story = { video_data: { video_id: m.video_id, image_url: capas.get(m.video_id!), title: atual.titulo || undefined, message: atual.texto || undefined, call_to_action: cta } }
          } else {
            story = { link_data: { image_hash: m.image_hash, link: item.link, name: atual.titulo || undefined, message: atual.texto || undefined, call_to_action: cta } }
          }
          const cr = await mPost(`act_${conta}/adcreatives`, {
            name: item.nome,
            object_story_spec: { page_id: molde.page_id, ...(molde.instagram_user_id ? { instagram_user_id: molde.instagram_user_id } : {}), ...story },
            degrees_of_freedom_spec: degreesOfFreedom(),
            contextual_multi_ads: { enroll_status: 'OPT_OUT' },
          }, tk)
          const ad = await mPost(`act_${conta}/ads`, { name: item.nome, adset_id: a.id, creative: { creative_id: cr.id }, status: 'PAUSED' }, tk)
          const pv = await mGet(`${ad.id}?fields=preview_shareable_link`, tk).catch(() => null)
          criados.anuncios.push({ id: ad.id, nome: item.nome, link: item.link, preview: pv?.preview_shareable_link })
        }
      }
    }

    const fim = (await lerSessao()) ?? atual
    fim.rascunho = criados
    fim.etapa = 'revisao'
    await salvarSessao(fim)
    await responder(resumoRascunho(fim))
    await mandarPrints(fim, tk)
  } catch (e) {
    await apagarRascunho(criados, tk)
    const s2 = await lerSessao()
    if (s2) { s2.etapa = 'revisao'; s2.rascunho = undefined; await salvarSessao(s2) }
    await responder(`❌ Não consegui montar: ${e instanceof Error ? e.message : e}\n\nNada ficou criado na Meta. Me diga o ajuste (ou *refazer* pra tentar de novo, *cancelar* pra sair).`)
  }
}

// Prints vêm da VPS (Chromium); se ela falhar, o rascunho continua valendo.
async function mandarPrints(s: Sessao, tk: string) {
  if (!s.rascunho) return
  await responder('📸 Gerando os prints (campanha, conjuntos e prévia de cada anúncio)...')
  const erro = await enviarPrintsRascunho(DONO, s.rascunho, s.conta!.moeda, tk)
  if (erro) await responder(`⚠️ Não consegui gerar os prints: ${erro}
O rascunho está montado mesmo assim — os links de prévia acima funcionam. Mande *prints* pra tentar de novo.`)
}

function resumoRascunho(s: Sessao): string {
  const r = s.rascunho!
  const moeda = s.conta!.moeda
  const cbo = s.estrutura !== 'ABO'
  const linhas: string[] = [
    '📋 *Rascunho montado na Meta — tudo PAUSADO*',
    '',
    `*Conta:* ${s.conta!.nome}${moeda !== 'BRL' ? ` (${moeda})` : ''}`,
    `*Molde copiado de:* ${r.molde}`,
    `_(pixel + evento de compra, público, página e Instagram)_`,
    '',
    `*Estrutura:* ${cbo ? 'CBO' : 'ABO'} · ${descreverAgrupamento(s.agrupamento ?? 'isolado')}`,
    `*Orçamento:* ${moedaFmt(s.orcamento!, moeda)}/dia ${cbo ? 'por campanha' : 'por conjunto'}`
      + (cbo && s.minimo ? ` · gasto mínimo ${moedaFmt(s.minimo, moeda)}/dia por conjunto` : ''),
    `*Público:* ${s.generos === 'homens' ? 'homens' : s.generos === 'todos' ? 'todos os gêneros' : s.generos === 'mulheres' ? 'mulheres' : 'igual ao molde'}`
      + `${s.idadeMin || s.idadeMax ? ` · ${s.idadeMin ?? 18}-${s.idadeMax ?? 65} anos` : ''}`,
    '',
    `*CTA:* ${ctaLabel(s.cta || 'LEARN_MORE')}`,
    `*Título:* ${s.titulo || '—'}`,
    `*Texto:* ${s.texto ? (s.texto.length > 160 ? s.texto.slice(0, 160) + '…' : s.texto) : '—'}`,
    `*Melhorias automáticas da Meta:* todas desligadas ✅`,
    '',
    '*Campanhas:*',
    ...r.campanhas.map((c) => `• ${c.nome}`),
    '',
    '*Anúncios:*',
  ]
  for (const a of r.anuncios) {
    linhas.push(`• *${a.nome}*`)
    linhas.push(`  🔗 ${a.link}`)
    if (a.preview) linhas.push(`  👀 Prévia: ${a.preview}`)
  }
  const ids = r.campanhas.map((c) => c.id).join(',')
  linhas.push('', `🛠️ Gerenciador: https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${s.conta!.id}&selected_campaign_ids=${ids}`)
  linhas.push('', 'Me manda os ajustes em texto livre (ex: _"orçamento 300"_, _"troca o CTA pra comprar agora"_, _"só mulheres 25 a 45"_).',
    'Pra trocar um vídeo, manda o arquivo com o código na legenda (ex: _ad44_). *prints* reenvia as fotos.',
    '', '✅ *publicar* — eu ativo tudo', '⏸️ *encerrar* — deixo pausado pra você publicar no gerenciador', '🗑️ *descartar* — apago o rascunho')
  return linhas.join('\n')
}

async function publicar(s: Sessao) {
  const tk = await token()
  const r = s.rascunho!
  try {
    for (const a of r.anuncios) await mPost(a.id, { status: 'ACTIVE' }, tk)
    for (const c of r.conjuntos) await mPost(c.id, { status: 'ACTIVE' }, tk)
    for (const c of r.campanhas) await mPost(c.id, { status: 'ACTIVE' }, tk)
    await salvarSessao(null)
    await responder(`🚀 *Publicado!* ${r.campanhas.length} campanha(s), ${r.conjuntos.length} conjunto(s) e ${r.anuncios.length} anúncio(s) ativos. Agora é a revisão da Meta.`)
  } catch (e) {
    const s2 = await lerSessao()
    if (s2) { s2.etapa = 'revisao'; await salvarSessao(s2) }
    await responder(`❌ Falhou ao publicar: ${e instanceof Error ? e.message : e}\nPode ter ficado parte ativa — confira no gerenciador. Mande *publicar* de novo pra tentar.`)
  }
}

// ——— ajustes em texto livre (IA) ——————————————————————————————————————————

const SISTEMA_AJUSTE = `Você interpreta pedidos de ajuste num rascunho de campanha da Meta Ads, vindos por WhatsApp em português.
Responda SÓ um JSON: {"acao": "...", "mudancas": {...}, "resposta": "..."}
acao:
- "ajustar": o pedido muda campos do rascunho. Ponha em "mudancas" só os campos alterados.
- "publicar": a pessoa quer ativar/publicar agora.
- "encerrar": a pessoa vai publicar ela mesma / quer deixar pausado e sair.
- "descartar": quer apagar o rascunho.
- "responder": é pergunta ou algo que não dá pra fazer; explique em "resposta" (curto).
Campos possíveis em "mudancas":
- texto (string; texto principal/legenda), titulo (string), cta (um de: ${CTAS.map((c) => `${c.tipo}=${c.label}`).join(', ')})
- url (string, link da página SEM o sck), hpid (string)
- estrutura ("CBO" | "ABO"), agrupamento ("isolado" = cada criativo no seu conjunto | "por_campanha" = uma campanha por criativo | "junto" = todos no mesmo conjunto)
- orcamento (número, valor diário na moeda da conta), minimo (número ou null; gasto mínimo diário por conjunto, só CBO)
- idadeMin (número), idadeMax (número), generos ("mulheres" | "homens" | "todos")
Não invente valores que a pessoa não disse. Nome de campanha/anúncio NÃO pode ser alterado (é o que rastreia a venda) — se pedirem, use "responder" e explique.
Em "resposta", diga em 1 frase o que vai mudar.`

async function interpretarAjuste(s: Sessao, pedido: string) {
  const atual = {
    conta: s.conta?.nome, fase: s.fase, url: s.url, hpid: s.hpid, texto: s.texto, titulo: s.titulo, cta: s.cta,
    estrutura: s.estrutura, agrupamento: s.agrupamento, orcamento: s.orcamento, minimo: s.minimo,
    idadeMin: s.idadeMin, idadeMax: s.idadeMax, generos: s.generos, anuncios: s.ads?.map((a) => a.codigo),
  }
  const r = await chamarLLM({ system: SISTEMA_AJUSTE, prompt: `Rascunho atual:\n${JSON.stringify(atual)}\n\nPedido:\n${pedido}`, json: true, maxTokens: 2000, temperatura: 0 })
  if (!r.ok) throw new Error(r.erro || 'IA indisponível')
  const j = extrairJSON<{ acao: string; mudancas?: Record<string, any>; resposta?: string }>(r.texto)
  if (!j?.acao) throw new Error('não entendi o ajuste')
  return j
}

function aplicarMudancas(s: Sessao, m: Record<string, any>): string[] {
  const feitas: string[] = []
  const num = (v: any) => (typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,]/g, '').replace(',', '.')))
  if (typeof m.texto === 'string') { s.texto = m.texto; feitas.push('texto') }
  if (typeof m.titulo === 'string') { s.titulo = m.titulo; feitas.push('título') }
  if (m.cta && CTAS.some((c) => c.tipo === m.cta)) { s.cta = m.cta; feitas.push(`CTA ${ctaLabel(m.cta)}`) }
  if (typeof m.url === 'string' && /^https?:\/\//i.test(m.url)) { definirUrl(s, m.url); feitas.push('URL') }
  if (typeof m.hpid === 'string') { s.hpid = limparHpid(m.hpid) || undefined; feitas.push('hpid') }
  if (m.estrutura === 'CBO' || m.estrutura === 'ABO') { s.estrutura = m.estrutura; feitas.push(m.estrutura) }
  if (['isolado', 'por_campanha', 'junto'].includes(m.agrupamento)) { s.agrupamento = m.agrupamento; feitas.push(descreverAgrupamento(m.agrupamento)) }
  if (m.orcamento != null && num(m.orcamento) > 0) { s.orcamento = num(m.orcamento); feitas.push('orçamento') }
  if ('minimo' in m) { s.minimo = m.minimo == null || num(m.minimo) <= 0 ? null : num(m.minimo); feitas.push('gasto mínimo') }
  if (m.idadeMin && num(m.idadeMin) >= 18) { s.idadeMin = num(m.idadeMin); feitas.push('idade') }
  if (m.idadeMax && num(m.idadeMax) <= 65) { s.idadeMax = num(m.idadeMax); if (!feitas.includes('idade')) feitas.push('idade') }
  if (['mulheres', 'homens', 'todos'].includes(m.generos)) { s.generos = m.generos; feitas.push('gênero') }
  return feitas
}

function definirUrl(s: Sessao, bruto: string) {
  const u = bruto.trim()
  const h = u.match(/[?&]hpid=([^&\s]+)/i)?.[1]
  if (h) s.hpid = h
  s.url = u.replace(/\?.*$/, '')
}

// ——— perguntas ——————————————————————————————————————————————————————————————

function perguntaNomes(s: Sessao): string {
  const ex = s.fase === 'FASE01' ? 'ad44-como-ganhei-presentes\nad26-minha-rotina-de-unboxing' : 'ad44-como-ganhei-presentes'
  return `📝 Agora os *nomes dos anúncios* — um por linha, começando pelo código:\n\n${ex}\n\n_O sufixo da fase${s.marcador ? ' e o marcador da conta' : ''} entram sozinhos._`
}

function perguntaMidia(s: Sessao): string | null {
  const prox = s.ads?.find((a) => !a.midia || a.midia.status === 'erro')
  if (!prox) return null
  return `🎬 Manda o criativo do *${prox.codigo}* (vídeo ou imagem).\n_Dica: envie como *documento/arquivo* pra o WhatsApp não comprimir. Também aceito link direto do arquivo._`
}

const PERGUNTA_TEXTO = '✍️ Qual o *texto principal* (legenda) do anúncio? Vale pra todos.\nResponda *sem texto* se for deixar vazio.'
const PERGUNTA_TITULO = '🔤 Qual o *título*? (as campanhas atuais usam _"Aperte em saiba mais"_ — responda *padrão* pra usar esse)'
const perguntaCta = () => `👉 Qual o *CTA* (botão)?\n${CTAS.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}`

function perguntaEstrutura(s: Sessao): string {
  const ag = s.agrupamento ?? 'isolado'
  return `🏗️ *CBO ou ABO?*\n\nVou montar assim: *${descreverAgrupamento(ag)}*`
    + (s.fase === 'FASE01' ? ' (padrão da fase 01 — criativo isolado)' : ' (padrão das fases 02/03)')
    + '.\nSe quiser outro jeito, me diga junto (ex: _"CBO, todos no mesmo conjunto"_).'
}

function perguntaOrcamento(s: Sessao): string {
  const cbo = s.estrutura !== 'ABO'
  const moeda = s.conta?.moeda || 'BRL'
  const qtd = plano(s).length
  const onde = cbo ? `por campanha${qtd > 1 ? ` (${qtd} campanhas)` : ''}` : 'por conjunto'
  return `💰 Qual o *orçamento diário ${onde}*${moeda !== 'BRL' ? ` em ${moeda}` : ' (R$)'}? Ex: _400_`
}

const PERGUNTA_MINIMO = '🧱 *Gasto mínimo diário por conjunto?* (garante que cada criativo receba verba na CBO)\nEx: _100_ — ou *sem*.'

// ——— conversa ————————————————————————————————————————————————————————————————

function novoGatilho(t: string) { return GATILHO.test(t) }

function lerNumero(t: string): number | null {
  const m = t.replace(/r\$|us\$|\s/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').match(/\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

/**
 * Trata a mensagem se ela for do fluxo "subir anúncio". Devolve true quando
 * consumiu a mensagem (a rota não deve fazer mais nada com ela).
 */
export async function tratarSubirAnuncio(data: any): Promise<boolean> {
  const remoteJid: string = data?.key?.remoteJid ?? ''
  if (!mesmoNumero(DONO, remoteJid)) return false
  const cru = textoCru(data?.message)
  const t = cru.toLowerCase()
  if (t.startsWith('/')) return false        // comandos do bot seguem o caminho normal
  const midia = midiaDaMensagem(data?.message)
  const msgId: string = data?.key?.id ?? ''

  let s = await lerSessao()
  if (!s) {
    if (!cru || !novoGatilho(cru)) return false
    const tk = await token()
    const contas = await listarContas(tk)
    s = { etapa: 'conta', atualizado: '', ids: msgId ? [msgId] : [], contasOpcoes: contas }
    await salvarSessao(s)
    await responder(`🚀 Bora montar! Nada vai ao ar sem você autorizar.\n_(cancelar a qualquer momento: *cancelar*)_\n\n🏦 *Qual a conta de anúncio?* Responde o número ou o nome:\n${contas.map((c, i) => `${i + 1}. ${c.nome}${c.moeda !== 'BRL' ? ` (${c.moeda})` : ''}`).join('\n')}`)
    return true
  }

  if (msgId && s.ids.includes(msgId)) return true
  s.ids = [...s.ids, msgId].filter(Boolean).slice(-40)

  if (['cancelar', 'cancela', 'sair', 'parar'].includes(t)) {
    const tk = await token().catch(() => '')
    if (s.rascunho && tk) await apagarRascunho(s.rascunho, tk)
    await salvarSessao(null)
    await responder(`🛑 Cancelado.${s.rascunho ? ' Apaguei o rascunho da Meta.' : ''}`)
    return true
  }
  switch (s.etapa) {
    case 'conta': {
      const ops = s.contasOpcoes ?? []
      const n = /^\d+$/.test(t) ? Number(t) : NaN
      let c = Number.isFinite(n) ? ops[n - 1] : undefined
      if (!c && t) {
        const alvo = t.replace(/\s/g, '')
        const achados = ops.filter((o) => o.nome.toLowerCase().replace(/\s/g, '').includes(alvo) || o.id === alvo.replace('act_', ''))
        if (achados.length === 1) c = achados[0]
        else if (achados.length > 1) { await responder(`Achei mais de uma:\n${achados.map((a) => `${ops.indexOf(a) + 1}. ${a.nome}`).join('\n')}\nResponde o número.`); break }
      }
      if (!c) { await responder('Não achei essa conta. Responde com o *número* da lista.'); break }
      s.conta = c
      s.contasOpcoes = undefined
      if (c.id === CONTA_PRINCIPAL) {
        s.etapa = 'fase'
        await responder(`✅ ${c.nome}\n\n📈 *Qual a fase?* 01, 02 ou 03`)
      } else {
        s.etapa = 'marcador'
        await responder(`✅ ${c.nome}\n\n🏷️ Como não é a conta principal, posso pôr um *marcador da conta* nos nomes e no sck (separa o ROAS dessa conta). Sugestão: *${slug(c.nome)}*\n\nResponde *ok*, outro marcador (ex: _bmus_) ou *nenhum*.`)
      }
      break
    }
    case 'marcador': {
      if (!t) { await responder('Responde *ok*, um marcador ou *nenhum*.'); break }
      s.marcador = t === 'ok' ? slug(s.conta!.nome) : ['nenhum', 'nao', 'não', 'sem'].includes(t) ? undefined : slug(t)
      s.etapa = 'fase'
      await responder(`${s.marcador ? `✅ Marcador *${s.marcador}*` : '✅ Sem marcador'}\n\n📈 *Qual a fase?* 01, 02 ou 03`)
      break
    }
    case 'fase': {
      const d = t.match(/0?([123])/)?.[1]
      if (!d) { await responder('Responde *01*, *02* ou *03*.'); break }
      s.fase = `FASE0${d}` as Fase
      s.agrupamento = s.fase === 'FASE01' ? 'isolado' : 'por_campanha'
      s.etapa = 'url'
      const cfg = FASE_CFG[s.fase]
      await responder(`✅ ${s.fase}${cfg.label ? ` (${cfg.label})` : ''}\n\n🌐 Qual o *link da página* (URL)? Se tiver hpid, pode colar junto que eu separo.\n_O sck de rastreio eu monto sozinho._`)
      break
    }
    case 'url': {
      const u = cru.match(/https?:\/\/\S+/i)?.[0]
      if (!u) { await responder('Manda o link começando com https://'); break }
      definirUrl(s, u)
      s.etapa = 'nomes'
      await responder(`✅ ${s.url}${s.hpid ? `\nhpid: ${s.hpid}` : ''}\n\n${perguntaNomes(s)}`)
      break
    }
    case 'nomes': {
      const linhas = cru.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean)
      const ads: AdRasc[] = []
      const ruins: string[] = []
      for (const l of linhas) {
        const p = parseBase(l)
        if (p) { if (!ads.some((a) => a.codigo === p.codigo)) ads.push(p) } else ruins.push(l)
      }
      if (!ads.length || ruins.length) {
        await responder(`Cada nome precisa começar com o código (ex: _ad44-como-ganhei-presentes_).${ruins.length ? `\nNão entendi: ${ruins.join(', ')}` : ''}`)
        break
      }
      s.ads = ads
      s.etapa = 'midia'
      const prev = plano(s)
      const lista = prev.flatMap((c) => [`*${c.nome}*`, ...c.conjuntos.flatMap((cj) => cj.ads.map((a) => `  ${cj.nome} › ${a.nome}\n  🔗 ${a.link}`))])
      await responder(`✅ Nomenclatura:\n\n${lista.join('\n')}\n\n${perguntaMidia(s)}`)
      break
    }
    case 'midia':
    case 'revisao': {
      if (s.etapa === 'revisao' && !midia && !/^https?:\/\//i.test(cru)) return await tratarRevisao(s, cru, t)
      const url = !midia ? cru.match(/https?:\/\/\S+/i)?.[0] : undefined
      if (!midia && !url) { await responder(perguntaMidia(s) ?? 'Já recebi todos os criativos.'); break }
      const legenda = (midia?.legenda || cru).toLowerCase()
      const porLegenda = legenda.match(/ad\d+/)?.[0]
      let ad = porLegenda ? s.ads!.find((a) => a.codigo === porLegenda) : undefined
      if (!ad && s.etapa === 'revisao') { await responder('Pra trocar um criativo, manda o arquivo com o código na legenda (ex: _ad44_).'); break }
      if (!ad) ad = s.ads!.find((a) => !a.midia || a.midia.status === 'erro')
      if (!ad) { await responder('Já tenho os criativos de todos. Pra trocar um, manda com o código na legenda.'); break }
      const tipo: 'video' | 'imagem' = midia?.tipo ?? (/\.(jpe?g|png|webp)(\?|$)/i.test(url!) ? 'imagem' : 'video')
      ad.midia = { tipo, status: 'subindo' }
      const codigo = ad.codigo
      const conta = s.conta!.id
      const nomeArq = ad.slug ? `${ad.codigo}-${ad.slug}` : ad.codigo
      const emRevisao = s.etapa === 'revisao'
      const proxima = s.ads!.find((a) => !a.midia || a.midia.status === 'erro')
      if (!emRevisao && !proxima) s.etapa = 'texto'
      await salvarSessao(s)
      await responder(`📤 Recebi o ${tipo} do *${codigo}*, subindo pra Meta...` + (emRevisao ? '\nQuando terminar eu refaço o rascunho.' : proxima ? `\n\n${perguntaMidia(s)}` : `\n\n${PERGUNTA_TEXTO}`))
      after(async () => {
        try {
          const tk = await token()
          let m: Midia
          if (tipo === 'video') {
            const id = url ? await subirVideo(conta, nomeArq, { url }, tk) : await subirVideo(conta, nomeArq, { bytes: await baixarDoWhatsapp(data), mime: midia!.mime }, tk)
            m = { tipo, status: 'ok', video_id: id }
          } else {
            const bytes = url ? Buffer.from(await (await fetchTimeout(url, {}, 60000)).arrayBuffer()) : await baixarDoWhatsapp(data)
            m = { tipo, status: 'ok', image_hash: await subirImagem(conta, bytes, tk) }
          }
          await atualizarMidia(codigo, m)
          if (emRevisao) await refazer()
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e)
          await atualizarMidia(codigo, { tipo, status: 'erro', erro })
          await responder(`❌ Falhou o upload do *${codigo}*: ${erro}\nManda de novo (com _${codigo}_ na legenda).`)
        }
      })
      return true
    }
    case 'texto': {
      if (!cru) { await responder(PERGUNTA_TEXTO); break }
      s.texto = ['sem texto', 'sem', 'vazio', 'nenhum'].includes(t) ? '' : cru
      s.etapa = 'titulo'
      await responder(PERGUNTA_TITULO)
      break
    }
    case 'titulo': {
      if (!cru) { await responder(PERGUNTA_TITULO); break }
      s.titulo = ['padrão', 'padrao', 'ok'].includes(t) ? 'Aperte em saiba mais' : ['sem', 'sem título', 'sem titulo', 'vazio'].includes(t) ? '' : cru
      s.etapa = 'cta'
      await responder(perguntaCta())
      break
    }
    case 'cta': {
      const n = /^\d+$/.test(t) ? Number(t) : NaN
      const c = Number.isFinite(n) ? CTAS[n - 1] : CTAS.find((x) => x.label.toLowerCase() === t || x.tipo.toLowerCase() === t)
      if (!c) { await responder(`Não achei esse CTA. ${perguntaCta()}`); break }
      s.cta = c.tipo
      s.etapa = 'estrutura'
      await responder(`✅ ${c.label}\n\n${perguntaEstrutura(s)}`)
      break
    }
    case 'estrutura': {
      const est = /\babo\b/.test(t) ? 'ABO' : /\bcbo\b/.test(t) ? 'CBO' : null
      if (!est) { await responder(perguntaEstrutura(s)); break }
      s.estrutura = est
      if (/mesmo conjunto|todos juntos|junto/.test(t)) s.agrupamento = 'junto'
      else if (/uma campanha (por|pra cada)|campanha separada|separad/.test(t)) s.agrupamento = 'por_campanha'
      else if (/isolad|conjunto pr[oó]prio|cada (um|criativo) (no|em) (seu|um)/.test(t)) s.agrupamento = 'isolado'
      s.etapa = 'orcamento'
      await responder(`✅ ${est} · ${descreverAgrupamento(s.agrupamento ?? 'isolado')}\n\n${perguntaOrcamento(s)}`)
      break
    }
    case 'orcamento': {
      const v = lerNumero(t)
      if (!v || v <= 0) { await responder(perguntaOrcamento(s)); break }
      s.orcamento = v
      const precisaMinimo = s.estrutura !== 'ABO' && (s.agrupamento ?? 'isolado') === 'isolado' && (s.ads?.length ?? 0) > 1
      if (precisaMinimo) {
        s.etapa = 'minimo'
        await responder(PERGUNTA_MINIMO)
        break
      }
      s.minimo = null
      return await iniciarMontagem(s)
    }
    case 'minimo': {
      const v = /^(sem|nao|não|nenhum|0)$/.test(t) ? 0 : lerNumero(t)
      if (v == null) { await responder(PERGUNTA_MINIMO); break }
      s.minimo = v > 0 ? v : null
      return await iniciarMontagem(s)
    }
    case 'montando':
    case 'publicando':
      await responder('⏳ Ainda estou trabalhando nisso, já te mando.')
      break
    case 'confirmar': {
      if (['sim', 's', 'confirmo', 'pode', 'pode publicar'].includes(t)) {
        s.etapa = 'publicando'
        await salvarSessao(s)
        await responder('🚀 Publicando...')
        const sess = s
        after(() => publicar(sess))
        return true
      }
      s.etapa = 'revisao'
      await responder('Ok, não publiquei. Continua tudo pausado — manda ajustes, *publicar*, *encerrar* ou *descartar*.')
      break
    }
  }
  await salvarSessao(s)
  return true
}

async function iniciarMontagem(s: Sessao): Promise<boolean> {
  s.etapa = 'montando'
  await salvarSessao(s)
  await responder('🧩 Montando na Meta (tudo *pausado*)... isso leva uns minutos se tiver vídeo processando.')
  after(() => montar())
  return true
}

// Apaga o rascunho atual e monta de novo com a sessão como está.
async function refazer() {
  const s = await lerSessao()
  if (!s) return
  const tk = await token()
  await apagarRascunho(s.rascunho, tk)
  s.rascunho = undefined
  s.etapa = 'montando'
  await salvarSessao(s)
  await montar()
}

async function tratarRevisao(s: Sessao, cru: string, t: string): Promise<boolean> {
  if (!s.rascunho && ['refazer', 'tentar de novo', 'montar'].includes(t)) {
    return iniciarMontagem(s)
  }
  if (['publicar', 'publica', 'pode publicar', 'ativar', 'subir'].includes(t)) {
    if (!s.rascunho) { await responder('Não tem rascunho montado ainda. Mande *refazer*.'); await salvarSessao(s); return true }
    s.etapa = 'confirmar'
    await salvarSessao(s)
    await responder(`⚠️ Vou *ATIVAR* ${s.rascunho.campanhas.length} campanha(s) e ${s.rascunho.anuncios.length} anúncio(s) em *${s.conta!.nome}* com ${moedaFmt(s.orcamento!, s.conta!.moeda)}/dia ${s.estrutura === 'ABO' ? 'por conjunto' : 'por campanha'}.\n\nConfirma? Responde *SIM*.`)
    return true
  }
  if (['encerrar', 'encerra', 'eu publico', 'deixa pausado', 'pronto', 'fim'].includes(t)) {
    await salvarSessao(null)
    await responder('⏸️ Fechado. O rascunho ficou *pausado* no gerenciador — é só ativar quando quiser.')
    return true
  }
  if (['descartar', 'apagar', 'apaga'].includes(t)) {
    const tk = await token()
    await apagarRascunho(s.rascunho, tk)
    await salvarSessao(null)
    await responder('🗑️ Rascunho apagado da Meta.')
    return true
  }
  if (['prints', 'print', 'manda os prints', 'foto', 'fotos'].includes(t)) {
    if (!s.rascunho) { await responder('Não tem rascunho montado ainda. Mande *refazer*.'); await salvarSessao(s); return true }
    await salvarSessao(s)
    const sess = s
    after(async () => mandarPrints(sess, await token()))
    return true
  }
  if (['refazer', 'montar de novo'].includes(t)) {
    s.etapa = 'montando'
    await salvarSessao(s)
    await responder('🔁 Refazendo o rascunho...')
    after(() => refazer())
    return true
  }

  let j
  try { j = await interpretarAjuste(s, cru) }
  catch (e) { await responder(`🤔 ${e instanceof Error ? e.message : e}. Tenta de outro jeito, ou *publicar* / *encerrar* / *descartar*.`); await salvarSessao(s); return true }

  if (j.acao === 'publicar') return tratarRevisao(s, cru, 'publicar')
  if (j.acao === 'encerrar') return tratarRevisao(s, cru, 'encerrar')
  if (j.acao === 'descartar') return tratarRevisao(s, cru, 'descartar')
  if (j.acao !== 'ajustar' || !j.mudancas) {
    await responder(j.resposta || 'Não entendi o ajuste. Me diga o que mudar.')
    await salvarSessao(s)
    return true
  }
  const feitas = aplicarMudancas(s, j.mudancas)
  if (!feitas.length) {
    await responder(j.resposta || 'Não achei nada pra mudar nesse pedido.')
    await salvarSessao(s)
    return true
  }
  s.etapa = 'montando'
  await salvarSessao(s)
  await responder(`🔁 Ajustando: ${feitas.join(', ')}. Refazendo o rascunho (continua pausado)...`)
  after(() => refazer())
  return true
}
