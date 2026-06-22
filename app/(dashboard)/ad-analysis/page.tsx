'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { format, subDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar, ChevronDown, ArrowUpDown, ExternalLink, RefreshCw, ImageOff } from 'lucide-react'
import type { AdMetric } from '@/app/api/meta/ad-metrics/route'

// ── Thresholds para colorir as barras ──────────────────────────────────────
// CPM: quanto menor, melhor
function cpmColor(v: number) {
  if (v < 20) return 'bg-emerald-500'
  if (v < 40) return 'bg-amber-500'
  return 'bg-red-500'
}
// CTR: quanto maior, melhor
function ctrColor(v: number) {
  if (v >= 3) return 'bg-emerald-500'
  if (v >= 1.5) return 'bg-amber-500'
  return 'bg-red-500'
}
// Hook Rate: quanto maior, melhor
function hookColor(v: number) {
  if (v >= 30) return 'bg-emerald-500'
  if (v >= 15) return 'bg-amber-500'
  return 'bg-red-500'
}
// CPC: quanto menor, melhor
function cpcColor(v: number) {
  if (v < 5) return 'bg-emerald-500'
  if (v < 15) return 'bg-amber-500'
  return 'bg-red-500'
}

function MetricBar({
  label, value, formatted, barPct, colorFn,
}: {
  label: string
  value: number | null
  formatted: string
  barPct: number
  colorFn: (v: number) => string
}) {
  const color = value !== null ? colorFn(value) : 'bg-muted'
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-20 shrink-0 text-muted-foreground font-medium">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(barPct, 100)}%` }}
        />
      </div>
      <span className={`w-14 text-right font-bold tabular-nums ${value === null ? 'text-muted-foreground' : 'text-foreground'}`}>
        {formatted}
      </span>
    </div>
  )
}

const FASES = ['FASE01', 'FASE02', 'FASE03'] as const
const FASE_BADGE: Record<string, string> = {
  FASE01: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  FASE02: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  FASE03: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
}

type SortKey = 'spend' | 'cpm' | 'ctr' | 'hook_rate' | 'frequency' | 'cpc'
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'spend', label: 'Gasto' },
  { key: 'cpm', label: 'CPM' },
  { key: 'ctr', label: 'CTR' },
  { key: 'hook_rate', label: 'Hook Rate' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'cpc', label: 'CPC' },
]

type Tab = 'todos' | 'hook' | 'ctr'

const PRESETS = [
  { label: 'Hoje', days: 0 },
  { label: 'Ontem', days: 1 },
  { label: 'Últimos 7 dias', days: 6 },
  { label: 'Últimos 30 dias', days: 29 },
]

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
}
function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(v)
}

