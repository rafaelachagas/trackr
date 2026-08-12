import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extrairCriativo, calcularRoas } from '@/lib/utils'
import { subDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

// Rota pesada (várias chamadas à Meta). Sem maxDuration explícito a Vercel corta
// no limite padrão e devolve uma página de ERRO em texto — o front quebrava com
// "Unexpected token 'A'... is not valid JSON". As otimizações abaixo (uma única
// listagem de anúncios reaproveitada + thumbnails só dos criativos que passam no
// filtro + insights das contas em paralelo) mantêm a rota bem abaixo do limite.
export const maxDuration = 60

const TIMEZONE = 'America/Sao_Paulo'
const META_API_VERSION = 'v25.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export interface AdMetric {
  criativo: string
  fase: string | null
  link_anuncio: string | null
  thumbnail_url: string | null
  campaign_name: string
  ad_name: string
  spend: number
  impressions: number
  clicks: number
  cpm: number | null
  ctr: number | null
  cpc: number | null
  frequency: number | null
  hook_rate: number | null
  receita: number
  roas: number | null
  roas_1d: number | null
  roas_3d: number | null
  roas_7d: number | null
}

// ————————————————————————————————————————————————————————————————
// CHAVE de agrupamento — IDÊNTICA ao /api/performance-v2 (overview). Junta os
// dois lados (gasto Meta × venda real) por código do anúncio + fase + marcadores
// (bmsub/bmus/v2), estável mesmo com typo no sck. Assim a lista e os números da
// Análise batem com a tabela "Performance por Criativo V2".
// ————————————————————————————————————————————————————————————————
function faseToken(t: string | null): string | null {
  const m = (t || '').toLowerCase().match(/fase\s*0?([123])/)
  return m ? `FASE0${m[1]}` : null
}
function flagsToken(t: string | null): string {
  const s = (t || '').toLowerCase()
  const bmsub = s.includes('bmsub') ? 'S' : '-'
  const bmus = s.includes('bmus') ? 'U' : '-'
  const v2 = /(^|[^a-z0-9])v2([^0-9]|$)/.test(s) ? '2' : '-'
  return `${bmsub}${bmus}${v2}`
}
function chaveDe(codigo: string, faseTok: string | null, flags: string) {
  return `${codigo}|${faseTok ?? '?'}|${flags}`
}

type AdAtivo = { name: string; campaign: string | null; creativeId: string | null }

// Anúncios ATIVOS (effective_status=ACTIVE) de uma conta, JÁ com o creative id —
// serve pro filtro de ativos E pra buscar o thumbnail depois (sem uma 2ª listagem).
async function fetchAdsAtivos(accountId: string, accessToken: string): Promise<AdAtivo[]> {
  const acct = accountId.startsWith('act_') ? accountId : `act_${accountId}`
  let url: string | null = `${META_API_BASE}/${acct}/ads?${new URLSearchParams({
    fields: 'name,effective_status,campaign{name},creative{id}',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: '500',
    access_token: accessToken,
  })}`
  const out: AdAtivo[] = []
  let paginas = 0
  while (url && paginas < 20) {
    const res: Response = await fetch(url)
    const json = await res.json()
    if (json.error) throw new Error(`Meta API: ${json.error.message}`)
    for (const ad of json.data ?? []) {
      if (ad.effective_status && ad.effective_status !== 'ACTIVE') continue
      out.push({ name: ad.name, campaign: ad.campaign?.name ?? null, creativeId: ad.creative?.id ?? null })
    }
    url = json.paging?.next ?? null
    paginas++
  }
  return out
}

// Chaves código|fase|flags ATIVAS agora + mapa ad_name -> creative id (p/ thumb).
async function buscarAtivos(accessToken: string, adAccountIds: string[]): Promise<{ keys: Set<string>; creativeIdPorAdName: Map<string, string> }> {
  const listas = await Promise.all(adAccountIds.map((id) => fetchAdsAtivos(id, accessToken)))
  const keys = new Set<string>()
  const creativeIdPorAdName = new Map<string, string>()
  for (const ads of listas) for (const ad of ads) {
    const cod = extrairCriativo(ad.name)
    if (cod) keys.add(chaveDe(cod, faseToken(ad.campaign), flagsToken(ad.name)))
    if (ad.creativeId && !creativeIdPorAdName.has(ad.name)) creativeIdPorAdName.set(ad.name, ad.creativeId)
  }
  return { keys, creativeIdPorAdName }
}

