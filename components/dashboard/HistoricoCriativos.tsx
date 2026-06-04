'use client'

import { useEffect, useState } from 'react'
import { HistoricoCriativo } from '@/app/api/criativos-historico/route'

function fmt(v: number) {
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} mil`
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default function HistoricoCriativos() {
  const [dados, setDados] = useState<HistoricoCriativo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/criativos-historico')
      .then(r => r.json())
      .then(({ criativos }) => setDados(criativos ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
      Carregando histórico...
    </div>
  )

  if (dados.length === 0) return null

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden text-foreground">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Histórico Geral por Criativo</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Todo o período — gasto e receita acumulados</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criativo</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gasto Total</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Receita Total</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ROAS</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vendas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dados.map(row => {
              const roasColor = row.roas === null ? 'text-muted-foreground' : row.roas >= 2 ? 'text-emerald-400' : row.roas >= 1 ? 'text-yellow-400' : 'text-rose-400'
              return (
                <tr key={row.criativo} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground max-w-[300px] truncate" title={row.criativo}>
                    {row.criativo}
                  </td>
                  <td className="px-4 py-3 text-right text-rose-400 font-semibold">
                    {fmt(row.gasto_total)}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-semibold">
                    {fmt(row.receita_total)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${roasColor}`}>
                    {row.roas === null ? '—' : `${row.roas.toFixed(2)}x`}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {row.vendas}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
