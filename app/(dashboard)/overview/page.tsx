'use client'

import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import MetricCard from '@/components/ui/MetricCard'
import GraficoDiario from '@/components/dashboard/GraficoDiario'
import TabelaCriativos from '@/components/dashboard/TabelaCriativos'
import TabelaCriativosV2 from '@/components/dashboard/TabelaCriativosV2'
import HistoricoCriativos from '@/components/dashboard/HistoricoCriativos'
import GraficoTipoVendas from '@/components/dashboard/GraficoTipoVendas'
import { RoasPorCriativo } from '@/types'
import { FrameworkData } from '@/app/api/framework/route'
import { useDashboard } from '@/context/DashboardContext'

export default function OverviewPage() {
  const { metrics, chartData, lastUpdate, dateRange } = useDashboard()
  const [criativos, setCriativos] = useState<RoasPorCriativo[]>([])

  useEffect(() => {
    const params = new URLSearchParams()
    try {
      // format() usa o fuso LOCAL — toISOString() é UTC e virava o dia seguinte
      // (23:59 local = 02:59 UTC do dia D+1), puxando 1 dia extra de gasto.
      if (dateRange.start && !isNaN(dateRange.start.getTime())) params.set('d_inicio', format(dateRange.start, 'yyyy-MM-dd'))
      if (dateRange.end && !isNaN(dateRange.end.getTime())) params.set('d_fim', format(dateRange.end, 'yyyy-MM-dd'))
    } catch {
      return
    }

    fetch(`/api/framework?${params}`)
      .then(r => r.json())
      .then(({ criativos: data }: { criativos: FrameworkData[] }) => {
        setCriativos(
          (data ?? []).map(d => ({
            criativo: d.criativo,
            ad_name: d.ad_name,
            campaign_name: d.campaign_name,
            fase: d.fase,
            vendas: d.vendas_7d,
            upsells: 0,
            receita: d.receita_7d,
            gasto: d.gasto_periodo,
            roas_7d: d.roas_7d,
            roas_3d: d.roas_3d,
            roas_1d: d.roas_1d,
            roas: d.roas_7d ?? 0,
            acao: d.acao,
          }))
        )
      })
      .catch(() => {})
  }, [lastUpdate, dateRange])

  return (
    <div className="relative space-y-6 w-full mx-auto text-foreground">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        <MetricCard
          titulo="Faturamento Líquido"
          valor={`R$ ${metrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tooltip="Faturamento líquido das vendas aprovadas. Fat. Líq. = Venda Aprovada − Taxa do Gateway de Pagamentos − Taxas de Coprodutores e Afiliados"
        />
        <MetricCard
          titulo="Gastos com anúncios"
          valor={`R$ ${metrics.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
        />
        <MetricCard
          titulo="ROAS"
          valor={`${metrics.roas.toFixed(2)}`}
          verde
          tooltip="Retorno sobre o investimento em anúncios. ROAS = Faturamento Bruto / Gastos com anúncios"
        />
        <MetricCard
          titulo="Lucro"
          valor={`R$ ${(metrics.revenue - metrics.spend).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          verde
          tooltip="Lucro calculado. Lucro = Faturamento Líquido − Gastos com anúncios − Despesas adicionais"
        />
        <MetricCard
          titulo="Imposto total"
          valor={`R$ ${metrics.imposto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tooltip="Imposto sobre gastos em anúncios (Meta). Alíquota configurável em Fontes de dados → Contas de anúncios, aplicada sobre o gasto das contas em BRL — a conta em dólar fica de fora. Não é somado ao card de Gastos."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <GraficoDiario dados={chartData} />
        </div>
        <GraficoTipoVendas />
      </div>

      <div>
        <TabelaCriativosV2 />
      </div>

      <div>
        <TabelaCriativos dados={criativos} />
      </div>

      <div className="pb-12">
        <HistoricoCriativos />
      </div>
    </div>
  )
}
