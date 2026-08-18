'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { Binoculars, Link2, Search, CalendarClock, Info, ExternalLink, Download, Copy, PlayCircle, Bookmark, Trash2, RotateCw, FileText, Loader2, ArrowLeft, X, Save, Check, Clock } from 'lucide-react'
import { extrairPageId, type CriativoRastreado } from '@/lib/rastreador'
import { listarBibliotecas, salvarBiblioteca, removerBiblioteca, getTranscricoes, salvarTranscricao, salvarSnapshot, listarSnapshots, type BibliotecaRastreada, type SnapshotRastreador } from '@/app/actions/rastreador'
import { baixarTxt, baixarDocx } from '@/lib/exportDoc'

const FREQ_NUM: Record<string, number> = { '1 dia': 1, '3 dias': 3, '5 dias': 5, '7 dias': 7, '14 dias': 14 }
const FREQ = ['1 dia', '3 dias', '5 dias', '7 dias', '14 dias']

const cardClass = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

type Ordem = 'antigos' | 'copias' | 'recentes'
type Tipo = 'todos' | 'video' | 'image'
type Aba = 'buscar' | 'bibliotecas'

interface Resultado { stats?: { encontrados: number; duplicacoes: number; idade_media_dias: number | null }; criativos?: CriativoRastreado[]; error?: string }

// Transcrição aberta no modal.
interface ModalT { c: CriativoRastreado; texto: string }

