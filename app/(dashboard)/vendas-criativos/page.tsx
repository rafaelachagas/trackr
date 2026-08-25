'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'
import { formatarMoeda, extrairCriativo } from '@/lib/utils'
import { ArrowDown, Trophy, ShoppingCart, TrendingUp, Undo2 } from 'lucide-react'
import type { CriativoBreak } from '@/app/api/dashboard/vendas-breakdown/route'
import SeletorPeriodoVturb, { rangeDoPreset, type RangePeriodo } from '@/components/ui/SeletorPeriodoVturb'
import ModalPreviewCriativo from '@/components/dashboard/ModalPreviewCriativo'

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
  const { lastUpdate, isPrivate } = useDashboard()
  const [linhas, setLinhas] = useState<CriativoBreak[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('front')
  const [range, setRange] = useState<RangePeriodo>(() => rangeDoPreset('Últimos 7 dias'))
  const [modalCriativo, setModalCriativo] = useState<string | null>(null)

  useEffect(() => {
    if (!range.ini || !range.fim) return
    const params = new URLSearchParams({ d_inicio: range.ini, d_fim: range.fim })
    setLoading(true)
    fetch(`/api/dashboard/vendas-breakdown?${params}`)
      .then((r) => r.json())
      .then((j) => setLinhas(j.porCriativo ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [lastUpdate, range])

  const totais = useMemo(() => ({
    front: linhas.reduce((a, c) => a + c.front, 0),
    upsell: linhas.reduce((a, c) => a + c.upsell, 0),
    reemb: linhas.reduce((a, c) => a + c.reembolsoCount, 0),
    reembValor: linhas.reduce((a, c) => a + (c.reembolsoValor || 0), 0),
  }), [linhas])

  const ordenadas = useMemo(() => {
    if (sortKey === 'reembolsoCount') {
      return [...linhas].sort((a, b) => taxaReemb(b) - taxaReemb(a) || b.reembolsoCount - a.reembolsoCount)
    }
    return [...linhas].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0))
  }, [linhas, sortKey])

  const priv = (n: React.ReactNode) => (isPrivate ? '••' : n)
  const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`
  const taxaUpsellMedia = totais.front > 0 ? (totais.upsell / totais.front) * 100 : 0
  const taxaReembMedia = (totais.front + totais.upsell) > 0 ? (totais.reemb / (totais.front + totais.upsell)) * 100 : 0

  return (
    <div className="pt-9 pb-12 space-y-6 max-w-[1200px] mx-auto w-full text-foreground px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Vendas × Criativos</h1>
        </div>
        <SeletorPeriodoVturb range={range} onChange={setRange} />
      </div>

      {/* Totais do período */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ResumoCard icon={<ShoppingCart className="w-4 h-4" />} label="Vendas Front" valor={priv(totais.front)} sub={`${ordenadas.length} criativos`} cor="text-primary" />
        <ResumoCard icon={<TrendingUp className="w-4 h-4" />} label="Vendas Upsell" valor={priv(totais.upsell)} sub={`taxa média ${fmtPct(taxaUpsellMedia)}`} cor="text-cyan-400" />
        <ResumoCard icon={<Undo2 className="w-4 h-4" />} label="Reembolsos" valor={priv(totais.reemb)} sub={`${fmtPct(taxaReembMedia)} · ${totais.reembValor > 0 ? priv(formatarMoeda(totais.reembValor)) : '—'}`} cor="text-rose-400" />
      </div>

      <div className="rounded-2xl overflow-hidden bg-card border border-border">
        <div className="flex items-center gap-1 px-5 py-3 flex-wrap border-b border-border">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-3">Ranking por criativo</p>
          {SORTS.map((s) => (
            <button key={s.key} onClick={() => setSortKey(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${sortKey === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'}`}>
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
            <table className="w-full text-sm min-w-[560px]">
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
                  const codigo = extrairCriativo(c.criativo)
                  return (
                    <tr key={c.criativo} onClick={() => codigo && setModalCriativo(codigo)} className={`border-t border-border hover:bg-accent/30 ${codigo ? 'cursor-pointer' : ''}`}>
                      <td className="px-5 py-3 font-semibold text-foreground">
                        <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>
                        <span className={codigo ? 'hover:underline hover:text-primary transition' : ''}>{c.criativo}</span>
                      </td>
                      <Cell n={priv(c.front)} pct={fmtPct(shareFront)} />
                      <Cell n={priv(c.upsell)} pct={c.front > 0 ? fmtPct(taxaUpsell(c)) : '—'} cor="text-cyan-400" />
                      <Cell n={priv(c.reembolsoCount)} pct={fmtPct(taxaReemb(c))} cor={c.reembolsoCount > 0 ? 'text-rose-400' : undefined} />
                      <td className="text-right px-5 py-3 tabular-nums text-muted-foreground">{c.reembolsoValor > 0 ? priv(formatarMoeda(c.reembolsoValor)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalPreviewCriativo codigo={modalCriativo} onFechar={() => setModalCriativo(null)} />
    </div>
  )
}

function ResumoCard({ icon, label, valor, sub, cor }: { icon: React.ReactNode; label: string; valor: React.ReactNode; sub: string; cor: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <span className={cor}>{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  )
}

function Cell({ n, pct, cor }: { n: React.ReactNode; pct: string; cor?: string }) {
  return (
    <td className="text-right px-5 py-3">
      <div className={`tabular-nums font-bold leading-tight ${cor ?? 'text-foreground'}`}>{n}</div>
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
