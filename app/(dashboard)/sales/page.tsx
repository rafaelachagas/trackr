'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import { getVendas, getVendasStats, reprocessarUpsellsSemCriativo } from '@/app/actions/vendas'
import { extrairFase, extrairCampanha } from '@/lib/utils'

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  approved:   { label: 'Aprovado',    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  refunded:   { label: 'Reembolso',   className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  chargeback: { label: 'Chargeback',  className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  reclamada:  { label: 'Reclamada',   className: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  cancelled:  { label: 'Cancelado',   className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  expired:    { label: 'Expirado',    className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
  pending:    { label: 'Pendente',    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
}

const TIPO_LABEL: Record<string, { label: string; className: string }> = {
  front:  { label: 'Front',  className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  upsell: { label: 'Upsell', className: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
}

const PAGE_SIZE = 50

export default function VendasPage() {
  const { product, isPrivate, dateRange, lastUpdate } = useDashboard()
  const [vendas, setVendas] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ approvedCount: 0, totalRevenue: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [skcFiltro, setSkcFiltro] = useState('')       // input em edição
  const [skcAplicado, setSkcAplicado] = useState('')    // valor que realmente filtra (server-side, período inteiro)

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const getRange = () => ({
    start: dateRange.start?.toISOString() ?? new Date().toISOString(),
    end: dateRange.end?.toISOString() ?? new Date().toISOString(),
  })

  const carregar = async (p = 1) => {
    setLoading(true)
    const { start, end } = getRange()
    try {
      const [res, statsRes] = await Promise.all([
        getVendas(start, end, product, statusFiltro, p, PAGE_SIZE, skcAplicado),
        getVendasStats(start, end, product, skcAplicado),
      ])
      if (res.success) {
        setVendas(res.data ?? [])
        setTotal(res.count ?? 0)
      }
      if (statsRes.success) {
        setStats({ approvedCount: statsRes.approvedCount ?? 0, totalRevenue: statsRes.totalRevenue ?? 0 })
      }
    } finally {
      setLoading(false)
    }
  }

  // Reprocessa upsells órfãos só UMA VEZ ao entrar na página — não a cada
  // troca de filtro/data (era o que deixava a Sales lenta: N+1 sem limite).
  useEffect(() => {
    reprocessarUpsellsSemCriativo()
  }, [])

  useEffect(() => {
    setPage(1)
    carregar(1)
  }, [product, statusFiltro, dateRange, lastUpdate, skcAplicado])

  const vendasFiltradas = busca.trim()
    ? vendas.filter(
        (v) =>
          v.transaction_id?.toLowerCase().includes(busca.toLowerCase()) ||
          v.buyer_email?.toLowerCase().includes(busca.toLowerCase()) ||
          v.produto?.toLowerCase().includes(busca.toLowerCase()) ||
          v.criativo?.toLowerCase().includes(busca.toLowerCase())
      )
    : vendas

  const blur = isPrivate ? 'blur-sm select-none' : ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sales</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Histórico completo de transações
        </p>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total de Vendas</p>
          <p className={`text-2xl font-bold text-foreground ${blur}`}>{total}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Aprovadas</p>
          <p className={`text-2xl font-bold text-emerald-400 ${blur}`}>{stats.approvedCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Receita</p>
          <p className={`text-2xl font-bold text-primary ${blur}`}>
            R$ {stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por transação, email, produto, criativo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder="Filtrar por SCK (ex: ad51-fase02-pre-escala)..."
            value={skcFiltro}
            onChange={(e) => setSkcFiltro(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setSkcAplicado(skcFiltro) }}
            title="Filtra pelo SCK/Origem de Checkout — roda no período inteiro (não só a página), pra conferir contra o export do Hotmart"
            className="w-full pl-3 pr-20 py-2 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
          <button
            onClick={() => setSkcAplicado(skcFiltro)}
            className="absolute right-1 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-semibold bg-primary/15 text-primary rounded-md hover:bg-primary/25 transition-colors"
          >
            Filtrar
          </button>
        </div>
        {skcAplicado && (
          <button
            onClick={() => { setSkcFiltro(''); setSkcAplicado('') }}
            className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg"
          >
            Limpar SCK ×
          </button>
        )}
        <select
          value={statusFiltro}
          onChange={(e) => { setStatusFiltro(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="todos">Todos os status</option>
          <option value="approved">Aprovado</option>
          <option value="refunded">Reembolso</option>
          <option value="chargeback">Chargeback</option>
          <option value="reclamada">Reclamada</option>
          <option value="cancelled">Cancelado</option>
          <option value="expired">Expirado</option>
          <option value="pending">Pendente</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-sm" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1100 }}>
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 130 }}>Data</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 130 }}>Transação</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 180 }}>Produto</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 75 }}>Tipo</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 95 }}>Status</th>
                <th className="text-right px-4 py-3 font-semibold" style={{ width: 105 }}>Líquido</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 170 }}>Email</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 75 }}>Criativo</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 75 }}>Fase</th>
                <th className="text-left px-4 py-3 font-semibold">Campanha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : vendasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-muted-foreground">
                    Nenhuma venda encontrada
                  </td>
                </tr>
              ) : (
                vendasFiltradas.map((v) => {
                  const statusInfo = STATUS_LABEL[v.status] ?? { label: v.status, className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  const tipoInfo = TIPO_LABEL[v.tipo] ?? { label: v.tipo, className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' }
                  return (
                    <tr key={v.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap" style={{ width: 130 }}>
                        {v.data ? format(new Date(v.data), 'dd/MM/yy HH:mm', { locale: ptBR }) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground overflow-hidden" style={{ width: 130, maxWidth: 130 }}>
                        <span className={`block truncate ${blur}`} title={v.transaction_id}>{v.transaction_id ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground overflow-hidden" style={{ width: 200, maxWidth: 200 }} title={v.produto}>
                        <span className="block truncate">{v.produto ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3" style={{ width: 80 }}>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${tipoInfo.className}`}>
                          {tipoInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ width: 100 }}>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${v.status === 'approved' ? 'text-emerald-400' : 'text-muted-foreground'} ${blur}`} style={{ width: 110 }}>
                        R$ {(v.valor_liquido ?? v.valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-muted-foreground text-xs overflow-hidden ${blur}`} style={{ width: 180, maxWidth: 180 }} title={v.buyer_email}>
                        <span className="block truncate">{v.buyer_email ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-primary font-medium overflow-hidden" style={{ width: 75, maxWidth: 75 }} title={v.criativo}>
                        <span className="block truncate">
                          {v.criativo ?? '—'}
                          {v.atribuicao_manual && <span className="text-amber-400 ml-0.5">*</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ width: 75 }}>
                        {(() => {
                          const fase = v.fase ?? extrairFase(v.sck)
                          if (!fase) return <span className="text-muted-foreground text-xs">—</span>
                          const cor = fase.includes('01') ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : fase.includes('02') ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cor}`}>{fase}</span>
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground overflow-hidden" title={v.campanha ?? v.sck ?? ''}>
                        <span className="block truncate">{v.campanha ?? extrairCampanha(v.sck) ?? '—'}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total} vendas
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const p = page - 1; setPage(p); carregar(p) }}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-foreground font-medium px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => { const p = page + 1; setPage(p); carregar(p) }}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
