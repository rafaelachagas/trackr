'use client'

import MetricCard from '@/components/ui/MetricCard'
import type { MetricaId } from '@/lib/metricas-overview'

// Uma métrica (por id do catálogo) → o MetricCard já pronto com os dados reais.
// Usado tanto no Overview de verdade quanto na prévia ao vivo do editor de
// layout — assim os dois NUNCA divergem (é o mesmo componente, os mesmos dados).
export default function MetricaCardById({ id, metrics }: { id: MetricaId; metrics: any }) {
  switch (id) {
    case 'revenue':
      return (
        <MetricCard
          titulo="Faturamento Líquido"
          valor={`R$ ${metrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tooltip="Faturamento líquido das vendas aprovadas. Fat. Líq. = Venda Aprovada − Taxa do Gateway de Pagamentos − Taxas de Coprodutores e Afiliados"
        />
      )
    case 'spend':
      return (
        <MetricCard
          titulo="Gastos com anúncios"
          valor={`R$ ${metrics.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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
          valor={`R$ ${(metrics.revenue - metrics.spend - metrics.imposto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          verde
          tooltip="Lucro (ROI final). Lucro = Faturamento Líquido − Gastos com anúncios − Imposto sobre anúncios (Meta)"
        />
      )
    case 'imposto':
      return (
        <MetricCard
          titulo="Imposto total"
          valor={`R$ ${metrics.imposto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tooltip="Imposto sobre gastos em anúncios (Meta). Alíquota configurável em Fontes de dados → Contas de anúncios, aplicada sobre o gasto das contas em BRL — a conta em dólar fica de fora. Não é somado ao card de Gastos."
        />
      )
    case 'reembolso':
      return (
        <MetricCard
          titulo="Reembolsos"
          valor={`R$ ${metrics.reembolso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subtitulo={`${metrics.taxaReembolso.toFixed(1).replace('.', ',')}% • ${metrics.reembolsoCount} venda${metrics.reembolsoCount !== 1 ? 's' : ''}`}
          tooltip="Vendas reembolsadas + chargeback no período (valor líquido devolvido). A taxa = reembolsos ÷ (faturamento aprovado + reembolsos) do período. Não é descontado do Faturamento/ROAS/Lucro — que já contam só as vendas aprovadas."
        />
      )
    case 'cpm':
      return (
        <MetricCard
          titulo="CPM médio"
          valor={`R$ ${metrics.cpmMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tooltip="Custo por mil impressões, na média de todas as contas de anúncio conectadas no período. CPM = (Gasto ÷ Impressões) × 1000 — vem cru da Meta."
        />
      )
    case 'cpa':
      return (
        <MetricCard
          titulo="CPA médio"
          valor={`R$ ${metrics.cpaMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subtitulo={`${metrics.vendasPagas} venda${metrics.vendasPagas !== 1 ? 's' : ''} de tráfego pago`}
          tooltip="Custo por aquisição. CPA = Gastos com anúncios ÷ vendas de TRÁFEGO PAGO no período — não conta venda orgânica (sem criativo/anúncio de origem), senão o CPA sairia artificialmente mais barato."
        />
      )
  }
}
