'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'
import { formatarMoeda, extrairCriativo } from '@/lib/utils'
import { ArrowDown, Trophy, ShoppingCart, TrendingUp, Undo2, Download, ChevronDown } from 'lucide-react'
import type { CriativoBreak } from '@/app/api/dashboard/vendas-breakdown/route'
import SeletorPeriodoVturb, { rangeDoPreset, type RangePeriodo } from '@/components/ui/SeletorPeriodoVturb'
import ModalPreviewCriativo from '@/components/dashboard/ModalPreviewCriativo'

type SortKey = 'front' | 'upsell' | 'reembolsoCount' | 'reembRapido'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'front', label: 'Mais Front' },
  { key: 'upsell', label: 'Mais Upsell' },
  { key: 'reembolsoCount', label: 'Maior Taxa de Reembolso' },
  { key: 'reembRapido', label: 'Reembolsa Mais Rápido' },
]

// Taxas proporcionais às vendas do PRÓPRIO criativo (não ao total).
const taxaUpsell = (c: CriativoBreak) => (c.front > 0 ? (c.upsell / c.front) * 100 : 0)
const taxaReemb = (c: CriativoBreak) => {
  const v = c.front + c.upsell
  return v > 0 ? (c.reembolsoCount / v) * 100 : 0
}
// % dos reembolsos (com timing conhecido) que aconteceram em ≤24h
const pct24 = (c: CriativoBreak) => (c.reembTiming > 0 ? (c.reemb24 / c.reembTiming) * 100 : 0)
// mediana em horas → texto amigável ("18h" / "3,2d")
const fmtMediana = (h: number | null) => h == null ? '—' : h < 48 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1).replace('.', ',')}d`

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
    if (sortKey === 'reembRapido') {
      // menor mediana de horas = reembolsa mais rápido; sem timing vai pro fim
      const med = (c: CriativoBreak) => (c.reembTiming > 0 && c.medHorasReemb != null ? c.medHorasReemb : Infinity)
      return [...linhas].sort((a, b) => med(a) - med(b) || pct24(b) - pct24(a))
    }
    return [...linhas].sort((a, b) => ((b as any)[sortKey] ?? 0) - ((a as any)[sortKey] ?? 0))
  }, [linhas, sortKey])
  const temTiming = useMemo(() => linhas.some((c) => c.reembTiming > 0), [linhas])

  const [menuExport, setMenuExport] = useState(false)

  // Monta as linhas do export a partir do que está na tela (período + ordenação).
  function dadosExport() {
    return ordenadas.map((c, i) => ({
      '#': i + 1,
      Criativo: c.criativo,
      Codigo: c.codigo ?? '',
      Fase: c.fase ?? '',
      Front: c.front,
      Upsell: c.upsell,
      'Taxa Upsell %': +taxaUpsell(c).toFixed(1),
      Reembolsos: c.reembolsoCount,
      'Taxa Reembolso %': +taxaReemb(c).toFixed(1),
      'Valor Reembolso': +(c.reembolsoValor || 0).toFixed(2),
      'Mediana ate Reemb (h)': c.medHorasReemb != null ? Math.round(c.medHorasReemb) : '',
      'Reemb 24h %': c.reembTiming > 0 ? +pct24(c).toFixed(1) : '',
      'Reemb 7d %': c.reembTiming > 0 ? +((c.reemb7d / c.reembTiming) * 100).toFixed(1) : '',
    }))
  }
  const nomeArquivo = `vendas-criativos-${range.ini}_${range.fim}`
  function baixar(blob: Blob, ext: string) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${nomeArquivo}.${ext}`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); setMenuExport(false)
  }
  function exportarCSV() {
    const rows = dadosExport(); if (!rows.length) return
    const cols = Object.keys(rows[0])
    const esc = (x: any) => `"${String(x).replace(/"/g, '""')}"`
    const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(';'))].join('\n')
    baixar(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }), 'csv')
  }
  async function exportarXLSX() {
    const rows = dadosExport(); if (!rows.length) return
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Criativos')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'xlsx')
  }
  function exportarMD() {
    const rows = dadosExport(); if (!rows.length) return
    const cols = Object.keys(rows[0])
    const linha = (vals: any[]) => `| ${vals.join(' | ')} |`
    const t = [
      `# Vendas × Criativos — ${range.ini} a ${range.fim}`,
      '',
      `Front: ${totais.front} · Upsell: ${totais.upsell} · Reembolsos: ${totais.reemb} (${fmtPct(taxaReembMedia)})`,
      '',
      linha(cols),
      linha(cols.map(() => '---')),
      ...rows.map((r) => linha(cols.map((c) => (r as any)[c]))),
    ].join('\n')
    baixar(new Blob([t], { type: 'text/markdown;charset=utf-8' }), 'md')
  }

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
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setMenuExport((v) => !v)} onBlur={() => setTimeout(() => setMenuExport(false), 150)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-border text-foreground/90 hover:bg-accent/60 transition">
              <Download className="w-4 h-4" /> Exportar <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {menuExport && (
              <div className="absolute right-0 mt-1 z-20 w-48 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                <button onMouseDown={exportarXLSX} className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent/60 flex items-center gap-2"><span className="text-emerald-400 font-bold text-xs">XLS</span> Excel (.xlsx)</button>
                <button onMouseDown={exportarCSV} className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent/60 flex items-center gap-2 border-t border-border"><span className="text-blue-400 font-bold text-xs">CSV</span> CSV (.csv)</button>
                <button onMouseDown={exportarMD} className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent/60 flex items-center gap-2 border-t border-border"><span className="text-violet-400 font-bold text-xs">MD</span> Markdown (Claude)</button>
              </div>
            )}
          </div>
          <SeletorPeriodoVturb range={range} onChange={setRange} />
        </div>
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
          {sortKey === 'reembRapido' && !temTiming && (
            <span className="text-[10px] text-muted-foreground/70 ml-2 basis-full sm:basis-auto">A velocidade de reembolso é medida a partir de agora (a Hotmart não expõe a data dos reembolsos antigos) — vai preenchendo conforme chegam novos reembolsos.</span>
          )}
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
                  <Th active={sortKey === 'reembRapido'} onClick={() => setSortKey('reembRapido')}>Velocidade Reemb.</Th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((c, i) => {
                  const shareFront = totais.front > 0 ? (c.front / totais.front) * 100 : 0
                  const codigo = c.codigo || extrairCriativo(c.criativo)
                  return (
                    <tr key={c.criativo} onClick={() => codigo && setModalCriativo(codigo)} className={`border-t border-border hover:bg-accent/30 ${codigo ? 'cursor-pointer' : ''}`}>
                      <td className="px-5 py-3 font-semibold text-foreground max-w-[420px]">
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground tabular-nums shrink-0">{i + 1}.</span>
                          <div className="min-w-0">
                            <span className={`${codigo ? 'hover:underline hover:text-primary transition' : ''} break-words`}>{c.criativo}</span>
                            {c.fase && <FaseBadge fase={c.fase} />}
                          </div>
                        </div>
                      </td>
                      <Cell n={priv(c.front)} pct={fmtPct(shareFront)} />
                      <Cell n={priv(c.upsell)} pct={c.front > 0 ? fmtPct(taxaUpsell(c)) : '—'} cor="text-cyan-400" />
                      <Cell n={priv(c.reembolsoCount)} pct={fmtPct(taxaReemb(c))} cor={c.reembolsoCount > 0 ? 'text-rose-400' : undefined} />
                      <td className="text-right px-5 py-3 tabular-nums text-muted-foreground">{c.reembolsoValor > 0 ? priv(formatarMoeda(c.reembolsoValor)) : '—'}</td>
                      <td className="text-right px-5 py-3">
                        {c.reembTiming > 0 ? (
                          <>
                            <div className="tabular-nums font-bold leading-tight text-amber-300" title={`${c.reembTiming} reembolsos com data conhecida`}>{fmtMediana(c.medHorasReemb)}</div>
                            <div className="text-[10px] text-muted-foreground tabular-nums leading-tight">24h {fmtPct(pct24(c))} · 7d {fmtPct(c.reemb7d / c.reembTiming * 100)}</div>
                          </>
                        ) : <span className="text-[11px] text-muted-foreground/50">sem dados ainda</span>}
                      </td>
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

// Badge da fase (FASE01–FASE04). O nome humano (escala/pré-escala) já aparece no
// próprio nome do criativo; aqui é só a flag colorida pra bater o olho.
const FASE_COR: Record<string, string> = {
  FASE01: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  FASE02: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  FASE03: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  FASE04: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
}
function FaseBadge({ fase }: { fase: string }) {
  const cor = FASE_COR[fase.toUpperCase()] || 'bg-white/5 text-muted-foreground border-border'
  return <span className={`ml-2 inline-block align-middle text-[9px] font-bold px-1.5 py-0.5 rounded border ${cor}`}>{fase.toUpperCase()}</span>
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
