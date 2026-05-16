'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Search, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import { getVendas } from '@/app/actions/vendas'

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  approved:   { label: 'Aprovado',    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  refunded:   { label: 'Reembolso',   className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  chargeback: { label: 'Chargeback',  className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  cancelled:  { label: 'Cancelado',   className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  pending:    { label: 'Pendente',    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
}

const TIPO_LABEL: Record<string, { label: string; className: string }> = {
  front:  { label: 'Front',  className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  upsell: { label: 'Upsell', className: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
}

const PAGE_SIZE = 50

export default function VendasPage() {
  const { dateRange, product, isPrivate } = useDashboard()
  const [vendas, setVendas] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todos')

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const carregar = async (p = 1) => {
    if (!dateRange.start || !dateRange.end) return
    setLoading(true)
    try {
      const res = await getVendas(
        dateRange.start.toISOString(),
        dateRange.end.toISOString(),
        product,
        statusFiltro,
        p,
        PAGE_SIZE
      )
      if (res.success) {
        setVendas(res.data ?? [])
        setTotal(res.count ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    carregar(1)
  }, [dateRange, product, statusFiltro])

  const vendasFiltradas = busca.trim()
    ? vendas.filter(
        (v) =>
          v.transaction_id?.toLowerCase().includes(busca.toLowerCase()) ||
          v.buyer_email?.toLowerCase().includes(busca.toLowerCase()) ||
          v.produto?.toLowerCase().includes(busca.toLowerCase()) ||
          v.criativo?.toLowerCase().includes(busca.toLowerCase())
      )
    : vendas

  const receitaTotal = vendasFiltradas
    .filter((v) => v.status === 'approved')
    .reduce((acc, v) => acc + (v.valor_liquido ?? v.valor ?? 0), 0)

  const blur = isPrivate ? 'blur-sm select-none' : ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Vendas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Histórico completo de transações
        </p>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total de Vendas</p>
          <p className={`text-2xl font-bold text-foreground ${blur}`}>{total}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Aprovadas</p>
          <p className={`text-2xl font-bold text-emerald-400 ${blur}`}>
            {vendas.filter((v) => v.status === 'approved').length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Receita</p>
          <p className={`text-2xl font-bold text-primary ${blur}`}>
            R$ {receitaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
        <select
          value={statusFiltro}
          onChange={(e) => { setStatusFiltro(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="todos">Todos os status</option>
          <option value="approved">Aprovado</option>
          <option value="refunded">Reembolso</option>
          <option value="chargeback">Chargeback</option>
          <option value="cancelled">Cancelado</option>
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
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 200 }}>Produto</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 80 }}>Tipo</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 100 }}>Status</th>
                <th className="text-right px-4 py-3 font-semibold" style={{ width: 110 }}>Líquido</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 180 }}>Email</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ width: 90 }}>Criativo</th>
                <th className="text-left px-4 py-3 font-semibold">SCK</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted-foreground">
                    Carregando...
                  </td>
                </tr>
              ) : vendasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-muted-foreground">
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
                      <td className={`px-4 py-3 font-mono text-xs text-foreground overflow-hidden`} style={{ width: 130, maxWidth: 130 }}>
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
                      <td className="px-4 py-3 text-xs text-primary font-medium overflow-hidden" style={{ width: 90, maxWidth: 90 }} title={v.criativo}>
                        <span className="block truncate">{v.criativo ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground overflow-hidden" title={v.sck}>
                        <span className="block truncate">{v.sck ?? '—'}</span>
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
