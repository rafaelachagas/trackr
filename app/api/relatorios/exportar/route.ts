import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPeriodoDatas } from '@/lib/utils'
import { PeriodoDashboard } from '@/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const periodo = (searchParams.get('periodo') ?? '7d') as PeriodoDashboard
  const formato = searchParams.get('formato') ?? 'csv'

  const { inicio, fim } = getPeriodoDatas(periodo)

  const { data: vendas, error } = await supabaseAdmin
    .from('vendas')
    .select('*')
    .eq('status', 'approved')
    .gte('data', inicio)
    .lte('data', fim)
    .order('data', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (formato === 'csv') {
    const cabecalho = [
      'ID',
      'Data',
      'Produto',
      'Tipo',
      'Valor',
      'Criativo',
      'VSL',
      'SCK',
      'Email',
      'Status',
    ].join(',')

    const linhas = (vendas ?? []).map((v) =>
      [
        v.transaction_id,
        new Date(v.data).toLocaleString('pt-BR'),
        `"${v.produto}"`,
        v.tipo,
        v.valor.toFixed(2).replace('.', ','),
        v.criativo ?? '',
        v.vsl ?? '',
        v.sck ?? '',
        v.buyer_email ?? '',
        v.status,
      ].join(',')
    )

    const csv = [cabecalho, ...linhas].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendas-${periodo}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  }

  return NextResponse.json(vendas ?? [])
}
