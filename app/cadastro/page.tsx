'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, Mail, Lock, User, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

export default function CadastroPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const supabase = createSupabaseBrowser()

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/overview`,
      },
    })

    setLoading(false)

    if (error) {
      if (error.message.includes('already registered')) {
        setError('Este e-mail já está cadastrado.')
      } else {
        setError('Erro ao criar conta. Tente novamente.')
      }
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] max-w-full bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="w-full max-w-md mx-auto z-10">
          <div className="bg-card/80 backdrop-blur-xl border border-border rounded-[32px] p-6 sm:p-8 shadow-2xl shadow-black/50 text-center">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-black text-foreground mb-2">Conta criada!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Enviamos um link de confirmação para <span className="text-foreground font-semibold">{email}</span>. Acesse seu e-mail para ativar a conta.
            </p>
            <Link
              href="/login"
              className="inline-block w-full bg-primary hover:bg-primary/90 text-black font-black uppercase tracking-tighter py-3.5 rounded-xl transition-all"
            >
              Ir para o Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

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
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-2">
              Criar nova conta
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                Nome
              </label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="seu nome"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full bg-[#f1f5f9] border-none rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                E-mail
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="email"
                  placeholder="insira seu e-mail"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#f1f5f9] border-none rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                Senha
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="password"
                  placeholder="mínimo 8 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full bg-[#f1f5f9] border-none rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
                Confirmar Senha
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="password"
                  placeholder="repita a senha"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  className="w-full bg-[#f1f5f9] border-none rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 transition-all outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-black font-black uppercase tracking-tighter py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[10px] text-muted-foreground">
              Já tem uma conta?{' '}
              <Link href="/login" className="text-primary hover:underline font-semibold">
                Fazer login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
