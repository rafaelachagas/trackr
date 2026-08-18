'use client'

import React, { useEffect, useState } from 'react'
import { Radar as RadarIcon, Plus, Trash2, Loader2, RefreshCw, Check, X, ExternalLink, AlertCircle } from 'lucide-react'
import { listarRadarTermos, salvarRadarTermo, removerRadarTermo, listarRadarAchados, atualizarRadarAchado, type RadarTermo, type RadarAchado } from '@/app/actions/rastreador-radar'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

export default function Radar() {
  const [termos, setTermos] = useState<RadarTermo[]>([])
  const [achados, setAchados] = useState<RadarAchado[]>([])
  const [novo, setNovo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function carregar() {
    const [t, a] = await Promise.all([listarRadarTermos(), listarRadarAchados('novo')])
    if (t.success) setTermos(t.data)
    if (a.success) setAchados(a.data)
  }
  useEffect(() => { carregar() }, [])

  async function addTermo() {
    if (novo.trim().length < 2) return
    await salvarRadarTermo(novo.trim()); setNovo(''); carregar()
  }
  async function delTermo(id: string) { await removerRadarTermo(id); carregar() }

  async function rodarBusca() {
    setBuscando(true); setMsg(null)
    try {
      const r = await fetch('/api/rastreador/radar?manual=1', { cache: 'no-store' })
      const j = await r.json()
      if (j.precisaSetup) setMsg('O scraper ainda não tem busca por palavra (endpoint /search). Assim que ativarmos no VPS, o radar começa a achar concorrentes novos automaticamente.')
      else setMsg(`${j.achados ?? 0} concorrente(s) novo(s) encontrados.`)
    } catch { setMsg('Falha ao rodar o radar.') }
    setBuscando(false); carregar()
  }

  async function marcar(id: string, status: 'ignorado' | 'adicionado') {
    setAchados((prev) => prev.filter((a) => a.id !== id))
    await atualizarRadarAchado(id, status)
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl p-4 ${card}`}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><RadarIcon className="w-4 h-4" /> Termos vigiados (nicho)</p>
        <div className="flex gap-2 mb-3">
          <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTermo() }}
            placeholder="ex: renda extra, emagrecimento, cortes virais..." className="flex-1 px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
          <button onClick={addTermo} className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition"><Plus className="w-4 h-4" /> Adicionar</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {termos.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 text-foreground">
              {t.termo}
              <button onClick={() => delTermo(t.id)} className="text-muted-foreground hover:text-rose-400"><X className="w-3 h-3" /></button>
            </span>
          ))}
          {termos.length === 0 && <span className="text-xs text-muted-foreground">Nenhum termo ainda. Adicione os nichos que quer vigiar.</span>}
        </div>
        <button onClick={rodarBusca} disabled={buscando || termos.length === 0} className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Rodar radar agora
        </button>
      </div>

      {msg && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm" style={{ backgroundColor: 'rgba(0,174,239,0.06)', border: '1px solid rgba(0,174,239,0.2)' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-primary" /><span className="text-foreground/90">{msg}</span>
        </div>
      )}

      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Concorrentes novos encontrados ({achados.length})</p>
        {achados.length === 0 ? (
          <div className={`rounded-2xl p-8 text-center ${card}`}>
            <p className="text-sm font-semibold">Nenhum concorrente novo por enquanto</p>
            <p className="text-xs text-muted-foreground mt-1">Quando o radar achar páginas anunciando no seu nicho que você ainda não rastreia, elas aparecem aqui.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {achados.map((a) => (
              <div key={a.id} className={`rounded-xl p-3 ${card} flex items-center gap-3`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{a.page_name || `Página ${a.page_id}`}</p>
                  {a.amostra_texto && <p className="text-[11px] text-muted-foreground truncate">{a.amostra_texto}</p>}
                  <p className="text-[10px] text-muted-foreground/70 font-mono">ID {a.page_id}{a.qtd_anuncios ? ` · ${a.qtd_anuncios} anúncios` : ''}</p>
                </div>
                <a href={`https://www.facebook.com/ads/library/?view_all_page_id=${a.page_id}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-primary transition" title="Ver na Meta"><ExternalLink className="w-4 h-4" /></a>
                <button onClick={() => marcar(a.id, 'adicionado')} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition"><Check className="w-3.5 h-3.5" /> Rastrear</button>
                <button onClick={() => marcar(a.id, 'ignorado')} className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 transition" title="Ignorar"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
