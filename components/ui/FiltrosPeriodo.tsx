'use client'

import { PeriodoDashboard } from '@/types'

interface Props {
  periodo: PeriodoDashboard
  onPeriodoChange: (p: PeriodoDashboard) => void
  dataInicio?: string
  dataFim?: string
  onDataInicioChange?: (d: string) => void
  onDataFimChange?: (d: string) => void
}

const opcoes: { label: string; value: PeriodoDashboard }[] = [
  { label: 'Hoje', value: '1d' },
  { label: '3 dias', value: '3d' },
  { label: '7 dias', value: '7d' },
  { label: '14 dias', value: '14d' },
  { label: '30 dias', value: '30d' },
  { label: 'Personalizado', value: 'custom' },
]

export default function FiltrosPeriodo({
  periodo,
  onPeriodoChange,
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1.5 flex-wrap">
        {opcoes.map((op) => (
          <button
            key={op.value}
            onClick={() => onPeriodoChange(op.value)}
            className={`px-4 py-2 text-[10px] rounded-xl font-bold uppercase tracking-widest transition-all ${
              periodo === op.value
                ? 'bg-[#00aeef] text-black shadow-[0_0_15px_rgba(0,174,239,0.2)]'
                : 'bg-[#0b1222] text-slate-500 border border-slate-800/50 hover:text-white hover:border-slate-600'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>

      {periodo === 'custom' && (
        <div className="flex items-center gap-2 ml-2">
          <input
            type="date"
            value={dataInicio ?? ''}
            onChange={(e) => onDataInicioChange?.(e.target.value)}
            className="text-[10px] font-bold uppercase tracking-widest border border-slate-800/50 rounded-xl px-3 py-2 bg-[#0b1222] text-white outline-none focus:border-[#00aeef]/50"
          />
          <span className="text-slate-600 font-bold uppercase text-[9px] tracking-widest">até</span>
          <input
            type="date"
            value={dataFim ?? ''}
            onChange={(e) => onDataFimChange?.(e.target.value)}
            className="text-[10px] font-bold uppercase tracking-widest border border-slate-800/50 rounded-xl px-3 py-2 bg-[#0b1222] text-white outline-none focus:border-[#00aeef]/50"
          />
        </div>
      )}
    </div>
  )
}
