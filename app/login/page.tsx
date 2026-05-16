'use client'

import { Zap, Mail, Lock } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Radial Glow Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm z-10">
        <div className="bg-[#0b1222]/80 backdrop-blur-xl border border-slate-800/50 rounded-[32px] p-8 shadow-2xl shadow-black/50">
          
          {/* Logo Section */}
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-16 h-16 rounded-3xl bg-[#0b1222] border border-[#1e293b] flex items-center justify-center shadow-lg shadow-black/50 mb-4 relative overflow-hidden">
               <div className="absolute inset-0 bg-[#00aeef]/10" />
               <Zap className="w-8 h-8 text-[#00aeef] relative z-10" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">
              TRACKR
            </h1>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">
              Painel de Gestão de Performance
            </p>
          </div>

          {/* Form */}
          <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                E-mail
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[#00aeef] transition-colors" />
                <input 
                  type="email" 
                  placeholder="insira seu e-mail"
                  className="w-full bg-[#f1f5f9] border-none rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#00aeef]/50 transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Senha
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[#00aeef] transition-colors" />
                <input 
                  type="password" 
                  placeholder="********"
                  className="w-full bg-[#f1f5f9] border-none rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-[#00aeef]/50 transition-all outline-none"
                />
              </div>
            </div>

            <Link 
              href="/overview"
              className="w-full bg-[#00aeef] hover:bg-[#0094cc] text-black font-black uppercase tracking-tighter py-4 rounded-xl flex items-center justify-center transition-all shadow-[0_0_25px_rgba(0,174,239,0.3)] hover:shadow-[0_0_35px_rgba(0,174,239,0.4)] active:scale-[0.98]"
            >
              Entrar no Dashboard
            </Link>
          </form>

          <div className="mt-10 text-center">
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">
              Trackr Analytics © V1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
