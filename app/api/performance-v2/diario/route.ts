import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { subDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const TIMEZONE = 'America/Sao_Paulo'
// Mesma regra do /api/performance-v2: conta reclamada/refunded/chargeback pelo
// valor cheio (o criativo vendeu; reembolso é sinal de qualidade, não desconta
// do ROAS de escala). Só cancelled/expired ficam fora.
const STATUS_RECEITA = ['approved', 'reclamada', 'refunded', 'chargeback']

// Mesma normalização do /api/performance-v2 (código | fase | flags bmsub/bmus/v2).
const faseToken = (t: string | null): string | null => {
  const m = (t || '').toLowerCase().match(/fase\s*0?([123])/)
  return m ? `FASE0${m[1]}` : null
}
const flagsToken = (t: string | null): string => {
  const s = (t || '').toLowerCase()
  return `${s.includes('bmsub') ? 'S' : '-'}${s.includes('bmus') ? 'U' : '-'}${/(^|[^a-z0-9])v2([^0-9]|$)/.test(s) ? '2' : '-'}`
}

/**
 * QUEBRA DIA A DIA do gasto/receita de uma campanha (chave código|fase|flags),
 * pra qualquer janela (7/3/1). Serve pra abrir ao clicar num ROAS e ver a conta
 * completa: dia a dia + total acumulado — a mesma "prova real" que o modal de
 * faturamento já dá, só que também mostrando o gasto.
 */
export async function GET(req: NextRequest) {
  try {
    const chave = req.nextUrl.searchParams.get('chave') || ''
    const janela = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get('janela')) || 7))
    const [codigo, faseAlvo, flagsAlvo] = chave.split('|')
    if (!codigo) return NextResponse.json({ error: 'chave inválida' }, { status: 400 })

    const agora = toZonedTime(new Date(), TIMEZONE)
    const hoje = format(agora, 'yyyy-MM-dd')
    const ontem = format(subDays(agora, 1), 'yyyy-MM-dd')
    const inicio = format(subDays(agora, janela), 'yyyy-MM-dd')
    const diaSP = (iso: string) => format(toZonedTime(new Date(iso), TIMEZONE), 'yyyy-MM-dd')

    async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
      const out: T[] = []
      for (let off = 0; ; off += 1000) {
        const { data, error } = await build(off, off + 999)
        if (error) throw error
        if (!data || data.length === 0) break
        out.push(...(data as T[]))
        if (data.length < 1000) break
      }
      return out
    }

    type G = { valor_gasto: number; data: string; campaign_name: string | null; ad_name: string | null; criativo: string | null }
    type V = { sck: string | null; valor: number; valor_liquido: number | null; data: string; criativo: string | null }

    const [gastos, vendas] = await Promise.all([
      fetchAll<G>((f, t) => supabaseAdmin.from('gastos').select('valor_gasto, data, campaign_name, ad_name, criativo')
        .not('ad_id', 'is', null).eq('criativo', codigo).gte('data', inicio).lte('data', ontem).range(f, t)),
      fetchAll<V>((f, t) => supabaseAdmin.from('vendas').select('sck, valor, valor_liquido, data, criativo')
        .in('status', STATUS_RECEITA).not('transaction_id', 'like', 'manual_%').eq('criativo', codigo)
        .gte('data', `${inicio}T00:00:00`).lte('data', `${hoje}T23:59:59`).range(f, t)),
    ])

    const gastoDaChave = gastos.filter((g) => (faseToken(g.campaign_name) ?? '?') === faseAlvo && flagsToken(g.ad_name) === flagsAlvo)
    const vendaDaChave = vendas.filter((v) => {
      const parte0 = (v.sck || '').split('|')[0]
      return (faseToken(parte0) ?? '?') === faseAlvo && flagsToken(v.sck) === flagsAlvo
    })

    // Monta os dias da janela (inicio..ontem), mesmo os sem gasto/venda.
    const dias: { data: string; gasto: number; receita: number; roas: number | null }[] = []
    for (let n = janela; n >= 1; n--) {
      const dia = format(subDays(agora, n), 'yyyy-MM-dd')
      const gastoDia = gastoDaChave.filter((g) => g.data === dia).reduce((a, g) => a + (Number(g.valor_gasto) || 0), 0)
      const receitaDia = vendaDaChave.filter((v) => diaSP(v.data) === dia).reduce((a, v) => a + (Number(v.valor_liquido ?? v.valor) || 0), 0)
      dias.push({ data: dia, gasto: gastoDia, receita: receitaDia, roas: gastoDia > 0 ? receitaDia / gastoDia : null })
    }

    const totalGasto = dias.reduce((a, d) => a + d.gasto, 0)
    const totalReceita = dias.reduce((a, d) => a + d.receita, 0)

    return NextResponse.json({
      dias,
      total: { gasto: totalGasto, receita: totalReceita, roas: totalGasto > 0 ? totalReceita / totalGasto : null },
      periodo: { de: inicio, ate: ontem },
    })
  } catch (err: any) {
    console.error('[performance-v2/diario]', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 })
  }
}
