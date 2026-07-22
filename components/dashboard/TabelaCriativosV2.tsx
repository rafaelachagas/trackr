'use client'

import { useEffect, useState } from 'react'
import { formatarMoeda, corDaAcao, iconeAcao } from '@/lib/utils'
import { useDashboard } from '@/context/DashboardContext'
import type { CriativoV2 } from '@/app/api/performance-v2/route'
import { Zap, ExternalLink, X, Radio } from 'lucide-react'

const COR_FASE: Record<string, string> = {
  FASE01: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  FASE02: 'bg-violet-500/15 text-violet-400 border border-violet-500/25',
  FASE03: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
}

type VendaDetalhe = { data: string; produto: string | null; tipo: string | null; valor_liquido: number; email: string; transaction_id: string; atribuicao_manual: boolean }

// Prova real da receita: lista as vendas que compõem o faturamento da campanha.
function VendasModal({ adName, chave, onClose }: { adName: string; chave: string; onClose: () => void }) {
  const [vendas, setVendas] = useState<VendaDetalhe[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/performance-v2/vendas?chave=${encodeURIComponent(chave)}`)
      .then(r => r.json())
      .then(j => { setVendas(j.vendas ?? []); setTotal(j.total ?? 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [chave])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate" title={adName}>{adName}</p>
            <p className="text-xs text-muted-foreground">{loading ? 'Carregando vendas...' : `${vendas.length} vendas · ${formatarMoeda(total)} líquido · últimos 7 dias fechados`}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
          ) : vendas.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">Nenhuma venda por anúncio nesta janela.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Data</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Produto</th>
                  <th className="text-center px-4 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Comprador</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Líquido</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Transação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vendas.map((v, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{new Date(v.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-2 text-foreground max-w-[160px] truncate" title={v.produto || ''}>{v.produto || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.tipo === 'upsell' ? 'bg-violet-500/15 text-violet-400' : 'bg-blue-500/15 text-blue-400'}`}>
                        {v.tipo || '—'}{v.atribuicao_manual && <span className="text-amber-400" title="sck atribuído por e-mail">*</span>}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground" translate="no">{v.email}</td>
                    <td className="px-4 py-2 text-right text-emerald-400 font-medium">{formatarMoeda(v.valor_liquido)}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs" translate="no">{v.transaction_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
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
  const [filtradoAtivos, setFiltradoAtivos] = useState(true)
  const [filtroAcao, setFiltroAcao] = useState('')
  const [detalhe, setDetalhe] = useState<{ ad_name: string; chave: string } | null>(null)

  // Sempre em FORMATO FRAMEWORK: 7 dias fechados terminando ontem (hoje fora).
  // Ignora o filtro de período do topo de propósito — a decisão é sobre dias
  // completos, não sobre o dia corrente incompleto.
  useEffect(() => {
    setLoading(true)
    fetch('/api/performance-v2')
      .then(r => r.json())
      .then(({ criativos, filtradoAtivos }: { criativos: CriativoV2[]; filtradoAtivos?: boolean }) => {
        setDados(criativos ?? [])
        setFiltradoAtivos(filtradoAtivos !== false)
      })
      .catch(() => setDados([]))
      .finally(() => setLoading(false))
  }, [lastUpdate])

  const filtrados = dados.filter(row => !filtroAcao || row.acao === filtroAcao)

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden text-foreground">
      {detalhe && <VendasModal adName={detalhe.ad_name} chave={detalhe.chave} onClose={() => setDetalhe(null)} />}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground">Performance por Criativo</h3>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-primary/15 text-primary border border-primary/25">
            <Zap className="w-3 h-3" /> v2 · automático
          </span>
          <span className="text-[11px] text-muted-foreground">· {filtradoAtivos ? 'só criativos ativos' : <span className="text-amber-400/90">ativos indisponíveis (mostrando todos)</span>} · ordenado por ação · <span className="text-sky-400/80">tempo real = hoje, fora da ação</span></span>
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
          <p>Nenhum criativo ativo com gasto nos últimos 7 dias.</p>
          <p className="text-sm mt-1">A tabela mostra só anúncios ativos na Meta. Ative um criativo ou sincronize os gastos.</p>
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
                <th className="text-center px-4 py-3 text-xs font-semibold text-sky-400/80 uppercase tracking-wide border-l border-border whitespace-nowrap" title="HOJE, dia correndo. Não entra na ação — é só pra acompanhar o dia.">
                  <span className="inline-flex items-center gap-1"><Radio className="w-3 h-3" /> Tempo real</span>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-l border-border">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtrados.map((row) => (
                <tr key={`${row.criativo}__${row.campaign_name}`} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-foreground max-w-[260px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate" title={row.ad_name}>{row.ad_name}</span>
                      <a
                        href={`/api/criativos/instagram?ad_name=${encodeURIComponent(row.ad_name)}`}
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
                    {isPrivate ? 'R$ ••••' : (
                      <button
                        onClick={e => { e.stopPropagation(); setDetalhe({ ad_name: row.ad_name, chave: row.chave }) }}
                        className="hover:underline decoration-dotted underline-offset-2 cursor-pointer"
                        title="Ver as vendas que compõem esse faturamento (prova real)"
                      >
                        {formatarMoeda(row.receita_7d)}
                      </button>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${row.lucro_7d >= 0 ? 'text-foreground' : 'text-rose-400'} ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? 'R$ ••••' : formatarMoeda(row.lucro_7d)}
                  </td>
                  <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_7d} />}</td>
                  <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_3d} />}</td>
                  <td className={`px-4 py-3 text-center ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? <span className="text-xs">•.••</span> : <BadgeRoas valor={row.roas_1d} />}</td>
                  <td className={`px-4 py-3 text-center border-l border-border ${isPrivate ? 'blur-sm select-none' : ''}`}>
                    {isPrivate ? <span className="text-xs">•.••</span> : (
                      <div className="leading-tight" title={`Hoje: ${formatarMoeda(row.gasto_hoje)} gasto · ${formatarMoeda(row.receita_hoje)} líquido`}>
                        <BadgeRoas valor={row.roas_hoje} />
                        {row.gasto_hoje > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                            {formatarMoeda(row.gasto_hoje)} → {formatarMoeda(row.receita_hoje)}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center border-l border-border">
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