// Paginação: PostgREST corta em 1000 linhas — 7d de vendas já passa disso.
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const todas: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    todas.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return todas
}

export async function GET(request: NextRequest) {
  try {
    const { data: configs, error: configError } = await supabaseAdmin
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['meta_access_token', 'meta_ad_account_ids', 'meta_ad_account_id'])

    if (configError) {
      return NextResponse.json({ error: 'Erro ao buscar configurações', detail: configError.message }, { status: 500 })
    }

    const configMap = Object.fromEntries(configs?.map((c) => [c.chave, c.valor]) ?? [])
    const accessToken = configMap['meta_access_token']

    let adAccountIds: string[] = []
    if (configMap['meta_ad_account_ids']) {
      try { adAccountIds = JSON.parse(configMap['meta_ad_account_ids']) } catch {}
    }
    if (adAccountIds.length === 0 && configMap['meta_ad_account_id']) {
      adAccountIds = [configMap['meta_ad_account_id']]
    }

    if (!accessToken || adAccountIds.length === 0) {
      return NextResponse.json({ error: 'Meta Ads não configurado. Configure o access_token e ad_account_id.' }, { status: 400 })
    }

    const sp = request.nextUrl.searchParams
    const agora = toZonedTime(new Date(), TIMEZONE)
    const hoje = format(agora, 'yyyy-MM-dd')
    const ontem = format(subDays(agora, 1), 'yyyy-MM-dd')

    const dataFim = sp.get('dataFim') ?? hoje
    const dataInicio = sp.get('dataInicio') ?? format(subDays(agora, 6), 'yyyy-MM-dd')

    // Janelas fixas sempre encerram em ontem (dia completo) — igual ao framework/V2
    const d1 = ontem
    const d3 = format(subDays(agora, 3), 'yyyy-MM-dd')
    const d7 = format(subDays(agora, 7), 'yyyy-MM-dd')

    // Faixa ampla p/ o banco: cobre o período selecionado + o rolling 7d.
    const desde = dataInicio < d7 ? dataInicio : d7
    const ate = dataFim > ontem ? dataFim : ontem

    // Criativos registrados (link do anúncio + thumbnail opcional já salvo)
    const { data: criativosDB } = await supabaseAdmin
      .from('criativos')
      .select('nome, fase, link_anuncio, thumbnail_url')

    const linkPorNome = new Map<string, string | null>()
    const thumbDB = new Map<string, string>()
    for (const c of criativosDB ?? []) {
      linkPorNome.set(c.nome, (c as any).link_anuncio ?? null)
      if ((c as any).thumbnail_url) thumbDB.set(c.nome, (c as any).thumbnail_url)
    }

    type GastoRow = { criativo: string | null; campaign_name: string | null; ad_name: string | null; valor_gasto: number; data: string }
    type VendaRow = { criativo: string | null; sck: string | null; valor: number; valor_liquido: number | null; data: string }

    // Ativos na Meta (chaves + creative ids). Se falhar/não configurado → null:
    // NÃO filtra (mostra tudo e sinaliza) e cai no thumbnail do banco.
    const ativosPromise: Promise<{ keys: Set<string>; creativeIdPorAdName: Map<string, string> } | null> =
      buscarAtivos(accessToken, adAccountIds).catch((err) => { console.error('[ad-metrics] ativos', err); return null })

    // GASTO e VENDA vêm do BANCO (mesma fonte do overview V2) — reconciliam com ele.
    // gastos.data já é DATE em SP; vendas.data é timestamptz (UTC), bucketado por SP.
    // INSIGHTS (impressões/cliques/frequência) das contas em paralelo, cada uma
    // paginando internamente.
    const [gastos, vendas, ativos, insightsPorConta] = await Promise.all([
      fetchAll<GastoRow>((from, to) =>
        supabaseAdmin
          .from('gastos')
          .select('criativo, campaign_name, ad_name, valor_gasto, data')
          .not('ad_id', 'is', null)
          .gte('data', desde)
          .lte('data', ate)
          .range(from, to)
      ),
      fetchAll<VendaRow>((from, to) =>
        supabaseAdmin
          .from('vendas')
          .select('criativo, sck, valor, valor_liquido, data')
          .eq('status', 'approved')
          .not('transaction_id', 'like', 'manual_%')
          .not('criativo', 'is', null)
          .gte('data', `${desde}T00:00:00`)
          .lte('data', `${ate}T23:59:59`)
          .range(from, to)
      ),
      ativosPromise,
      Promise.all(adAccountIds.map((id) => fetchAllInsights(accessToken, id, dataInicio, dataFim))),
    ])

    const activeKeys = ativos?.keys ?? null
    const creativeIdPorAdName = ativos?.creativeIdPorAdName ?? new Map<string, string>()
    const filtradoAtivos = activeKeys != null

    type Entrada = {
      codigo: string
      fase: string | null
      campaign_name: string | null
      adNames: Map<string, number>   // ad_name -> gasto (p/ nome representativo)
      sckName: string | null
      gastos: { valor: number; data: string }[]
      vendas: { liquido: number; data: string }[]
      impressions: number
      clicks: number
      freqTotal: number
      freqCount: number
    }
    const mapa = new Map<string, Entrada>()
    function getEntrada(key: string, codigo: string, faseTok: string | null): Entrada {
      let e = mapa.get(key)
      if (!e) {
        e = { codigo, fase: faseTok, campaign_name: null, adNames: new Map(), sckName: null, gastos: [], vendas: [], impressions: 0, clicks: 0, freqTotal: 0, freqCount: 0 }
        mapa.set(key, e)
      }
      if (!e.fase && faseTok) e.fase = faseTok
      return e
    }

    for (const g of gastos) {
      if (!g.criativo) continue
      const faseTok = faseToken(g.campaign_name)
      const key = chaveDe(g.criativo, faseTok, flagsToken(g.ad_name))
      const e = getEntrada(key, g.criativo, faseTok)
      const val = Number(g.valor_gasto) || 0
      e.gastos.push({ valor: val, data: g.data })
      if (g.ad_name) e.adNames.set(g.ad_name, (e.adNames.get(g.ad_name) ?? 0) + val)
      if (!e.campaign_name && g.campaign_name) e.campaign_name = g.campaign_name
    }

    for (const v of vendas) {
      if (!v.criativo) continue
      const parte0 = (v.sck || '').split('|')[0]
      const faseTok = faseToken(parte0)
      const key = chaveDe(v.criativo, faseTok, flagsToken(v.sck))
      const e = getEntrada(key, v.criativo, faseTok)
      e.vendas.push({ liquido: Number(v.valor_liquido ?? v.valor) || 0, data: v.data })
      if (!e.sckName) e.sckName = (v.sck || '').split('|')[2] || null
    }

    // Qualidade (impressões/cliques/frequência) dos insights, na mesma chave. Só
    // anexa a criativos que já têm gasto no banco — sem linha fantasma.
    for (const rows of insightsPorConta) {
      for (const row of rows) {
        const cod = extrairCriativo(row.ad_name)
        if (!cod) continue
        const key = chaveDe(cod, faseToken(row.campaign_name), flagsToken(row.ad_name))
        const e = mapa.get(key)
        if (!e) continue
        e.impressions += parseInt(row.impressions) || 0
        e.clicks += parseInt(row.clicks) || 0
        const freq = parseFloat(row.frequency) || 0
        if (freq > 0) { e.freqTotal += freq; e.freqCount++ }
      }
    }

    // DATA da venda no fuso de São Paulo (não a data UTC crua do timestamptz).
    const diaSP = (iso: string) => format(toZonedTime(new Date(iso), TIMEZONE), 'yyyy-MM-dd')

    // 1ª passada: monta as linhas que passam no filtro (ativo + gastou ≥ R$1).
    type Linha = AdMetric & { _rep: string }
    const linhas: Linha[] = []
    for (const [chave, e] of mapa.entries()) {
      const gastoPeriodo = e.gastos.filter((g) => g.data >= dataInicio && g.data <= dataFim).reduce((a, g) => a + g.valor, 0)
      const receitaPeriodo = e.vendas.filter((v) => { const d = diaSP(v.data); return d >= dataInicio && d <= dataFim }).reduce((a, v) => a + v.liquido, 0)

      // Só criativos que rodaram (gastaram ≥ R$1) no período — descarta restos de
      // campanha pausada com centavos de gasto (ROAS lixo tipo R$0,35 → 674x).
      if (gastoPeriodo < 1) continue
      // Só ativos na Meta agora (se activeKeys==null, Meta off → não filtra).
      if (activeKeys && !activeKeys.has(chave)) continue

      // Janelas fechadas terminando ONTEM (independem do período), fonte = banco.
      const g1 = e.gastos.filter((g) => g.data === d1).reduce((a, g) => a + g.valor, 0)
      const g3 = e.gastos.filter((g) => g.data >= d3 && g.data <= ontem).reduce((a, g) => a + g.valor, 0)
      const g7 = e.gastos.filter((g) => g.data >= d7 && g.data <= ontem).reduce((a, g) => a + g.valor, 0)
      const r1 = e.vendas.filter((v) => diaSP(v.data) === d1).reduce((a, v) => a + v.liquido, 0)
      const r3 = e.vendas.filter((v) => { const d = diaSP(v.data); return d >= d3 && d <= ontem }).reduce((a, v) => a + v.liquido, 0)
      const r7 = e.vendas.filter((v) => { const d = diaSP(v.data); return d >= d7 && d <= ontem }).reduce((a, v) => a + v.liquido, 0)

      const impressions = e.impressions
      const clicks = e.clicks
      const cpm = impressions > 0 ? (gastoPeriodo / impressions) * 1000 : null
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : null
      const cpc = clicks > 0 ? gastoPeriodo / clicks : null
      const frequency = e.freqCount > 0 ? e.freqTotal / e.freqCount : null

      // ad_name representativo = o de maior gasto; senão o nome do sck; senão o código.
      let adNameRep = e.sckName ?? e.codigo
      let maxG = -1
      for (const [nome, g] of e.adNames) { if (g > maxG) { maxG = g; adNameRep = nome } }

      linhas.push({
        _rep: adNameRep,
        criativo: adNameRep,
        fase: e.fase ?? extrairFaseDoCampaign(e.campaign_name),
        link_anuncio: linkPorNome.get(adNameRep) ?? null,
        thumbnail_url: thumbDB.get(adNameRep) ?? null,
        campaign_name: e.campaign_name ?? '',
        ad_name: adNameRep,
        spend: gastoPeriodo,
        impressions,
        clicks,
        cpm,
        ctr,
        cpc,
        frequency,
        hook_rate: null,
        receita: receitaPeriodo,
        roas: gastoPeriodo > 0 && receitaPeriodo > 0 ? calcularRoas(receitaPeriodo, gastoPeriodo) : null,
        roas_1d: g1 > 0 && r1 > 0 ? calcularRoas(r1, g1) : null,
        roas_3d: g3 > 0 && r3 > 0 ? calcularRoas(r3, g3) : null,
        roas_7d: g7 > 0 && r7 > 0 ? calcularRoas(r7, g7) : null,
      })
    }

    // THUMBNAILS só dos criativos que sobraram (e que ainda não têm thumb do banco).
    // Reaproveita o creative id já obtido na listagem de ativos — nada de 2ª listagem.
    const faltamThumb = linhas.filter((l) => !l.thumbnail_url && creativeIdPorAdName.has(l._rep))
    if (faltamThumb.length > 0) {
      const items = faltamThumb.map((l) => ({ adName: l._rep, creativeId: creativeIdPorAdName.get(l._rep)! }))
      const thumbs = await fetchThumbsPorCreative(accessToken, items).catch((err) => { console.error('[thumb] error:', err); return new Map<string, string>() })
      for (const l of linhas) { if (!l.thumbnail_url) l.thumbnail_url = thumbs.get(l._rep) ?? null }
    }

    const resultado: AdMetric[] = linhas
      .map(({ _rep, ...m }) => m)
      .sort((a, b) => b.spend - a.spend)

    return NextResponse.json({
      metrics: resultado,
      periodo: { dataInicio, dataFim },
      filtradoAtivos,
      debug: { total: resultado.length, accounts: adAccountIds.length },
    })
  } catch (err) {
    console.error('[ad-metrics]', err)
    return NextResponse.json({ error: `Erro interno: ${err}` }, { status: 500 })
  }
}

