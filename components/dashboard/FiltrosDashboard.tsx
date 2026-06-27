'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Info, ChevronDown, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, isWithinInterval,
  addMonths, subMonths, startOfDay, endOfDay, subDays
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

const PERIODS = ['Máximo', 'Hoje', 'Ontem', 'Últimos 7 dias', 'Esse mês', 'Mês passado', 'Personalizado']
const PRESETS = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Últimos 30 dias', 'Este Mês', 'Mês Passado']
const WEEK_DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const popoverStyle = {
  backgroundColor: '#13181a',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '12px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
}

const btnStyle = {
  backgroundColor: '#13181a',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '10px',
  color: '#e2e8f0',
}

export default function FiltrosDashboard() {
  const {
    period, setPeriod,
    product, setProduct,
    dateRange, setDateRange,
    sincronizarTudo, lastUpdate, isRefreshing,
    productsList
  } = useDashboard()

  const [periodOpen, setPeriodOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selecting, setSelecting] = useState<'start' | 'end'>('start')
  const [hoverDate, setHoverDate] = useState<Date | null>(null)

  const periodRef = useRef<HTMLDivElement>(null)
  const productRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodOpen(false)
        setCalendarOpen(false)
      }
      if (productRef.current && !productRef.current.contains(e.target as Node)) {
        setProductOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectPeriod(p: string) {
    setPeriod(p as any)
    if (p === 'Personalizado') {
      setPeriodOpen(false)
      setCalendarOpen(true)
      setSelecting('start')
    } else {
      setPeriodOpen(false)
    }
  }

  function applyPreset(preset: string) {
    const today = new Date()
    switch (preset) {
      case 'Hoje':
        setDateRange({ start: startOfDay(today), end: endOfDay(today) }); break
      case 'Ontem': {
        const y = subDays(today, 1)
        setDateRange({ start: startOfDay(y), end: endOfDay(y) }); break
      }
      case 'Últimos 7 dias':
        setDateRange({ start: startOfDay(subDays(today, 6)), end: endOfDay(today) }); break
      case 'Últimos 30 dias':
        setDateRange({ start: startOfDay(subDays(today, 29)), end: endOfDay(today) }); break
      case 'Este Mês':
        setDateRange({ start: startOfMonth(today), end: endOfDay(today) }); break
      case 'Mês Passado': {
        const lm = subMonths(today, 1)
        setDateRange({ start: startOfMonth(lm), end: endOfMonth(lm) }); break
      }
    }
    setCalendarOpen(false)
    setSelecting('start')
  }

  function handleDayClick(date: Date) {
    if (selecting === 'start') {
      setDateRange({ start: startOfDay(date), end: endOfDay(date) })
      setSelecting('end')
    } else {
      if (date < dateRange.start!) {
        setDateRange({ start: startOfDay(date), end: endOfDay(dateRange.start!) })
      } else {
        setDateRange({ ...dateRange, end: endOfDay(date) })
      }
      setSelecting('start')
      setCalendarOpen(false)
    }
  }

  function renderDays() {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

    const days: React.ReactElement[] = []
    let d = gridStart
    while (d <= gridEnd) {
      const day = d
      const isStart = dateRange.start && isSameDay(day, dateRange.start)
      const isEnd = dateRange.end && isSameDay(day, dateRange.end)
      const rangeEnd = hoverDate && selecting === 'end' && dateRange.start && hoverDate > dateRange.start ? hoverDate : dateRange.end
      const inRange = dateRange.start && rangeEnd && isWithinInterval(day, { start: dateRange.start, end: rangeEnd })
      const inCurrentMonth = isSameMonth(day, calendarMonth)
      const isToday = isSameDay(day, new Date())

      days.push(
        <button
          key={day.toISOString()}
          onClick={() => handleDayClick(day)}
          onMouseEnter={() => setHoverDate(day)}
          onMouseLeave={() => setHoverDate(null)}
          className="w-9 h-9 text-xs font-semibold rounded-full flex items-center justify-center transition-all"
          style={{
            color: !inCurrentMonth
              ? 'rgba(255,255,255,0.2)'
              : isStart || isEnd
              ? '#fff'
              : isToday
              ? '#00aeef'
              : '#e2e8f0',
            backgroundColor: isStart || isEnd
              ? '#00aeef'
              : inRange
              ? 'rgba(0,174,239,0.12)'
              : 'transparent',
          }}
        >
          {format(day, 'd')}
        </button>
      )
      d = addDays(d, 1)
    }
    return days
  }

  const periodLabel = period === 'Personalizado' && dateRange.start && dateRange.end
    ? `${format(dateRange.start, 'dd/MM')} → ${format(dateRange.end, 'dd/MM')}`
    : period

  return (
    <div className="flex items-end gap-3 w-full">

      {/* Período */}
      <div className="flex flex-col gap-1.5" ref={periodRef}>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-1">
          Período de Visualização <Info className="w-3 h-3 opacity-40" />
        </span>
        <div className="relative">
          <button
            onClick={() => {
              if (period === 'Personalizado') {
                setCalendarOpen(v => !v)
                setPeriodOpen(false)
              } else {
                setPeriodOpen(v => !v)
                setCalendarOpen(false)
              }
            }}
            className="h-11 px-4 flex items-center gap-3 text-xs font-bold min-w-[190px] justify-between transition-all hover:border-white/10"
            style={btnStyle}
          >
            <span>{periodLabel}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${periodOpen || calendarOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown de período */}
          {periodOpen && (
            <div className="absolute top-full mt-1.5 z-50 w-48 p-1" style={popoverStyle}>
              {PERIODS.map(p => (
                <button
                  key={p}
                  onClick={() => selectPeriod(p)}
                  className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all hover:bg-white/5"
                  style={{ color: period === p ? '#00aeef' : '#e2e8f0' }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Calendar popover */}
          {calendarOpen && (
            <div className="absolute top-full mt-1.5 z-50 p-4" style={{ ...popoverStyle, width: '320px' }}>
              {/* Presets */}
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => applyPreset(p)}
                    className="text-[10px] font-bold px-2 py-2 rounded-lg transition-all hover:bg-white/5 text-center leading-tight"
                    style={{ color: '#94a3b8', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }} />

              {/* Navegação do mês */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition"
                >
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-bold text-foreground capitalize">
                  {format(calendarMonth, 'MMMM yyyy', { locale: ptBR })}
                </span>
                <button
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition"
                >
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Cabeçalho dias da semana */}
              <div className="grid grid-cols-7 mb-1">
                {WEEK_DAYS.map(d => (
                  <div key={d} className="w-9 h-8 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>

              {/* Grid de dias */}
              <div className="grid grid-cols-7">
                {renderDays()}
              </div>

              <p className="text-[10px] text-muted-foreground text-center mt-3 opacity-50">
                {selecting === 'start' ? 'Clique para selecionar data inicial' : 'Clique para selecionar data final'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Produto */}
      <div className="flex flex-col gap-1.5" ref={productRef}>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Produto</span>
        <div className="relative">
          <button
            onClick={() => setProductOpen(v => !v)}
            className="h-11 px-4 flex items-center gap-3 text-xs font-bold min-w-[190px] justify-between transition-all hover:border-white/10"
            style={btnStyle}
          >
            <span>{product}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${productOpen ? 'rotate-180' : ''}`} />
          </button>
          {productOpen && (
            <div className="absolute top-full mt-1.5 z-50 w-48 p-1" style={popoverStyle}>
              {productsList.map(p => (
                <button
                  key={p}
                  onClick={() => { setProduct(p); setProductOpen(false) }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all hover:bg-white/5"
                  style={{ color: product === p ? '#00aeef' : '#e2e8f0' }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sincronizado + Atualizar */}
      <div className="flex items-center gap-3 ml-2 pl-4" style={{ borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex flex-col items-start justify-center h-11">
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-tight">Sincronizado</span>
          <span className="text-[10px] font-bold text-muted-foreground tracking-tighter leading-tight opacity-70">
            {format(lastUpdate, 'HH:mm:ss')}
          </span>
        </div>
        <button
          onClick={sincronizarTudo}
          disabled={isRefreshing}
          className="h-11 px-8 bg-primary text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] transition-all active:scale-[0.98] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isRefreshing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : null}
          Atualizar
        </button>
      </div>
    </div>
  )
}
