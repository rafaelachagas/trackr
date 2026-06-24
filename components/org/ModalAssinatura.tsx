'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, CreditCard, Calendar, Hash, User, Mail } from 'lucide-react'
import type { OrgMembership } from '@/hooks/useAuth'

interface Subscription {
  plan_name: string | null
  status: string | null
  subscriber_email: string | null
  purchase_date: string | null
  access_until: string | null
  transaction_id: string | null
  subscriber_code: string | null
  max_members: number | null
  max_criativos: number | null
}

interface Props {
  activeOrg: OrgMembership
  onClose: () => void
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Ativo', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  inactive: { label: 'Inativo', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  cancelled: { label: 'Cancelado', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  overdue: { label: 'Em atraso', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
}

function fmt(date: string | null) {
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#13181a', border: '1px solid rgba(255,255,255,0.07)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Plano</p>
            <h2 className="text-base font-black text-foreground tracking-tight">Assinatura</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
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
            <div className="space-y-4">
              {/* Status + Plano */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ backgroundColor: '#1a2022' }}
              >
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Plano</p>
                  <p className="text-lg font-black text-foreground tracking-tight">{sub.plan_name ?? '—'}</p>
                </div>
                {status && (
                  <span
                    className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg"
                    style={{ color: status.color, backgroundColor: status.bg }}
                  >
                    {status.label}
                  </span>
                )}
              </div>

              {/* Detalhes */}
              {[
                { icon: Mail, label: 'E-mail do assinante', value: sub.subscriber_email },
                { icon: Calendar, label: 'Data da compra', value: fmt(sub.purchase_date) },
                { icon: Calendar, label: 'Acesso até', value: fmt(sub.access_until) },
                { icon: Hash, label: 'ID da transação', value: sub.transaction_id },
                { icon: User, label: 'Código do assinante', value: sub.subscriber_code },
              ].map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ backgroundColor: '#1a2022' }}
                >
                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
                    <p className="text-xs font-semibold text-foreground truncate mt-0.5">{value ?? '—'}</p>
                  </div>
                </div>
              ))}

              {/* Limites do plano */}
              {(sub.max_members != null || sub.max_criativos != null) && (
                <div
                  className="flex gap-3 px-4 py-3 rounded-xl"
                  style={{ backgroundColor: '#1a2022' }}
                >
                  {sub.max_members != null && (
                    <div className="flex-1 text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Membros</p>
                      <p className="text-xl font-black text-foreground mt-1">{sub.max_members}</p>
                    </div>
                  )}
                  {sub.max_criativos != null && (
                    <div className="flex-1 text-center border-l" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Criativos</p>
                      <p className="text-xl font-black text-foreground mt-1">{sub.max_criativos}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
