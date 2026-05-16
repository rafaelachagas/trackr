import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extrairCriativo } from '@/lib/utils'
import { MetaAdInsight } from '@/types'
import { subDays, format } from 'date-fns'

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export async function GET(request: NextRequest) {
  return sincronizarMeta(request)
}

export async function POST(request: NextRequest) {
  return sincronizarMeta(request)
}

async function sincronizarMeta(request: NextRequest) {
  try {
    // Buscar configurações
    const { data: configs } = await supabaseAdmin
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['meta_access_token', 'meta_ad_account_id'])

    const configMap = Object.fromEntries(configs?.map((c) => [c.chave, c.valor]) ?? [])
    const accessToken = configMap['meta_access_token']
    const adAccountId = configMap['meta_ad_account_id']

    if (!accessToken || !adAccountId) {
      return NextResponse.json(
        { error: 'Meta Ads não configurado. Configure o access_token e ad_account_id.' },
        { status: 400 }
      )
    }

    // Determinar período (padrão: últimos 7 dias)
    const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams
    const diasParam = searchParams.get('dias') ?? '7'
    const dias = Math.min(parseInt(diasParam), 90)

    const dataFim = format(new Date(), 'yyyy-MM-dd')
    const dataInicio = format(subDays(new Date(), dias), 'yyyy-MM-dd')

    // Registrar início da sync
    const { data: syncLog } = await supabaseAdmin
      .from('sync_logs')
      .insert({ tipo: 'meta', status: 'em_andamento', mensagem: `Sincronizando ${dias} dias` })
      .select()
      .single()

    let totalRegistros = 0
    let cursor: string | null = null
    let paginaAtual = 0

    do {
      paginaAtual++
      const resultado = await buscarInsightsMeta({
        accessToken,
        adAccountId,
        dataInicio,
        dataFim,
        cursor,
      })

      if (resultado.error) {
        await atualizarSyncLog(syncLog?.id, 'erro', resultado.error)
        return NextResponse.json({ error: resultado.error }, { status: 500 })
      }

      const insights: MetaAdInsight[] = resultado.data ?? []

      if (insights.length > 0) {
        // Agrupa por (data, ad_name) somando gastos quando o mesmo anúncio aparece em múltiplos adsets
        const mapaRegistros = new Map<string, ReturnType<typeof buildRegistro>>()
        for (const insight of insights) {
          const chave = `${insight.date_start}||${insight.ad_name}`
          const existente = mapaRegistros.get(chave)
          if (existente) {
            existente.valor_gasto += parseFloat(insight.spend) || 0
            existente.impressions += parseInt(insight.impressions) || 0
            existente.clicks += parseInt(insight.clicks) || 0
          } else {
            mapaRegistros.set(chave, buildRegistro(insight))
          }
        }
        const registros = Array.from(mapaRegistros.values())

        const { error: erroUpsert } = await supabaseAdmin
          .from('gastos')
          .upsert(registros, { onConflict: 'data,ad_name' })

        if (erroUpsert) {
          console.error('[Meta] Erro ao salvar gastos:', erroUpsert)
          await atualizarSyncLog(syncLog?.id, 'erro', `Erro ao salvar: ${erroUpsert.message}`)
          return NextResponse.json({ error: `Erro ao salvar gastos: ${erroUpsert.message}`, detalhes: erroUpsert }, { status: 500 })
        }

        totalRegistros += registros.length
      }

      cursor = resultado.nextCursor ?? null
    } while (cursor && paginaAtual < 20) // Limite de segurança

    // Atualizar última sync
    await supabaseAdmin
      .from('configuracoes')
      .update({ valor: new Date().toISOString() })
      .eq('chave', 'meta_ultima_sync')

    await atualizarSyncLog(
      syncLog?.id,
      'sucesso',
      `${totalRegistros} registros sincronizados`,
      totalRegistros
    )

    return NextResponse.json({
      success: true,
      total_registros: totalRegistros,
      periodo: { inicio: dataInicio, fim: dataFim },
    })
  } catch (error) {
    console.error('[Meta] Erro na sincronização:', error)
    return NextResponse.json({ error: 'Erro interno na sincronização' }, { status: 500 })
  }
}

function buildRegistro(insight: MetaAdInsight) {
  return {
    data: insight.date_start,
    campaign_id: insight.campaign_id,
    campaign_name: insight.campaign_name,
    adset_id: insight.adset_id,
    adset_name: insight.adset_name,
    ad_id: insight.ad_id,
    ad_name: insight.ad_name,
    criativo: extrairCriativo(insight.ad_name),
    valor_gasto: parseFloat(insight.spend) || 0,
    impressions: parseInt(insight.impressions) || 0,
    clicks: parseInt(insight.clicks) || 0,
    cpc: insight.cpc ? parseFloat(insight.cpc) : null,
  }
}

async function buscarInsightsMeta({
  accessToken,
  adAccountId,
  dataInicio,
  dataFim,
  cursor,
}: {
  accessToken: string
  adAccountId: string
  dataInicio: string
  dataFim: string
  cursor: string | null
}): Promise<{ data?: MetaAdInsight[]; nextCursor?: string; error?: string }> {
  try {
    const campos = [
      'campaign_id',
      'campaign_name',
      'adset_id',
      'adset_name',
      'ad_id',
      'ad_name',
      'spend',
      'impressions',
      'clicks',
      'cpc',
      'date_start',
      'date_stop',
    ].join(',')

    const params = new URLSearchParams({
      fields: campos,
      level: 'ad',
      time_range: JSON.stringify({ since: dataInicio, until: dataFim }),
      time_increment: '1',
      limit: '500',
      access_token: accessToken,
    })

    if (cursor) params.set('after', cursor)

    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
    const url = `${META_API_BASE}/${accountId}/insights?${params}`
    const response = await fetch(url)
    const json = await response.json()

    if (json.error) {
      console.error('[Meta API] Erro:', json.error)
      return { error: `Meta API: ${json.error.message}` }
    }

    return {
      data: json.data ?? [],
      nextCursor: json.paging?.cursors?.after,
    }
  } catch (error) {
    return { error: `Erro de conexão com Meta API: ${error}` }
  }
}

async function atualizarSyncLog(
  id: string | undefined,
  status: string,
  mensagem: string,
  registros = 0
) {
  if (!id) return
  await supabaseAdmin
    .from('sync_logs')
    .update({ status, mensagem, registros_processados: registros })
    .eq('id', id)
}
