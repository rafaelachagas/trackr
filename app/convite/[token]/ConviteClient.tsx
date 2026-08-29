'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, CheckCircle2, XCircle, Clock, Users, Loader2, Crown, User } from 'lucide-react'

type Status = 'pending' | 'invalid' | 'used' | 'expired' | 'already_member' | 'accepted'

interface Props {
  status: Status
  token?: string
  orgName?: string
  role?: string
  requiresLogin?: boolean
}

const MESSAGES: Record<Status, { icon: React.ReactNode; title: string; body: string; color: string }> = {
  invalid: {
    icon: <XCircle className="w-8 h-8 text-rose-400" />,
    title: 'Convite inválido',
    body: 'Este link de convite não existe ou foi removido.',
    color: 'rose',
  },
  used: {
    icon: <CheckCircle2 className="w-8 h-8 text-muted-foreground" />,
    title: 'Convite já usado',
    body: 'Este link já foi utilizado e não pode ser usado novamente.',
    color: 'slate',
  },
  expired: {
    icon: <Clock className="w-8 h-8 text-yellow-400" />,
    title: 'Convite expirado',
    body: 'Este link de convite expirou. Peça um novo link ao administrador.',
    color: 'yellow',
  },
  already_member: {
    icon: <CheckCircle2 className="w-8 h-8 text-emerald-400" />,
    title: 'Você já é membro',
    body: 'Você já faz parte desta organização.',
    color: 'emerald',
  },
  accepted: {
    icon: <CheckCircle2 className="w-8 h-8 text-emerald-400" />,
    title: 'Bem-vindo!',
    body: 'Você entrou na organização com sucesso.',
    color: 'emerald',
  },
  pending: {
    icon: <Users className="w-8 h-8 text-primary" />,
    title: 'Você foi convidado',
    body: '',
    color: 'blue',
  },
}

export default function ConviteClient({ status: initialStatus, token, orgName, role, requiresLogin }: Props) {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function acceptInvite() {
    if (!token) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/org/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error ?? 'Erro ao aceitar convite.')
      return
    }

    setStatus('accepted')
    setTimeout(() => router.push('/overview'), 2000)
  }

  const msg = MESSAGES[status]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] max-w-full bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md mx-auto z-10">
        <div className="bg-card/80 backdrop-blur-xl border border-border rounded-[32px] p-6 sm:p-8 shadow-2xl shadow-black/50">

          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-3xl bg-background border border-border flex items-center justify-center shadow-lg shadow-black/50 mb-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/10" />
              <Zap className="w-8 h-8 text-primary relative z-10" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-foreground">TRACKR</h1>
          </div>

          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent border border-border flex items-center justify-center">
              {msg.icon}
            </div>

            <div>
              <h2 className="text-xl font-black text-foreground mb-2">{msg.title}</h2>

              {status === 'pending' ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Você foi convidado para entrar na organização{' '}
                    <span className="text-foreground font-bold">{orgName}</span>
                    {' '}como{' '}
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: role === 'admin' ? '#f59e0b' : '#2E90FA' }}>
                      {role === 'admin' ? <Crown className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {role === 'admin' ? 'Administrador' : 'Membro'}
                    </span>.
                  </p>

                  {requiresLogin ? (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs text-muted-foreground">Faça login ou crie uma conta para aceitar.</p>
                      <Link
                        href={`/login?redirect=/convite/${token}`}
                        className="block w-full bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-tighter py-3.5 rounded-xl transition-all text-center"
                      >
                        Entrar com conta existente
                      </Link>
                      <Link
                        href={`/cadastro?redirect=/convite/${token}`}
                        className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition py-2"
                      >
                        Criar nova conta →
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2">
                      {error && (
                        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>
                      )}
                      <button
                        onClick={acceptInvite}
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-black font-black uppercase tracking-tighter py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aceitar Convite'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{msg.body}</p>
              )}
            </div>

            {(status === 'invalid' || status === 'used' || status === 'expired' || status === 'already_member') && (
              <Link href="/overview" className="text-xs text-muted-foreground hover:text-primary transition font-semibold">
                Ir para o Dashboard →
              </Link>
            )}

            {status === 'accepted' && (
              <p className="text-xs text-muted-foreground">Redirecionando para o dashboard...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
