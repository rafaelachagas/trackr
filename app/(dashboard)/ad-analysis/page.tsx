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

function cpmColor(v: number) { return v < 20 ? 'bg-emerald-500' : v < 40 ? 'bg-amber-500' : 'bg-red-500' }
function ctrColor(v: number) { return v >= 3 ? 'bg-emerald-500' : v >= 1.5 ? 'bg-amber-500' : 'bg-red-500' }
function hookColor(v: number) { return v >= 30 ? 'bg-emerald-500' : v >= 15 ? 'bg-amber-500' : 'bg-red-500' }
function roasColor(v: number) { return v >= 3 ? 'text-emerald-400' : v >= 1.5 ? 'text-amber-400' : 'text-red-400' }
function roasBg(v: number) { return v >= 3 ? 'bg-emerald-500' : v >= 1.5 ? 'bg-amber-500' : 'bg-red-500' }

function MetricBar({ label, value, formatted, barPct, colorFn }: {
  label: string; value: number | null; formatted: string; barPct: number; colorFn: (v: number) => string
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-[60px] shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${value !== null ? colorFn(value) : 'bg-muted'}`} style={{ width: `${Math.min(barPct, 100)}%` }} />
      </div>
      <span className={`w-14 text-right font-semibold tabular-nums text-[11px] ${value === null ? 'text-muted-foreground' : 'text-foreground'}`}>{formatted}</span>
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
    <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-2xl shadow-xl overflow-hidden w-[320px]">
      <div className="grid grid-cols-3 gap-px p-3 border-b border-border bg-background/50">
        {presets.map(p => (
          <button key={p.label} onClick={() => { onRangeChange(p.s, p.e); onClose() }}
            className="px-2 py-1.5 rounded-lg text-xs text-foreground hover:bg-muted/60 transition text-center">
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
function DetailModal({ metric: m, onClose }: { metric: AdMetric; onClose: () => void }) {
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
        <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
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
                  <p className={`text-sm font-bold tabular-nums ${roasColor(m.roas!)}`}>{m.roas!.toFixed(2)}x</p>
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
                    <span className={`w-14 text-right font-bold tabular-nums ${value === null ? 'text-muted-foreground' : roasColor(value)}`}>
                      {value !== null ? `${value.toFixed(2)}x` : '—'}
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
function AdCard({ metric: m, onExpand }: { metric: AdMetric; onExpand: () => void }) {
  const [imgErr, setImgErr] = useState(false)

  const cpmPct = m.cpm !== null ? Math.min((m.cpm / 60) * 100, 100) : 0
  const ctrPct = m.ctr !== null ? Math.min((m.ctr / 6) * 100, 100) : 0
  const hookPct = m.hook_rate !== null ? Math.min((m.hook_rate / 50) * 100, 100) : 0

  const thumbSrc = m.thumbnail_url ? `/api/meta/thumb-proxy?url=${encodeURIComponent(m.thumbnail_url)}` : null
  const hasThumb = !!thumbSrc && !imgErr
  const hasRoas = m.roas !== null && m.roas > 0

  return (
    <div className="rounded-xl overflow-hidden transition-colors group flex flex-col" style={{ backgroundColor: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Thumbnail */}
      <div className="relative bg-[#0d1117] overflow-hidden" style={{ height: '180px' }}>
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
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="w-8 h-8 text-muted-foreground/20" />
          </div>
        )}

        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

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

        {/* Name overlaid at bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 pt-8">
          <p className="text-[11px] font-semibold text-white leading-snug line-clamp-2" title={m.criativo}>
            {m.criativo}
          </p>
        </div>
      </div>

      {/* Main stats — Gasto + Impressões */}
      <div className="px-4 pt-3 pb-2 flex gap-6">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Gasto</p>
          <p className="text-xl font-bold text-rose-500 tabular-nums">{fmtBRL2(m.spend)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Impressões</p>
          <p className="text-xl font-semibold text-foreground tabular-nums">{fmtK(m.impressions)}</p>
        </div>
        {!hasRoas && <p className="text-xs text-muted-foreground/50 italic self-end pb-0.5">Sem conversões</p>}
      </div>

      {/* Divider */}
      <div className="px-4">
        <div className="h-px bg-border/40" />
      </div>

      {/* Metric bars section */}
      <div className="px-4 py-3 space-y-2">
        <MetricBar label="CPM" value={m.cpm} formatted={m.cpm !== null ? fmtBRL2(m.cpm) : '—'} barPct={cpmPct} colorFn={cpmColor} />
        <MetricBar label="CTR" value={m.ctr} formatted={m.ctr !== null ? `${m.ctr.toFixed(2)}%` : '—'} barPct={ctrPct} colorFn={ctrColor} />
        <MetricBar label="Hook Rate" value={m.hook_rate} formatted={m.hook_rate !== null ? `${m.hook_rate.toFixed(2)}%` : '—'} barPct={hookPct} colorFn={hookColor} />
      </div>

      {/* ROAS section (if available) */}
      {hasRoas && (
        <>
          <div className="px-4">
            <div className="h-px bg-border/40" />
          </div>
          <div className="px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">ROAS</p>
            <p className={`text-lg font-bold tabular-nums mb-2 ${roasColor(m.roas!)}`}>{m.roas!.toFixed(2)}x</p>
            {m.receita > 0 && (
              <>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Receita</p>
                <p className="text-base font-semibold text-emerald-400 tabular-nums">{fmtBRL(m.receita)}</p>
              </>
            )}
          </div>
        </>
      )}

      {/* Rolling ROAS section */}
      {(m.roas_1d !== null || m.roas_3d !== null || m.roas_7d !== null) && (
        <>
          <div className="px-4">
            <div className="h-px bg-border/40" />
          </div>
          <div className="px-4 py-3 space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">ROAS Rolling</p>
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
                <span className={`w-14 text-right font-semibold tabular-nums text-[11px] ${value === null ? 'text-muted-foreground' : roasColor(value)}`}>
                  {value !== null ? `${value.toFixed(2)}x` : '—'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Footer — Número de anúncios */}
      <div className="px-4 py-3 border-t border-border/40 mt-auto">
        <span className="text-[11px] text-muted-foreground">1 anúncio</span>
      </div>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function AdAnalysisPage() {
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
  const dateRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

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
      const json = await res.json()
      if (json.error) {
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
  }, [metrics, sortKey, sortAsc, tab, filtroFase])

  const fmtDate = (d: string) => format(parseISO(d), 'dd/MM/yy')

  return (
    <div className="pb-12 space-y-6 max-w-[1440px] mx-auto w-full">
      {expanded && <DetailModal metric={expanded} onClose={() => setExpanded(null)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Análise de Criativos</h1>
        <div className="flex items-center gap-3">
          <div ref={dateRef} className="relative">
            <button
              onClick={() => setShowDatePicker(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-muted/50 transition"
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

      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #111827 0%, rgba(28,77,135,0.2) 100%)', border: '1px solid rgba(85,182,247,0.12)' }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 flex-wrap gap-2" style={{ borderBottom: '1px solid rgba(85,182,247,0.08)' }}>
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted/50 transition">
                <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                {SORT_OPTIONS.find(s => s.key === sortKey)?.label}
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showSort ? 'rotate-180' : ''}`} />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl p-1 w-40">
                  {SORT_OPTIONS.map(s => (
                    <button key={s.key} onClick={() => toggleSort(s.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition ${sortKey === s.key ? 'text-primary font-semibold' : 'text-foreground hover:bg-muted/40'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="p-4">
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
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
