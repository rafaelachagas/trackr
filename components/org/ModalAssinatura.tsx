'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, CreditCard, Calendar, Hash, User, Mail, RefreshCw, Building2 } from 'lucide-react'
import type { OrgMembership } from '@/hooks/useAuth'

interface Subscription {
  plan_name: string | null
  status: string | null
  hotmart_email: string | null
  purchase_date: string | null
  access_until: string | null
  transaction_id: string | null
  subscriber_code: string | null
  recurrence_count: number | null
  max_workspaces: number | null
}

interface Props {
  activeOrg: OrgMembership
  onClose: () => void
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Ativo', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  inactive: { label: 'Inativo', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  cancelled: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  overdue: { label: 'Em atraso', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

function fmt(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtShort(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ModalAssinatura({ activeOrg, onClose }: Props) {
  const [sub, setSub] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/org/subscription?org_id=${activeOrg.org_id}`)
      .then(r => r.json())
      .then(json => {
        if (json.subscription) setSub(json.subscription)
        else setNotFound(true)
        setLoading(false)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [])

  const status = sub?.status ? (STATUS_MAP[sub.status] ?? STATUS_MAP.inactive) : null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(46, 144, 250,0.1)' }}>
            <CreditCard className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-base font-black text-foreground tracking-tight flex-1">Gerenciar Assinatura</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : notFound || !sub ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma assinatura encontrada para esta organização.</p>
            </div>
          ) : (
            <div className="space-y-3">

              {/* Card: Informações da Assinatura */}
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Informações da Assinatura</p>
                </div>
                <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  {[
                    { label: 'Plano', value: sub.plan_name },
                    { label: 'Status', value: status ? (
                      <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: status.color }}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {status.label}
                      </span>
                    ) : '—' },
                    { label: 'Email', value: sub.hotmart_email },
                    { label: 'Data de Compra', value: fmtShort(sub.purchase_date) },
                    { label: 'Recorrência', value: sub.recurrence_count != null ? `${sub.recurrence_count}ª` : '—' },
                    { label: 'Transaction ID', value: sub.transaction_id },
                    { label: 'Subscriber Code', value: sub.subscriber_code },
                    { label: 'Acesso até', value: sub.access_until ? (
                      <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>{fmt(sub.access_until)}</span>
                    ) : <span className="text-xs font-bold text-emerald-400">Sem vencimento</span> },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5 gap-4">
                      <p className="text-[11px] text-muted-foreground flex-shrink-0">{label}:</p>
                      <div className="text-xs font-semibold text-foreground text-right truncate">{value ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card: Limites */}
              {sub.max_workspaces != null && (
                <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Limites da Assinatura</p>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Workspaces permitidos:</span>
                      <span className="font-bold text-foreground">{sub.max_workspaces}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Card: Organização vinculada */}
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Organizações Vinculadas</p>
                </div>
                <div className="px-4 py-3">
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">{activeOrg.org_name}</span>
                    </div>
                    <span
                      className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded"
                      style={{ backgroundColor: 'rgba(46, 144, 250,0.1)', color: '#2E90FA' }}
                    >
                      Atual
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-xs font-bold transition"
            style={{ backgroundColor: 'rgba(46, 144, 250,0.1)', color: '#2E90FA', border: '1px solid rgba(46, 144, 250,0.2)' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
