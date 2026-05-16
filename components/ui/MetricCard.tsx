import { ReactNode } from 'react'
import { useDashboard } from '@/context/DashboardContext'

interface Props {
  titulo: string
  valor: string
  subtitulo?: string
  cor?: 'default' | 'green' | 'red' | 'blue'
  icone?: ReactNode
  tendencia?: string
}

const coresMap = {
  default: 'from-orange-400 to-rose-400',
  green: 'from-emerald-500 to-teal-400',
  red: 'from-rose-500 to-red-600',
  blue: 'from-blue-500 to-indigo-500',
}

const coresValor = {
  default: 'text-white',
  green: 'text-emerald-400',
  red: 'text-rose-400',
  blue: 'text-blue-400',
}

export default function MetricCard({ titulo, valor, subtitulo, cor = 'default', icone, tendencia }: Props) {
  const { isPrivate } = useDashboard()
  
  const colorMap = {
    default: 'text-foreground',
    green: 'text-emerald-500',
    red: 'text-rose-500',
    blue: 'text-primary',
  }

  const borderMap = {
    default: 'border-border',
    green: 'border-emerald-500/20',
    red: 'border-rose-500/20',
    blue: 'border-primary/20',
  }

  return (
    <div className={`bg-card border ${borderMap[cor]} p-5 rounded-[24px] shadow-sm relative overflow-hidden group hover:border-primary/50 transition-all duration-300`}>
      <div className="flex justify-between items-start relative z-10">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{titulo}</p>
          <h3 className={`text-2xl font-black tracking-tighter ${colorMap[cor]} ${isPrivate ? 'blur-md select-none opacity-50' : ''}`}>
            {isPrivate ? '••••••' : valor}
          </h3>
        </div>
        {icone && (
          <div className="p-2.5 bg-muted rounded-xl border border-border shadow-inner">
            {icone}
          </div>
        )}
      </div>
      {(tendencia || subtitulo) && (
        <div className="mt-4 flex items-center text-[10px] font-bold z-10 relative">
          {tendencia && (
            <span className={`px-2 py-0.5 rounded-full mr-2 ${tendencia.startsWith('+') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
              {tendencia}
            </span>
          )}
          {subtitulo && <span className="text-muted-foreground uppercase tracking-widest">{subtitulo}</span>}
        </div>
      )}
      
      {/* Subtle Glow */}
      <div className={`absolute -bottom-10 -right-10 w-24 h-24 bg-current opacity-[0.03] rounded-full blur-2xl group-hover:opacity-[0.06] transition-opacity ${colorMap[cor]}`} />
    </div>
  )
}
