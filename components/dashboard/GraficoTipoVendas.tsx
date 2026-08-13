'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useDashboard } from '@/context/DashboardContext'

const CORES = ['#6366f1', '#22d3ee']

export default function GraficoTipoVendas() {
  const { metrics, isPrivate } = useDashboard()
  const { frontCount, upsellCount } = metrics
  const total = frontCount + upsellCount

  const dados = [
    { name: 'Front', value: frontCount },
    { name: 'Upsell', value: upsellCount },
  ]

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  // Conversão de upsell: % dos compradores de front que levaram upsell.
  const conversaoUpsell = frontCount > 0 ? (upsellCount / frontCount) * 100 : 0

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Vendas por Tipo</h3>

      {total === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Sem dados</div>
      ) : (
        <div className="flex items-center gap-6">
          <div className="relative w-40 h-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dados}
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={64}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {dados.map((_, i) => (
                    <Cell key={i} fill={CORES[i]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [
                    isPrivate ? '••' : `${Number(value)} venda${Number(value) !== 1 ? 's' : ''}`,
                    name,
                  ]}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total</span>
              <span className="text-xl font-black text-foreground">{isPrivate ? '••' : total}</span>
            </div>
          </div>

          <div className="space-y-3 flex-1">
            {dados.map((d, i) => (
              <div key={d.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CORES[i] }} />
                    <span className="font-medium text-foreground">{d.name}</span>
                  </div>
                  <span className="font-bold text-foreground">{isPrivate ? '••' : d.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct(d.value)}%`, background: CORES[i] }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{pct(d.value)}%</span>
              </div>
            ))}

            {/* Conversão de upsell: % dos compradores de front que levaram upsell */}
            <div className="pt-3 mt-1 border-t border-border/60 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">Conversão de Upsell</span>
              <span className="text-sm font-black" style={{ color: '#22d3ee' }}>
                {isPrivate ? '••' : `${conversaoUpsell.toFixed(1).replace('.', ',')}%`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