function extrairFaseDoCampaign(campaignName: string | null): string | null {
  if (!campaignName) return null
  const match = campaignName.match(/\[(FASE\d+)\]/i)
  return match ? match[1].toUpperCase() : null
}

// Thumbnail (thumbnail_url/image_url) por creative id, em lotes de 50. Devolve
// mapa ad_name -> url. Só pros creatives passados (os que passaram no filtro).
async function fetchThumbsPorCreative(accessToken: string, items: { adName: string; creativeId: string }[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const BATCH_SIZE = 50
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const batchBody = new URLSearchParams({
      access_token: accessToken,
      batch: JSON.stringify(
        batch.map(({ creativeId }) => ({
          method: 'GET',
          relative_url: `${META_API_VERSION}/${creativeId}?fields=thumbnail_url,image_url&thumbnail_width=500&thumbnail_height=500`,
        }))
      ),
    })
    const batchRes = await fetch(`https://graph.facebook.com/`, { method: 'POST', body: batchBody })
    const batchJson: any[] = await batchRes.json()
    for (let j = 0; j < batchJson.length; j++) {
      const item = batchJson[j]
      if (item?.code === 200) {
        try {
          const body = JSON.parse(item.body)
          const thumbUrl = body.thumbnail_url || body.image_url || null
          if (thumbUrl) map.set(batch[j].adName, thumbUrl)
        } catch {}
      }
    }
  }
  return map
}

