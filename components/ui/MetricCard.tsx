import { useState } from 'react'
import { Info } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'

interface Props {
  titulo: string
  valor: string
  valorBadge?: string
  subtitulo?: string
  tendencia?: string
  tooltip?: string
  verde?: boolean
  alinharTooltipDireita?: boolean
}

export default function MetricCard({ titulo, valor, valorBadge, subtitulo, tendencia, tooltip, verde, alinharTooltipDireita }: Props) {
  const { isPrivate } = useDashboard()
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="bg-card border border-border p-5 rounded-[10px] shadow-sm relative">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{titulo}</p>
        {tooltip && (
          <div
            className="relative"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {/* onClick além do hover — no mobile não tem "passar o mouse", então
                toca no (i) pra abrir/fechar. */}
            <Info
              onClick={(e) => { e.stopPropagation(); setShowTooltip((v) => !v) }}
              className="w-3 h-3 text-muted-foreground/60 cursor-help hover:text-muted-foreground transition-colors"
            />
            {showTooltip && (
              <div
                className={`absolute top-5 z-50 w-64 rounded-xl bg-popover border border-border shadow-xl p-3 text-xs text-foreground leading-relaxed ${alinharTooltipDireita ? 'right-0' : 'left-0'}`}
              >
                {tooltip}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <h3 className={`text-2xl font-black tracking-tighter ${verde ? 'text-emerald-400' : 'text-foreground'} ${isPrivate ? 'blur-md select-none opacity-50' : ''}`}>
          {isPrivate ? '••••••' : valor}
        </h3>
        {valorBadge && (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-muted/40 text-muted-foreground ${isPrivate ? 'blur-sm select-none' : ''}`}>
            {isPrivate ? '••' : valorBadge}
          </span>
        )}
      </div>
      {/* Sempre reserva essa linha, com ou sem conteúdo — senão os cards da
          mesma fileira ficam com alturas diferentes conforme têm ou não
          subtítulo (ex.: Imposto/CPM sem subtítulo ao lado de Reembolso/CPA
          com subtítulo). */}
      <div className="mt-4 h-[18px] flex items-center text-[10px] font-bold">
        {tendencia && (
          <span className={`px-2 py-0.5 rounded-full mr-2 ${tendencia.startsWith('+') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
            {tendencia}
          </span>
        )}
        {subtitulo && <span className="text-muted-foreground uppercase tracking-widest">{subtitulo}</span>}
      </div>
    </div>
  )
}
