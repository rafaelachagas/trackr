'use client'

import MetricCard from '@/components/ui/MetricCard'
import GraficoDiario from '@/components/dashboard/GraficoDiario'
import GraficoTipoVendas from '@/components/dashboard/GraficoTipoVendas'
import PainelVendasExtra from '@/components/dashboard/PainelVendasExtra'
import VendasPorProdutoBloco from '@/components/dashboard/VendasPorProdutoBloco'
import VendasPorPagamentoBloco from '@/components/dashboard/VendasPorPagamentoBloco'
import GraficosPorHora from '@/components/dashboard/GraficosPorHora'
import TabelaCriativosV2 from '@/components/dashboard/TabelaCriativosV2'
import HistoricoCriativos from '@/components/dashboard/HistoricoCriativos'
import type { BlocoId } from '@/lib/metricas-overview'
import type { RoasPorCriativo } from '@/types'

// Qualquer bloco do Overview (card de métrica OU seção grande) a partir do id
// do catálogo — usado tanto na página de verdade quanto na prévia ao vivo do
// editor de layout. Nunca duas versões divergentes: é o MESMO componente.
export default function BlocoById({ id, metrics, chartData, criativos }: {
  id: BlocoId
  metrics: any
  chartData?: any[]
  criativos?: RoasPorCriativo[]
}) {
  switch (id) {
    case 'revenue':
      return (
        <MetricCard
          titulo="Faturamento Líquido"
          valor={`R$ ${metrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          tooltip="Faturamento líquido das vendas aprovadas. Fat. Líq. = Venda Aprovada − Taxa do Gateway de Pagamentos − Taxas de Coprodutores e Afiliados"
        />
      )
    case 'spend':
      return (
        <MetricCard
          titulo="Gastos com anúncios"
          valor={`R$ ${metrics.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
      )
    case 'roas':
      return (
        <MetricCard
          titulo="ROAS"
          valor={`${metrics.roas.toFixed(2)}`}
          verde
          tooltip="Retorno sobre o investimento em anúncios. ROAS = Faturamento Bruto / Gastos com anúncios"
        />
      )
    case 'lucro':
      return (
        <MetricCard
          titulo="Lucro"
          valor={`R$ ${(metrics.revenue - metrics.spend - metrics.imposto).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          verde
          tooltip="Lucro (ROI final). Lucro = Faturamento Líquido − Gastos com anúncios − Imposto sobre anúncios (Meta)"
        />
      )
    case 'imposto':
      return (
        <MetricCard
          titulo="Imposto total"
          valor={`R$ ${metrics.imposto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          tooltip="Imposto sobre gastos em anúncios (Meta). Alíquota configurável em Fontes de dados → Contas de anúncios, aplicada sobre o gasto das contas em BRL — a conta em dólar fica de fora. Não é somado ao card de Gastos."
        />
      )
    case 'reembolso':
      return (
        <MetricCard
          titulo="Reembolsos"
          valor={`R$ ${metrics.reembolso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          valorBadge={`${metrics.taxaReembolso.toFixed(1).replace('.', ',')}%`}
          subtitulo={`${metrics.reembolsoCount} venda${metrics.reembolsoCount !== 1 ? 's' : ''}`}
          tooltip="Vendas reembolsadas + chargeback no período (valor líquido devolvido). A taxa = reembolsos ÷ (faturamento aprovado + reembolsos) do período. Não é descontado do Faturamento/ROAS/Lucro — que já contam só as vendas aprovadas."
        />
      )
    case 'cpm':
      return (
        <MetricCard
          titulo="CPM médio"
          valor={`R$ ${metrics.cpmMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          tooltip="Custo por mil impressões, na média de todas as contas de anúncio conectadas no período. CPM = (Gasto ÷ Impressões) × 1000 — vem cru da Meta."
          alinharTooltipDireita
        />
      )
    case 'cpa':
      return (
        <MetricCard
          titulo="CPA médio"
          valor={`R$ ${metrics.cpaMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitulo={`${metrics.vendasPagas} venda${metrics.vendasPagas !== 1 ? 's' : ''} de tráfego pago`}
          tooltip="Custo por aquisição do funil como um todo. CPA = Gastos com anúncios ÷ vendas de TRÁFEGO PAGO no período (front + upsell) — não conta venda orgânica (sem criativo/anúncio de origem), senão o CPA sairia artificialmente mais barato."
          alinharTooltipDireita
        />
      )
    case 'grafico-diario':
      return <GraficoDiario dados={chartData ?? []} />
    case 'vendas-por-tipo':
      return <GraficoTipoVendas />
    case 'vendas-extra':
      // Id antigo, mantido só pra não quebrar layouts salvos antes da divisão
      // em dois blocos separados (vendas-por-produto / vendas-por-pagamento).
      return <PainelVendasExtra />
    case 'vendas-por-produto':
      return <VendasPorProdutoBloco />
    case 'vendas-por-pagamento':
      return <VendasPorPagamentoBloco />
    case 'graficos-por-hora':
      return <GraficosPorHora />
    case 'tabela-criativos-v2':
      return <TabelaCriativosV2 />
    case 'tabela-criativos':
      // Performance por Criativo MANUAL — oculto do overview (criativos são
      // puxados automaticamente em 'tabela-criativos-v2'). Layouts salvos que
      // ainda referenciam este bloco simplesmente não renderizam nada.
      return null
    case 'historico-criativos':
      return <HistoricoCriativos />
  }
}
