import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { calcularRoas, extrairFase } from '@/lib/utils'
import { subDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { AcaoOtimizacao } from '@/types'

/**
 * PERFORMANCE POR CRIATIVO — V2 (AUTOMÁTICO)
 *
 * Junta, pelo CÓDIGO DO ANÚNCIO (ad54, ad12...), que já existe nos dois lados:
 *   - GASTO: tabela `gastos` da Meta (ad_id IS NOT NULL) — criativo extraído do ad_name
 *   - FATURAMENTO: vendas REAIS da Hotmart (não-manuais) com sck de anúncio
 *     (criativo != null). Vendas orgânicas / link na bio NÃO têm código de
 *     criativo no sck, então ficam de fora — exatamente "só vendas via anúncio".
 *
 * ROAS/Lucro são sobre o faturamento LÍQUIDO (valor_liquido, com fallback p/ valor).
 * O front e o upsell entram juntos (o upsell herda o sck por e-mail — asterisco).
 *
 * Não toca na versão manual (/api/framework) — é aditivo.
 */

const TIMEZONE = 'America/Sao_Paulo'
const ROAS_MINIMO_PADRAO = 1.0

type RegraFramework = { p7: boolean; p3: boolean; p1: boolean; acao: AcaoOtimizacao }

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

function aplicarRegras(r7: number | null, r3: number | null, r1: number | null, min: number, regras: RegraFramework[]): AcaoOtimizacao {
  const p7 = r7 !== null && r7 >= min
  const p3 = r3 !== null && r3 >= min
  const p1 = r1 !== null && r1 >= min
  return regras.find(r => r.p7 === p7 && r.p3 === p3 && r.p1 === p1)?.acao ?? 'Manter'
}

function detectarFaseCampaign(campaignName: string | null): string | null {
  if (!campaignName) return null
  const u = campaignName.toUpperCase()
  if (u.includes('FASE03')) return 'FASE03'
  if (u.includes('FASE02')) return 'FASE02'
  if (u.includes('FASE01')) return 'FASE01'
  return null
}

export interface CriativoV2 {
  criativo: string
  ad_name: string
  campaign_name: string | null
  fase: string | null
  gasto_periodo: number
  receita_periodo: number
  roas_periodo: number | null
  lucro_periodo: number
  vendas_periodo: number
  gasto_7d: number
  gasto_3d: number
  gasto_1d: number
  roas_7d: number | null
  roas_3d: number | null
  roas_1d: number | null
  acao: AcaoOtimizacao
}

// Paginação: PostgREST corta em 1000 linhas — em 7 dias as vendas já passam disso.
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const agora = toZonedTime(new Date(), TIMEZONE)

    const hoje = format(agora, 'yyyy-MM-dd')
    const ontem = format(subDays(agora, 1), 'yyyy-MM-dd')
    const d7 = format(subDays(agora, 7), 'yyyy-MM-dd')
    const d3 = format(subDays(agora, 3), 'yyyy-MM-dd')
    const d1 = ontem

    const dInicio = searchParams.get('d_inicio') ?? d7
    const dFim = searchParams.get('d_fim') ?? hoje

    // ROAS mínimo + regras do framework (config compartilhada)
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
      if (cfgRegras?.valor) { try { regras = JSON.parse(cfgRegras.valor) } catch {} }
    }

    // Janela ampla o suficiente para cobrir período custom + rolling 7d
    const desde = dInicio < d7 ? dInicio : d7
    const ate = dFim > hoje ? dFim : hoje

    type GastoRow = { criativo: string | null; campaign_name: string | null; ad_name: string | null; valor_gasto: number; data: string }
    type VendaRow = { criativo: string | null; fase: string | null; campanha: string | null; valor: number; valor_liquido: number | null; data: string; tipo: string | null }

    const [gastos, vendas] = await Promise.all([
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
          .select('criativo, fase, campanha, valor, valor_liquido, data, tipo')
          .eq('status', 'approved')
          .not('transaction_id', 'like', 'manual_%')
          .not('criativo', 'is', null)
          .gte('data', `${desde}T00:00:00`)
          .lte('data', `${ate}T23:59:59`)
          .range(from, to)
      ),
    ])

    type Entrada = {
      criativo: string
      ad_name: string | null
      campaign_name: string | null
      faseSck: string | null
      gastos: { valor: number; data: string }[]
      vendas: { liquido: number; data: string }[]
    }
    const mapa = new Map<string, Entrada>()

    function getEntrada(cri: string): Entrada {
      let e = mapa.get(cri)
      if (!e) {
        e = { criativo: cri, ad_name: null, campaign_name: null, faseSck: null, gastos: [], vendas: [] }
        mapa.set(cri, e)
      }
      return e
    }

    for (const g of gastos) {
      if (!g.criativo) continue
      const e = getEntrada(g.criativo)
      e.gastos.push({ valor: Number(g.valor_gasto) || 0, data: g.data })
      // guarda um ad_name/campanha representativo (o de maior gasto tende a vir primeiro após sort)
      if (!e.ad_name && g.ad_name) e.ad_name = g.ad_name
      if (!e.campaign_name && g.campaign_name) e.campaign_name = g.campaign_name
    }

    for (const v of vendas) {
      if (!v.criativo) continue
      const e = getEntrada(v.criativo)
      e.vendas.push({ liquido: Number(v.valor_liquido ?? v.valor) || 0, data: v.data })
      if (!e.faseSck) e.faseSck = v.fase ?? extrairFase(v.campanha)
    }

    const dia = (iso: string) => iso.substring(0, 10)

    const linhas: CriativoV2[] = []
    for (const e of mapa.values()) {
      const gastoPeriodo = e.gastos.filter(g => g.data >= dInicio && g.data <= dFim).reduce((a, g) => a + g.valor, 0)
      const gasto7d = e.gastos.filter(g => g.data >= d7 && g.data <= ontem).reduce((a, g) => a + g.valor, 0)
      const gasto3d = e.gastos.filter(g => g.data >= d3 && g.data <= ontem).reduce((a, g) => a + g.valor, 0)
      const gasto1d = e.gastos.filter(g => g.data === d1).reduce((a, g) => a + g.valor, 0)

      const receitaPeriodo = e.vendas.filter(v => dia(v.data) >= dInicio && dia(v.data) <= dFim).reduce((a, v) => a + v.liquido, 0)
      const receita7d = e.vendas.filter(v => dia(v.data) >= d7 && dia(v.data) <= ontem).reduce((a, v) => a + v.liquido, 0)
      const receita3d = e.vendas.filter(v => dia(v.data) >= d3 && dia(v.data) <= ontem).reduce((a, v) => a + v.liquido, 0)
      const receita1d = e.vendas.filter(v => dia(v.data) === d1).reduce((a, v) => a + v.liquido, 0)
      const vendasPeriodo = e.vendas.filter(v => dia(v.data) >= dInicio && dia(v.data) <= dFim).length

      const roas7d = gasto7d > 0 ? calcularRoas(receita7d, gasto7d) : null
      const roas3d = gasto3d > 0 ? calcularRoas(receita3d, gasto3d) : null
      const roas1d = gasto1d > 0 ? calcularRoas(receita1d, gasto1d) : null
      const roasPeriodo = gastoPeriodo > 0 ? calcularRoas(receitaPeriodo, gastoPeriodo) : null

      linhas.push({
        criativo: e.criativo,
        ad_name: e.ad_name ?? e.criativo,
        campaign_name: e.campaign_name,
        fase: e.faseSck ?? detectarFaseCampaign(e.campaign_name),
        gasto_periodo: gastoPeriodo,
        receita_periodo: receitaPeriodo,
        roas_periodo: roasPeriodo,
        lucro_periodo: receitaPeriodo - gastoPeriodo,
        vendas_periodo: vendasPeriodo,
        gasto_7d: gasto7d,
        gasto_3d: gasto3d,
        gasto_1d: gasto1d,
        roas_7d: roas7d,
        roas_3d: roas3d,
        roas_1d: roas1d,
        acao: aplicarRegras(roas7d, roas3d, roas1d, ROAS_MINIMO, regras),
      })
    }

    // Ordena por gasto do período (maior primeiro) — foco no que consome verba
    linhas.sort((a, b) => b.gasto_periodo - a.gasto_periodo)

    return NextResponse.json({ criativos: linhas, roasMinimo: ROAS_MINIMO })
  } catch (err) {
    console.error('[performance-v2]', err)
    return NextResponse.json({ error: `Erro interno: ${err}` }, { status: 500 })
  }
}