export default function RastreadorPage() {
  const [aba, setAba] = useState<Aba>('buscar')
  const [link, setLink] = useState('')
  const [freq, setFreq] = useState('3 dias')
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<Resultado | null>(null)
  const [ordem, setOrdem] = useState<Ordem>('antigos')
  const [tipo, setTipo] = useState<Tipo>('todos')
  const [bibliotecas, setBibliotecas] = useState<BibliotecaRastreada[]>([])
  const [salvando, setSalvando] = useState(false)
  const [cacheTranscricoes, setCacheTranscricoes] = useState<Record<string, string>>({})
  const [modalT, setModalT] = useState<ModalT | null>(null)
  const [bibAberta, setBibAberta] = useState<BibliotecaRastreada | null>(null)

  useEffect(() => { carregarBibs() }, [])
  async function carregarBibs() {
    const r = await listarBibliotecas()
    if (r.success) setBibliotecas(r.data)
  }

  async function puxar(alvo?: string) {
    const url = (alvo ?? link).trim()
    if (!url) return
    if (alvo) setLink(alvo)
    setAba('buscar')
    setLoading(true); setRes(null)
    try {
      const r = await fetch('/api/rastreador/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const j = await r.json()
      setRes(j)
      const ids = (j?.criativos ?? []).map((c: CriativoRastreado) => c.ad_archive_id).filter(Boolean) as string[]
      if (ids.length) {
        const t = await getTranscricoes(ids)
        if (t.success) setCacheTranscricoes(t.data)
      }
      // Se a página já é uma biblioteca salva, registra um snapshot (movimento).
      const pageId = extrairPageId(url)
      if (pageId && j?.criativos?.length) {
        const s = await salvarSnapshot(pageId, j.stats, j.criativos)
        if (s.success && !(s as any).naoSalva) carregarBibs()
      }
    } catch {
      setRes({ error: 'Falha ao chamar o scraper.' })
    } finally {
      setLoading(false)
    }
  }

  async function salvar(freqDias: number | null) {
    const pageId = extrairPageId(link)
    if (!pageId) { alert('Cole um link válido da Biblioteca de Anúncios (ou o ID da página) antes de salvar.'); return }
    setSalvando(true)
    const pageName = res?.criativos?.[0]?.page_name ?? null
    const r = await salvarBiblioteca(pageId, pageName, link.trim() || null, freqDias)
    if (r.success) carregarBibs()
    else alert('Erro ao salvar: ' + r.error)
    setSalvando(false)
  }

  async function removerBib(id: string) {
    if (!confirm('Parar de acompanhar esta biblioteca?')) return
    const r = await removerBiblioteca(id)
    if (r.success) { carregarBibs(); if (bibAberta?.id === id) setBibAberta(null) }
  }

  const criativos = useMemo(() => {
    let cs = [...(res?.criativos ?? [])]
    if (tipo !== 'todos') cs = cs.filter((c) => c.media_type === tipo)
    cs.sort((a, b) => {
      if (ordem === 'copias') return (b.copias || 0) - (a.copias || 0)
      return (b.dias_ativo ?? 0) - (a.dias_ativo ?? 0)
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
          <p className="text-xs text-muted-foreground mt-0.5">Veja quais criativos estão rodando na Biblioteca de Anúncios da Meta — e acompanhe concorrentes ao longo do tempo.</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1.5 border-b border-border">
        {([['buscar', 'Buscar concorrente'], ['bibliotecas', `Bibliotecas rastreadas${bibliotecas.length ? ` (${bibliotecas.length})` : ''}`]] as [Aba, string][]).map(([k, label]) => (
          <button key={k} onClick={() => { setAba(k); setBibAberta(null) }}
            className={`px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${aba === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {aba === 'buscar' && (
        <>
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
              <button onClick={() => puxar()} disabled={loading || !link.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                <Search className="w-4 h-4" /> {loading ? 'Puxando...' : 'Puxar criativos'}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Cole o link da página do concorrente na biblioteca da Meta (ou só o ID da página).</p>

            {/* Salvar + Agendamento */}
            <div className="mt-5 pt-4 border-t border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Acompanhar / puxar automaticamente a cada</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {FREQ.map((f) => (
                  <button key={f} onClick={() => setFreq(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${freq === f ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                    {f}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => salvar(null)} disabled={salvando || !link.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-white/10 text-muted-foreground hover:bg-white/5 disabled:opacity-40">
                    <Bookmark className="w-4 h-4" /> Só salvar
                  </button>
                  <button onClick={() => salvar(FREQ_NUM[freq] ?? 3)} disabled={salvando || !link.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40">
                    <CalendarClock className="w-4 h-4" /> Agendar ({freq})
                  </button>
                </div>
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
              <ResumoStats stats={res.stats} tipo={tipo} setTipo={setTipo} ordem={ordem} setOrdem={setOrdem} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {criativos.map((c) => (
                  <CardCriativo key={c.ad_archive_id} c={c}
                    inicial={c.ad_archive_id ? cacheTranscricoes[c.ad_archive_id] : undefined}
                    onAbrir={(texto) => setModalT({ c, texto })} />
                ))}
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
        </>
      )}

      {aba === 'bibliotecas' && (
        bibAberta
          ? <DetalheBiblioteca bib={bibAberta} onVoltar={() => setBibAberta(null)} onPuxarAgora={() => puxar(bibAberta.link || bibAberta.page_id)} onAbrirTranscricao={(c, texto) => setModalT({ c, texto })} />
          : <ListaBibliotecas bibliotecas={bibliotecas} onAbrir={setBibAberta} onPuxar={(b) => puxar(b.link || b.page_id)} onRemover={removerBib} />
      )}

      {modalT && (
        <ModalTranscricao
          modal={modalT}
          onFechar={() => setModalT(null)}
          onSalvar={async (texto) => {
            if (modalT.c.ad_archive_id) await salvarTranscricao(modalT.c.ad_archive_id, modalT.c.video_url, texto)
          }}
        />
      )}
    </div>
  )
}

function ResumoStats({ stats, tipo, setTipo, ordem, setOrdem }: {
  stats: { encontrados: number; duplicacoes: number; idade_media_dias: number | null }
  tipo: Tipo; setTipo: (t: Tipo) => void; ordem: Ordem; setOrdem: (o: Ordem) => void
}) {
  return (
    <div className="flex items-center gap-5 flex-wrap text-sm">
      <span className="text-muted-foreground"><b className="text-foreground">{stats.encontrados}</b> criativos</span>
      <span className="text-muted-foreground"><b className="text-foreground">{stats.duplicacoes}</b> duplicações</span>
      {stats.idade_media_dias != null && <span className="text-muted-foreground"><b className="text-foreground">{stats.idade_media_dias}</b> dias de idade média</span>}
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
  )
}

function ListaBibliotecas({ bibliotecas, onAbrir, onPuxar, onRemover }: {
  bibliotecas: BibliotecaRastreada[]
  onAbrir: (b: BibliotecaRastreada) => void
  onPuxar: (b: BibliotecaRastreada) => void
  onRemover: (id: string) => void
}) {
  if (bibliotecas.length === 0) {
    return (
      <div className={`rounded-2xl p-12 flex flex-col items-center justify-center text-center ${cardClass}`}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#1a2022' }}>
          <Bookmark className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold">Nenhuma biblioteca rastreada ainda</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">Na aba <b>Buscar concorrente</b>, puxe um concorrente e clique em <b>Agendar</b> pra rastrear o movimento dele ao longo do tempo.</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {bibliotecas.map((b) => (
        <div key={b.id} className={`rounded-2xl p-4 ${cardClass} flex flex-col gap-3`}>
          <button onClick={() => onAbrir(b)} className="text-left flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-black text-primary" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.06)' }}>
              {(b.page_name || '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition">{b.page_name || `Página ${b.page_id}`}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                {b.freq_dias
                  ? <><span className="inline-flex items-center gap-1 text-emerald-300"><Clock className="w-3 h-3" /> a cada {b.freq_dias}d</span></>
                  : <span>sem agendamento</span>}
                {b.ultima_puxada && <span>· última {new Date(b.ultima_puxada).toLocaleDateString('pt-BR')}</span>}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <button onClick={() => onAbrir(b)} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-foreground hover:bg-white/5 transition">Ver movimento</button>
            <button onClick={() => onPuxar(b)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition" title="Puxar agora"><RotateCw className="w-4 h-4" /></button>
            <button onClick={() => onRemover(b.id)} className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition" title="Parar de acompanhar"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}
    </div>
  )
}

function DetalheBiblioteca({ bib, onVoltar, onPuxarAgora, onAbrirTranscricao }: {
  bib: BibliotecaRastreada
  onVoltar: () => void
  onPuxarAgora: () => void
  onAbrirTranscricao: (c: CriativoRastreado, texto: string) => void
}) {
  const [snaps, setSnaps] = useState<SnapshotRastreador[] | null>(null)
  const [cache, setCache] = useState<Record<string, string>>({})

  useEffect(() => {
    (async () => {
      const r = await listarSnapshots(bib.id)
      if (r.success) {
        setSnaps(r.data)
        const ids = (r.data[0]?.criativos ?? []).map((c: any) => c.ad_archive_id).filter(Boolean)
        if (ids.length) { const t = await getTranscricoes(ids); if (t.success) setCache(t.data) }
      }
    })()
  }, [bib.id])

  const atual = snaps?.[0]
  const criativosAtuais: CriativoRastreado[] = atual?.criativos ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVoltar} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><ArrowLeft className="w-4 h-4" /></button>
        <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-sm font-black text-primary" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(bib.page_name || '?').slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{bib.page_name || `Página ${bib.page_id}`}</h2>
          <p className="text-[11px] text-muted-foreground">{bib.freq_dias ? `Rastreando a cada ${bib.freq_dias} dia(s)` : 'Sem agendamento automático'}</p>
        </div>
        <button onClick={onPuxarAgora} className="ml-auto px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition">
          <RotateCw className="w-4 h-4" /> Puxar agora
        </button>
      </div>

      {snaps === null && <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando movimento...</div>}

      {snaps && snaps.length === 0 && (
        <div className={`rounded-2xl p-8 text-center ${cardClass}`}>
          <p className="text-sm font-semibold">Ainda sem histórico</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em <b>Puxar agora</b> ou aguarde o rastreamento automático pra registrar o primeiro ponto.</p>
        </div>
      )}

      {snaps && snaps.length > 0 && (
        <>
          {/* Linha do tempo do movimento */}
          <div className={`rounded-2xl p-5 ${cardClass}`}>
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Movimento — {snaps.length} registro(s)</span>
            </div>
            <div className="space-y-1.5">
              {snaps.map((s, i) => {
                const prox = snaps[i + 1]
                const delta = prox ? s.total - prox.total : 0
                return (
                  <div key={s.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">{new Date(s.puxado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="font-bold text-foreground">{s.total}</span>
                    <span className="text-xs text-muted-foreground">criativos</span>
                    {delta !== 0 && (
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${delta > 0 ? 'text-emerald-300 bg-emerald-500/10' : 'text-rose-300 bg-rose-500/10'}`}>
                        {delta > 0 ? '+' : ''}{delta}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">{s.duplicacoes} dup · {s.idade_media != null ? `${Math.round(Number(s.idade_media))}d idade` : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Criativos do último registro */}
          {criativosAtuais.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Criativos no último registro ({new Date(atual!.puxado_em).toLocaleDateString('pt-BR')})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {criativosAtuais.map((c, i) => (
                  <CardCriativo key={c.ad_archive_id || i} c={c}
                    inicial={c.ad_archive_id ? cache[c.ad_archive_id] : undefined}
                    onAbrir={(texto) => onAbrirTranscricao(c, texto)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function CardCriativo({ c, inicial, onAbrir }: { c: CriativoRastreado; inicial?: string; onAbrir: (texto: string) => void }) {
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [texto, setTexto] = useState<string | null>(inicial ?? null)
  const [erroT, setErroT] = useState<string | null>(null)

  useEffect(() => { if (inicial) setTexto(inicial) }, [inicial])

  async function transcrever() {
    if (!c.video_url) return
    // Já tem transcrição em cache → abre direto no modal.
    if (texto) { onAbrir(texto); return }
    setTranscrevendo(true); setErroT(null)
    try {
      const r = await fetch('/api/rastreador/transcrever', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: c.video_url }),
      })
      const j = await r.json()
      if (j.error) setErroT(j.error)
      else {
        const t = j.texto || '(sem fala detectada)'
        setTexto(t)
        if (c.ad_archive_id) salvarTranscricao(c.ad_archive_id, c.video_url, t)
        onAbrir(t)
      }
    } catch {
      setErroT('Falha ao transcrever.')
    } finally {
      setTranscrevendo(false)
    }
  }

  return (
    <div className={`rounded-2xl overflow-hidden flex flex-col ${cardClass}`}>
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

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {c.page_name && <p className="text-xs font-semibold text-muted-foreground truncate">{c.page_name}</p>}
        {c.headline && <p className="text-sm font-bold text-foreground leading-tight line-clamp-2">{c.headline}</p>}
        {c.body && <p className="text-[11px] text-muted-foreground line-clamp-3">{c.body}</p>}

        <div className="mt-auto pt-2 flex flex-wrap gap-1.5">
          {c.snapshot_url && <A href={c.snapshot_url}><ExternalLink className="w-3.5 h-3.5" /> Ver na Meta</A>}
          {c.link_url && <A href={c.link_url}>Página</A>}
          {c.video_url && <A href={c.video_url}><Download className="w-3.5 h-3.5" /> Vídeo</A>}
          {c.video_url && (
            <button onClick={transcrever} disabled={transcrevendo}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
              {transcrevendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {transcrevendo ? 'Transcrevendo...' : texto ? 'Ver transcrição' : 'Transcrever'}
            </button>
          )}
        </div>

        {erroT && <p className="mt-2 text-[11px] text-rose-300/90">{erroT}</p>}
      </div>
    </div>
  )
}

function ModalTranscricao({ modal, onFechar, onSalvar }: {
  modal: ModalT
  onFechar: () => void
  onSalvar: (texto: string) => Promise<void>
}) {
  const { c } = modal
  const [texto, setTexto] = useState(modal.texto)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const nomeBase = `transcricao-${c.page_name || c.ad_archive_id || 'anuncio'}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFechar])

  async function salvarTrack() {
    setSalvando(true); setSalvo(false)
    await onSalvar(texto)
    setSalvando(false); setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-2xl rounded-2xl ${cardClass} shadow-2xl flex flex-col max-h-[85vh]`}>
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-border">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#1a2022' }}>
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold truncate">Transcrição</h3>
            <p className="text-xs text-muted-foreground truncate">{c.page_name || 'Anúncio'}{c.headline ? ` · ${c.headline}` : ''}</p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-5 h-5" /></button>
        </div>

        {/* Corpo — texto editável */}
        <div className="p-5 overflow-y-auto">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Texto (pode editar antes de salvar)</label>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
            className="w-full h-64 px-3 py-2.5 rounded-lg text-sm leading-relaxed resize-y" style={inputStyle} />
          <p className="text-[11px] text-muted-foreground mt-1.5">{texto.trim().split(/\s+/).filter(Boolean).length} palavras</p>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 flex-wrap p-5 border-t border-border">
          <button onClick={salvarTrack} disabled={salvando}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : salvo ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {salvando ? 'Salvando...' : salvo ? 'Salvo no The Track' : 'Salvar no The Track'}
          </button>
          <button onClick={() => baixarTxt(nomeBase, texto)}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-white/10 text-foreground hover:bg-white/5 transition">
            <Download className="w-4 h-4" /> .txt
          </button>
          <button onClick={() => baixarDocx(nomeBase, `Transcrição — ${c.page_name || 'Anúncio'}`, texto)}
            className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-white/10 text-foreground hover:bg-white/5 transition">
            <Download className="w-4 h-4" /> .docx
          </button>
          {c.snapshot_url && (
            <a href={c.snapshot_url} target="_blank" rel="noreferrer" className="ml-auto px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-white/10 text-muted-foreground hover:text-primary hover:border-primary/40 transition">
              <ExternalLink className="w-4 h-4" /> Ver na Meta
            </a>
          )}
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
