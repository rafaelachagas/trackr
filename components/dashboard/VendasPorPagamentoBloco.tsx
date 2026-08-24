'use client'

import React, { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import { formatInTimeZone } from 'date-fns-tz'
import type { VendasBreakdown } from '@/app/api/dashboard/vendas-breakdown/route'

const COR_PAG: Record<string, string> = {
  'Cartão': '#38bdf8', 'Pix': '#2563eb', 'Boleto': '#f59e0b', 'PayPal': '#22d3ee', 'Outros': '#f43f5e', 'Não informado': '#64748b',
}

function Card({ title, hint, tooltip, children }: { title: string; hint?: string; tooltip?: string; children: React.ReactNode }) {
  const [showTip, setShowTip] = useState(false)
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        {tooltip && (
          <div className="relative ml-auto" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
            <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
            {showTip && (
              <div className="absolute right-0 top-6 z-30 w-64 text-[11px] font-medium bg-popover border border-border rounded-lg shadow-2xl px-3 py-2 text-popover-foreground">{tooltip}</div>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

// Bloco separado (ver comentário em VendasPorProdutoBloco.tsx) — duplica o
// mesmo fetch de propósito pra ficar independente no editor de layout.
export default function VendasPorPagamentoBloco() {
  const { dateRange, lastUpdate, isPrivate } = useDashboard()
  const [data, setData] = useState<VendasBreakdown | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    try {
      if (dateRange.start && !isNaN(dateRange.start.getTime())) params.set('d_inicio', formatInTimeZone(dateRange.start, 'America/Sao_Paulo', 'yyyy-MM-dd'))
      if (dateRange.end && !isNaN(dateRange.end.getTime())) params.set('d_fim', formatInTimeZone(dateRange.end, 'America/Sao_Paulo', 'yyyy-MM-dd'))
    } catch { return }
    fetch(`/api/dashboard/vendas-breakdown?${params}`)
      .then((r) => r.json())
      .then((j) => { if (!j.error) setData(j) })
      .catch(() => {})
  }, [lastUpdate, dateRange])

  const metodos = data?.porPagamento ?? []
  const temDado = metodos.some((m) => m.metodo !== 'Não informado')
  const total = metodos.reduce((a, m) => a + m.total, 0)

  return (
    <Card
      title="Vendas por Pagamento"
      hint="por funil"
      tooltip="Qual método de pagamento vende mais em cada etapa (front vs upsell). Só passa a registrar a partir de agora — vendas antigas ficam em 'Não informado'."
    >
      {!temDado ? (
        <div className="flex flex-col items-center justify-center h-32 text-center text-sm text-muted-foreground gap-1">
          <span>Ainda sem método registrado.</span>
          <span className="text-[11px] opacity-70">Começa a popular com as próximas vendas.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {metodos.map((m) => {
            const pct = total > 0 ? (m.total / total) * 100 : 0
            const cor = COR_PAG[m.metodo] ?? '#64748b'
            return (
              <div key={m.metodo} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} />
                    <span className="font-medium text-foreground truncate">{m.metodo}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 tabular-nums">
                    <span className="text-muted-foreground text-[11px]">Front <b className="text-foreground">{isPrivate ? '••' : m.front}</b></span>
                    <span className="text-muted-foreground text-[11px]">Upsell <b style={{ color: '#22d3ee' }}>{isPrivate ? '••' : m.upsell}</b></span>
                    <span className="font-bold text-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
