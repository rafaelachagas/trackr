import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { resolverFatoresGasto } from '@/lib/meta-fatores'
import { subDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { spRangeISO } from '@/lib/utils'

// Chama a Meta (gasto por hora). Estende o limite pra não estourar e devolver
// texto no lugar de JSON (mesmo motivo do ad-metrics).
export const maxDuration = 30

const TIMEZONE = 'America/Sao_Paulo'
const META_API_VERSION = 'v25.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

// Um ponto por hora do dia (0..23), agregado no período selecionado.
// Faturamento separado por fonte (frio = veio de anúncio, orgânico = sem sck de
// criativo) e por valor (líquido/bruto). Investimento é 100% do tráfego frio,
// com o gasto REAL por hora vindo da Meta.
export interface HoraPonto {
  hora: number
  fatFrioLiq: number
  fatFrioBru: number
  fatOrgLiq: number
  fatOrgBru: number
  investimento: number
}

// desde/ate são ISO (UTC) das bordas do dia em SP — senão a janela "hoje" usa
// meia-noite UTC (= 21h de ontem em SP) e vendas de ontem à noite vazam pros
// baldes 21/22/23h, aparecendo como "dado do futuro" no dia corrente.
async function fetchAllVendas(desde: string, ate: string) {
  const todas: { criativo: string | null; valor: number; valor_liquido: number | null; data: string }[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabaseAdmin
      .from('vendas')
      .select('criativo, valor, valor_liquido, data')
      .eq('status', 'approved')
      .not('transaction_id', 'like', 'manual_%')
      .gte('data', desde)
      .lte('data', ate)
      .range(off, off + 999)
    if (error) break
    if (!data || data.length === 0) break
    todas.push(...(data as any))
    if (data.length < 1000) break
  }
  return todas
}

// Gasto por HORA DO DIA (0..23), agregado no período, direto da Meta —
// breakdown hourly_stats_aggregated_by_advertiser_time_zone, nível conta.
async function fetchGastoPorHora(accountId: string, accessToken: string, since: string, until: string, fator: number): Promise<number[]> {
  const horas = new Array(24).fill(0)
  const acct = accountId.startsWith('act_') ? accountId : `act_${accountId}`
  let url: string | null = `${META_API_BASE}/${acct}/insights?${new URLSearchParams({
    fields: 'spend',
    level: 'account',
    breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    time_range: JSON.stringify({ since, until }),
    limit: '500',
    access_token: accessToken,
  })}`
  let paginas = 0
  while (url && paginas < 10) {
    const res: Response = await fetch(url)
    const json = await res.json()
    if (json.error) throw new Error(`Meta API: ${json.error.message}`)
    for (const row of json.data ?? []) {
      const bucket = row.hourly_stats_aggregated_by_advertiser_time_zone as string | undefined
      const h = bucket ? parseInt(bucket.slice(0, 2), 10) : NaN
      if (!Number.isNaN(h) && h >= 0 && h < 24) horas[h] += (parseFloat(row.spend) || 0) * fator
    }
    url = json.paging?.next ?? null
    paginas++
  }
  return horas
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const agora = toZonedTime(new Date(), TIMEZONE)
    const hoje = format(agora, 'yyyy-MM-dd')
    const dInicio = sp.get('d_inicio') ?? format(subDays(agora, 6), 'yyyy-MM-dd')
    const dFim = sp.get('d_fim') ?? hoje

    const { data: configs } = await supabaseAdmin
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['meta_access_token', 'meta_ad_account_ids', 'meta_ad_account_id', 'usd_brl_rate', 'meta_imposto_pct'])
    const configMap = Object.fromEntries(configs?.map((c) => [c.chave, c.valor]) ?? [])

    const accessToken = configMap['meta_access_token']
    let adAccountIds: string[] = []
    if (configMap['meta_ad_account_ids']) { try { adAccountIds = JSON.parse(configMap['meta_ad_account_ids']) } catch {} }
    if (adAccountIds.length === 0 && configMap['meta_ad_account_id']) adAccountIds = [configMap['meta_ad_account_id']]

    // Gasto por hora da Meta (se configurada). Falha → investimento zerado, mas o
    // faturamento por hora ainda aparece (não quebra o gráfico).
    const investPromise: Promise<number[]> = (async () => {
      const acc = new Array(24).fill(0)
      if (!accessToken || adAccountIds.length === 0) return acc
      try {
        const { fatores } = await resolverFatoresGasto(accessToken, adAccountIds, configMap)
        const listas = await Promise.all(
          adAccountIds.map((id) => {
            const fator = fatores.get(id.replace('act_', '')) ?? 1
            return fetchGastoPorHora(id, accessToken, dInicio, dFim, fator)
          })
        )
        for (const horas of listas) for (let h = 0; h < 24; h++) acc[h] += horas[h]
      } catch (e) {
        console.error('[por-hora] gasto Meta', e)
      }
      return acc
    })()

    const { desde, ate } = spRangeISO(dInicio, dFim)
    const [vendas, investimento] = await Promise.all([fetchAllVendas(desde, ate), investPromise])

    const pontos: HoraPonto[] = Array.from({ length: 24 }, (_, hora) => ({
      hora, fatFrioLiq: 0, fatFrioBru: 0, fatOrgLiq: 0, fatOrgBru: 0, investimento: investimento[hora] || 0,
    }))

    for (const v of vendas) {
      const h = Number(format(toZonedTime(new Date(v.data), TIMEZONE), 'H'))
      if (Number.isNaN(h) || h < 0 || h > 23) continue
      const liq = Number(v.valor_liquido ?? v.valor) || 0
      const bru = Number(v.valor) || 0
      if (v.criativo) { pontos[h].fatFrioLiq += liq; pontos[h].fatFrioBru += bru }
      else { pontos[h].fatOrgLiq += liq; pontos[h].fatOrgBru += bru }
    }

    return NextResponse.json({ pontos, periodo: { dInicio, dFim } })
  } catch (err) {
    console.error('[por-hora]', err)
    return NextResponse.json({ error: `Erro interno: ${err}` }, { status: 500 })
  }
}
