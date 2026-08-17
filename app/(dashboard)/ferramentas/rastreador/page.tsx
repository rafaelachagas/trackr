'use client'

import React, { useMemo, useState } from 'react'
import { Binoculars, Link2, Search, CalendarClock, Info, ExternalLink, Download, Copy, PlayCircle } from 'lucide-react'
import type { CriativoRastreado } from '@/lib/rastreador'

const cardClass = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

const FREQ = ['3 dias', '5 dias', '7 dias', '14 dias']
type Ordem = 'antigos' | 'copias' | 'recentes'
type Tipo = 'todos' | 'video' | 'image'

interface Resultado { stats?: { encontrados: number; duplicacoes: number; idade_media_dias: number | null }; criativos?: CriativoRastreado[]; error?: string }

export default function RastreadorPage() {
  const [link, setLink] = useState('')
  const [freq, setFreq] = useState('3 dias')
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)
  const [ordem, setOrdem] = useState<Ordem>('antigos')
  const [tipo, setTipo] = useState<Tipo>('todos')

  async function puxar() {
    if (!link.trim()) return
    setLoading(true); setRes(null)
    try {
      const r = await fetch('/api/rastreador/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link.trim() }),
      })
      const j = await r.json()
      setRes(j)
    } catch {
      setRes({ error: 'Falha ao chamar o scraper.' })
    } finally {
      setLoading(false)
    }
  }

  const criativos = useMemo(() => {
    let cs = [...(res?.criativos ?? [])]
    if (tipo !== 'todos') cs = cs.filter((c) => c.media_type === tipo)
    cs.sort((a, b) => {
      if (ordem === 'copias') return (b.copias || 0) - (a.copias || 0)
      if (ordem === 'recentes') return (b.dias_ativo ?? 0) - (a.dias_ativo ?? 0) // menos dias = mais recente → invertido abaixo
      return (b.dias_ativo ?? 0) - (a.dias_ativo ?? 0) // 'antigos' = mais dias ativo primeiro
    })
    if (ordem === 'recentes') cs.reverse()
    return cs
  }, [res, tipo, ordem])

  return (
    <div className="pb-20 max-w-[1200px] mx-auto w-full text-foreground space-y-6 px-4 sm:px-6 lg:px-8">
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

      {/* Busca por link */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Busca de concorrente</span>
        </div>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Link da Biblioteca de Anúncios</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') puxar() }}
            placeholder="https://www.facebook.com/ads/library/?...view_all_page_id=..." className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
          <button onClick={puxar} disabled={loading || !link.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
            <Search className="w-4 h-4" /> {loading ? 'Puxando...' : 'Puxar criativos'}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">Cole o link da página do concorrente na biblioteca da Meta (ou só o ID da página).</p>

        {/* Agendamento (shell — entra na próxima) */}
        <div className="mt-5 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Puxar automaticamente a cada</span>
            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground ml-1">em breve</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {FREQ.map((f) => (
              <button key={f} onClick={() => setFreq(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${freq === f ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                {f}
              </button>
            ))}
            <button disabled className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 opacity-40 cursor-not-allowed border border-emerald-500/30 text-emerald-300">
              <CalendarClock className="w-4 h-4" /> Agendar
            </button>
          </div>
        </div>
      </div>

      {/* Erro */}
      {res?.error && (
        <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ backgroundColor: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)' }}>
          <Info className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-200/90">{res.error}</p>
        </div>
      )}

      {/* Resultados */}
      {res?.stats && (
        <>
          <div className="flex items-center gap-5 flex-wrap text-sm">
            <span className="text-muted-foreground"><b className="text-foreground">{res.stats.encontrados}</b> criativos</span>
            <span className="text-muted-foreground"><b className="text-foreground">{res.stats.duplicacoes}</b> duplicações</span>
            {res.stats.idade_media_dias != null && <span className="text-muted-foreground"><b className="text-foreground">{res.stats.idade_media_dias}</b> dias de idade média</span>}
            <div className="flex items-center gap-1.5 ml-auto">
              {(['todos', 'video', 'image'] as Tipo[]).map((t) => (
                <button key={t} onClick={() => setTipo(t)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${tipo === t ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                  {t === 'todos' ? 'Todos' : t === 'video' ? 'Vídeo' : 'Imagem'}
                </button>
              ))}
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="text-[11px] font-semibold rounded-lg px-2 py-1.5 outline-none" style={inputStyle}>
                <option value="antigos">Mais antigos</option>
                <option value="copias">Mais cópias</option>
                <option value="recentes">Mais recentes</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {criativos.map((c) => <CardCriativo key={c.ad_archive_id} c={c} />)}
          </div>
        </>
      )}

      {/* Estado vazio inicial */}
      {!res && !loading && (
        <div className={`rounded-2xl p-12 flex flex-col items-center justify-center text-center ${cardClass}`}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#1a2022' }}>
            <Binoculars className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold">Cole um link pra ver os criativos</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">A gente puxa os anúncios ativos do concorrente direto da biblioteca da Meta — com tempo ativo, nº de cópias, mídia e link.</p>
        </div>
      )}
    </div>
  )
}

function CardCriativo({ c }: { c: CriativoRastreado }) {
  return (
    <div className={`rounded-2xl overflow-hidden flex flex-col ${cardClass}`}>
      {/* Mídia */}
      <div className="relative aspect-square bg-black/40 flex items-center justify-center overflow-hidden">
        {c.image_url
          ? <img src={c.image_url} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          : <Binoculars className="w-8 h-8 text-muted-foreground" />}
        {c.media_type === 'video' && <PlayCircle className="absolute w-10 h-10 text-white/80 drop-shadow-lg" />}
        <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">
          {c.dias_ativo != null ? `Ativo há ${c.dias_ativo}d` : 'Ativo'}
        </span>
        {c.copias > 1 && (
          <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/80 text-black flex items-center gap-1">
            <Copy className="w-3 h-3" /> {c.copias}
          </span>
        )}
        {c.media_type === 'video' && <span className="absolute bottom-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/80 text-white">VÍDEO</span>}
      </div>

      {/* Texto */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {c.page_name && <p className="text-xs font-semibold text-muted-foreground truncate">{c.page_name}</p>}
        {c.headline && <p className="text-sm font-bold text-foreground leading-tight line-clamp-2">{c.headline}</p>}
        {c.body && <p className="text-[11px] text-muted-foreground line-clamp-3">{c.body}</p>}

        <div className="mt-auto pt-2 flex flex-wrap gap-1.5">
          {c.snapshot_url && <A href={c.snapshot_url}><ExternalLink className="w-3.5 h-3.5" /> Ver na Meta</A>}
          {c.link_url && <A href={c.link_url}>Página</A>}
          {c.video_url && <A href={c.video_url}><Download className="w-3.5 h-3.5" /> Vídeo</A>}
        </div>
      </div>
    </div>
  )
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-white/10 text-muted-foreground hover:text-primary hover:border-primary/40 transition">
      {children}
    </a>
  )
}
