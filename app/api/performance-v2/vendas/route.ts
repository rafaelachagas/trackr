import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { subDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const TIMEZONE = 'America/Sao_Paulo'

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
 * PROVA REAL DA RECEITA: lista as vendas que compõem o faturamento de uma
 * campanha (chave código|fase|flags) na janela de 7 dias fechados da v2.
 * Serve pra cruzar cada venda com a Hotmart.
 */
export async function GET(req: NextRequest) {
  try {
    const chave = req.nextUrl.searchParams.get('chave') || ''
    const [codigo, faseAlvo, flagsAlvo] = chave.split('|')
    if (!codigo) return NextResponse.json({ error: 'chave inválida' }, { status: 400 })

    const agora = toZonedTime(new Date(), TIMEZONE)
    const hoje = format(agora, 'yyyy-MM-dd')
    const ontem = format(subDays(agora, 1), 'yyyy-MM-dd')
    const d7 = format(subDays(agora, 7), 'yyyy-MM-dd')
    const diaSP = (iso: string) => format(toZonedTime(new Date(iso), TIMEZONE), 'yyyy-MM-dd')

    type V = { sck: string | null; valor: number; valor_liquido: number | null; data: string; produto: string | null; tipo: string | null; buyer_email: string | null; transaction_id: string; atribuicao_manual: boolean | null }
    const todas: V[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabaseAdmin
        .from('vendas')
        .select('sck, valor, valor_liquido, data, produto, tipo, buyer_email, transaction_id, atribuicao_manual')
        .eq('status', 'approved')
        .not('transaction_id', 'like', 'manual_%')
        .eq('criativo', codigo)
        .gte('data', `${d7}T00:00:00`)
        .lte('data', `${hoje}T23:59:59`)
        .order('data', { ascending: false })
        .range(off, off + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      todas.push(...(data as any))
      if (data.length < 1000) break
    }

    const vendas = todas.filter((v) => {
      const d = diaSP(v.data)
      if (d < d7 || d > ontem) return false
      const parte0 = (v.sck || '').split('|')[0]
      return (faseToken(parte0) ?? '?') === faseAlvo && flagsToken(v.sck) === flagsAlvo
    }).map((v) => ({
      data: v.data,
      produto: v.produto,
      tipo: v.tipo,
      valor_liquido: Number(v.valor_liquido ?? v.valor) || 0,
      // e-mail mascarado — o suficiente pra reconhecer sem expor o dado todo
      email: (v.buyer_email || '').replace(/^(.{2}).*(@.*)$/, '$1•••$2'),
      transaction_id: v.transaction_id,
      atribuicao_manual: !!v.atribuicao_manual,
    }))

    const total = vendas.reduce((a, v) => a + v.valor_liquido, 0)
    return NextResponse.json({ vendas, total, periodo: { de: d7, ate: ontem } })
  } catch (err: any) {
    console.error('[performance-v2/vendas]', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 })
  }
}
