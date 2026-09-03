'use client'

import { useEffect, useState } from 'react'
import { HistoricoCriativo } from '@/app/api/criativos-historico/route'
import { useDashboard } from '@/context/DashboardContext'
import ModalPreviewCriativo from '@/components/dashboard/ModalPreviewCriativo'

function fmt(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} mil`
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default function HistoricoCriativos() {
  const { isPrivate } = useDashboard()
  const [dados, setDados] = useState<HistoricoCriativo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalCriativo, setModalCriativo] = useState<string | null>(null)

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
              const nome = row.nome_completo || row.criativo
              return (
                <tr key={row.criativo} onClick={() => setModalCriativo(row.criativo)} className="hover:bg-muted/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3 font-medium text-foreground max-w-[420px]" title={nome}>
                    <span className="hover:underline hover:text-primary transition break-words">{nome}</span>
                    {row.nome_completo && <span className="ml-2 text-[10px] font-mono text-muted-foreground/60 uppercase">{row.criativo}</span>}
                  </td>
                  <td className={`px-4 py-3 text-right text-rose-400 font-semibold ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? 'R$ ••••' : fmt(row.gasto_total)}
                  </td>
                  <td className={`px-4 py-3 text-right text-emerald-400 font-semibold ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? 'R$ ••••' : fmt(row.receita_total)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${roasColor} ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? '•.••x' : (row.roas === null ? '—' : `${row.roas.toFixed(2)}x`)}
                  </td>
                  <td className={`px-4 py-3 text-right text-muted-foreground ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? '••' : row.vendas}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ModalPreviewCriativo codigo={modalCriativo} onFechar={() => setModalCriativo(null)} />
    </div>
  )
}
