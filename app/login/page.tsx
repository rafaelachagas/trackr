'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BrandIcon } from '@/components/ui/BrandLogo'
import { Zap, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/overview'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
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
        <div className="flex items-center justify-between ml-1">
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            Senha
          </label>
          <Link href="/reset-senha" className="text-[10px] text-primary hover:underline font-semibold">
            Esqueceu a senha?
          </Link>
        </div>
        <div className="relative group">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
          <input
            type="password"
            placeholder="********"
            value={password}
            onChange={e => setPassword(e.target.value)}
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
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar no Dashboard'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] max-w-full bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md mx-auto z-10">
        <div className="bg-card/80 backdrop-blur-xl border border-border rounded-[32px] p-6 sm:p-8 shadow-2xl shadow-black/50">

          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-16 h-16 rounded-3xl bg-[#070C16] border border-border flex items-center justify-center shadow-lg shadow-black/50 mb-4" style={{ filter: 'drop-shadow(0 12px 34px rgba(46,144,250,0.38))' }}>
              <BrandIcon size={40} />
            </div>
            <div style={{ fontFamily: 'var(--font-brand), var(--font-app), sans-serif', fontWeight: 700, letterSpacing: '-0.045em', fontSize: 34, lineHeight: 1 }}>
              <span style={{ color: 'var(--muted-foreground)' }}>the</span><span style={{ color: 'var(--foreground)' }}>track</span>
            </div>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-2">
              Painel de Gestão de Performance
            </p>
          </div>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          <div className="mt-8 text-center">
            <p className="text-[10px] text-muted-foreground">
              Não tem acesso?{' '}
              <Link href="/cadastro" className="text-primary hover:underline font-semibold">
                Criar conta
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              Trackr Analytics © V1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
