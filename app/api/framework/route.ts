import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { calcularRoas } from '@/lib/utils'
import { subDays, addDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { AcaoOtimizacao } from '@/types'

const TIMEZONE = 'America/Sao_Paulo'
const ROAS_MINIMO_PADRAO = 1.0

type RegraFramework = {
  p7: boolean
  p3: boolean
  p1: boolean
  acao: AcaoOtimizacao
}

const REGRAS_PADRAO: RegraFramework[] = [
  { p7: true,  p3: true,  p1: true,  acao: '+20% orçamento' },
  { p7: true,  p3: true,  p1: false, acao: 'Manter' },
  { p7: true,  p3: false, p1: true,  acao: '+20% orçamento' },
  { p7: true,  p3: false, p1: false, acao: '-20% ou pausar' },
  { p7: false, p3: true,  p1: true,  acao: '+20% orçamento' },
  { p7: false, p3: true,  p1: false, acao: 'Manter' },
  { p7: false, p3: false, p1: true,  acao: 'Manter' },
  { p7: false, p3: false, p1: false, acao: 'Pausar' },
]

function aplicarRegras(
  roas7d: number | null,
  roas3d: number | null,
  roas1d: number | null,
  roasMinimo: number,
  regras: RegraFramework[]
): AcaoOtimizacao {
  const p7 = roas7d !== null && roas7d >= roasMinimo
  const p3 = roas3d !== null && roas3d >= roasMinimo
  const p1 = roas1d !== null && roas1d >= roasMinimo

  const regra = regras.find(r => r.p7 === p7 && r.p3 === p3 && r.p1 === p1)
  return regra?.acao ?? 'Manter'
}

export type FaseCampanha = 'FASE01' | 'FASE02' | 'FASE03' | null

export interface FrameworkData {
  criativo: string
  ad_name: string
  campaign_name: string | null
  fase: FaseCampanha
  roas_7d: number | null
  roas_3d: number | null
  roas_1d: number | null
  positivo_7d: boolean
  positivo_3d: boolean
  positivo_1d: boolean
  acao: AcaoOtimizacao
  receita_7d: number
  gasto_7d: number
  gasto_3d: number
  gasto_1d: number
  gasto_periodo: number
  vendas_7d: number
}

function detectarFase(campaignName: string | null): FaseCampanha {
  if (!campaignName) return null
  const upper = campaignName.toUpperCase()
  if (upper.includes('FASE03')) return 'FASE03'
  if (upper.includes('FASE02')) return 'FASE02'
  if (upper.includes('FASE01')) return 'FASE01'
  return null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const agora = toZonedTime(new Date(), TIMEZONE)

    const hoje = format(agora, 'yyyy-MM-dd')
    const amanha = format(addDays(agora, 1), 'yyyy-MM-dd')
    const ontem = format(subDays(agora, 1), 'yyyy-MM-dd')
    // All ROAS windows end at yesterday (complete days only — today is incomplete)
    const d7 = format(subDays(agora, 7), 'yyyy-MM-dd') // 7 complete days ending yesterday
    const d3 = format(subDays(agora, 3), 'yyyy-MM-dd') // 3 complete days ending yesterday
    const d1 = ontem

    // Período customizado para a coluna de gasto
    const dInicio = searchParams.get('d_inicio') ?? d7
    const dFim = searchParams.get('d_fim') ?? hoje

    const { data: configs } = await supabaseAdmin
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['roas_minimo', 'framework_regras'])

    let ROAS_MINIMO = ROAS_MINIMO_PADRAO
    let regras = REGRAS_PADRAO

    if (configs) {
      const cfgRoas = configs.find(c => c.chave === 'roas_minimo')
      if (cfgRoas?.valor) ROAS_MINIMO = parseFloat(cfgRoas.valor) || ROAS_MINIMO_PADRAO

      const cfgRegras = configs.find(c => c.chave === 'framework_regras')
      if (cfgRegras?.valor) {
        try { regras = JSON.parse(cfgRegras.valor) } catch {}
      }
    }

    const [{ data: gastos7d }, { data: gastosPeriodo }, { data: vendas7d }] = await Promise.all([
      supabaseAdmin
        .from('gastos')
        .select('criativo, campaign_name, ad_name, valor_gasto, data')
        .gte('data', d7)
        .lte('data', amanha),
      supabaseAdmin
        .from('gastos')
        .select('criativo, ad_name, campaign_name, valor_gasto')
        .gte('data', dInicio)
        .lte('data', dFim),
      supabaseAdmin
        .from('vendas')
        .select('criativo, fase, campanha, valor, data')
        .eq('status', 'approved')
        .gte('data', `${d7}T00:00:00`)
        .lte('data', `${ontem}T23:59:59`),
    ])

    if (!gastos7d || !vendas7d) {
      return NextResponse.json({ criativos: [], roasMinimo: ROAS_MINIMO })
    }

    // Mapa de gasto por período selecionado: "adKey__campaign" -> total
    const gastoPeriodoMap = new Map<string, number>()
    for (const g of (gastosPeriodo ?? [])) {
      const adKey = g.criativo || g.ad_name || 'Sem Nome'
      const key = `${adKey}__${(g as any).campaign_name ?? ''}`
      gastoPeriodoMap.set(key, (gastoPeriodoMap.get(key) ?? 0) + Number(g.valor_gasto))
    }

    type EntradaCriativo = {
      ad_name: string
      campaign_name: string | null
      gastos: { valor: number; data: string }[]
      vendas: { valor: number; data: string }[]
    }

    const criativoMap = new Map<string, EntradaCriativo>()

    for (const g of gastos7d) {
      const adKey = g.criativo || g.ad_name || 'Sem Nome'
      const key = `${adKey}__${g.campaign_name ?? ''}`
      if (!criativoMap.has(key)) {
        criativoMap.set(key, { ad_name: g.ad_name || adKey, campaign_name: g.campaign_name, gastos: [], vendas: [] })
      }
      criativoMap.get(key)!.gastos.push({ valor: Number(g.valor_gasto), data: g.data })
    }

    for (const v of vendas7d) {
      if (!v.criativo) continue
      const faseDaVenda = (v as any).fase as string | null
      for (const [key, dados] of criativoMap.entries()) {
        if (!key.startsWith(`${v.criativo}__`)) continue
        // Se a venda tem fase definida, só atribui à campanha da mesma fase
        if (faseDaVenda && dados.campaign_name) {
          const faseCampanha = detectarFase(dados.campaign_name)
          if (faseCampanha && faseCampanha !== faseDaVenda) continue
        }
        dados.vendas.push({ valor: Number(v.valor), data: v.data })
      }
    }

    const criativos: FrameworkData[] = []

    for (const [nome, dados] of criativoMap.entries()) {
      // All windows use complete days only (≤ ontem)
      const gasto7d = dados.gastos.filter((g) => g.data <= ontem).reduce((a, g) => a + g.valor, 0)
      const gasto3d = dados.gastos
        .filter((g) => g.data >= d3 && g.data <= ontem)
        .reduce((a, g) => a + g.valor, 0)
      const gasto1d = dados.gastos
        .filter((g) => g.data === d1)
        .reduce((a, g) => a + g.valor, 0)

      // vendas query already bounded by ontem
      const receita7d = dados.vendas.reduce((a, v) => a + v.valor, 0)
      const receita3d = dados.vendas
        .filter((v) => v.data.substring(0, 10) >= d3)
        .reduce((a, v) => a + v.valor, 0)
      const receita1d = dados.vendas
        .filter((v) => v.data.substring(0, 10) === d1)
        .reduce((a, v) => a + v.valor, 0)

      const roas7d = gasto7d > 0 ? calcularRoas(receita7d, gasto7d) : null
      const roas3d = gasto3d > 0 ? calcularRoas(receita3d, gasto3d) : null
      const roas1d = gasto1d > 0 ? calcularRoas(receita1d, gasto1d) : null

      const acao = aplicarRegras(roas7d, roas3d, roas1d, ROAS_MINIMO, regras)
      const fase = detectarFase(dados.campaign_name)

      const adKey = nome.split('__')[0]
      criativos.push({
        criativo: adKey,
        ad_name: dados.ad_name,
        campaign_name: dados.campaign_name,
        fase,
        roas_7d: roas7d,
        roas_3d: roas3d,
        roas_1d: roas1d,
        positivo_7d: roas7d !== null && roas7d >= ROAS_MINIMO,
        positivo_3d: roas3d !== null && roas3d >= ROAS_MINIMO,
        positivo_1d: roas1d !== null && roas1d >= ROAS_MINIMO,
        acao,
        receita_7d: receita7d,
        gasto_7d: gasto7d,
        gasto_3d: gasto3d,
        gasto_1d: gasto1d,
        gasto_periodo: gastoPeriodoMap.get(nome) ?? 0,

        vendas_7d: dados.vendas.length,
      })
    }

    const prioridade: Record<AcaoOtimizacao, number> = {
      '+20% orçamento': 0,
      'Manter': 1,
      '-20% ou pausar': 2,
      'Pausar': 3,
    }
    criativos.sort((a, b) => prioridade[a.acao] - prioridade[b.acao])

    return NextResponse.json({ criativos, roasMinimo: ROAS_MINIMO })
  } catch (err) {
    console.error('[framework]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
