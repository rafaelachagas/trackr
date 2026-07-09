import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extrairCriativo } from '@/lib/utils'
import { resolverFatoresGasto } from '@/lib/meta-fatores'
import { MetaAdInsight } from '@/types'
import { subDays, format } from 'date-fns'

const META_API_VERSION = 'v25.0'
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
      .in('chave', ['meta_access_token', 'meta_ad_account_ids', 'meta_ad_account_id', 'usd_brl_rate', 'meta_imposto_pct'])

    const configMap = Object.fromEntries(configs?.map((c) => [c.chave, c.valor]) ?? [])
    const accessToken = configMap['meta_access_token']

    // Lê todas as contas selecionadas; fallback para campo legado
    let adAccountIds: string[] = []
    if (configMap['meta_ad_account_ids']) {
      try { adAccountIds = JSON.parse(configMap['meta_ad_account_ids']) } catch {}
    }
    if (adAccountIds.length === 0 && configMap['meta_ad_account_id']) {
      adAccountIds = [configMap['meta_ad_account_id']]
    }

    if (!accessToken || adAccountIds.length === 0) {
      return NextResponse.json(
        { error: 'Meta Ads não configurado. Configure o access_token e ad_account_id.' },
        { status: 400 }
      )
    }

    // Resolver organização (single-tenant). Coluna org_id é NOT NULL em gastos —
    // sem isso o upsert falha e a tabela fica vazia.
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    const orgId = org?.id
    if (!orgId) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 500 })
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

    // Limpa apenas gastos vindos da Meta API (ad_id IS NOT NULL) — nunca apaga entradas manuais do framework
    await supabaseAdmin
      .from('gastos')
      .delete()
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .not('ad_id', 'is', null)

    // Fator por conta (só câmbio: USD→BRL; BRL fica cru) + alíquota do imposto.
    // O imposto NÃO entra no valor_gasto — é salvo por dia em meta_imposto_diario
    // e exibido no card "Imposto total" do overview. Ver lib/meta-fatores.
    const { fatores, moedas, impostoPct } = await resolverFatoresGasto(accessToken, adAccountIds, configMap)

    // Gasto CRU das contas BRL por dia — base de cálculo do imposto.
    const gastoBrlPorDia = new Map<string, number>()

    // Agrega por (data, ad_name) sobre TODAS as contas selecionadas.
    // O mapa vive FORA do loop de contas: se o mesmo ad_name roda em duas
    // contas no mesmo dia (escala em CA01/CA02/...), os gastos são SOMADOS
    // em vez de um upsert sobrescrever o outro (onConflict data,ad_name).
    const mapaRegistros = new Map<string, ReturnType<typeof buildRegistro>>()

    for (const adAccountId of adAccountIds) {
      const idLimpo = adAccountId.replace('act_', '')
      const fator = fatores.get(idLimpo) ?? 1
      // Coleta TODOS os insights de todas as páginas antes de agregar
      // (evita o bug onde page2 sobrescreve page1 para o mesmo ad_name+data)
      const todosInsights: MetaAdInsight[] = []
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

        todosInsights.push(...(resultado.data ?? []))
        cursor = resultado.nextCursor ?? null
      } while (cursor && paginaAtual < 20)

      const ehBRL = moedas.get(idLimpo) !== 'USD'
      for (const insight of todosInsights) {
        const spendRaw = parseFloat(insight.spend) || 0
        if (ehBRL) {
          gastoBrlPorDia.set(insight.date_start, (gastoBrlPorDia.get(insight.date_start) ?? 0) + spendRaw)
        }
        const chave = `${insight.date_start}||${insight.ad_name}`
        const existente = mapaRegistros.get(chave)
        if (existente) {
          existente.valor_gasto += spendRaw * fator
          existente.impressions += parseInt(insight.impressions) || 0
          existente.clicks += parseInt(insight.clicks) || 0
        } else {
          mapaRegistros.set(chave, buildRegistro(insight, orgId, fator))
        }
      }
    }

    let totalRegistros = 0
    const registros = Array.from(mapaRegistros.values())
    if (registros.length > 0) {
      const { error: erroUpsert } = await supabaseAdmin
        .from('gastos')
        .upsert(registros, { onConflict: 'data,ad_name' })

      if (erroUpsert) {
        console.error('[Meta] Erro ao salvar gastos:', erroUpsert)
        await atualizarSyncLog(syncLog?.id, 'erro', `Erro ao salvar: ${erroUpsert.message}`)
        return NextResponse.json({ error: `Erro ao salvar gastos: ${erroUpsert.message}`, detalhes: erroUpsert }, { status: 500 })
      }
      totalRegistros = registros.length
    }

    // Salva o imposto diário: alíquota × gasto CRU das contas BRL de cada dia.
    // Mapa { 'yyyy-MM-dd': valor } em meta_imposto_diario — recalcula só os
    // dias da janela sincronizada e preserva o histórico fora dela.
    {
      const { data: cfgImp } = await supabaseAdmin
        .from('configuracoes')
        .select('valor')
        .eq('chave', 'meta_imposto_diario')
        .maybeSingle()

      let mapaImposto: Record<string, number> = {}
      try { mapaImposto = JSON.parse(cfgImp?.valor || '{}') } catch {}

      for (let d = new Date(`${dataInicio}T12:00:00Z`); format(d, 'yyyy-MM-dd') <= dataFim; d.setUTCDate(d.getUTCDate() + 1)) {
        const dia = format(d, 'yyyy-MM-dd')
        const brl = gastoBrlPorDia.get(dia) ?? 0
        if (brl > 0 && impostoPct > 0) mapaImposto[dia] = Number(((brl * impostoPct) / 100).toFixed(2))
        else delete mapaImposto[dia]
      }

      await supabaseAdmin.from('configuracoes').upsert(
        { chave: 'meta_imposto_diario', valor: JSON.stringify(mapaImposto), org_id: orgId, updated_at: new Date().toISOString() },
        { onConflict: 'chave' }
      )
    }

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

function buildRegistro(insight: MetaAdInsight, orgId: string, fator = 1) {
  return {
    org_id: orgId,
    data: insight.date_start,
    campaign_id: insight.campaign_id,
    campaign_name: insight.campaign_name,
    adset_id: insight.adset_id,
    adset_name: insight.adset_name,
    ad_id: insight.ad_id,
    ad_name: insight.ad_name,
    criativo: extrairCriativo(insight.ad_name),
    valor_gasto: (parseFloat(insight.spend) || 0) * fator,
    impressions: parseInt(insight.impressions) || 0,
    clicks: parseInt(insight.clicks) || 0,
    cpc: insight.cpc ? parseFloat(insight.cpc) * fator : null,
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
      // cursors.after exists even on the last page; paging.next only exists when there IS a next page
      nextCursor: json.paging?.next ? json.paging?.cursors?.after : undefined,
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
