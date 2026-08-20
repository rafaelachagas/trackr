import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { faseToken, flagsToken } from '@/lib/meta-chave'
import { calcularRoas } from '@/lib/utils'
import { subDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { AcaoOtimizacao } from '@/types'

/**
 * SNAPSHOT DIÁRIO — memória protegida do performance-v2.
 *
 * performance-v2 (app/api/performance-v2/route.ts) recalcula tudo ao vivo, a
 * partir de `vendas`/`gastos`. Isso é ótimo pra decisão em tempo real, mas
 * significa que se essas tabelas forem editadas, corrigidas (como fizemos com
 * o sck/câmbio) ou perderem dados no futuro, o número histórico que embasou
 * uma decisão de escalar/pausar um criativo também muda ou desaparece — não
 * dá pra provar depois "o que a gente viu naquele dia".
 *
 * Essa rota congela, por criativo (chave = código|fase|flags, mesma
 * normalização do performance-v2 — ver lib/meta-chave.ts), o gasto/receita/
 * ROAS de UM DIA FECHADO específico, e grava em performance_criativo_snapshot.
 * Roda 1x/dia via cron (ver vercel.json) pro dia que acabou de fechar, mas
 * aceita ?data=YYYY-MM-DD pra backfill manual de qualquer dia.
 *
 * NÃO decide nada (sem framework/ação de escala aqui) — é só o registro
 * histórico do que aconteceu. Depois de gravado, nunca é sobrescrito por dias
 * antigos (só grava se a linha ainda não existir pra aquele data+chave) —
 * assim nenhuma reconciliação futura de vendas.sck reescreve a história.
 */

export const maxDuration = 60
const TIMEZONE = 'America/Sao_Paulo'
const STATUS_RECEITA = ['approved', 'reclamada', 'refunded', 'chargeback']

const REGRAS_ORDEM: AcaoOtimizacao[] = ['+20% orçamento', 'Manter', '-20% ou pausar', 'Pausar']

async function snapshotDia(dia: string): Promise<{ dia: string; linhas: number; jaExistiam: number }> {
  type GastoRow = { criativo: string | null; campaign_name: string | null; ad_name: string | null; valor_gasto: number }
  type VendaRow = { criativo: string | null; sck: string | null; valor: number; valor_liquido: number | null; data: string }

  const diaSP = (iso: string) => format(toZonedTime(new Date(iso), TIMEZONE), 'yyyy-MM-dd')

  const [{ data: gastos }, { data: vendasRaw }] = await Promise.all([
    supabaseAdmin
      .from('gastos')
      .select('criativo, campaign_name, ad_name, valor_gasto')
      .not('ad_id', 'is', null)
      .eq('data', dia),
    supabaseAdmin
      .from('vendas')
      .select('criativo, sck, valor, valor_liquido, data')
      .in('status', STATUS_RECEITA)
      .not('transaction_id', 'like', 'manual_%')
      .not('criativo', 'is', null)
      .gte('data', `${dia}T00:00:00-03:00`)
      .lte('data', `${dia}T23:59:59.999-03:00`),
  ])

  const vendas = ((vendasRaw ?? []) as VendaRow[]).filter((v) => diaSP(v.data) === dia)

  type Entrada = { codigo: string; fase: string | null; ad_name: string | null; campaign_name: string | null; gasto: number; receita: number; vendasCount: number }
  const mapa = new Map<string, Entrada>()

  function getEntrada(key: string, codigo: string, fase: string | null): Entrada {
    let e = mapa.get(key)
    if (!e) {
      e = { codigo, fase, ad_name: null, campaign_name: null, gasto: 0, receita: 0, vendasCount: 0 }
      mapa.set(key, e)
    }
    if (!e.fase && fase) e.fase = fase
    return e
  }

  for (const g of (gastos ?? []) as GastoRow[]) {
    if (!g.criativo) continue
    const fase = faseToken(g.campaign_name)
    const key = `${g.criativo}|${fase ?? '?'}|${flagsToken(g.ad_name)}`
    const e = getEntrada(key, g.criativo, fase)
    e.gasto += Number(g.valor_gasto) || 0
    if (!e.ad_name) e.ad_name = g.ad_name
    if (!e.campaign_name) e.campaign_name = g.campaign_name
  }

  for (const v of vendas) {
    if (!v.criativo) continue
    const parte0 = (v.sck || '').split('|')[0]
    const fase = faseToken(parte0)
    const key = `${v.criativo}|${fase ?? '?'}|${flagsToken(v.sck)}`
    const e = getEntrada(key, v.criativo, fase)
    e.receita += Number(v.valor_liquido ?? v.valor) || 0
    e.vendasCount++
    if (!e.ad_name) e.ad_name = (v.sck || '').split('|')[2] || null
  }

  const linhas = [...mapa.entries()]
    .filter(([, e]) => e.gasto >= 1 || e.receita > 0) // ignora ruído de centavos
    .map(([chave, e]) => {
      const roas = e.gasto > 0 ? calcularRoas(e.receita, e.gasto) : null
      return {
        data: dia,
        chave,
        criativo: e.codigo,
        fase: e.fase,
        ad_name: e.ad_name,
        campaign_name: e.campaign_name,
        gasto: Math.round(e.gasto * 100) / 100,
        receita: Math.round(e.receita * 100) / 100,
        vendas_count: e.vendasCount,
        roas,
        acao: null as AcaoOtimizacao | null,
      }
    })

  if (linhas.length === 0) return { dia, linhas: 0, jaExistiam: 0 }

  // Não sobrescreve dias já congelados — o snapshot é a fonte da verdade
  // histórica; só preenche o que ainda não existe pra essa data+chave.
  const { data: existentes } = await supabaseAdmin
    .from('performance_criativo_snapshot')
    .select('chave')
    .eq('data', dia)
  const chavesExistentes = new Set((existentes ?? []).map((r: any) => r.chave))
  const novas = linhas.filter((l) => !chavesExistentes.has(l.chave))

  if (novas.length > 0) {
    const { error } = await supabaseAdmin.from('performance_criativo_snapshot').insert(novas)
    if (error) throw error
  }

  return { dia, linhas: novas.length, jaExistiam: chavesExistentes.size }
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const agora = toZonedTime(new Date(), TIMEZONE)
  const diaParam = req.nextUrl.searchParams.get('data')
  const diasBackfill = Math.min(Number(req.nextUrl.searchParams.get('dias') ?? '1') || 1, 30)

  try {
    const dias = diaParam
      ? [diaParam]
      : Array.from({ length: diasBackfill }, (_, i) => format(subDays(agora, i + 1), 'yyyy-MM-dd')) // padrão: dia fechado = ontem

    const resultados = []
    for (const dia of dias) {
      console.log('[SnapshotCriativo] Processando', dia)
      resultados.push(await snapshotDia(dia))
    }
    console.log('[SnapshotCriativo] Concluído:', JSON.stringify(resultados))
    return NextResponse.json({ success: true, resultados })
  } catch (e: any) {
    console.error('[SnapshotCriativo] Erro:', e.message)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}
