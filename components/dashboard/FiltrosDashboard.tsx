'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Info, ChevronDown, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, isWithinInterval,
  addMonths, subMonths, subDays
} from 'date-fns'
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'
import { ptBR } from 'date-fns/locale'
import { spDayRangeInstants } from '@/lib/utils'

const TZ = 'America/Sao_Paulo'

const PERIODS = ['Máximo', 'Hoje', 'Ontem', 'Últimos 7 dias', 'Esse mês', 'Mês passado', 'Personalizado']
const PRESETS = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Últimos 30 dias', 'Este Mês', 'Mês Passado']
const WEEK_DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const dropdownBase: React.CSSProperties = {
  backgroundColor: '#13181a',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '12px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: '6px',
  zIndex: 50,
}

const btnBase: React.CSSProperties = {
  backgroundColor: '#0e1315',
  border: '1px solid rgba(255,255,255,0.06)',
  color: '#e2e8f0',
  borderRadius: '8px',
}

// Dropdown genérico reutilizável
function FilterDropdown({ label, value, options, onChange, showInfo }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; showInfo?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="flex-1 min-w-0" ref={ref}>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">{label}</span>
        {showInfo && <Info className="w-3 h-3 text-muted-foreground opacity-40 flex-shrink-0" />}
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full h-10 px-3 flex items-center justify-between text-xs font-semibold transition-all"
          style={btnBase}
        >
          <span className="truncate">{value}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div style={{ ...dropdownBase, minWidth: '100%' }}>
            <div className="p-1">
              {options.map(opt => (
                <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all hover:bg-white/5 whitespace-nowrap"
                  style={{ color: value === opt ? '#00aeef' : '#e2e8f0' }}
                >{opt}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FiltrosDashboard() {
  const { period, setPeriod, product, setProduct, dateRange, setDateRange,
    sincronizarTudo, lastUpdate, isRefreshing, productsList } = useDashboard()

  const [periodOpen, setPeriodOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selecting, setSelecting] = useState<'start' | 'end'>('start')
  const [hoverDate, setHoverDate] = useState<Date | null>(null)

  const [adAccount] = useState('Qualquer')
  const [trafficSource, setTrafficSource] = useState('Qualquer')
  const [platform, setPlatformFilter] = useState('Qualquer')

  const periodRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodOpen(false); setCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function selectPeriod(p: string) {
    setPeriod(p as any)
    setPeriodOpen(false)
    if (p === 'Personalizado') { setCalendarOpen(true); setSelecting('start') }
    else setCalendarOpen(false)
  }

  function applyPreset(preset: string) {
    // Ancorado em SP (não no fuso do navegador) — mesmo padrão do dropdown.
    const nowSP = toZonedTime(new Date(), TZ)
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
    let s = fmt(nowSP)
    let e = fmt(nowSP)
    if (preset === 'Hoje') { s = fmt(nowSP) }
    else if (preset === 'Ontem') { s = e = fmt(subDays(nowSP, 1)) }
    else if (preset === 'Últimos 7 dias') { s = fmt(subDays(nowSP, 6)) }
    else if (preset === 'Últimos 30 dias') { s = fmt(subDays(nowSP, 29)) }
    else if (preset === 'Este Mês') { s = fmt(startOfMonth(nowSP)) }
    else if (preset === 'Mês Passado') { s = fmt(startOfMonth(subMonths(nowSP, 1))); e = fmt(endOfMonth(subMonths(nowSP, 1))) }
    setDateRange(spDayRangeInstants(s, e))
    setCalendarOpen(false); setSelecting('start')
  }

  function handleDayClick(date: Date) {
    const dStr = format(date, 'yyyy-MM-dd')
    if (selecting === 'start') {
      setDateRange(spDayRangeInstants(dStr, dStr)); setSelecting('end')
    } else {
      const startStr = dateRange.start ? formatInTimeZone(dateRange.start, TZ, 'yyyy-MM-dd') : dStr
      const [a, b] = dStr < startStr ? [dStr, startStr] : [startStr, dStr]
      setDateRange(spDayRangeInstants(a, b)); setSelecting('start'); setCalendarOpen(false)
    }
  }

  function renderDays() {
    const gridStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 })
    const gridEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 })
    const days: React.ReactElement[] = []
    let d = gridStart
    while (d <= gridEnd) {
      const day = d
      const isStart = dateRange.start && isSameDay(day, dateRange.start)
      const isEnd = dateRange.end && isSameDay(day, dateRange.end)
      const rangeEnd = hoverDate && selecting === 'end' && dateRange.start && hoverDate > dateRange.start ? hoverDate : dateRange.end
      const inRange = dateRange.start && rangeEnd && isWithinInterval(day, { start: dateRange.start, end: rangeEnd })
      days.push(
        <button key={day.toISOString()} onClick={() => handleDayClick(day)}
          onMouseEnter={() => setHoverDate(day)} onMouseLeave={() => setHoverDate(null)}
          className="w-9 h-9 text-xs font-semibold rounded-full flex items-center justify-center transition-all"
          style={{
            color: !isSameMonth(day, calendarMonth) ? 'rgba(255,255,255,0.2)' : isStart || isEnd ? '#fff' : isSameDay(day, new Date()) ? '#00aeef' : '#e2e8f0',
            backgroundColor: isStart || isEnd ? '#00aeef' : inRange ? 'rgba(0,174,239,0.12)' : 'transparent',
          }}
        >{format(day, 'd')}</button>
      )
      d = addDays(d, 1)
    }
    return days
  }

  const periodLabel = period === 'Personalizado' && dateRange.start && dateRange.end
    ? `${format(dateRange.start, 'dd/MM')} → ${format(dateRange.end, 'dd/MM')}` : period

  return (
    <div>
      {/* Linha 1: Resumo + botão Atualizar */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-foreground">Resumo</h2>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-tight">Sincronizado</span>
            <span className="text-[10px] font-bold text-muted-foreground tracking-tighter leading-tight opacity-70">{format(lastUpdate, 'HH:mm:ss')}</span>
          </div>
          <button onClick={sincronizarTudo} disabled={isRefreshing}
            className="h-9 px-6 bg-primary text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
          >
            {isRefreshing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : null}
            Atualizar
          </button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }} />

      {/* Linha 2: Filtros */}
      <div className="grid grid-cols-2 gap-3 md:flex md:items-end">

        {/* Período (especial — tem calendar) */}
        <div className="col-span-2 md:flex-1 min-w-0" ref={periodRef}>
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Período de Visualização</span>
            <Info className="w-3 h-3 text-muted-foreground opacity-40 flex-shrink-0" />
          </div>
          <div className="relative">
            <button
              onClick={() => {
                if (period === 'Personalizado') { setCalendarOpen(v => !v); setPeriodOpen(false) }
                else { setPeriodOpen(v => !v); setCalendarOpen(false) }
              }}
              className="w-full h-10 px-3 flex items-center justify-between text-xs font-semibold transition-all"
              style={btnBase}
            >
              <span className="truncate">{periodLabel}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 ml-2 transition-transform ${periodOpen || calendarOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown de opções */}
            {periodOpen && (
              <div style={{ ...dropdownBase, minWidth: '100%' }}>
                <div className="p-1">
                  {PERIODS.map(p => (
                    <button key={p} onClick={() => selectPeriod(p)}
                      className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all hover:bg-white/5"
                      style={{ color: period === p ? '#00aeef' : '#e2e8f0' }}
                    >{p}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Calendar picker */}
            {calendarOpen && (
              <div style={{ ...dropdownBase, width: '320px' }}>
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-1.5 mb-4">
                    {PRESETS.map(p => (
                      <button key={p} onClick={() => applyPreset(p)}
                        className="text-[10px] font-bold px-2 py-2 rounded-lg transition-all hover:bg-white/5 text-center leading-tight"
                        style={{ color: '#94a3b8', border: '1px solid rgba(255,255,255,0.05)' }}
                      >{p}</button>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }} />
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="p-1.5 rounded-lg hover:bg-white/5 transition">
                      <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <span className="text-sm font-bold text-foreground capitalize">
                      {format(calendarMonth, 'MMMM yyyy', { locale: ptBR })}
                    </span>
                    <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="p-1.5 rounded-lg hover:bg-white/5 transition">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 mb-1">
                    {WEEK_DAYS.map(d => (
                      <div key={d} className="w-9 h-8 flex items-center justify-center text-[10px] font-bold text-muted-foreground">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">{renderDays()}</div>
                  <p className="text-[10px] text-muted-foreground text-center mt-3 opacity-50">
                    {selecting === 'start' ? 'Selecione a data inicial' : 'Selecione a data final'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <FilterDropdown label="Conta de Anúncio" value={adAccount} options={['Qualquer']} onChange={() => {}} />
        <FilterDropdown label="Fonte de Tráfego" value={trafficSource} options={['Qualquer', 'Meta Ads', 'Google Ads', 'Orgânico']} onChange={setTrafficSource} />
        <FilterDropdown label="Plataforma" value={platform} options={['Qualquer', 'Hotmart', 'Kiwify', 'Eduzz', 'Monetizze']} onChange={setPlatformFilter} />
        <FilterDropdown label="Produto" value={product} options={productsList} onChange={setProduct} />
      </div>
    </div>
  )
}
