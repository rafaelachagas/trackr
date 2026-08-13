'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'
import { formatInTimeZone } from 'date-fns-tz'
import { formatarMoeda } from '@/lib/utils'
import { ArrowDown, Trophy } from 'lucide-react'
import type { CriativoBreak } from '@/app/api/dashboard/vendas-breakdown/route'

type SortKey = 'front' | 'upsell' | 'reembolsoCount'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'front', label: 'Mais Front' },
  { key: 'upsell', label: 'Mais Upsell' },
  { key: 'reembolsoCount', label: 'Mais Reembolso' },
]

export default function VendasCriativosPage() {
  const { dateRange, lastUpdate, isPrivate } = useDashboard()
  const [linhas, setLinhas] = useState<CriativoBreak[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('front')

  useEffect(() => {
    const params = new URLSearchParams()
    try {
      if (dateRange.start && !isNaN(dateRange.start.getTime())) params.set('d_inicio', formatInTimeZone(dateRange.start, 'America/Sao_Paulo', 'yyyy-MM-dd'))
      if (dateRange.end && !isNaN(dateRange.end.getTime())) params.set('d_fim', formatInTimeZone(dateRange.end, 'America/Sao_Paulo', 'yyyy-MM-dd'))
    } catch { return }
    setLoading(true)
    fetch(`/api/dashboard/vendas-breakdown?${params}`)
      .then((r) => r.json())
      .then((j) => setLinhas(j.porCriativo ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lastUpdate, dateRange])

  const ordenadas = useMemo(() => {
    return [...linhas].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0))
  }, [linhas, sortKey])

  const priv = (n: React.ReactNode) => (isPrivate ? '••' : n)

  return (
    <div className="pb-12 space-y-6 max-w-[1200px] mx-auto w-full text-foreground">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Vendas × Criativos</h1>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13181a', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-1 px-5 py-3 flex-wrap" style={{ borderBottom: '1px solid rgba(85,182,247,0.08)' }}>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-3">Ranking por criativo</p>
          {SORTS.map((s) => (
            <button key={s.key} onClick={() => setSortKey(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${sortKey === s.key ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : ordenadas.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">Sem vendas por criativo no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="text-left px-5 py-3">Criativo</th>
                  <Th active={sortKey === 'front'} onClick={() => setSortKey('front')}>Front</Th>
                  <Th active={sortKey === 'upsell'} onClick={() => setSortKey('upsell')}>Upsell</Th>
                  <Th active={sortKey === 'reembolsoCount'} onClick={() => setSortKey('reembolsoCount')}>Reembolsos</Th>
                  <th className="text-right px-5 py-3">Valor Reemb.</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((c, i) => (
                  <tr key={c.criativo} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-semibold text-foreground">
                      <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>{c.criativo}
                    </td>
                    <td className="text-right px-5 py-3 tabular-nums font-bold">{priv(c.front)}</td>
                    <td className="text-right px-5 py-3 tabular-nums font-bold" style={{ color: '#22d3ee' }}>{priv(c.upsell)}</td>
                    <td className="text-right px-5 py-3 tabular-nums font-bold" style={{ color: c.reembolsoCount > 0 ? '#f43f5e' : undefined }}>{priv(c.reembolsoCount)}</td>
                    <td className="text-right px-5 py-3 tabular-nums text-muted-foreground">{c.reembolsoValor > 0 ? priv(formatarMoeda(c.reembolsoValor)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Th({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <th className="text-right px-5 py-3">
      <button onClick={onClick} className={`inline-flex items-center gap-1 uppercase tracking-widest ${active ? 'text-primary' : 'hover:text-foreground'}`}>
        {children}
        {active && <ArrowDown className="w-3 h-3" />}
      </button>
    </th>
  )
}
