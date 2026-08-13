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
  { key: 'reembolsoCount', label: 'Maior Taxa de Reembolso' },
]

// Taxas proporcionais às vendas do PRÓPRIO criativo (não ao total).
const taxaUpsell = (c: CriativoBreak) => (c.front > 0 ? (c.upsell / c.front) * 100 : 0)
const taxaReemb = (c: CriativoBreak) => {
  const v = c.front + c.upsell
  return v > 0 ? (c.reembolsoCount / v) * 100 : 0
}

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

  const totais = useMemo(() => ({
    front: linhas.reduce((a, c) => a + c.front, 0),
    upsell: linhas.reduce((a, c) => a + c.upsell, 0),
    reemb: linhas.reduce((a, c) => a + c.reembolsoCount, 0),
  }), [linhas])

  const ordenadas = useMemo(() => {
    // Reembolso ordena pela TAXA (proporcional às vendas do criativo), não pelo
    // volume — senão criativo grande sempre lidera só por ter mais venda.
    if (sortKey === 'reembolsoCount') {
      return [...linhas].sort((a, b) => taxaReemb(b) - taxaReemb(a) || b.reembolsoCount - a.reembolsoCount)
    }
    return [...linhas].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0))
  }, [linhas, sortKey])

  const priv = (n: React.ReactNode) => (isPrivate ? '••' : n)
  const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`

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
                  <Th active={sortKey === 'front'} onClick={() => setSortKey('front')}>Front · % do total</Th>
                  <Th active={sortKey === 'upsell'} onClick={() => setSortKey('upsell')}>Upsell · taxa</Th>
                  <Th active={sortKey === 'reembolsoCount'} onClick={() => setSortKey('reembolsoCount')}>Reembolso · taxa</Th>
                  <th className="text-right px-5 py-3">Valor Reemb.</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((c, i) => {
                  const shareFront = totais.front > 0 ? (c.front / totais.front) * 100 : 0
                  return (
                    <tr key={c.criativo} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 font-semibold text-foreground">
                        <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>{c.criativo}
                      </td>
                      <Cell n={priv(c.front)} pct={fmtPct(shareFront)} />
                      <Cell n={priv(c.upsell)} pct={c.front > 0 ? fmtPct(taxaUpsell(c)) : '—'} cor="#22d3ee" />
                      <Cell n={priv(c.reembolsoCount)} pct={fmtPct(taxaReemb(c))} cor={c.reembolsoCount > 0 ? '#f43f5e' : undefined} />
                      <td className="text-right px-5 py-3 tabular-nums text-muted-foreground">{c.reembolsoValor > 0 ? priv(formatarMoeda(c.reembolsoValor)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Cell({ n, pct, cor }: { n: React.ReactNode; pct: string; cor?: string }) {
  return (
    <td className="text-right px-5 py-3">
      <div className="tabular-nums font-bold leading-tight" style={{ color: cor }}>{n}</div>
      <div className="text-[10px] text-muted-foreground tabular-nums leading-tight">{pct}</div>
    </td>
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
