import { NextRequest, NextResponse } from 'next/server'
import { toZonedTime } from 'date-fns-tz'
import { format, subDays } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase'
import { getDashboardData } from '@/app/actions/dashboard'
import { spRangeISO } from '@/lib/utils'
import { GET as performanceV2 } from '@/app/api/performance-v2/route'
import { GET as vendasBreakdown } from '@/app/api/dashboard/vendas-breakdown/route'

// Servidor MCP (Streamable HTTP, sem estado) pra conectar a The Track no Claude
// como "conector personalizado". URL: https://www.thetrack.com.br/api/mcp/<token>
// — o token fica em configuracoes.mcp_token e é gerado em Configurações.
// Só LEITURA: nenhuma ferramenta daqui escreve em vendas/gastos.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TZ = 'America/Sao_Paulo'
const PROTOCOLO = '2025-06-18'
const hojeSP = () => format(toZonedTime(new Date(), TZ), 'yyyy-MM-dd')
const diaSP = (n: number) => format(subDays(toZonedTime(new Date(), TZ), n), 'yyyy-MM-dd')
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

const periodo = {
  inicio: { type: 'string', description: 'Data inicial yyyy-MM-dd (fuso de São Paulo). Padrão: 7 dias atrás.' },
  fim: { type: 'string', description: 'Data final yyyy-MM-dd, inclusiva. Padrão: hoje.' },
}

const TOOLS = [
  {
    name: 'resumo_periodo',
    description: 'Métricas gerais de um período: faturamento líquido, gasto em anúncios (Meta), ROAS, lucro, vendas, imposto, reembolsos, CPM e CPA médios.',
    inputSchema: {
      type: 'object',
      properties: {
        ...periodo,
        fonte: { type: 'string', enum: ['Qualquer', 'pago', 'organico'], description: 'pago = vendas com criativo; organico = sem criativo. Padrão: Qualquer.' },
      },
    },
  },
  {
    name: 'metricas_por_dia',
    description: 'Faturamento líquido, gasto, ROAS e número de vendas dia a dia no período. Bom pra tendência e comparação entre dias.',
    inputSchema: { type: 'object', properties: periodo },
  },
  {
    name: 'performance_criativos',
    description: 'Performance por criativo (código do anúncio): gasto, receita, lucro e ROAS em 7d/3d/1d fechados (até ontem) + hoje em tempo real, fase e ação sugerida pelo framework (escalar/manter/pausar).',
    inputSchema: {
      type: 'object',
      properties: {
        ordenar_por: { type: 'string', enum: ['lucro_7d', 'gasto_7d', 'roas_7d', 'receita_7d', 'gasto_hoje'], description: 'Padrão: lucro_7d.' },
        limite: { type: 'number', description: 'Máximo de criativos. Padrão: 50.' },
      },
    },
  },
  {
    name: 'vendas_breakdown',
    description: 'Vendas quebradas por produto, por forma de pagamento e por criativo (front, upsell, reembolsos) num período.',
    inputSchema: { type: 'object', properties: periodo },
  },
]

function lerPeriodo(args: any): { inicio: string; fim: string } {
  const inicio = DATA_RE.test(args?.inicio ?? '') ? args.inicio : diaSP(6)
  const fim = DATA_RE.test(args?.fim ?? '') ? args.fim : hojeSP()
  return { inicio, fim }
}

async function dashboard(inicio: string, fim: string, fonte: any = 'Qualquer') {
  const { desde, ate } = spRangeISO(inicio, fim)
  const d: any = await getDashboardData('Qualquer', desde, ate, fonte)
  if (!d?.success) throw new Error(d?.error ?? 'Falha ao carregar métricas')
  return d
}

