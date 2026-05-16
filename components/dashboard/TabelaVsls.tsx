'use client'

import { RoasPorVsl } from '@/types'
import { formatarMoeda } from '@/lib/utils'
import { useDashboard } from '@/context/DashboardContext'

interface Props {
  dados: RoasPorVsl[]
}

export default function TabelaVsls({ dados }: Props) {
  const { isPrivate } = useDashboard()

  if (dados.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground shadow-sm">
        <p>Nenhuma VSL identificada no período.</p>
        <p className="text-sm mt-1">Configure o VTurb para vincular VSLs às vendas.</p>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden text-foreground">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ROAS por VSL</h3>
      </div>
      <div className="overflow-x-auto hide-scrollbar">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">VSL</th>
              <th className="text-right px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Vendas</th>
              <th className="text-right px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Receita</th>
              <th className="text-right px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">RPV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dados.map((row) => (
              <tr key={row.vsl} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{row.vsl}</td>
                <td className={`px-4 py-3 text-right text-muted-foreground ${isPrivate ? 'blur-sm' : ''}`}>{isPrivate ? '••' : row.vendas}</td>
                <td className={`px-4 py-3 text-right font-bold text-emerald-500 ${isPrivate ? 'blur-sm' : ''}`}>{isPrivate ? 'R$ ••••' : formatarMoeda(row.receita)}</td>
                <td className={`px-4 py-3 text-right text-primary font-medium ${isPrivate ? 'blur-sm' : ''}`}>{isPrivate ? 'R$ ••' : formatarMoeda(row.rpv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
