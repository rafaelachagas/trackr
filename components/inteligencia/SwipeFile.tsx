'use client'

import React, { useEffect, useState } from 'react'
import { Search, Loader2, ExternalLink, Copy, Check, Clock } from 'lucide-react'
import { buscarSwipe, listarNichosOfertas, type SwipeItem } from '@/app/actions/rastreador-swipe'
import { ANGULOS, anguloMeta, CLASSIFICACAO_META, type ClassificacaoTeste } from '@/lib/rastreador-intel'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

export default function SwipeFile() {
  const [termo, setTermo] = useState('')
  const [nicho, setNicho] = useState('')
  const [oferta, setOferta] = useState('')
  const [angulo, setAngulo] = useState('')
  const [nichos, setNichos] = useState<string[]>([])
  const [ofertas, setOfertas] = useState<string[]>([])
  const [itens, setItens] = useState<SwipeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [buscou, setBuscou] = useState(false)

  useEffect(() => { (async () => { const r = await listarNichosOfertas(); if (r.success) { setNichos(r.nichos); setOfertas(r.ofertas) } })(); buscar() }, [])

  async function buscar() {
    setLoading(true)
    const r = await buscarSwipe({ termo, nicho, oferta, angulo })
    setLoading(false); setBuscou(true)
    if (r.success) setItens(r.data)
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl p-4 ${card} space-y-3`}>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
              placeholder="Buscar por palavra, gancho, headline, texto da transcrição..." className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
          </div>
          <button onClick={buscar} disabled={loading} className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={nicho} onChange={(e) => { setNicho(e.target.value) }} className="text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle}>
            <option value="">Todos os nichos</option>
            {nichos.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={oferta} onChange={(e) => setOferta(e.target.value)} className="text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle}>
            <option value="">Todas as ofertas</option>
            {ofertas.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={angulo} onChange={(e) => setAngulo(e.target.value)} className="text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none" style={inputStyle}>
            <option value="">Todos os ângulos</option>
            {ANGULOS.filter((a) => a.id !== 'indefinido').map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {(nicho || oferta || angulo || termo) && <button onClick={() => { setTermo(''); setNicho(''); setOferta(''); setAngulo(''); }} className="text-[11px] text-muted-foreground hover:text-foreground">limpar</button>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</div>
      ) : itens.length === 0 && buscou ? (
        <div className={`rounded-2xl p-10 text-center ${card}`}>
          <p className="text-sm font-semibold">Nada encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">Puxe concorrentes no Rastreador, transcreva e classifique os ângulos pra popular o swipe file.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">{itens.length} criativo(s)</p>
          {itens.map((it) => <CardSwipe key={it.ad_archive_id} it={it} />)}
        </div>
      )}
    </div>
  )
}

function CardSwipe({ it }: { it: SwipeItem }) {
  const [copiado, setCopiado] = useState(false)
  const [aberto, setAberto] = useState(false)
  const a = anguloMeta(it.angulo)
  const m = it.classificacao ? CLASSIFICACAO_META[it.classificacao as ClassificacaoTeste] : null
  const texto = it.transcricao || [it.headline, it.body].filter(Boolean).join('\n\n')
  async function copiar() { try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch {} }

  return (
    <div className={`rounded-2xl p-4 ${card}`}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-xs font-bold text-foreground">{it.page_name}</span>
        {it.nicho && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{it.nicho}</span>}
        {it.angulo && it.angulo !== 'indefinido' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: a.cor, backgroundColor: `${a.cor}18` }}>{a.label}</span>}
        {m && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: m.cor, backgroundColor: m.bg }}>{m.label}</span>}
        <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{it.dias_no_ar}d</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={copiar} className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
            {copiado ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          {it.snapshot_url && <a href={it.snapshot_url} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-white/10 text-muted-foreground hover:text-primary transition"><ExternalLink className="w-3 h-3" /></a>}
        </div>
      </div>
      {it.headline && <p className="text-sm font-bold text-foreground">{it.headline}</p>}
      {it.angulo_resumo && <p className="text-xs text-muted-foreground italic mt-0.5">"{it.angulo_resumo}"</p>}
      {texto && (
        <div className="mt-2">
          <p className={`text-[13px] text-muted-foreground whitespace-pre-wrap ${aberto ? '' : 'line-clamp-3'}`}>{texto}</p>
          {texto.length > 220 && <button onClick={() => setAberto(!aberto)} className="text-[11px] text-primary font-semibold mt-1">{aberto ? 'ver menos' : 'ver tudo'}</button>}
        </div>
      )}
    </div>
  )
}
