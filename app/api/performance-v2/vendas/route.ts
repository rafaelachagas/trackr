import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { subDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { criarResolvedor, casaChave } from '@/lib/meta-chave'

const TIMEZONE = 'America/Sao_Paulo'
// Mesma regra do /api/performance-v2: conta reclamada/refunded/chargeback (o
// criativo vendeu; o que aconteceu depois é sinal de qualidade, não desconta
// do ROAS de escala). Só cancelled/expired ficam fora.
const STATUS_RECEITA = ['approved', 'reclamada', 'refunded', 'chargeback']

// faseToken/flagsToken vêm de @/lib/meta-chave (mesma normalização da v2, com o
// marcador de retest) — tem que ser a MESMA função pra chave do modal casar.

/**
 * PROVA REAL DA RECEITA: lista as vendas que compõem o faturamento de uma
 * campanha (chave código|fase|flags) na janela de 7 dias fechados da v2.
 * Serve pra cruzar cada venda com a Hotmart.
 */
export async function GET(req: NextRequest) {
  try {
    const chave = req.nextUrl.searchParams.get('chave') || ''
    const [codigo] = chave.split('|')
    if (!codigo) return NextResponse.json({ error: 'chave inválida' }, { status: 400 })

    const agora = toZonedTime(new Date(), TIMEZONE)
    const hoje = format(agora, 'yyyy-MM-dd')
    const ontem = format(subDays(agora, 1), 'yyyy-MM-dd')
    const d7 = format(subDays(agora, 7), 'yyyy-MM-dd')
    const diaSP = (iso: string) => format(toZonedTime(new Date(iso), TIMEZONE), 'yyyy-MM-dd')

    type V = { sck: string | null; valor: number; valor_liquido: number | null; data: string; produto: string | null; tipo: string | null; buyer_email: string | null; transaction_id: string; atribuicao_manual: boolean | null; status: string }
    const todas: V[] = []
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabaseAdmin
        .from('vendas')
        .select('sck, valor, valor_liquido, data, produto, tipo, buyer_email, transaction_id, atribuicao_manual, status')
        .in('status', STATUS_RECEITA)
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

    // Gastos do criativo na mesma janela da tabela: é com eles que se decide em
    // qual campanha cada venda cai (lib/meta-chave → criarResolvedor).
    const { data: gastos, error: erroGastos } = await supabaseAdmin
      .from('gastos')
      .select('criativo, campaign_name, ad_name')
      .not('ad_id', 'is', null)
      .eq('criativo', codigo)
      .gte('data', d7)
      .lte('data', hoje)
      .limit(1000)
    if (erroGastos) throw erroGastos
    const chaves = criarResolvedor(gastos ?? [])

    const vendas = todas.filter((v) => {
      const d = diaSP(v.data)
      if (d < d7 || d > ontem) return false
      return casaChave(chaves.doVenda(codigo, v.sck), chave)
    }).map((v) => ({
      data: v.data,
      produto: v.produto,
      tipo: v.tipo,
      valor_liquido: Number(v.valor_liquido ?? v.valor) || 0,
      // e-mail mascarado — o suficiente pra reconhecer sem expor o dado todo
      email: (v.buyer_email || '').replace(/^(.{2}).*(@.*)$/, '$1•••$2'),
      transaction_id: v.transaction_id,
      status: v.status,
      atribuicao_manual: !!v.atribuicao_manual,
    }))

    const total = vendas.reduce((a, v) => a + v.valor_liquido, 0)
    return NextResponse.json({ vendas, total, periodo: { de: d7, ate: ontem } })
  } catch (err: any) {
    console.error('[performance-v2/vendas]', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 })
  }
}
