'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

export default function NovaSenhaPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

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
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('Erro ao atualizar senha. O link pode ter expirado.')
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/overview'), 2000)
  }

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm z-10">
        <div className="bg-[#0b1222]/80 backdrop-blur-xl border border-slate-800/50 rounded-[32px] p-8 shadow-2xl shadow-black/50">

          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-3xl bg-[#0b1222] border border-[#1e293b] flex items-center justify-center shadow-lg shadow-black/50 mb-4 relative overflow-hidden">
              {success
                ? <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                : <><div className="absolute inset-0 bg-[#00aeef]/10" /><Zap className="w-8 h-8 text-[#00aeef] relative z-10" strokeWidth={2.5} /></>
              }
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">TRACKR</h1>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">
              {success ? 'Senha atualizada!' : 'Nova senha'}
            </p>
          </div>

          {success ? (
            <p className="text-sm text-slate-400 text-center">
              Sua senha foi atualizada. Redirecionando para o dashboard...
            </p>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Nova Senha
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[#00aeef] transition-colors" />
                  <input
                    type="password"
                    placeholder="mínimo 8 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full bg-[#f1f5f9] border-none rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#00aeef]/50 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Confirmar Senha
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[#00aeef] transition-colors" />
                  <input
                    type="password"
                    placeholder="repita a senha"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
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
                className="w-full bg-[#00aeef] hover:bg-[#0094cc] disabled:opacity-60 text-black font-black uppercase tracking-tighter py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_25px_rgba(0,174,239,0.3)] active:scale-[0.98]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Nova Senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