export default function AdAnalysisPage() {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [dataFim, setDataFim] = useState(hoje)
  const [metrics, setMetrics] = useState<AdMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortAsc, setSortAsc] = useState(false)
  const [tab, setTab] = useState<Tab>('todos')
  const [filtroFase, setFiltroFase] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [atualizado, setAtualizado] = useState<string | null>(null)
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
    try {
      const res = await fetch(`/api/meta/ad-metrics?dataInicio=${dataInicio}&dataFim=${dataFim}`)
      const json = await res.json()
      setMetrics(json.metrics ?? [])
      setAtualizado(format(new Date(), 'HH:mm'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [dataInicio, dataFim])

  function applyPreset(days: number) {
    const fim = format(new Date(), 'yyyy-MM-dd')
    const ini = format(subDays(new Date(), days), 'yyyy-MM-dd')
    setDataInicio(ini)
    setDataFim(fim)
    setShowDatePicker(false)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
    setShowSort(false)
  }

  const filtered = useMemo(() => {
    let list = [...metrics]
    if (filtroFase) list = list.filter(m => m.fase === filtroFase)
    if (tab === 'hook') list = list.filter(m => m.hook_rate !== null).sort((a, b) => (b.hook_rate ?? 0) - (a.hook_rate ?? 0))
    else if (tab === 'ctr') list = list.filter(m => m.ctr !== null).sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))
    else {
      list.sort((a, b) => {
        const av = a[sortKey] ?? 0
        const bv = b[sortKey] ?? 0
        return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
      })
    }
    return list
  }, [metrics, sortKey, sortAsc, tab, filtroFase])

  const fmtDate = (d: string) => format(parseISO(d), 'dd/MM/yy')

  return (
    <div className="pb-12 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Análise de Criativos</h1>
        <div className="flex items-center gap-3">
          {/* Date picker */}
          <div ref={dateRef} className="relative">
            <button
              onClick={() => setShowDatePicker(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground hover:bg-muted/50 transition"
            >
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{fmtDate(dataInicio)}</span>
              <span className="text-muted-foreground">–</span>
              <span className="font-medium">{fmtDate(dataFim)}</span>
            </button>
            {showDatePicker && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-2xl shadow-xl p-4 w-64 space-y-1">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.days)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted/50 transition"
                  >
                    {p.label}
                  </button>
                ))}
                <div className="pt-2 border-t border-border space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">De</label>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={e => setDataInicio(e.target.value)}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Até</label>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={e => setDataFim(e.target.value)}
                      className="w-full mt-1 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-foreground"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Atualizar */}
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold border border-primary/20 hover:bg-primary hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {atualizado ? `Atualizado: ${atualizado}` : 'Carregar'}
          </button>
        </div>
      </div>

      {/* Container de cards */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-3">Criativos em Cards</p>
            {/* Tabs */}
            {([
              { key: 'todos' as Tab, label: 'Todos' },
              { key: 'hook' as Tab, label: 'Melhores Ganchos' },
              { key: 'ctr' as Tab, label: 'Maiores CTR' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === t.key
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Filtro fase */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFiltroFase(null)}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition border ${
                  filtroFase === null ? 'border-primary/40 bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-muted/40'
                }`}
              >
                Todas
              </button>
              {FASES.map(f => (
                <button
                  key={f}
                  onClick={() => setFiltroFase(filtroFase === f ? null : f)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition border ${
                    filtroFase === f
                      ? `border ${FASE_BADGE[f]}`
                      : 'border-transparent text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div ref={sortRef} className="relative">
              <button
                onClick={() => setShowSort(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted/50 transition"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                {SORT_OPTIONS.find(s => s.key === sortKey)?.label}
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showSort ? 'rotate-180' : ''}`} />
              </button>
              {showSort && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl p-1 w-40">
                  {SORT_OPTIONS.map(s => (
                    <button
                      key={s.key}
                      onClick={() => toggleSort(s.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition ${
                        sortKey === s.key ? 'text-primary font-semibold' : 'text-foreground hover:bg-muted/40'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              Nenhum dado encontrado para o período selecionado.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((m, i) => (
                <AdCard key={`${m.ad_name}-${m.fase}-${i}`} metric={m} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AdCard({ metric: m }: { metric: AdMetric }) {
  const [imgErr, setImgErr] = useState(false)

  const cpmPct = m.cpm !== null ? Math.min((m.cpm / 60) * 100, 100) : 0
  const ctrPct = m.ctr !== null ? Math.min((m.ctr / 6) * 100, 100) : 0
  const hookPct = m.hook_rate !== null ? Math.min((m.hook_rate / 60) * 100, 100) : 0
  const cpcPct = m.cpc !== null ? Math.min((m.cpc / 30) * 100, 100) : 0

  const temThumbnail = m.thumbnail_url && !imgErr

  return (
    <div className="bg-background border border-border rounded-2xl overflow-hidden hover:border-border/80 transition group">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {temThumbnail ? (
          <a href={m.link_anuncio ?? '#'} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.thumbnail_url!}
              alt={m.criativo}
              onError={() => setImgErr(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
              <span className="text-xs font-semibold text-white truncate flex-1 mr-2" title={m.criativo}>
                {m.criativo}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-white/70 shrink-0 opacity-0 group-hover:opacity-100 transition" />
            </div>
          </a>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <ImageOff className="w-8 h-8 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground/60 text-center px-4 truncate w-full text-center" title={m.criativo}>
              {m.criativo}
            </span>
          </div>
        )}

        {/* Fase badge */}
        {m.fase && (
          <span className={`absolute top-2 right-2 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${FASE_BADGE[m.fase] ?? 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'}`}>
            {m.fase}
          </span>
        )}
      </div>

      {/* Métricas */}
      <div className="p-4 space-y-3">
        {/* Resumo gasto + impressões */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Gasto</p>
            <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
              {m.spend > 0 ? m.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'R$ 0'}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Impressões</p>
            <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">{fmtK(m.impressions)}</p>
          </div>
        </div>

        {/* Barras de métricas */}
        <div className="space-y-2 pt-1 border-t border-border">
          <MetricBar
            label="CPM"
            value={m.cpm}
            formatted={m.cpm !== null ? m.cpm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }) : '—'}
            barPct={cpmPct}
            colorFn={cpmColor}
          />
          <MetricBar
            label="CTR"
            value={m.ctr}
            formatted={m.ctr !== null ? `${m.ctr.toFixed(2)}%` : '—'}
            barPct={ctrPct}
            colorFn={ctrColor}
          />
          <MetricBar
            label="Hook Rate"
            value={m.hook_rate}
            formatted={m.hook_rate !== null ? `${m.hook_rate.toFixed(2)}%` : '—'}
            barPct={hookPct}
            colorFn={hookColor}
          />
          <MetricBar
            label="Frequência"
            value={m.frequency}
            formatted={m.frequency !== null && m.frequency > 0 ? m.frequency.toFixed(1) : '—'}
            barPct={m.frequency !== null ? Math.min((m.frequency / 5) * 100, 100) : 0}
            colorFn={(v) => v < 2 ? 'bg-emerald-500' : v < 4 ? 'bg-amber-500' : 'bg-red-500'}
          />
          <MetricBar
            label="CPC"
            value={m.cpc}
            formatted={m.cpc !== null ? m.cpc.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }) : '—'}
            barPct={cpcPct}
            colorFn={cpcColor}
          />
        </div>

        {/* Link para o anúncio */}
        {m.link_anuncio && (
          <a
            href={m.link_anuncio}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition pt-1"
          >
            <ExternalLink className="w-3 h-3" />
            Ver anúncio
          </a>
        )}
      </div>
    </div>
  )
}
