import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { subDays, format } from 'date-fns'

const META_API_VERSION = 'v25.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export interface AdMetric {
  criativo: string       // nome do criativo (ex: ad03-entrevista-viral-pre-escala)
  fase: string | null    // FASE01 | FASE02 | FASE03
  link_anuncio: string | null
  thumbnail_url: string | null
  campaign_name: string
  ad_name: string
  spend: number
  impressions: number
  clicks: number
  cpm: number | null
  ctr: number | null     // porcentagem (ex: 2.84)
  cpc: number | null
  frequency: number | null
  hook_rate: number | null  // porcentagem (video_3s / impressions * 100)
}

export async function GET(request: NextRequest) {
  try {
    const { data: configs } = await supabaseAdmin
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['meta_access_token', 'meta_ad_account_ids', 'meta_ad_account_id'])

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
      return NextResponse.json({ error: 'Meta Ads não configurado.' }, { status: 400 })
    }

    const sp = request.nextUrl.searchParams
    const dataFim = sp.get('dataFim') ?? format(new Date(), 'yyyy-MM-dd')
    const dataInicio = sp.get('dataInicio') ?? format(subDays(new Date(), 6), 'yyyy-MM-dd')

    // Carrega criativos do DB para cruzar link_anuncio e fase
    const { data: criativosDB } = await supabaseAdmin
      .from('criativos')
      .select('nome, fase, link_anuncio, campaign_name, thumbnail_url')

    const criativosMap = new Map<string, { fase: string | null; link_anuncio: string | null; campaign_name: string; thumbnail_url: string | null }>()
    for (const c of criativosDB ?? []) {
      // Chave: "nome||campaign_name_prefix"
      criativosMap.set(`${c.nome}||${c.campaign_name}`, {
        fase: c.fase,
        link_anuncio: c.link_anuncio,
        campaign_name: c.campaign_name,
        thumbnail_url: c.thumbnail_url ?? null,
      })
    }

    // Agrega insights de todas as contas
    const mapaMetricas = new Map<string, {
      ad_name: string
      campaign_name: string
      spend: number
      impressions: number
      clicks: number
      cpm_sum: number
      ctr_sum: number
      cpc_sum: number
      frequency_sum: number
      hook_actions: number
      count: number
      ad_id: string
    }>()

    const adIdParaThumbnail = new Map<string, string>() // ad_name → thumbnail_url

    for (const adAccountId of adAccountIds) {
      const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

      // Busca thumbnails dos ads desta conta
      const thumbData = await fetchAdThumbnails(accountId, accessToken)
      for (const [adName, url] of thumbData) {
        adIdParaThumbnail.set(adName, url)
      }

      // Busca insights agregados pelo período
      let cursor: string | null = null
      let page = 0
      do {
        const resultado = await fetchInsights({ accessToken, accountId, dataInicio, dataFim, cursor })
        if (resultado.error) {
          return NextResponse.json({ error: resultado.error }, { status: 500 })
        }

        for (const row of resultado.data ?? []) {
          const chave = `${row.ad_name}||${row.campaign_name}`
          const existente = mapaMetricas.get(chave)
          const hookActions = parseHookActions(row.video_3_sec_watched_actions)
          if (existente) {
            existente.spend += parseFloat(row.spend) || 0
            existente.impressions += parseInt(row.impressions) || 0
            existente.clicks += parseInt(row.clicks) || 0
            existente.hook_actions += hookActions
            existente.count++
          } else {
            mapaMetricas.set(chave, {
              ad_name: row.ad_name,
              campaign_name: row.campaign_name,
              spend: parseFloat(row.spend) || 0,
              impressions: parseInt(row.impressions) || 0,
              clicks: parseInt(row.clicks) || 0,
              cpm_sum: parseFloat(row.cpm) || 0,
              ctr_sum: parseFloat(row.ctr) || 0,
              cpc_sum: parseFloat(row.cpc) || 0,
              frequency_sum: parseFloat(row.frequency) || 0,
              hook_actions: hookActions,
              count: 1,
              ad_id: row.ad_id,
            })
          }
        }

        cursor = resultado.nextCursor ?? null
        page++
      } while (cursor && page < 20)
    }

    // Monta resultado final cruzando com criativos do DB
    const resultado: AdMetric[] = []

    for (const [chave, m] of mapaMetricas) {
      const cpm = m.impressions > 0 ? (m.spend / m.impressions) * 1000 : null
      const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null
      const cpc = m.clicks > 0 ? m.spend / m.clicks : null
      const hookRate = m.impressions > 0 ? (m.hook_actions / m.impressions) * 100 : null

      // Frequência: média simples (cada row do insights já tem frequency por período)
      const frequency = m.frequency_sum / m.count

      // Tenta casar com criativo do DB
      // Procura por criativo cujo campaign_name seja prefixo do campaign_name da meta
      let dbCriativo: ReturnType<typeof criativosMap.get> | undefined
      for (const [dbKey, dbVal] of criativosMap) {
        const [dbNome, dbCampanha] = dbKey.split('||')
        if (
          m.ad_name === dbNome &&
          m.campaign_name.startsWith(dbCampanha)
        ) {
          dbCriativo = dbVal
          break
        }
      }

      // Thumbnail: primeiro do DB (manual), depois da API Meta
      const thumbnailUrl = dbCriativo?.thumbnail_url ?? adIdParaThumbnail.get(m.ad_name) ?? null

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
        hook_rate: hookRate,
      })
    }

    // Ordena por gasto decrescente por padrão
    resultado.sort((a, b) => b.spend - a.spend)

    return NextResponse.json({ metrics: resultado, periodo: { dataInicio, dataFim } })
  } catch (err) {
    console.error('[ad-metrics]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

function parseHookActions(arr: unknown): number {
  if (!Array.isArray(arr)) return 0
  const item = arr.find((a: any) => a.action_type === 'video_view')
  return parseInt(item?.value ?? '0') || 0
}

function extrairFaseDoCampaign(campaignName: string): string | null {
  const match = campaignName.match(/\[(FASE\d+)\]/i)
  return match ? match[1].toUpperCase() : null
}

async function fetchAdThumbnails(accountId: string, accessToken: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  try {
    const params = new URLSearchParams({
      fields: 'name,creative{thumbnail_url}',
      limit: '500',
      access_token: accessToken,
    })
    const res = await fetch(`${META_API_BASE}/${accountId}/ads?${params}`)
    const json = await res.json()
    for (const ad of json.data ?? []) {
      if (ad.creative?.thumbnail_url) {
        result.set(ad.name, ad.creative.thumbnail_url)
      }
    }
  } catch {}
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
      'video_3_sec_watched_actions',
    ].join(',')

    const params = new URLSearchParams({
      fields: campos,
      level: 'ad',
      time_range: JSON.stringify({ since: dataInicio, until: dataFim }),
      limit: '500',
      access_token: accessToken,
    })
    if (cursor) params.set('after', cursor)

    const res = await fetch(`${META_API_BASE}/${accountId}/insights?${params}`)
    const json = await res.json()

    if (json.error) return { error: `Meta API: ${json.error.message}` }
    return {
      data: json.data ?? [],
      nextCursor: json.paging?.next ? json.paging?.cursors?.after : undefined,
    }
  } catch (err) {
    return { error: `Erro de conexão: ${err}` }
  }
}
