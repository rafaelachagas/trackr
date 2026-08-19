'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, ExternalLink, Copy, Check, Clock, PlayCircle, Users, FolderOpen, X } from 'lucide-react'
import { buscarSwipe, listarNichosOfertas, type SwipeItem } from '@/app/actions/rastreador-swipe'
import { listarBibliotecas, type BibliotecaRastreada } from '@/app/actions/rastreador'
import { ANGULOS, anguloMeta, CLASSIFICACAO_META, type ClassificacaoTeste } from '@/lib/rastreador-intel'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

function nomeBib(b: BibliotecaRastreada): string {
  return (b.nome_custom?.trim() || b.page_name?.trim() || `Página ${b.page_id}`)
}

export default function SwipeFile() {
  const [bibs, setBibs] = useState<BibliotecaRastreada[]>([])
  const [bibId, setBibId] = useState('')        // pessoa selecionada
  const [termo, setTermo] = useState('')
  const [nicho, setNicho] = useState('')
  const [angulo, setAngulo] = useState('')
  const [nichos, setNichos] = useState<string[]>([])
  const [itens, setItens] = useState<SwipeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [buscou, setBuscou] = useState(false)

  useEffect(() => {
    (async () => {
      const [b, no] = await Promise.all([listarBibliotecas(), listarNichosOfertas()])
      if (b.success) setBibs(b.data)
      if (no.success) setNichos(no.nichos)
    })()
    buscar()
  }, [])

  async function buscar() {
    setLoading(true)
    const r = await buscarSwipe({ termo, nicho, angulo, bibliotecaId: bibId || undefined })
    setLoading(false); setBuscou(true)
    if (r.success) setItens(r.data)
  }

  // Reexecuta a busca ao trocar pessoa/nicho/ângulo.
  useEffect(() => { if (buscou) buscar() /* eslint-disable-next-line */ }, [bibId, nicho, angulo])

  // Agrupa por pessoa quando não há pessoa selecionada.
  const grupos = useMemo(() => {
    const m = new Map<string, { nome: string; itens: SwipeItem[] }>()
    for (const it of itens) {
      const k = it.biblioteca_id
      if (!m.has(k)) m.set(k, { nome: it.page_name || 'Concorrente', itens: [] })
      m.get(k)!.itens.push(it)
    }
    return [...m.values()].sort((a, b) => b.itens.length - a.itens.length)
  }, [itens])

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className={`rounded-2xl p-4 ${card} space-y-3`}>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <Users className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <select value={bibId} onChange={(e) => setBibId(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none appearance-none" style={inputStyle}>
              <option value="">Todas as pessoas ({bibs.length})</option>
              {bibs.map((b) => <option key={b.id} value={b.id}>{nomeBib(b)}</option>)}
            </select>
          </div>
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
              placeholder="Buscar gancho, headline, transcrição..." className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
          </div>
          <button onClick={buscar} disabled={loading} className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={nicho} onChange={(e) => setNicho(e.target.value)} className="text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle}>
            <option value="">Todos os nichos</option>
            {nichos.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={angulo} onChange={(e) => setAngulo(e.target.value)} className="text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle}>
            <option value="">Todos os ângulos</option>
            {ANGULOS.filter((a) => a.id !== 'indefinido').map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {(nicho || angulo || termo || bibId) && <button onClick={() => { setTermo(''); setNicho(''); setAngulo(''); setBibId(''); }} className="text-[11px] text-muted-foreground hover:text-foreground">limpar</button>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</div>
      ) : itens.length === 0 && buscou ? (
        <div className={`rounded-2xl p-10 text-center ${card}`}>
          <p className="text-sm font-semibold">Nada no swipe file ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Puxe concorrentes no Rastreador e transcreva os criativos — eles caem aqui organizados por pessoa.</p>
        </div>
      ) : (
        // Sem pessoa selecionada: agrupa por pessoa. Com pessoa: grid direto.
        <div className="space-y-6">
          {grupos.map((g) => (
            <div key={g.nome}>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">{g.nome}</h3>
                <span className="text-[11px] text-muted-foreground">{g.itens.length} criativo(s)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.itens.map((it) => <CardSwipe key={it.ad_archive_id} it={it} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CardSwipe({ it }: { it: SwipeItem }) {
  const [copiado, setCopiado] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [tocando, setTocando] = useState(false)
  const podeTocar = it.media_type === 'video' && !!it.video_url
  const a = anguloMeta(it.angulo)
  const m = it.classificacao ? CLASSIFICACAO_META[it.classificacao as ClassificacaoTeste] : null
  const texto = it.transcricao || [it.headline, it.body].filter(Boolean).join('\n\n')
  async function copiar() { try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch {} }

  return (
    <div className={`rounded-2xl overflow-hidden flex flex-col ${card}`}>
      {tocando && it.video_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTocando(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md">
            <button onClick={() => setTocando(false)} className="absolute -top-9 right-0 p-1.5 rounded-lg text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
            <video src={it.video_url} controls autoPlay playsInline className="w-full rounded-2xl bg-black max-h-[80vh]" />
          </div>
        </div>
      )}
      <button type="button" onClick={() => { if (podeTocar) setTocando(true) }} disabled={!podeTocar}
        className={`relative aspect-square bg-black/40 flex items-center justify-center overflow-hidden w-full ${podeTocar ? 'cursor-pointer group' : 'cursor-default'}`}>
        {it.image_url
          ? <img src={it.image_url} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          : <Search className="w-7 h-7 text-muted-foreground" />}
        {it.media_type === 'video' && <PlayCircle className="absolute w-9 h-9 text-white/80 drop-shadow-lg group-hover:scale-110 transition" />}
        <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white flex items-center gap-1"><Clock className="w-3 h-3" />{it.dias_no_ar}d</span>
        {m && <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: m.cor, backgroundColor: m.bg }}>{m.label}</span>}
        {it.status === 'removido' && <span className="absolute bottom-2 left-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/80 text-white">Saiu do ar</span>}
      </button>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {it.angulo && it.angulo !== 'indefinido' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: a.cor, backgroundColor: `${a.cor}18` }}>{a.label}</span>}
          {it.nicho && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{it.nicho}</span>}
        </div>
        {it.headline && <p className="text-sm font-bold text-foreground leading-tight line-clamp-2">{it.headline}</p>}
        {it.angulo_resumo && <p className="text-[11px] text-muted-foreground italic">"{it.angulo_resumo}"</p>}
        {texto && (
          <p className={`text-[12px] text-muted-foreground whitespace-pre-wrap ${aberto ? '' : 'line-clamp-3'}`}>{texto}</p>
        )}
        <div className="mt-auto pt-2 flex items-center gap-1.5">
          {texto.length > 160 && <button onClick={() => setAberto(!aberto)} className="text-[11px] text-primary font-semibold">{aberto ? 'ver menos' : 'ver tudo'}</button>}
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={copiar} className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
              {copiado ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
            {it.snapshot_url && <a href={it.snapshot_url} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-white/10 text-muted-foreground hover:text-primary transition"><ExternalLink className="w-3 h-3" /></a>}
          </div>
        </div>
      </div>
    </div>
  )
}
