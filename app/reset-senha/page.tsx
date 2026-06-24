'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Zap, Mail, AlertCircle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

export default function ResetSenhaPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nova-senha`,
    })

    setLoading(false)

    if (error) {
      setError('Erro ao enviar e-mail. Verifique o endereço e tente novamente.')
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="w-full max-w-sm z-10">
          <div className="bg-[#0b1222]/80 backdrop-blur-xl border border-slate-800/50 rounded-[32px] p-8 shadow-2xl shadow-black/50 text-center">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-black text-white mb-2">E-mail enviado!</h2>
            <p className="text-sm text-slate-400 mb-6">
              Enviamos as instruções de recuperação para{' '}
              <span className="text-white font-semibold">{email}</span>.
              Verifique sua caixa de entrada.
            </p>
            <Link
              href="/login"
              className="inline-block w-full bg-[#00aeef] hover:bg-[#0094cc] text-black font-black uppercase tracking-tighter py-3.5 rounded-xl transition-all"
            >
              Voltar ao Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm z-10">
        <div className="bg-[#0b1222]/80 backdrop-blur-xl border border-slate-800/50 rounded-[32px] p-8 shadow-2xl shadow-black/50">

          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-3xl bg-[#0b1222] border border-[#1e293b] flex items-center justify-center shadow-lg shadow-black/50 mb-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-[#00aeef]/10" />
              <Zap className="w-8 h-8 text-[#00aeef] relative z-10" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">TRACKR</h1>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">
              Recuperar senha
            </p>
          </div>

          <p className="text-xs text-slate-400 text-center mb-6">
            Insira seu e-mail e enviaremos um link para redefinir sua senha.
          </p>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                E-mail
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[#00aeef] transition-colors" />
                <input
                  type="email"
                  placeholder="insira seu e-mail"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#f1f5f9] border-none rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#00aeef]/50 transition-all outline-none"
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
              className="w-full bg-[#00aeef] hover:bg-[#0094cc] disabled:opacity-60 text-black font-black uppercase tracking-tighter py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_25px_rgba(0,174,239,0.3)] hover:shadow-[0_0_35px_rgba(0,174,239,0.4)] active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar Link de Recuperação'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-[#00aeef] transition-colors font-semibold uppercase tracking-widest">
              <ArrowLeft className="w-3 h-3" />
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
