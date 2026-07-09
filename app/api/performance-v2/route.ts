import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { calcularRoas } from '@/lib/utils'
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
  chave: string        // código|fase|flags — usado pra listar as vendas (prova real)
  // Headline = janela de 7 DIAS FECHADOS (terminando ONTEM). Hoje fica de fora.
  gasto_7d: number
  receita_7d: number
  lucro_7d: number
  vendas_7d: number
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

    // FORMATO FRAMEWORK: janelas de DIAS FECHADOS terminando ONTEM. HOJE (dia
    // incompleto) NUNCA entra — é o dia em que a decisão é tomada. O filtro de
    // período do topo é ignorado aqui de propósito (real-time fica pra outra visão).
    const hoje = format(agora, 'yyyy-MM-dd')
    const ontem = format(subDays(agora, 1), 'yyyy-MM-dd')       // fim de todas as janelas
    const d7 = format(subDays(agora, 7), 'yyyy-MM-dd')          // 7 dias fechados: [d7 .. ontem]
    const d3 = format(subDays(agora, 3), 'yyyy-MM-dd')          // 3 dias fechados: [d3 .. ontem]
    const d1 = ontem                                            // 1 dia fechado: ontem

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

    type GastoRow = { criativo: string | null; campaign_name: string | null; ad_name: string | null; valor_gasto: number; data: string }
    type VendaRow = { criativo: string | null; sck: string | null; fase: string | null; campanha: string | null; valor: number; valor_liquido: number | null; data: string; tipo: string | null }

    // gastos.data já é DATE em SP (date_start da Meta). vendas.data é timestamptz
    // (UTC): busco de d7 até o fim de HOJE em UTC e depois bucketo pela DATA de
    // São Paulo — senão vendas perto da meia-noite caem no dia errado e o ROAS
    // (principalmente o de 1D) sai furado.
    const [gastos, vendas] = await Promise.all([
      fetchAll<GastoRow>((from, to) =>
        supabaseAdmin
          .from('gastos')
          .select('criativo, campaign_name, ad_name, valor_gasto, data')
          .not('ad_id', 'is', null)
          .gte('data', d7)
          .lte('data', ontem)
          .range(from, to)
      ),
      fetchAll<VendaRow>((from, to) =>
        supabaseAdmin
          .from('vendas')
          .select('criativo, sck, fase, campanha, valor, valor_liquido, data, tipo')
          .eq('status', 'approved')
          .not('transaction_id', 'like', 'manual_%')
          .not('criativo', 'is', null)
          .gte('data', `${d7}T00:00:00`)
          .lte('data', `${hoje}T23:59:59`)
          .range(from, to)
      ),
    ])

    // CHAVE = CAMPANHA NORMALIZADA: código + fase + marcadores (bmsub/bmus/v2).
    // Casar por nome completo do anúncio é frágil — um typo no sck já quebra o
    // match (ex: ad12 "rendas-extra-escala" no sck vs "rendas-extras-escala" na
    // Meta) e a receita se perde. A fase vem do part[0] do sck / do campaign_name
    // e os marcadores são tokens curtos e estáveis. Validado: 0 campanhas com
    // gasto sem receita casada. Assim pre-escala-v2, escala-v2, bmsub e bmus
    // (mesmo criativo, campanhas diferentes) viram linhas separadas com ROAS próprio.
    const faseToken = (t: string | null): string | null => {
      const m = (t || '').toLowerCase().match(/fase\s*0?([123])/)
      return m ? `FASE0${m[1]}` : null
    }
    const flagsToken = (t: string | null): string => {
      const s = (t || '').toLowerCase()
      const bmsub = s.includes('bmsub') ? 'S' : '-'
      const bmus = s.includes('bmus') ? 'U' : '-'
      const v2 = /(^|[^a-z0-9])v2([^0-9]|$)/.test(s) ? '2' : '-'
      return `${bmsub}${bmus}${v2}`
    }

    type Entrada = {
      codigo: string
      fase: string | null
      campaign_name: string | null
      adNames: Map<string, number> // ad_name -> gasto acumulado (p/ o nome representativo)
      sckName: string | null       // nome do anúncio pelo sck (fallback quando só há venda)
      gastos: { valor: number; data: string }[]
      vendas: { liquido: number; data: string }[]
    }
    const mapa = new Map<string, Entrada>()

    function getEntrada(key: string, codigo: string, fase: string | null): Entrada {
      let e = mapa.get(key)
      if (!e) {
        e = { codigo, fase, campaign_name: null, adNames: new Map(), sckName: null, gastos: [], vendas: [] }
        mapa.set(key, e)
      }
      if (!e.fase && fase) e.fase = fase
      return e
    }

    for (const g of gastos) {
      if (!g.criativo) continue
      const fase = faseToken(g.campaign_name)
      const key = `${g.criativo}|${fase ?? '?'}|${flagsToken(g.ad_name)}`
      const e = getEntrada(key, g.criativo, fase)
      const val = Number(g.valor_gasto) || 0
      e.gastos.push({ valor: val, data: g.data })
      if (g.ad_name) e.adNames.set(g.ad_name, (e.adNames.get(g.ad_name) ?? 0) + val)
      if (!e.campaign_name && g.campaign_name) e.campaign_name = g.campaign_name
    }

    for (const v of vendas) {
      if (!v.criativo) continue
      const parte0 = (v.sck || '').split('|')[0]
      const fase = faseToken(parte0)
      const key = `${v.criativo}|${fase ?? '?'}|${flagsToken(v.sck)}`
      const e = getEntrada(key, v.criativo, fase)
      e.vendas.push({ liquido: Number(v.valor_liquido ?? v.valor) || 0, data: v.data })
      if (!e.sckName) e.sckName = (v.sck || '').split('|')[2] || null
    }

    // DATA da venda no fuso de São Paulo (não a data UTC crua do timestamptz).
    const diaSP = (iso: string) => format(toZonedTime(new Date(iso), TIMEZONE), 'yyyy-MM-dd')

    const linhas: CriativoV2[] = []
    for (const [chave, e] of mapa.entries()) {
      const gasto7d = e.gastos.filter(g => g.data >= d7 && g.data <= ontem).reduce((a, g) => a + g.valor, 0)
      const gasto3d = e.gastos.filter(g => g.data >= d3 && g.data <= ontem).reduce((a, g) => a + g.valor, 0)
      const gasto1d = e.gastos.filter(g => g.data === d1).reduce((a, g) => a + g.valor, 0)

      const vend7d = e.vendas.filter(v => { const d = diaSP(v.data); return d >= d7 && d <= ontem })
      const vend3d = e.vendas.filter(v => { const d = diaSP(v.data); return d >= d3 && d <= ontem })
      const vend1d = e.vendas.filter(v => diaSP(v.data) === d1)

      const receita7d = vend7d.reduce((a, v) => a + v.liquido, 0)
      const receita3d = vend3d.reduce((a, v) => a + v.liquido, 0)
      const receita1d = vend1d.reduce((a, v) => a + v.liquido, 0)

      const roas7d = gasto7d > 0 ? calcularRoas(receita7d, gasto7d) : null
      const roas3d = gasto3d > 0 ? calcularRoas(receita3d, gasto3d) : null
      const roas1d = gasto1d > 0 ? calcularRoas(receita1d, gasto1d) : null

      // Só anúncios que realmente RODARAM (gastaram) na janela de 7 dias fechados.
      // Descarta restos de campanhas pausadas com centavos de gasto — eles não são
      // anúncios que você roda e ainda geram ROAS lixo (ex: R$0,35 → 674x).
      if (gasto7d < 1) continue

      // ad_name representativo = o de maior gasto da campanha; senão o nome do sck.
      let adNameRep = e.sckName ?? e.codigo
      let maxG = -1
      for (const [nome, g] of e.adNames) { if (g > maxG) { maxG = g; adNameRep = nome } }

      linhas.push({
        criativo: e.codigo,
        ad_name: adNameRep,
        campaign_name: e.campaign_name,
        fase: e.fase ?? detectarFaseCampaign(e.campaign_name),
        chave,
        gasto_7d: gasto7d,
        receita_7d: receita7d,
        lucro_7d: receita7d - gasto7d,
        vendas_7d: vend7d.length,
        gasto_3d: gasto3d,
        gasto_1d: gasto1d,
        roas_7d: roas7d,
        roas_3d: roas3d,
        roas_1d: roas1d,
        acao: aplicarRegras(roas7d, roas3d, roas1d, ROAS_MINIMO, regras),
      })
    }

    // Ordena por gasto de 7d (maior primeiro) — foco no que consome verba
    linhas.sort((a, b) => b.gasto_7d - a.gasto_7d)

    return NextResponse.json({ criativos: linhas, roasMinimo: ROAS_MINIMO })
  } catch (err) {
    console.error('[performance-v2]', err)
    return NextResponse.json({ error: `Erro interno: ${err}` }, { status: 500 })
  }
}