async function executar(nome: string, args: any): Promise<unknown> {
  if (nome === 'resumo_periodo') {
    const { inicio, fim } = lerPeriodo(args)
    const fonte = ['pago', 'organico'].includes(args?.fonte) ? args.fonte : 'Qualquer'
    const { metrics: m } = await dashboard(inicio, fim, fonte)
    return { periodo: { inicio, fim }, fonte, moeda: 'BRL', ...m, lucro: m.revenue - m.spend - m.imposto }
  }

  if (nome === 'metricas_por_dia') {
    const { inicio, fim } = lerPeriodo(args)
    const d = await dashboard(inicio, fim)
    const dias = new Map<string, { faturamento: number; gasto: number; vendas: number }>()
    const dia = (k: string) => {
      if (!dias.has(k)) dias.set(k, { faturamento: 0, gasto: 0, vendas: 0 })
      return dias.get(k)!
    }
    for (const v of d.vendas ?? []) {
      // vendas.data é timestamp → dia no fuso de SP. gastos.data já é DATE puro.
      const k = format(toZonedTime(new Date(v.data), TZ), 'yyyy-MM-dd')
      const x = dia(k)
      x.faturamento += Number(v.valor_liquido ?? v.valor ?? 0)
      x.vendas += 1
    }
    for (const g of d.gastos ?? []) dia(String(g.data).slice(0, 10)).gasto += Number(g.valor_gasto ?? 0)
    const linhas = [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, x]) => ({
      data, ...x, roas: x.gasto > 0 ? +(x.faturamento / x.gasto).toFixed(2) : null,
    }))
    return {
      periodo: { inicio, fim }, moeda: 'BRL', dias: linhas,
      obs: 'faturamento por dia usa valor_liquido cru; o total oficial (com reembolso imputado) está em resumo_periodo.',
    }
  }

  if (nome === 'performance_criativos') {
    const r = await performanceV2(new Request('http://local/api/performance-v2'))
    const p: any = await r.json()
    const campo = ['gasto_7d', 'roas_7d', 'receita_7d', 'gasto_hoje'].includes(args?.ordenar_por) ? args.ordenar_por : 'lucro_7d'
    const limite = Math.min(Math.max(Number(args?.limite) || 50, 1), 500)
    const criativos = [...(p.criativos ?? [])]
      .sort((a: any, b: any) => (b[campo] ?? -Infinity) - (a[campo] ?? -Infinity))
      .slice(0, limite)
      .map(({ chave, ...c }: any) => c)
    return { roas_minimo: p.roasMinimo, total: p.criativos?.length ?? 0, ordenado_por: campo, criativos }
  }

  if (nome === 'vendas_breakdown') {
    const { inicio, fim } = lerPeriodo(args)
    const r = await vendasBreakdown(new NextRequest(`http://local/api/dashboard/vendas-breakdown?d_inicio=${inicio}&d_fim=${fim}`))
    return { periodo: { inicio, fim }, moeda: 'BRL', ...(await r.json()) }
  }

  throw new Error(`Ferramenta desconhecida: ${nome}`)
}

async function tokenValido(token: string) {
  if (!token || token.length < 20) return false
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'mcp_token').maybeSingle()
  return !!data?.valor && data.valor === token
}

const ok = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result })
const erro = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

async function responder(msg: any) {
  const { id, method, params } = msg ?? {}
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: params?.protocolVersion ?? PROTOCOLO,
      capabilities: { tools: {} },
      serverInfo: { name: 'the-track', version: '1.0.0' },
      instructions: 'Dados de vendas (Hotmart) e gasto (Meta Ads) da The Track. Valores em BRL, datas no fuso de São Paulo. Hoje é ' + hojeSP() + '.',
    })
  }
  if (method === 'ping') return ok(id, {})
  if (method === 'tools/list') return ok(id, { tools: TOOLS })
  if (method === 'tools/call') {
    try {
      const dados = await executar(params?.name, params?.arguments ?? {})
      return ok(id, { content: [{ type: 'text', text: JSON.stringify(dados) }] })
    } catch (e: any) {
      return ok(id, { isError: true, content: [{ type: 'text', text: `Erro: ${e?.message ?? e}` }] })
    }
  }
  return erro(id, -32601, `Método não suportado: ${method}`)
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/mcp/[token]'>) {
  const { token } = await ctx.params
  if (!(await tokenValido(token))) return NextResponse.json(erro(null, -32001, 'Token inválido'), { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json(erro(null, -32700, 'JSON inválido'), { status: 400 }) }

  const lote = Array.isArray(body) ? body : [body]
  // Notificações (sem id) não têm resposta.
  const comId = lote.filter((m) => m && m.id !== undefined && m.id !== null)
  if (!comId.length) return new NextResponse(null, { status: 202 })
  const respostas = await Promise.all(comId.map(responder))
  return NextResponse.json(Array.isArray(body) ? respostas : respostas[0])
}

// Sem stream de servidor → cliente cai no modo só-POST.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}
