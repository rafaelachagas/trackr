'use client'

import React, { useState } from 'react'
import { Binoculars, Link2, Search, CalendarClock, Info } from 'lucide-react'

const cardStyle: React.CSSProperties = { backgroundColor: '#13181a', border: '1px solid rgba(255,255,255,0.05)' }
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

const FREQ = ['3 dias', '5 dias', '7 dias', '14 dias']

export default function RastreadorPage() {
  const [link, setLink] = useState('')
  const [freq, setFreq] = useState('3 dias')

  return (
    <div className="pb-20 max-w-[1100px] mx-auto w-full text-foreground space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Binoculars className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Rastreador de Anúncios</h1>
            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary">Beta</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Veja quais criativos estão rodando na Biblioteca de Anúncios da Meta — em volume e há muito tempo. Referência do que funciona no nicho.</p>
        </div>
      </div>

      {/* Aviso de construção */}
      <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ backgroundColor: 'rgba(245,179,1,0.06)', border: '1px solid rgba(245,179,1,0.2)' }}>
        <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-200/90">
          <b>Em construção.</b> A coleta roda por scraping na VPS (Biblioteca de Anúncios) e a transcrição via Transkriptor. A interface abaixo é a prévia — o botão de puxar entra assim que o serviço da VPS estiver ligado.
        </p>
      </div>

      {/* Busca pontual */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Busca de concorrente</span>
        </div>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Link da Biblioteca de Anúncios</label>
        <input value={link} onChange={(e) => setLink(e.target.value)}
          placeholder="https://www.facebook.com/ads/library/?id=..." className="w-full px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
        <p className="text-[11px] text-muted-foreground mt-1.5">Cole o link da página de anúncios do concorrente na biblioteca da Meta.</p>
        <button disabled className="mt-3 px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 opacity-50 cursor-not-allowed" style={inputStyle}>
          <Search className="w-4 h-4" /> Puxar criativos
        </button>

        {/* Agendamento */}
        <div className="mt-5 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Puxar novos criativos automaticamente a cada</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {FREQ.map((f) => (
              <button key={f} onClick={() => setFreq(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${freq === f ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                {f}
              </button>
            ))}
            <button disabled className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 opacity-50 cursor-not-allowed border border-emerald-500/30 text-emerald-300">
              <CalendarClock className="w-4 h-4" /> Agendar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Mínimo de 3 dias. Roda na VPS com a mesma segmentação e salva os novos criativos no Supabase.</p>
        </div>
      </div>

      {/* Estado vazio */}
      <div className="rounded-2xl p-12 flex flex-col items-center justify-center text-center" style={cardStyle}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#1a2022' }}>
          <Binoculars className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold">Cole um link pra ver os criativos</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">Quando o serviço da VPS estiver ligado, puxamos os anúncios ativos do concorrente direto da biblioteca da Meta — com tempo ativo, nº de cópias, download do vídeo, transcrição e link da página.</p>
      </div>
    </div>
  )
}
