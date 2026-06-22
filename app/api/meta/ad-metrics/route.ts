import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { subDays, format } from 'date-fns'

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
    const dataFim = sp.get('dataFim') ?? format(new Date(), 'yyyy-MM-dd')
    const dataInicio = sp.get('dataInicio') ?? format(subDays(new Date(), 6), 'yyyy-MM-dd')

    const hoje = format(new Date(), 'yyyy-MM-dd')
    const d1 = format(subDays(new Date(), 0), 'yyyy-MM-dd')
    const d3 = format(subDays(new Date(), 2), 'yyyy-MM-dd')
    const d7 = format(subDays(new Date(), 6), 'yyyy-MM-dd')

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

    // Carrega vendas e gastos do DB (para ROAS 1D/3D/7D e período)
    const [vendasPeriodo, vendasRolling, gastosPeriodo, gastosRolling] = await Promise.all([
      supabaseAdmin.from('vendas').select('criativo, valor').eq('status', 'approved').gte('data', dataInicio).lte('data', dataFim),
      supabaseAdmin.from('vendas').select('criativo, valor, data').eq('status', 'approved').gte('data', d7).lte('data', hoje),
      supabaseAdmin.from('gastos').select('criativo, valor_gasto').gte('data', dataInicio).lte('data', dataFim),
      supabaseAdmin.from('gastos').select('criativo, valor_gasto, data').gte('data', d7).lte('data', hoje),
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

    // Agrega para rolling windows
    function rollingReceita(criativo: string, desde: string) {
      return (vendasRolling.data ?? [])
        .filter((v) => v.criativo === criativo && v.data >= desde)
        .reduce((s, v) => s + (v.valor || 0), 0)
    }
    function rollingGasto(criativo: string, desde: string) {
      return (gastosRolling.data ?? [])
        .filter((g) => g.criativo === criativo && g.data >= desde)
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

    for (const adAccountId of adAccountIds) {
      const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

      const [thumbData, primeiroLote] = await Promise.all([
        fetchAdThumbnails(accountId, accessToken).catch(() => new Map<string, string>()),
        fetchInsights({ accessToken, accountId, dataInicio, dataFim, cursor: null }),
      ])

      for (const [name, url] of thumbData) adNameToThumb.set(name, url)

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

      const r1 = rollingReceita(m.ad_name, d1)
      const g1 = rollingGasto(m.ad_name, d1)
      const r3 = rollingReceita(m.ad_name, d3)
      const g3 = rollingGasto(m.ad_name, d3)
      const r7 = rollingReceita(m.ad_name, d7)
      const g7 = rollingGasto(m.ad_name, d7)

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
      debug: { total: resultado.length, accounts: adAccountIds.length },
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

async function fetchAdThumbnails(accountId: string, accessToken: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const params = new URLSearchParams({
    fields: 'name,creative{thumbnail_url}',
    limit: '500',
    access_token: accessToken,
  })
  const res = await fetch(`${META_API_BASE}/${accountId}/ads?${params}`)
  const json = await res.json()
  for (const ad of json.data ?? []) {
    if (ad.creative?.thumbnail_url) result.set(ad.name, ad.creative.thumbnail_url)
  }
  return result
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
