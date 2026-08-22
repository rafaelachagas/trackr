'use client'

import React, { useState, useEffect } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import MetricCard from '@/components/ui/MetricCard'
import GraficoDiario from '@/components/dashboard/GraficoDiario'
import TabelaCriativos from '@/components/dashboard/TabelaCriativos'
import TabelaCriativosV2 from '@/components/dashboard/TabelaCriativosV2'
import HistoricoCriativos from '@/components/dashboard/HistoricoCriativos'
import GraficoTipoVendas from '@/components/dashboard/GraficoTipoVendas'
import GraficosPorHora from '@/components/dashboard/GraficosPorHora'
import PainelVendasExtra from '@/components/dashboard/PainelVendasExtra'
import { RoasPorCriativo } from '@/types'
import { FrameworkData } from '@/app/api/framework/route'
import { useDashboard } from '@/context/DashboardContext'

export default function OverviewPage() {
  const { metrics, chartData, lastUpdate, dateRange, firstLoadDone } = useDashboard()
  const [criativos, setCriativos] = useState<RoasPorCriativo[]>([])

  useEffect(() => {
    const params = new URLSearchParams()
    try {
      // Formata no fuso de São Paulo — dateRange são instantes absolutos (bordas
      // do dia em SP). Usar format() do fuso do navegador jogaria o d_fim pro dia
      // seguinte pra quem acessa de fora do Brasil (ex.: 23:59 SP = 04:59 CEST).
      if (dateRange.start && !isNaN(dateRange.start.getTime())) params.set('d_inicio', formatInTimeZone(dateRange.start, 'America/Sao_Paulo', 'yyyy-MM-dd'))
      if (dateRange.end && !isNaN(dateRange.end.getTime())) params.set('d_fim', formatInTimeZone(dateRange.end, 'America/Sao_Paulo', 'yyyy-MM-dd'))
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
      {!firstLoadDone ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border p-5 rounded-[10px] shadow-sm animate-pulse">
              <div className="h-2.5 w-24 bg-muted rounded mb-4" />
              <div className="h-7 w-32 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-5">
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
          valor={`R$ ${(metrics.revenue - metrics.spend - metrics.imposto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          verde
          tooltip="Lucro (ROI final). Lucro = Faturamento Líquido − Gastos com anúncios − Imposto sobre anúncios (Meta)"
        />
        <MetricCard
          titulo="Imposto total"
          valor={`R$ ${metrics.imposto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          tooltip="Imposto sobre gastos em anúncios (Meta). Alíquota configurável em Fontes de dados → Contas de anúncios, aplicada sobre o gasto das contas em BRL — a conta em dólar fica de fora. Não é somado ao card de Gastos."
        />
        <MetricCard
          titulo="Reembolsos"
          valor={`R$ ${metrics.reembolso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          subtitulo={`${metrics.taxaReembolso.toFixed(1).replace('.', ',')}% • ${metrics.reembolsoCount} venda${metrics.reembolsoCount !== 1 ? 's' : ''}`}
          tooltip="Vendas reembolsadas + chargeback no período (valor líquido devolvido). A taxa = reembolsos ÷ (faturamento aprovado + reembolsos) do período. Não é descontado do Faturamento/ROAS/Lucro — que já contam só as vendas aprovadas."
        />
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {/* Mesma regra dos cards: o gráfico lê o gasto do banco (último sync),
              então antes do sync de hoje ele mostraria gasto defasado. */}
          {!firstLoadDone ? (
            <div className="bg-card border border-border rounded-[10px] shadow-sm h-full min-h-[340px] animate-pulse" />
          ) : (
            <GraficoDiario dados={chartData} />
          )}
        </div>
        <GraficoTipoVendas />
      </div>

      <PainelVendasExtra />

      <GraficosPorHora />

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
