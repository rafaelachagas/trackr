'use client'

import { Info, ChevronDown, Calendar, RefreshCcw } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import { format } from 'date-fns'

export default function FiltrosDashboard() {
  const { 
    period, setPeriod, 
    product, setProduct, 
    dateRange, setDateRange,
    sincronizarTudo, lastUpdate, isRefreshing,
    productsList 
  } = useDashboard()

  const formatDateTimeLocal = (date: Date | null) => {
    if (!date) return ''
    return format(date, "yyyy-MM-dd'T'HH:mm")
  }

  const opcoesPeriodo = [
    'Máximo',
    'Hoje',
    'Ontem',
    'Últimos 7 dias',
    'Esse mês',
    'Mês passado',
    'Personalizado'
  ]

  return (
    <div className="flex items-end justify-end gap-4 bg-background p-1 rounded-xl w-full">
      {/* Período de Visualização */}
      <div className="flex flex-col gap-2 min-w-[200px]">
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
            Período de Visualização
          </span>
          <Info className="w-3 h-3 text-muted-foreground opacity-50" />
        </div>
        <div className="relative group">
          <select 
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="w-full h-11 bg-card border border-border rounded-xl px-4 text-xs font-bold text-foreground appearance-none outline-none focus:border-primary/50 transition-all cursor-pointer hover:border-muted-foreground/30"
          >
            {opcoesPeriodo.map(opt => (
              <option key={opt} value={opt} className="bg-card text-foreground">{opt}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-focus-within:text-primary" />
        </div>
      </div>

      {/* Produto */}
      <div className="flex flex-col gap-2 min-w-[200px]">
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">
            Produto
          </span>
        </div>
        <div className="relative group">
          <select 
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            className="w-full h-11 bg-card border border-border rounded-xl px-4 text-xs font-bold text-foreground appearance-none outline-none focus:border-primary/50 transition-all cursor-pointer hover:border-muted-foreground/30"
          >
            {productsList.map(opt => (
              <option key={opt} value={opt} className="bg-card text-foreground">{opt}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-focus-within:text-primary" />
        </div>
      </div>

      {/* Custom Date Inputs */}
      {period === 'Personalizado' && (
        <>
          <div className="flex flex-col gap-2 min-w-[180px] animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">Data Inicial</span>
            </div>
            <div className="relative group">
              <input 
                type="datetime-local" 
                value={formatDateTimeLocal(dateRange.start)}
                onChange={(e) => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setDateRange({ ...dateRange, start: d }) }}
                className="w-full h-11 bg-card border border-border rounded-xl px-4 text-[11px] font-bold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all cursor-pointer dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-[180px] animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">Data Final</span>
            </div>
            <div className="relative group">
              <input 
                type="datetime-local" 
                value={formatDateTimeLocal(dateRange.end)}
                onChange={(e) => { const d = new Date(e.target.value); if (!isNaN(d.getTime())) setDateRange({ ...dateRange, end: d }) }}
                className="w-full h-11 bg-card border border-border rounded-xl px-4 text-[11px] font-bold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all cursor-pointer dark:[color-scheme:dark]"
              />
            </div>
          </div>
        </>
      )}

      {/* Update Button Section */}
      <div className="flex items-center gap-4 ml-2 pl-4 border-l border-border">
        <div className="flex flex-col items-end justify-center h-11">
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-tight">Sincronizado</span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter leading-tight opacity-70">
            {format(lastUpdate, "HH:mm:ss")}
          </span>
        </div>
        <button 
          onClick={sincronizarTudo}
          disabled={isRefreshing}
          className="h-11 px-8 bg-primary text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] transition-all active:scale-[0.98] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isRefreshing ? (
            <RefreshCcw className="w-4 h-4 animate-spin" />
          ) : null}
          Atualizar
        </button>
      </div>
    </div>
  )
}
