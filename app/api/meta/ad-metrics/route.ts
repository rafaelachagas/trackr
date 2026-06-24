import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { subDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

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
    const agora = toZonedTime(new Date(), 'America/Sao_Paulo')
    const hoje = format(agora, 'yyyy-MM-dd')
    const ontem = format(subDays(agora, 1), 'yyyy-MM-dd')

    const dataFim = sp.get('dataFim') ?? hoje
    const dataInicio = sp.get('dataInicio') ?? format(subDays(agora, 6), 'yyyy-MM-dd')

    // Janelas fixas sempre encerram em ontem (dia completo) — igual ao framework
    const d1 = ontem
    const d3 = format(subDays(agora, 3), 'yyyy-MM-dd')
    const d7 = format(subDays(agora, 7), 'yyyy-MM-dd')

    // Carrega criativos
    const { data: criativosDB } = await supabaseAdmin
      .from('criativos')
      .select('nome, fase, link_anuncio, campaign_name')

    // Tenta carregar thumbnail_url separado (coluna opcional)
    const thumbMap = new Map<string, string>()
    try {
      const { data: thumbRows } = await supabaseAdmin
        .from('criativos')
        .select('nome, thumbnail_url')
      for (const r of thumbRows ?? []) {
        if (r.thumbnail_url) thumbMap.set(r.nome, r.thumbnail_url)
      }
    } catch {}

    // Carrega vendas e gastos do DB — espelha /api/framework exatamente
    const [vendasPeriodo, vendasRolling, gastosPeriodo, gastosRolling] = await Promise.all([
      // Período selecionado: todas as vendas aprovadas (para receita do card)
      supabaseAdmin.from('vendas').select('criativo, valor').eq('status', 'approved').gte('data', dataInicio).lte('data', dataFim),
      // Rolling 7d: só lançamentos manuais, encerrando em ontem
      supabaseAdmin.from('vendas').select('criativo, valor, data').eq('status', 'approved').like('transaction_id', 'manual_%').gte('data', `${d7}T00:00:00`).lte('data', `${ontem}T23:59:59`),
      // Gastos do período: só gastos manuais (ad_id null)
      supabaseAdmin.from('gastos').select('criativo, valor_gasto').is('ad_id', null).gte('data', dataInicio).lte('data', dataFim),
      // Gastos rolling 7d: só gastos manuais
      supabaseAdmin.from('gastos').select('criativo, valor_gasto, data').is('ad_id', null).gte('data', d7).lte('data', ontem),
    ])

    // Agrega receita e gasto por criativo para o período selecionado
    const receitaPeriodoMap = new Map<string, number>()
    for (const v of vendasPeriodo.data ?? []) {
      if (v.criativo) receitaPeriodoMap.set(v.criativo, (receitaPeriodoMap.get(v.criativo) ?? 0) + (v.valor || 0))
    }
    const gastoPeriodoMap = new Map<string, number>()
    for (const g of gastosPeriodo.data ?? []) {
      if (g.criativo) gastoPeriodoMap.set(g.criativo, (gastoPeriodoMap.get(g.criativo) ?? 0) + (g.valor_gasto || 0))
    }

    // Agrega para rolling windows — igual ao framework
    function rollingReceita(criativo: string, desde: string, ate: string = ontem) {
      return (vendasRolling.data ?? [])
        .filter((v) => v.criativo === criativo && v.data.substring(0, 10) >= desde && v.data.substring(0, 10) <= ate)
        .reduce((s, v) => s + (v.valor || 0), 0)
    }
    function rollingGasto(criativo: string, desde: string, ate: string = ontem) {
      return (gastosRolling.data ?? [])
        .filter((g) => g.criativo === criativo && g.data >= desde && g.data <= ate)
        .reduce((s, g) => s + (g.valor_gasto || 0), 0)
    }

    type DBCriativo = { fase: string | null; link_anuncio: string | null; campaign_name: string }
    const criativosMap = new Map<string, DBCriativo>()
    for (const c of criativosDB ?? []) {
      criativosMap.set(`${c.nome}||${c.campaign_name}`, {
        fase: c.fase,
        link_anuncio: c.link_anuncio,
        campaign_name: c.campaign_name,
      })
    }

    type MetricEntry = {
      ad_name: string
      campaign_name: string
      spend: number
      impressions: number
      clicks: number
      frequency_total: number
      frequency_count: number
      hook_actions: number
      ad_id: string
    }
    const mapaMetricas = new Map<string, MetricEntry>()
    const adNameToThumb = new Map<string, string>()
    let thumbDebug: any[] = []

    for (const adAccountId of adAccountIds) {
      const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

      const [thumbResult, primeiroLote] = await Promise.all([
        fetchAdThumbnails(accountId, accessToken).catch(() => ({ map: new Map<string, string>(), debug: [] })),
        fetchInsights({ accessToken, accountId, dataInicio, dataFim, cursor: null }),
      ])

      thumbDebug = thumbResult.debug
      for (const [name, url] of thumbResult.map) adNameToThumb.set(name, url)

      if (primeiroLote.error) {
        return NextResponse.json({ error: primeiroLote.error }, { status: 500 })
      }

      const processRows = (rows: any[]) => {
        for (const row of rows) {
          const chave = `${row.ad_name}||${row.campaign_name}`
          const freq = parseFloat(row.frequency) || 0
          const existente = mapaMetricas.get(chave)
          if (existente) {
            existente.spend += parseFloat(row.spend) || 0
            existente.impressions += parseInt(row.impressions) || 0
            existente.clicks += parseInt(row.clicks) || 0
            existente.frequency_total += freq
            existente.frequency_count++
          } else {
            mapaMetricas.set(chave, {
              ad_name: row.ad_name,
              campaign_name: row.campaign_name,
              spend: parseFloat(row.spend) || 0,
              impressions: parseInt(row.impressions) || 0,
              clicks: parseInt(row.clicks) || 0,
              frequency_total: freq,
              frequency_count: 1,
              hook_actions: 0,
              ad_id: row.ad_id,
            })
          }
        }
      }

      processRows(primeiroLote.data ?? [])

      let cursor: string | null = primeiroLote.nextCursor ?? null
      let page = 1
      while (cursor && page < 20) {
        const resultado = await fetchInsights({ accessToken, accountId, dataInicio, dataFim, cursor })
        if (resultado.error) {
          return NextResponse.json({ error: resultado.error }, { status: 500 })
        }
        processRows(resultado.data ?? [])
        cursor = resultado.nextCursor ?? null
        page++
      }
    }

    const resultado: AdMetric[] = []

    for (const [, m] of mapaMetricas) {
      const cpm = m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null
      const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null
      const cpc = m.clicks > 0 ? m.spend / m.clicks : null
      const frequency = m.frequency_count > 0 ? m.frequency_total / m.frequency_count : null

      let dbCriativo: DBCriativo | undefined
      for (const [dbKey, dbVal] of criativosMap) {
        const [dbNome, dbCampanha] = dbKey.split('||')
        if (m.ad_name === dbNome && m.campaign_name.startsWith(dbCampanha)) {
          dbCriativo = dbVal
          break
        }
      }

      const thumbnailUrl = thumbMap.get(m.ad_name) ?? adNameToThumb.get(m.ad_name) ?? null

      // ROAS
      const receita = receitaPeriodoMap.get(m.ad_name) ?? 0
      const gastoDB = gastoPeriodoMap.get(m.ad_name) ?? 0
      const spendParaRoas = gastoDB > 0 ? gastoDB : m.spend
      const roas = spendParaRoas > 0 && receita > 0 ? receita / spendParaRoas : null

      // Janelas: 1d = só ontem, 3d = d3 até ontem, 7d = d7 até ontem
      const r1 = rollingReceita(m.ad_name, d1, d1)
      const g1 = rollingGasto(m.ad_name, d1, d1)
      const r3 = rollingReceita(m.ad_name, d3, ontem)
      const g3 = rollingGasto(m.ad_name, d3, ontem)
      const r7 = rollingReceita(m.ad_name, d7, ontem)
      const g7 = rollingGasto(m.ad_name, d7, ontem)

      resultado.push({
        criativo: m.ad_name,
        fase: dbCriativo?.fase ?? extrairFaseDoCampaign(m.campaign_name),
        link_anuncio: dbCriativo?.link_anuncio ?? null,
        thumbnail_url: thumbnailUrl,
        campaign_name: m.campaign_name,
        ad_name: m.ad_name,
        spend: m.spend,
        impressions: m.impressions,
        clicks: m.clicks,
        cpm,
        ctr,
        cpc,
        frequency,
        hook_rate: null,
        receita,
        roas,
        roas_1d: g1 > 0 && r1 > 0 ? r1 / g1 : null,
        roas_3d: g3 > 0 && r3 > 0 ? r3 / g3 : null,
        roas_7d: g7 > 0 && r7 > 0 ? r7 / g7 : null,
      })
    }

    resultado.sort((a, b) => b.spend - a.spend)

    return NextResponse.json({
      metrics: resultado,
      periodo: { dataInicio, dataFim },
      debug: { total: resultado.length, accounts: adAccountIds.length, thumb_sample: (thumbDebug as any[]) },
    })
  } catch (err) {
    console.error('[ad-metrics]', err)
    return NextResponse.json({ error: `Erro interno: ${err}` }, { status: 500 })
  }
}

