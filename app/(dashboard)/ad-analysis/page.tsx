'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import {
  format, subDays, parseISO, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isWithinInterval, addMonths, subMonths,
  startOfWeek, endOfWeek, isAfter, isBefore,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, ChevronDown, ArrowUpDown, ExternalLink, RefreshCw, ImageOff, ChevronLeft, ChevronRight, AlertCircle, Maximize2, X } from 'lucide-react'
import type { AdMetric } from '@/app/api/meta/ad-metrics/route'
import type { AcaoOtimizacao } from '@/types'
import { supabase } from '@/lib/supabase'
import { useDashboard } from '@/context/DashboardContext'

// ─── Framework de decisão (mesma matriz do Setup) ──────────────────
type RegraFramework = { p7: boolean; p3: boolean; p1: boolean; acao: AcaoOtimizacao }
const REGRAS_PADRAO: RegraFramework[] = [
  { p7: true,  p3: true,  p1: true,  acao: '+20% orçamento' },
  { p7: true,  p3: true,  p1: false, acao: 'Manter' },
  { p7: true,  p3: false, p1: true,  acao: '+20% orçamento' },
  { p7: true,  p3: false, p1: false, acao: '-20% ou pausar' },
  { p7: false, p3: true,  p1: true,  acao: '+20% orçamento' },
  { p7: false, p3: true,  p1: false, acao: 'Manter' },
  { p7: false, p3: false, p1: true,  acao: 'Manter' },
  { p7: false, p3: false, p1: false, acao: 'Pausar' },
]
const ACAO_META: Record<AcaoOtimizacao, { label: string; badge: string; chip: string; chipOn: string }> = {
  '+20% orçamento': { label: '▲ Escalar', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', chip: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30', chipOn: 'bg-emerald-500/40 text-emerald-200 border-emerald-400/60 ring-1 ring-emerald-400/30' },
  'Manter':         { label: '→ Manter',  badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',     chip: 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30',       chipOn: 'bg-amber-500/40 text-amber-200 border-amber-400/60 ring-1 ring-amber-400/30' },
  '-20% ou pausar': { label: '▼ Reduzir', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',  chip: 'bg-orange-500/20 text-orange-300 border-orange-500/30 hover:bg-orange-500/30',    chipOn: 'bg-orange-500/40 text-orange-200 border-orange-400/60 ring-1 ring-orange-400/30' },
  'Pausar':         { label: '✕ Pausar',  badge: 'bg-red-500/20 text-red-300 border-red-500/30',           chip: 'bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30',                chipOn: 'bg-red-500/40 text-red-200 border-red-400/60 ring-1 ring-red-400/30' },
}
function calcAcao(m: AdMetric, roasMin: number, regras: RegraFramework[]): AcaoOtimizacao | null {
  if (m.roas_7d === null && m.roas_3d === null && m.roas_1d === null) return null
  const p7 = (m.roas_7d ?? 0) >= roasMin
  const p3 = (m.roas_3d ?? 0) >= roasMin
  const p1 = (m.roas_1d ?? 0) >= roasMin
  return regras.find(r => r.p7 === p7 && r.p3 === p3 && r.p1 === p1)?.acao ?? null
}

function cpmColor(v: number) { return v < 20 ? 'bg-emerald-500' : v < 40 ? 'bg-amber-500' : 'bg-red-500' }
function ctrColor(v: number) { return v >= 3 ? 'bg-emerald-500' : v >= 1.5 ? 'bg-amber-500' : 'bg-red-500' }
function hookColor(v: number) { return v >= 30 ? 'bg-emerald-500' : v >= 15 ? 'bg-amber-500' : 'bg-red-500' }
function roasColor(v: number) { return v >= 2 ? 'text-emerald-400' : v >= 1 ? 'text-amber-400' : 'text-red-400' }
function roasBg(v: number) { return v >= 2 ? 'bg-emerald-500' : v >= 1 ? 'bg-amber-500' : 'bg-red-500' }

function MetricBar({ label, value, formatted, barPct, colorFn, isPrivate }: {
  label: string; value: number | null; formatted: string; barPct: number; colorFn: (v: number) => string; isPrivate?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-[60px] shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${value !== null ? colorFn(value) : 'bg-muted'}`} style={{ width: `${Math.min(barPct, 100)}%` }} />
      </div>
      <span className={`w-14 text-right font-semibold tabular-nums text-[11px] ${value === null ? 'text-muted-foreground' : 'text-foreground'} ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : formatted}</span>
    </div>
  )
}

