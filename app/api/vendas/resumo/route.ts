import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Resumo fidedigno das vendas REAIS da Hotmart (não-manuais) num período.
 * Roda no servidor com service role e pagina com ORDER BY estável — o cálculo
 * client-side batia no teto de 1000 linhas do PostgREST e subcontava tudo.
 * Lançamentos manuais (transaction_id 'manual_%') ficam de fora: aqui é a saúde
 * da integração Hotmart, não os lançamentos que o usuário sobe à mão.
 */
export async function GET(request: NextRequest) {
  try {
    const dias = Math.min(parseInt(request.nextUrl.searchParams.get('dias') ?? '30') || 30, 365)
    const inicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

    // Paginação estável (order by id) — sem isso o PostgREST repete/pula linhas.
    const rows: { transaction_id: string; valor: number; valor_liquido: number | null; buyer_email: string | null; tipo: string | null }[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin
        .from('vendas')
        .select('transaction_id, valor, valor_liquido, buyer_email, tipo')
        .eq('status', 'approved')
        .not('transaction_id', 'like', 'manual_%')
        .gte('data', inicio)
        .order('id', { ascending: true })
        .range(offset, offset + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      rows.push(...(data as any))
      if (data.length < 1000) break
    }

    const clientes = new Set(rows.map((r) => r.buyer_email).filter(Boolean)).size
    const receitaBruta = rows.reduce((a, r) => a + Number(r.valor || 0), 0)
    const receitaLiquida = rows.reduce((a, r) => a + Number(r.valor_liquido ?? r.valor ?? 0), 0)
    const front = rows.filter((r) => r.tipo === 'front').length
    const upsell = rows.filter((r) => r.tipo === 'upsell').length

    return NextResponse.json({
      dias,
      vendas: rows.length,
      clientes,
      receitaBruta,
      receitaLiquida,
      front,
      upsell,
    })
  } catch (err: any) {
    console.error('[vendas/resumo]', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 })
  }
}