// Insights (nível ad) de UMA conta, no período, com paginação. Só anúncios ATIVOS.
async function fetchAllInsights(accessToken: string, accountId: string, dataInicio: string, dataFim: string): Promise<any[]> {
  const acct = accountId.startsWith('act_') ? accountId : `act_${accountId}`
  const rows: any[] = []
  let cursor: string | null = null
  let page = 0
  do {
    const r = await fetchInsights({ accessToken, accountId: acct, dataInicio, dataFim, cursor })
    if (r.error) throw new Error(r.error)
    rows.push(...(r.data ?? []))
    cursor = r.nextCursor ?? null
    page++
  } while (cursor && page < 20)
  return rows
}

async function fetchInsights({
  accessToken,
  accountId,
  dataInicio,
  dataFim,
  cursor,
}: {
  accessToken: string
  accountId: string
  dataInicio: string
  dataFim: string
  cursor: string | null
}): Promise<{ data?: any[]; nextCursor?: string; error?: string }> {
  try {
    const campos = ['ad_id', 'ad_name', 'campaign_name', 'impressions', 'clicks', 'frequency'].join(',')

    const params = new URLSearchParams({
      fields: campos,
      level: 'ad',
      time_range: JSON.stringify({ since: dataInicio, until: dataFim }),
      filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
      limit: '500',
      access_token: accessToken,
    })
    if (cursor) params.set('after', cursor)

    const res = await fetch(`${META_API_BASE}/${accountId}/insights?${params}`)
    const json = await res.json()

    if (json.error) return { error: `Meta API: ${json.error.message} (code ${json.error.code})` }
    return {
      data: json.data ?? [],
      nextCursor: json.paging?.next ? json.paging?.cursors?.after : undefined,
    }
  } catch (err) {
    return { error: `Erro de conexão: ${err}` }
  }
}