function extrairFaseDoCampaign(campaignName: string): string | null {
  const match = campaignName.match(/\[(FASE\d+)\]/i)
  return match ? match[1].toUpperCase() : null
}

async function fetchAdThumbnails(accountId: string, accessToken: string): Promise<{ map: Map<string, string>; debug: any[] }> {
  const map = new Map<string, string>()
  const debug: any[] = []

  // Step 1: fetch all ads with creative IDs + inline fields (works for image ads)
  let url = `${META_API_BASE}/${accountId}/ads?${new URLSearchParams({
    fields: 'name,creative{id,thumbnail_url,image_url,object_story_spec{link_data{picture},photo_data{url},video_data{image_url,thumbnail_url}}}',
    limit: '500',
    access_token: accessToken,
  })}`

  const adCreativeIds: { adName: string; creativeId: string }[] = []

  while (url) {
    const res = await fetch(url)
    const json = await res.json()
    for (const ad of json.data ?? []) {
      const c = ad.creative
      const inlineUrl =
        c?.thumbnail_url ||
        c?.image_url ||
        c?.object_story_spec?.link_data?.picture ||
        c?.object_story_spec?.photo_data?.url ||
        c?.object_story_spec?.video_data?.image_url ||
        c?.object_story_spec?.video_data?.thumbnail_url ||
        null
      if (inlineUrl) {
        map.set(ad.name, inlineUrl)
      } else if (c?.id) {
        adCreativeIds.push({ adName: ad.name, creativeId: c.id })
      }
    }
    url = json.paging?.next ?? null
  }

  // Step 2: batch-fetch thumbnails for video creatives (thumbnail_url requires explicit dimensions)
  const BATCH_SIZE = 50
  for (let i = 0; i < adCreativeIds.length; i += BATCH_SIZE) {
    const batch = adCreativeIds.slice(i, i + BATCH_SIZE)
    const batchBody = new URLSearchParams({
      access_token: accessToken,
      batch: JSON.stringify(
        batch.map(({ creativeId }) => ({
          method: 'GET',
          relative_url: `${creativeId}?fields=thumbnail_url,image_url&thumbnail_width=500&thumbnail_height=500`,
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
          debug.push({ adName: batch[j].adName, creative_id: batch[j].creativeId, url_found: !!thumbUrl })
        } catch {}
      }
    }
  }

  return { map, debug }
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
    const campos = [
      'ad_id', 'ad_name', 'campaign_name',
      'spend', 'impressions', 'clicks',
      'cpm', 'ctr', 'cpc', 'frequency',
    ].join(',')

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