const FASES = ['FASE01', 'FASE02', 'FASE03'] as const
const FASE_BADGE: Record<string, string> = {
  FASE01: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  FASE02: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  FASE03: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
}

type SortKey = 'spend' | 'cpm' | 'ctr' | 'frequency' | 'cpc' | 'roas'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'spend', label: 'Gasto' },
  { key: 'roas', label: 'ROAS' },
  { key: 'cpm', label: 'CPM' },
  { key: 'ctr', label: 'CTR' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'cpc', label: 'CPC' },
]

type Tab = 'todos' | 'roas' | 'ctr'

function CalendarRangePicker({
  startDate, endDate, onRangeChange, onClose,
}: {
  startDate: string; endDate: string
  onRangeChange: (start: string, end: string) => void
  onClose: () => void
}) {
  const today = new Date()
  const [viewMonth, setViewMonth] = useState(parseISO(endDate))
  const [selecting, setSelecting] = useState<Date | null>(null)

  const start = parseISO(startDate)
  const end = parseISO(endDate)

  const presets = [
    { label: 'Hoje', s: format(today, 'yyyy-MM-dd'), e: format(today, 'yyyy-MM-dd') },
    { label: 'Ontem', s: format(subDays(today, 1), 'yyyy-MM-dd'), e: format(subDays(today, 1), 'yyyy-MM-dd') },
    { label: 'Últimos 7 dias', s: format(subDays(today, 6), 'yyyy-MM-dd'), e: format(today, 'yyyy-MM-dd') },
    { label: 'Últimos 30 dias', s: format(subDays(today, 29), 'yyyy-MM-dd'), e: format(today, 'yyyy-MM-dd') },
    { label: 'Este Mês', s: format(startOfMonth(today), 'yyyy-MM-dd'), e: format(today, 'yyyy-MM-dd') },
    { label: 'Mês Passado', s: format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd'), e: format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd') },
  ]

  const calStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 })
  const calEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function handleDayClick(day: Date) {
    if (!selecting) {
      setSelecting(day)
    } else {
      const s = isBefore(day, selecting) ? day : selecting
      const e = isAfter(day, selecting) ? day : selecting
      onRangeChange(format(s, 'yyyy-MM-dd'), format(e, 'yyyy-MM-dd'))
      setSelecting(null)
      onClose()
    }
  }

  function dayClass(day: Date) {
    const inRange = !selecting && isWithinInterval(day, { start, end })
    const isCurrentMonth = day.getMonth() === viewMonth.getMonth()
    if ((selecting && isSameDay(day, selecting)) || (!selecting && (isSameDay(day, start) || isSameDay(day, end)))) {
      return 'bg-primary text-white font-bold rounded-full'
    }
    if (inRange) return 'bg-primary/20 text-foreground rounded-none'
    if (isSameDay(day, today)) return 'ring-1 ring-primary/60 text-foreground rounded-full'
    if (!isCurrentMonth) return 'text-muted-foreground/30'
    return 'text-foreground hover:bg-muted/40 rounded-full'
  }

  return (
    <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden w-[360px]" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="grid grid-cols-3 gap-1 p-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#151c1e' }}>
        {presets.map(p => (
          <button key={p.label} onClick={() => { onRangeChange(p.s, p.e); onClose() }}
            className="px-2 py-2 rounded-lg text-xs font-medium transition text-center hover:bg-white/5 cursor-pointer whitespace-nowrap" style={{ color: '#6b7980' }}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setViewMonth(m => subMonths(m, 1))} className="p-1 rounded-lg hover:bg-muted/40 transition">
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-semibold text-foreground capitalize">
          {format(viewMonth, 'MMMM yyyy', { locale: ptBR })}
        </span>
        <button onClick={() => setViewMonth(m => addMonths(m, 1))} className="p-1 rounded-lg hover:bg-muted/40 transition">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-7 px-3 pb-1">
        {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
        {days.map(day => (
          <button key={day.toISOString()} onClick={() => handleDayClick(day)}
            className={`h-8 w-full text-xs transition-colors ${dayClass(day)}`}>
            {day.getDate()}
          </button>
        ))}
      </div>
      {selecting && (
        <div className="px-4 pb-3 text-xs text-muted-foreground text-center">Agora clique na data final</div>
      )}
    </div>
  )
}

function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(v)
}
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtBRL2(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
}

/* ─── Detail Modal ───────────────────────────────────────────────── */
function DetailModal({ metric: m, onClose, isPrivate }: { metric: AdMetric; onClose: () => void; isPrivate: boolean }) {
  const [imgErr, setImgErr] = useState(false)
  const thumbSrc = m.thumbnail_url ? `/api/meta/thumb-proxy?url=${encodeURIComponent(m.thumbnail_url)}` : null
  const hasThumb = !!thumbSrc && !imgErr
  const hasRoas = m.roas !== null && m.roas > 0

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function StatCell({ label, value }: { label: string; value: string }) {
    return (
      <div className="bg-background/60 rounded-xl p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
        <p className={`text-sm font-bold text-foreground tabular-nums ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : value}</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{m.criativo}</p>
            {m.fase && (
              <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${FASE_BADGE[m.fase] ?? 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'}`}>
                {m.fase}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {m.link_anuncio && (
              <a
                href={m.link_anuncio}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver anúncio
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 transition text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-0">
          {/* Thumbnail panel */}
          <div className="md:w-64 shrink-0 bg-black/30">
            {hasThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbSrc!}
                alt={m.criativo}
                onError={() => setImgErr(true)}
                className="w-full h-full object-cover md:rounded-bl-2xl"
                style={{ maxHeight: '520px' }}
              />
            ) : (
              <div className="w-full flex items-center justify-center py-20 md:rounded-bl-2xl">
                <ImageOff className="w-10 h-10 text-muted-foreground/20" />
              </div>
            )}
          </div>

          {/* Metrics panel */}
          <div className="flex-1 p-5 space-y-4">
            {/* Main stats grid */}
            <div className="grid grid-cols-3 gap-2">
              <StatCell label="Gasto" value={fmtBRL2(m.spend)} />
              <StatCell label="Impressões" value={fmtK(m.impressions)} />
              <StatCell label="Cliques" value={fmtK(m.clicks)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCell label="CPM" value={m.cpm !== null ? fmtBRL2(m.cpm) : '—'} />
              <StatCell label="CPC" value={m.cpc !== null ? fmtBRL2(m.cpc) : '—'} />
              <StatCell label="CTR" value={m.ctr !== null ? `${m.ctr.toFixed(2)}%` : '—'} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCell label="Hook Rate" value={m.hook_rate !== null ? `${m.hook_rate.toFixed(2)}%` : '—'} />
              <StatCell label="Frequência" value={m.frequency !== null ? m.frequency.toFixed(1) : '—'} />
              <div className="bg-background/60 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">ROAS</p>
                {hasRoas ? (
                  <p className={`text-sm font-bold tabular-nums ${roasColor(m.roas!)} ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : `${m.roas!.toFixed(2)}x`}</p>
                ) : (
                  <p className="text-sm font-bold text-muted-foreground">—</p>
                )}
              </div>
            </div>

            {/* Rolling ROAS */}
            {(m.roas_1d !== null || m.roas_3d !== null || m.roas_7d !== null) && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ROAS Rolling</p>
                {([
                  { label: 'Últ. 7d', value: m.roas_7d },
                  { label: 'Últ. 3d', value: m.roas_3d },
                  { label: 'Últ. 1d', value: m.roas_1d },
                ] as const).map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-3 text-xs">
                    <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      {value !== null && (
                        <div
                          className={`h-full rounded-full ${roasBg(value)}`}
                          style={{ width: `${Math.min((value / 5) * 100, 100)}%` }}
                        />
                      )}
                    </div>
                    <span className={`w-14 text-right font-bold tabular-nums ${value === null ? 'text-muted-foreground' : roasColor(value)} ${isPrivate ? 'blur-sm select-none' : ''}`}>
                      {isPrivate ? '••••' : (value !== null ? `${value.toFixed(2)}x` : '—')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Ad Card ────────────────────────────────────────────────────── */
function AdCard({ metric: m, onExpand, acao, isPrivate }: { metric: AdMetric; onExpand: () => void; acao: AcaoOtimizacao | null; isPrivate: boolean }) {
  const [imgErr, setImgErr] = useState(false)

  const cpmPct = m.cpm !== null ? Math.min((m.cpm / 60) * 100, 100) : 0
  const ctrPct = m.ctr !== null ? Math.min((m.ctr / 6) * 100, 100) : 0
  const hookPct = m.hook_rate !== null ? Math.min((m.hook_rate / 50) * 100, 100) : 0

  const thumbSrc = m.thumbnail_url ? `/api/meta/thumb-proxy?url=${encodeURIComponent(m.thumbnail_url)}` : null
  const hasThumb = !!thumbSrc && !imgErr
  const hasRoas = m.roas !== null && m.roas > 0

  return (
    <div className="rounded-2xl transition-colors group flex flex-col p-3" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.07)' }}>

      {/* Thumbnail */}
      <div className="relative rounded-xl overflow-hidden mb-3" style={{ height: '192px' }}>
          {hasThumb ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbSrc!}
                alt={m.criativo}
                onError={() => setImgErr(true)}
                className="w-full h-full object-cover"
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#262d2f' }}>
              <ImageOff className="w-8 h-8 text-muted-foreground/20" />
            </div>
          )}

          {/* Gradient overlay + name at bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-3 pt-10">
            <p className="text-[11px] font-semibold text-white leading-snug line-clamp-2" title={m.criativo}>
              {m.criativo}
            </p>
          </div>

          {/* Action buttons — top right */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onExpand}
              className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition"
              title="Ver detalhes"
            >
              <Maximize2 className="w-3.5 h-3.5 text-white" />
            </button>
            {m.link_anuncio && (
              <a
                href={m.link_anuncio}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition"
                title="Abrir no Instagram"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5 text-white" />
              </a>
            )}
          </div>

          {/* Fase badge — top left */}
          {m.fase && (
            <span className={`absolute top-2 left-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${FASE_BADGE[m.fase] ?? 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'}`}>
              {m.fase}
            </span>
          )}
      </div>

      {/* Selo de ação (Framework) */}
      {acao && (
        <div className={`mb-3 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${ACAO_META[acao].badge}`}>
          {ACAO_META[acao].label}
        </div>
      )}

      {/* Main stats — mini-cards lado a lado */}
      <div className="flex gap-2 mb-3">
        {/* Mini-card: Gasto + Impressões empilhados */}
        <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: '#262d2f' }}>
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Gasto</p>
          <p className={`text-base font-bold text-rose-500 tabular-nums leading-tight ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : fmtBRL2(m.spend)}</p>
          <div className="h-px my-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Impressões</p>
          <p className={`text-base font-semibold text-foreground tabular-nums leading-tight ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : fmtK(m.impressions)}</p>
        </div>
        {/* Mini-card direito: Sem conversões ou ROAS */}
        <div className="flex-1 rounded-xl p-3 flex items-center justify-center" style={{ backgroundColor: '#262d2f' }}>
          {hasRoas ? (
            <div className="w-full">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">ROAS</p>
              <p className={`text-base font-bold tabular-nums ${roasColor(m.roas!)} ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : `${m.roas!.toFixed(2)}x`}</p>
              {m.receita > 0 && (
                <>
                  <div className="h-px my-2" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Receita</p>
                  <p className={`text-base font-semibold text-emerald-400 tabular-nums ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : fmtBRL(m.receita)}</p>
                </>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/50 italic">Sem conversões</p>
          )}
        </div>
      </div>

      {/* Metric bars section */}
      <div className="px-1 pb-2 space-y-2.5">
        <MetricBar label="CPM" value={m.cpm} formatted={m.cpm !== null ? fmtBRL2(m.cpm) : '—'} barPct={cpmPct} colorFn={cpmColor} isPrivate={isPrivate} />
        <MetricBar label="CTR" value={m.ctr} formatted={m.ctr !== null ? `${m.ctr.toFixed(2)}%` : '—'} barPct={ctrPct} colorFn={ctrColor} isPrivate={isPrivate} />
        <MetricBar label="Hook Rate" value={m.hook_rate} formatted={m.hook_rate !== null ? `${m.hook_rate.toFixed(2)}%` : '—'} barPct={hookPct} colorFn={hookColor} isPrivate={isPrivate} />
      </div>

      {/* Rolling ROAS section */}
      {(m.roas_1d !== null || m.roas_3d !== null || m.roas_7d !== null) && (
        <>
          <div className="h-px mx-1 my-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <div className="px-1 pb-3 space-y-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">ROAS Rolling</p>
            {([
              { label: 'Últ. 7d', value: m.roas_7d },
              { label: 'Últ. 3d', value: m.roas_3d },
              { label: 'Últ. 1d', value: m.roas_1d },
            ] as const).map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2 text-[11px]">
                <span className="w-[60px] shrink-0 text-muted-foreground">{label}</span>
                <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  {value !== null && (
                    <div
                      className={`h-full rounded-full ${roasBg(value)}`}
                      style={{ width: `${Math.min((value / 5) * 100, 100)}%` }}
                    />
                  )}
                </div>
                <span className={`w-14 text-right font-semibold tabular-nums text-[11px] ${value === null ? 'text-muted-foreground' : roasColor(value)} ${isPrivate ? 'blur-sm select-none' : ''}`}>
                  {isPrivate ? '••••' : (value !== null ? `${value.toFixed(2)}x` : '—')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Footer — Número de anúncios */}
      <div className="px-1 py-2 border-t mt-auto" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <span className="text-[11px] text-muted-foreground">1 anúncio</span>
      </div>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function AdAnalysisPage() {
  const { isPrivate } = useDashboard()
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [dataFim, setDataFim] = useState(hoje)
  const [metrics, setMetrics] = useState<AdMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortAsc, setSortAsc] = useState(false)
  const [tab, setTab] = useState<Tab>('todos')
  const [filtroFase, setFiltroFase] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [atualizado, setAtualizado] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<AdMetric | null>(null)
  const [roasMin, setRoasMin] = useState(2)
  const [regras, setRegras] = useState<RegraFramework[]>(REGRAS_PADRAO)
  const [filtroAcao, setFiltroAcao] = useState<AcaoOtimizacao | null>(null)
  const dateRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  // Lê a matriz de decisão do Setup (mesma fonte do Framework) pra rotular cada criativo.
  useEffect(() => {
    supabase.from('configuracoes').select('chave,valor').in('chave', ['roas_minimo', 'framework_regras']).then(({ data }) => {
      data?.forEach(c => {
        if (c.chave === 'roas_minimo' && c.valor) setRoasMin(parseFloat(c.valor) || 2)
        if (c.chave === 'framework_regras' && c.valor) { try { setRegras(JSON.parse(c.valor)) } catch {} }
      })
    })
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setShowDatePicker(false)
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSort(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function carregar() {
    setLoading(true)
    setApiError(null)
    try {
      const res = await fetch(`/api/meta/ad-metrics?dataInicio=${dataInicio}&dataFim=${dataFim}`)
      // Se a função estourar o tempo/limite, a Vercel devolve uma página de erro
      // em texto (não JSON). Lê o corpo cru e só tenta o parse se for JSON, pra
      // mostrar um erro legível em vez de "Unexpected token ... is not valid JSON".
      const raw = await res.text()
      let json: any = null
      try { json = JSON.parse(raw) } catch {}
      if (!json) {
        setApiError(
          res.status === 504 || res.status === 502
            ? 'A análise demorou demais e o servidor encerrou a requisição (timeout). Tente um período menor.'
            : `Falha no servidor (HTTP ${res.status}).`
        )
        setMetrics([])
      } else if (json.error) {
        setApiError(json.error)
        setMetrics([])
      } else {
        setMetrics(json.metrics ?? [])
      }
      setAtualizado(format(new Date(), 'HH:mm'))
    } catch (e) {
      setApiError(`Erro de rede: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [dataInicio, dataFim])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
    setShowSort(false)
  }

  const filtered = useMemo(() => {
    let list = [...metrics]
    if (filtroFase) list = list.filter(m => m.fase === filtroFase)
    if (filtroAcao) list = list.filter(m => calcAcao(m, roasMin, regras) === filtroAcao)
    if (tab === 'roas') list = list.filter(m => m.roas !== null).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
    else if (tab === 'ctr') list = list.filter(m => m.ctr !== null).sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))
    else {
      list.sort((a, b) => {
        const av = (a[sortKey] ?? 0) as number
        const bv = (b[sortKey] ?? 0) as number
        return sortAsc ? av - bv : bv - av
      })
    }
    return list
  }, [metrics, sortKey, sortAsc, tab, filtroFase, filtroAcao, roasMin, regras])

  // Contagem por ação (respeita o filtro de fase, ignora o de ação pra os chips mostrarem o total)
  const contagemAcao = useMemo(() => {
    const base = filtroFase ? metrics.filter(m => m.fase === filtroFase) : metrics
    const c: Record<string, number> = {}
    for (const m of base) { const a = calcAcao(m, roasMin, regras); if (a) c[a] = (c[a] ?? 0) + 1 }
    return c
  }, [metrics, filtroFase, roasMin, regras])

  const fmtDate = (d: string) => format(parseISO(d), 'dd/MM/yy')

  return (
    <div className="pb-12 space-y-6 max-w-[1440px] mx-auto w-full px-4 sm:px-6 lg:px-8">
      {expanded && <DetailModal metric={expanded} onClose={() => setExpanded(null)} isPrivate={isPrivate} />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Análise de Criativos</h1>
        <div className="flex items-center gap-3">
          <div ref={dateRef} className="relative">
            <button
              onClick={() => setShowDatePicker(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition hover:bg-white/5"
              style={{ border: '1px solid rgba(255,255,255,0.07)', backgroundColor: '#1a2022', color: '#e2e8f0' }}
            >
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{fmtDate(dataInicio)}</span>
              <span className="text-muted-foreground mx-0.5">–</span>
              <span className="font-medium">{fmtDate(dataFim)}</span>
            </button>
            {showDatePicker && (
              <CalendarRangePicker
                startDate={dataInicio} endDate={dataFim}
                onRangeChange={(s, e) => { setDataInicio(s); setDataFim(e) }}
                onClose={() => setShowDatePicker(false)}
              />
            )}
          </div>
          <button onClick={carregar} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold border border-primary/20 hover:bg-primary hover:text-white transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {atualizado ? `Atualizado: ${atualizado}` : 'Carregar'}
          </button>
        </div>
      </div>

      {apiError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden bg-card border border-border">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 flex-wrap gap-2 border-b border-border">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-3">Análise de Criativos</p>
            {([
              { key: 'todos' as Tab, label: 'Todos' },
              { key: 'roas' as Tab, label: 'Maiores ROAS' },
              { key: 'ctr' as Tab, label: 'Maiores CTR' },
            ]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${tab === t.key ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              {(['todas', ...FASES] as const).map(f => (
                <button key={f}
                  onClick={() => setFiltroFase(f === 'todas' ? null : (filtroFase === f ? null : f))}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border ${
                    (f === 'todas' && filtroFase === null)
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : (f !== 'todas' && filtroFase === f)
                      ? `border ${FASE_BADGE[f]}`
                      : 'border-transparent text-muted-foreground hover:bg-muted/40'
                  }`}>
                  {f === 'todas' ? 'Todas' : f}
                </button>
              ))}
            </div>

            <div ref={sortRef} className="relative">
              <button onClick={() => setShowSort(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:bg-white/5"
                style={{ border: '1px solid rgba(255,255,255,0.07)', backgroundColor: '#1a2022', color: '#e2e8f0' }}>
                <ArrowUpDown className="w-3.5 h-3.5" style={{ color: '#6b7980' }} />
                {SORT_OPTIONS.find(s => s.key === sortKey)?.label}
                <ChevronDown className={`w-3 h-3 transition-transform ${showSort ? 'rotate-180' : ''}`} style={{ color: '#6b7980' }} />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-2xl p-1 w-40" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {SORT_OPTIONS.map(s => (
                    <button key={s.key} onClick={() => toggleSort(s.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition hover:bg-white/5 ${sortKey === s.key ? 'font-semibold' : ''}`}
                      style={{ color: sortKey === s.key ? '#2E90FA' : '#e2e8f0' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Barra de decisão (Framework fundido) */}
        {!loading && metrics.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border">
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mr-1">Decisão</span>
            <button
              onClick={() => setFiltroAcao(null)}
              className={`text-xs font-bold px-2.5 py-1 rounded-full border transition ${filtroAcao === null ? 'bg-primary/20 text-primary border-primary/40' : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/30'}`}
            >
              Todos
            </button>
            {(['+20% orçamento', 'Manter', '-20% ou pausar', 'Pausar'] as AcaoOtimizacao[]).map(a =>
              (contagemAcao[a] ?? 0) > 0 ? (
                <button
                  key={a}
                  onClick={() => setFiltroAcao(filtroAcao === a ? null : a)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border transition ${filtroAcao === a ? ACAO_META[a].chipOn : ACAO_META[a].chip}`}
                >
                  {ACAO_META[a].label} · {contagemAcao[a]}
                </button>
              ) : null
            )}
          </div>
        )}

        {/* Cards grid */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {apiError ? 'Erro ao carregar dados.' : 'Nenhum dado encontrado para o período selecionado.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((m, i) => (
                <AdCard
                  key={`${m.ad_name}-${m.fase ?? 'x'}-${i}`}
                  metric={m}
                  onExpand={() => setExpanded(m)}
                  acao={calcAcao(m, roasMin, regras)}
                  isPrivate={isPrivate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
