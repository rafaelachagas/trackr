'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'


export async function getDashboardData(product: string, startDate: string, endDate: string) {
  try {
    // Faturamento vem das vendas REAIS da Hotmart (aprovadas). Os lançamentos
    // manuais (transaction_id 'manual_%') continuam no banco, mas ficam de fora
    // daqui para não contar a mesma venda duas vezes.
    // Paginação: o PostgREST corta em 1000 linhas por request; sem isso a soma
    // sairia subestimada em períodos com muitas vendas.
    async function fetchVendasReais() {
      const todas: { valor: number; valor_liquido: number | null; data: string; tipo: string | null; produto: string | null }[] = []
      for (let offset = 0; ; offset += 1000) {
        let q = supabaseAdmin
          .from('vendas')
          .select('valor, valor_liquido, data, tipo, produto')
          .eq('status', 'approved')
          .not('transaction_id', 'like', 'manual_%')
          .range(offset, offset + 999)
        if (product !== 'Qualquer') q = q.eq('produto', product)
        if (startDate) q = q.gte('data', startDate)
        if (endDate) q = q.lte('data', endDate)
        const { data, error } = await q
        if (error) throw error
        if (!data || data.length === 0) break
        todas.push(...(data as any))
        if (data.length < 1000) break
      }
      return todas
    }

    // Gasto com anúncios vem da conexão com a Meta (registros com ad_id preenchido).
    // Os lançamentos manuais (ad_id null) ficam de fora para não duplicar o gasto.
    // ATENÇÃO: gastos.data é DATE puro. Os filtros chegam como timestamp ISO (UTC);
    // "23:59 de Brasília" vira madrugada do dia SEGUINTE em UTC, e o cast pra date
    // puxava 1 dia extra de gasto no fim do período (painel mostrava dia D + D+1).
    // Converte o timestamp para a DATA local de São Paulo antes de filtrar.
    const isoParaDataLocal = (iso: string) => format(toZonedTime(new Date(iso), 'America/Sao_Paulo'), 'yyyy-MM-dd')
    // Paginação: o PostgREST corta em 1000 linhas por request. Sem isso, períodos
    // longos (mais de ~1000 linhas de anúncio×dia) tinham os dias mais recentes
    // cortados — a sync reinsere os dias recentes com id maior, então eles caíam
    // fora das primeiras 1000 linhas e sumiam do gráfico e do total de gasto.
    async function fetchGastos() {
      const todas: { valor_gasto: number; data: string }[] = []
      for (let offset = 0; ; offset += 1000) {
        let q = supabaseAdmin.from('gastos').select('valor_gasto, data').not('ad_id', 'is', null).range(offset, offset + 999)
        if (startDate) q = q.gte('data', isoParaDataLocal(startDate))
        if (endDate) q = q.lte('data', isoParaDataLocal(endDate))
        const { data, error } = await q
        if (error) throw error
        if (!data || data.length === 0) break
        todas.push(...(data as any))
        if (data.length < 1000) break
      }
      return todas
    }

    // Vendas reembolsadas/estornadas no período (mesmo filtro de produto). Base
    // pra taxa de reembolso — comparada com o faturamento aprovado do período.
    async function fetchReembolsos() {
      const todas: { valor: number; valor_liquido: number | null }[] = []
      for (let offset = 0; ; offset += 1000) {
        let q = supabaseAdmin
          .from('vendas')
          .select('valor, valor_liquido')
          .in('status', ['refunded', 'chargeback'])
          .not('transaction_id', 'like', 'manual_%')
          .range(offset, offset + 999)
        if (product !== 'Qualquer') q = q.eq('produto', product)
        if (startDate) q = q.gte('data', startDate)
        if (endDate) q = q.lte('data', endDate)
        const { data, error } = await q
        if (error) throw error
        if (!data || data.length === 0) break
        todas.push(...(data as any))
        if (data.length < 1000) break
      }
      return todas
    }

    const [vendas, gastos, reembolsos, produtosRes, cfgImpostoRes] = await Promise.all([
      fetchVendasReais(),
      fetchGastos(),
      fetchReembolsos(),
      supabaseAdmin.from('produtos_mapeamento').select('nome_produto, tipo').eq('ativo', true),
      supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'meta_imposto_diario').maybeSingle(),
    ])

    // Imposto sobre gastos em anúncios no período: soma do mapa diário
    // (alíquota × gasto BRL do dia, salvo pelo /api/meta/sync). Card próprio
    // no overview — NÃO entra em "Gastos com anúncios" nem no ROAS/Lucro.
    let imposto = 0
    try {
      const mapaImposto: Record<string, number> = JSON.parse(cfgImpostoRes.data?.valor || '{}')
      const ini = startDate ? isoParaDataLocal(startDate) : null
      const fim = endDate ? isoParaDataLocal(endDate) : null
      for (const [dia, v] of Object.entries(mapaImposto)) {
        if ((!ini || dia >= ini) && (!fim || dia <= fim)) imposto += Number(v) || 0
      }
    } catch {}

    // Mapa produto -> tipo para classificar vendas sem tipo definido
    const produtoTipoMap = new Map<string, string>()
    for (const p of (produtosRes.data ?? [])) {
      produtoTipoMap.set(p.nome_produto, p.tipo)
    }
    // Faturamento LÍQUIDO: usa valor_liquido (comissão do produtor = o que a Hotmart
    // mostra como "Receita Líquida"). Fallback para valor bruto se o líquido não
    // estiver preenchido (venda ainda não reconciliada via /sales/commissions).
    const totalRevenue = vendas.reduce((acc, v) => acc + Number(v.valor_liquido ?? v.valor), 0)
    const totalSpend = gastos.reduce((acc, g) => acc + Number(g.valor_gasto), 0)
    const salesCount = vendas.length
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    // Reembolsos/estornos: valor líquido devolvido + taxa sobre a base de vendas
    // pagas do período (aprovadas + reembolsadas). Não afeta ROAS/Lucro/Faturamento.
    const reembolsoValor = reembolsos.reduce((acc, v) => acc + Number(v.valor_liquido ?? v.valor), 0)
    const reembolsoCount = reembolsos.length
    const baseVendasPagas = totalRevenue + reembolsoValor
    const taxaReembolso = baseVendasPagas > 0 ? (reembolsoValor / baseVendasPagas) * 100 : 0

    // Resolve tipo via mapeamento quando o campo está nulo
    const vendasComTipo = vendas.map((v: any) => ({
      ...v,
      tipo: v.tipo ?? produtoTipoMap.get(v.produto) ?? 'front',
    }))

    return {
      success: true,
      metrics: {
        revenue: totalRevenue,
        spend: totalSpend,
        roas: roas,
        salesCount: salesCount,
        imposto: imposto,
        reembolso: reembolsoValor,
        reembolsoCount: reembolsoCount,
        taxaReembolso: taxaReembolso
      },
      vendas: vendasComTipo,
      gastos: gastos
    }
  } catch (error: any) {
    console.error('Error in getDashboardData action:', error)
    return { success: false, error: error.message }
  }
}

export async function fetchActiveProducts() {
  const { data, error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .select('nome_produto')
    .eq('ativo', true)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data.map(p => p.nome_produto) }
}
