'use client'

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { EyeOff } from 'lucide-react'
import { RoasDiario } from '@/types'
import { formatarData, formatarMoeda } from '@/lib/utils'
import { useDashboard } from '@/context/DashboardContext'

interface Props {
  dados: RoasDiario[]
}

function TooltipCustom({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-popover border border-border rounded-xl shadow-2xl p-4 text-sm text-popover-foreground">
      <p className="font-bold text-foreground mb-3 border-b border-border pb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <p key={entry.name} style={{ color: entry.color }} className="flex justify-between gap-8">
            <span className="font-medium">{entry.name}:</span>
            <span className="font-black">
              {entry.name === 'ROAS' ? entry.value.toFixed(2) + 'x' : formatarMoeda(entry.value)}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

export default function GraficoDiario({ dados }: Props) {
  const { isPrivate } = useDashboard()
  const dadosFormatados = dados.map((d) => ({
    ...d,
    dataLabel: d.data ? formatarData(d.data) : (d as any).name ?? '',
  }))

  return (
    <div className="bg-card border-border rounded-2xl border p-6 shadow-sm relative overflow-hidden">
      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-6 relative z-10">Receita vs Gasto + ROAS Diário</h3>
      
      <div className={`w-full h-[320px] transition-all duration-500 ${isPrivate ? 'blur-xl opacity-20 pointer-events-none select-none' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dadosFormatados} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="dataLabel"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              padding={{ left: 20, right: 20 }}
            />
            <YAxis
              yAxisId="moeda"
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="roas"
              orientation="right"
              domain={[0, 'auto']}
              tickFormatter={(v) => v.toFixed(1) + 'x'}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<TooltipCustom />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
            <Line
              yAxisId="moeda" type="monotone" dataKey="receita" name="Receita"
              stroke="#10b981" strokeWidth={2.5}
              dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: 'var(--card)', strokeWidth: 2 }}
              connectNulls
            />
            <Line
              yAxisId="moeda" type="monotone" dataKey="gasto" name="Gasto"
              stroke="#f43f5e" strokeWidth={2.5}
              dot={{ r: 3, fill: '#f43f5e', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: 'var(--card)', strokeWidth: 2 }}
              connectNulls
            />
            <Line
              yAxisId="roas" type="monotone" dataKey="roas" name="ROAS"
              stroke="var(--primary)" strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: 'var(--card)', strokeWidth: 2 }}
              connectNulls
            />
            <ReferenceLine
              yAxisId="roas"
              y={1.0}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              opacity={0.3}
              label={{ value: 'Break-even', fill: 'var(--muted-foreground)', fontSize: 10, position: 'insideTopLeft' }}
            />
            <ReferenceLine
              yAxisId="roas"
              y={2.0}
              stroke="#10b981"
              strokeDasharray="4 4"
              opacity={0.3}
              label={{ value: 'Meta 2x', fill: '#10b981', fontSize: 10, position: 'insideTopLeft' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {isPrivate && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/5 backdrop-blur-[2px] z-20">
          <div className="bg-card border border-border p-5 rounded-3xl shadow-2xl flex flex-col items-center gap-3 animate-in zoom-in duration-300">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <EyeOff className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-1">Privacidade Ativa</p>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">Dados Ocultos</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
