'use client'

import React, { useRef, useState, useEffect } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { X, GripVertical } from 'lucide-react'
import BlocoById from '@/components/dashboard/BlocoById'
import { CATALOGO_METRICAS, type BlocoId, type SpanBloco } from '@/lib/metricas-overview'
import { RoasPorCriativo } from '@/types'
import { FrameworkData } from '@/app/api/framework/route'
import { useDashboard } from '@/context/DashboardContext'
import { useEditorDashboard } from '@/context/EditorDashboardContext'

// Igual à Utmify: o "modo edição" não é uma tela separada — é a MESMA página,
// com os MESMOS blocos de verdade (dados reais), só que arrastáveis. Sidebar
// e Topbar assumem outro conteúdo enquanto isso (ver Sidebar.tsx/Topbar.tsx);
// o que muda aqui é só ler `rascunho` (ordem de trabalho) em vez de
// `itemsSalvos` (o que está publicado), e permitir arrastar/remover.
function spanClass(span: SpanBloco) {
  switch (span) {
    case 3: return 'col-span-12 sm:col-span-6 lg:col-span-3'
    case 4: return 'col-span-12 lg:col-span-4'
    case 6: return 'col-span-12 lg:col-span-6'
    case 8: return 'col-span-12 lg:col-span-8'
    default: return 'col-span-12'
  }
}
const SPAN_POR_ID = new Map(CATALOGO_METRICAS.map((m) => [m.id, m.span]))

export default function OverviewPage() {
  const { metrics, chartData, lastUpdate, dateRange, firstLoadDone } = useDashboard()
  const { ativo: editando, itemsSalvos, rascunho, carregandoRascunho, mover, remover } = useEditorDashboard()
  const [criativos, setCriativos] = useState<RoasPorCriativo[]>([])
  const dragIndex = useRef<number | null>(null)

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

  const items: BlocoId[] = editando ? rascunho : itemsSalvos
  const carregando = editando ? carregandoRascunho : !firstLoadDone

  function onDrop(destino: number) {
    const origem = dragIndex.current
    dragIndex.current = null
    if (origem == null || origem === destino) return
    mover(origem, destino)
  }

  return (
    <div className="relative space-y-6 w-full mx-auto text-foreground">
      {editando && (
        <p className="text-xs text-muted-foreground -mb-2">Arraste os blocos abaixo pra reordenar. Esta é uma prévia com os dados reais do período atual.</p>
      )}

      {carregando ? (
        <div className="grid grid-cols-12 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="col-span-12 sm:col-span-6 lg:col-span-3 bg-card border border-border p-5 rounded-[10px] shadow-sm animate-pulse">
              <div className="h-2.5 w-24 bg-muted rounded mb-4" />
              <div className="h-7 w-32 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {items.map((id, i) => {
            const span = SPAN_POR_ID.get(id) ?? 12
            const bloco = (
              <BlocoById id={id} metrics={metrics} chartData={chartData} criativos={criativos} />
            )
            if (!editando) return <div key={id} className={spanClass(span)}>{bloco}</div>
            return (
              <div
                key={id}
                draggable
                onDragStart={() => { dragIndex.current = i }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                className={`relative group cursor-grab active:cursor-grabbing ${spanClass(span)}`}
              >
                <div className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => remover(id)} className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow"><X className="w-3 h-3" /></button>
                </div>
                <div className="absolute top-2 left-2 z-10 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition"><GripVertical className="w-3.5 h-3.5" /></div>
                {bloco}
              </div>
            )
          })}
          {editando && items.length === 0 && (
            <p className="col-span-12 text-sm text-muted-foreground text-center py-16">Nenhum bloco selecionado — adicione pela lista ao lado.</p>
          )}
        </div>
      )}
    </div>
  )
}
