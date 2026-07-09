'use client'

import { useState } from 'react'
import { RoasPorCriativo, AcaoOtimizacao } from '@/types'
import { formatarMoeda, corDaAcao, iconeAcao } from '@/lib/utils'
import { useDashboard } from '@/context/DashboardContext'

interface Props {
  dados: RoasPorCriativo[]
}

const COR_FASE: Record<string, string> = {
  FASE01: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  FASE02: 'bg-violet-500/15 text-violet-400 border border-violet-500/25',
  FASE03: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
}

const ACOES: { value: string; label: string }[] = [
  { value: '', label: 'Todas as ações' },
  { value: '+20% orçamento', label: '▲ +20% orçamento' },
  { value: 'Manter', label: '→ Manter' },
  { value: '-20% ou pausar', label: '▼ -20% ou pausar' },
  { value: 'Pausar', label: '✕ Pausar' },
]

function BadgeRoas({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-muted-foreground text-xs">—</span>
  const cor =
    valor >= 2 ? 'text-emerald-400' :
    valor >= 1 ? 'text-yellow-400' :
    'text-rose-400'
  return <span className={`font-bold text-xs ${cor}`}>{valor.toFixed(2)}x</span>
}

export default function TabelaCriativos({ dados }: Props) {
  const { isPrivate } = useDashboard()
  const [filtroAcao, setFiltroAcao] = useState('')

  const dadosFiltrados = dados
    .filter(row => row.fase !== null)
    .filter(row => !filtroAcao || row.acao === filtroAcao)

  if (dadosFiltrados.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground shadow-sm">
        <p>Nenhum dado encontrado para o período selecionado.</p>
        <p className="text-sm mt-1">Sincronize os dados do Meta Ads ou aguarde novas vendas.</p>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden text-foreground">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Performance por Criativo</h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-muted text-muted-foreground border border-border">
            manual
          </span>
        </div>
        <select
          value={filtroAcao}
          onChange={e => setFiltroAcao(e.target.value)}
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60 transition-colors"
        >
          {ACOES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto hide-scrollbar">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criativo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campanha</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fase</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gasto</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ROAS 7d</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ROAS 3d</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ROAS 1d</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dadosFiltrados.map((row) => (
              <tr key={`${row.criativo}__${row.campaign_name}`} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-foreground max-w-[240px] truncate" title={row.ad_name || row.criativo}>
                  {row.ad_name || row.criativo}
                </td>
                <td className="px-4 py-3 text-left text-xs text-muted-foreground max-w-[180px] truncate" title={row.campaign_name ?? ''}>
                  {row.campaign_name ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {row.fase ? (
                    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${COR_FASE[row.fase] ?? 'bg-slate-500/15 text-slate-400'}`}>
                      {row.fase}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className={`px-4 py-3 text-right font-medium text-rose-500 ${isPrivate ? 'blur-sm select-none' : ''}`}>
                  {isPrivate ? 'R$ ••••' : formatarMoeda(row.gasto)}
                </td>
                <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>
                  {isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_7d} />}
                </td>
                <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>
                  {isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_3d} />}
                </td>
                <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>
                  {isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_1d} />}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${corDaAcao(row.acao)}`}>
                    {iconeAcao(row.acao)} {row.acao}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
