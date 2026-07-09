'use client'

import { useEffect, useState } from 'react'
import { formatarMoeda, corDaAcao, iconeAcao } from '@/lib/utils'
import { useDashboard } from '@/context/DashboardContext'
import type { CriativoV2 } from '@/app/api/performance-v2/route'
import { Zap, ExternalLink } from 'lucide-react'

const COR_FASE: Record<string, string> = {
  FASE01: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  FASE02: 'bg-violet-500/15 text-violet-400 border border-violet-500/25',
  FASE03: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
}

const ACOES = [
  { value: '', label: 'Todas as ações' },
  { value: '+20% orçamento', label: '▲ +20% orçamento' },
  { value: 'Manter', label: '→ Manter' },
  { value: '-20% ou pausar', label: '▼ -20% ou pausar' },
  { value: 'Pausar', label: '✕ Pausar' },
]

function BadgeRoas({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-muted-foreground text-xs">—</span>
  const cor = valor >= 2 ? 'text-emerald-400' : valor >= 1 ? 'text-yellow-400' : 'text-rose-400'
  return <span className={`font-bold text-xs ${cor}`}>{valor.toFixed(2)}x</span>
}

export default function TabelaCriativosV2() {
  const { isPrivate, lastUpdate } = useDashboard()
  const [dados, setDados] = useState<CriativoV2[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroAcao, setFiltroAcao] = useState('')

  // Sempre em FORMATO FRAMEWORK: 7 dias fechados terminando ontem (hoje fora).
  // Ignora o filtro de período do topo de propósito — a decisão é sobre dias
  // completos, não sobre o dia corrente incompleto.
  useEffect(() => {
    setLoading(true)
    fetch('/api/performance-v2')
      .then(r => r.json())
      .then(({ criativos }: { criativos: CriativoV2[] }) => setDados(criativos ?? []))
      .catch(() => setDados([]))
      .finally(() => setLoading(false))
  }, [lastUpdate])

  const filtrados = dados.filter(row => !filtroAcao || row.acao === filtroAcao)

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden text-foreground">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground">Performance por Criativo</h3>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-primary/15 text-primary border border-primary/25">
            <Zap className="w-3 h-3" /> v2 · automático
          </span>
          <span className="text-[11px] text-muted-foreground">· Framework — últimos 7 dias fechados (até ontem, sem o dia de hoje)</span>
        </div>
        <select
          value={filtroAcao}
          onChange={e => setFiltroAcao(e.target.value)}
          className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60 transition-colors"
        >
          {ACOES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <p>Sem gasto nem venda por anúncio nos últimos 7 dias fechados.</p>
          <p className="text-sm mt-1">Sincronize os gastos da Meta e aguarde vendas com sck de anúncio.</p>
        </div>
      ) : (
        <div className="overflow-x-auto hide-scrollbar">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criativo</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fase</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gasto 7d</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fat. líq. 7d</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lucro 7d</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ROAS 7d</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ROAS 3d</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ROAS 1d</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtrados.map((row) => (
                <tr key={`${row.criativo}__${row.campaign_name}`} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-foreground max-w-[260px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate" title={row.ad_name}>{row.ad_name}</span>
                      <a
                        href={`/api/criativos/instagram?codigo=${row.criativo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-primary/60 hover:text-primary transition shrink-0"
                        title="Ver post no Instagram (prova real)"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.fase ? (
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${COR_FASE[row.fase] ?? 'bg-slate-500/15 text-slate-400'}`}>{row.fase}</span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium text-rose-500 ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? 'R$ ••••' : formatarMoeda(row.gasto_7d)}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium text-emerald-400 ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? 'R$ ••••' : formatarMoeda(row.receita_7d)}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${row.lucro_7d >= 0 ? 'text-foreground' : 'text-rose-400'} ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? 'R$ ••••' : formatarMoeda(row.lucro_7d)}
                  </td>
                  <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_7d} />}</td>
                  <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_3d} />}</td>
                  <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_1d} />}</td>
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
      )}
    </div>
  )
}
