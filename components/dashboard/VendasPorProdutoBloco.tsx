'use client'

import React, { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import { formatInTimeZone } from 'date-fns-tz'
import type { VendasBreakdown } from '@/app/api/dashboard/vendas-breakdown/route'

function Card({ title, tooltip, children }: { title: string; tooltip?: string; children: React.ReactNode }) {
  const [showTip, setShowTip] = useState(false)
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
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

// Bloco separado (Utmify mostra Produto e Pagamento como cards independentes,
// arrastáveis um sem o outro no editor). Busca os dados por conta própria —
// duplica o fetch de VendasPorPagamentoBloco.tsx de propósito, pra cada bloco
// poder ser adicionado/removido do dashboard sem depender do outro.
export default function VendasPorProdutoBloco() {
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

  const produtos = data?.porProduto ?? []
  const total = produtos.reduce((a, p) => a + p.count, 0)

  return (
    <Card title="Vendas por Produto" tooltip="Contagem e participação de cada produto nas vendas aprovadas do período.">
      {produtos.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Sem dados</div>
      ) : (
        <div className="space-y-3">
          {produtos.map((p) => {
            const pct = total > 0 ? (p.count / total) * 100 : 0
            return (
              <div key={p.produto} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground truncate" title={p.produto}>{p.produto}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-foreground tabular-nums">{isPrivate ? '••' : p.count}</span>
                    <span className="text-muted-foreground tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
