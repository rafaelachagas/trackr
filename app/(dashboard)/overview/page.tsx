'use client'

import React, { useState, useEffect } from 'react'
import MetricCard from '@/components/ui/MetricCard'
import GraficoDiario from '@/components/dashboard/GraficoDiario'
import TabelaCriativos from '@/components/dashboard/TabelaCriativos'
import HistoricoCriativos from '@/components/dashboard/HistoricoCriativos'
import GraficoTipoVendas from '@/components/dashboard/GraficoTipoVendas'
import { RoasPorCriativo } from '@/types'
import { FrameworkData } from '@/app/api/framework/route'
import { DollarSign, Target, TrendingUp, Users } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'

export default function OverviewPage() {
  const { metrics, chartData, lastUpdate, dateRange } = useDashboard()
  const [criativos, setCriativos] = useState<RoasPorCriativo[]>([])

  useEffect(() => {
    const params = new URLSearchParams()
    try {
      if (dateRange.start && !isNaN(dateRange.start.getTime())) params.set('d_inicio', dateRange.start.toISOString().split('T')[0])
      if (dateRange.end && !isNaN(dateRange.end.getTime())) params.set('d_fim', dateRange.end.toISOString().split('T')[0])
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricCard
          titulo="Receita Total"
          valor={`R$ ${metrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          cor="green"
          icone={<DollarSign className="w-5 h-5 text-slate-300" />}
          tendencia="+0%"
          subtitulo="vs mês anterior"
        />
        <MetricCard
          titulo="Gasto Meta Ads"
          valor={`R$ ${metrics.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          cor="red"
          icone={<Target className="w-5 h-5 text-slate-300" />}
        />
        <MetricCard
          titulo="ROAS Global"
          valor={`${metrics.roas.toFixed(2)}x`}
          cor="blue"
          icone={<TrendingUp className="w-5 h-5 text-slate-300" />}
        />
        <MetricCard
          titulo="Nº de Vendas"
          valor={`${metrics.salesCount}`}
          cor="default"
          icone={<Users className="w-5 h-5 text-slate-300" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <GraficoDiario dados={chartData} />
        </div>
        <GraficoTipoVendas />
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
