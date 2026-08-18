'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { Binoculars, Link2, Search, CalendarClock, Info, ExternalLink, Download, Copy, PlayCircle, Bookmark, Trash2, RotateCw, FileText, Loader2 } from 'lucide-react'
import { extrairPageId, type CriativoRastreado } from '@/lib/rastreador'
import { listarBibliotecas, salvarBiblioteca, removerBiblioteca, getTranscricoes, salvarTranscricao, type BibliotecaRastreada } from '@/app/actions/rastreador'

const FREQ_NUM: Record<string, number> = { '3 dias': 3, '5 dias': 5, '7 dias': 7, '14 dias': 14 }

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
  const [bibliotecas, setBibliotecas] = useState<BibliotecaRastreada[]>([])
  const [salvando, setSalvando] = useState(false)
  const [cacheTranscricoes, setCacheTranscricoes] = useState<Record<string, string>>({})

  useEffect(() => { carregarBibs() }, [])
  async function carregarBibs() {
    const r = await listarBibliotecas()
    if (r.success) setBibliotecas(r.data)
  }

  async function puxar(alvo?: string) {
    const url = (alvo ?? link).trim()
    if (!url) return
    if (alvo) setLink(alvo)
    setLoading(true); setRes(null)
    try {
      const r = await fetch('/api/rastreador/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const j = await r.json()
      setRes(j)
      // Puxa transcrições já salvas dos anúncios retornados (pré-preenche os cards).
      const ids = (j?.criativos ?? []).map((c: CriativoRastreado) => c.ad_archive_id).filter(Boolean) as string[]
      if (ids.length) {
        const t = await getTranscricoes(ids)
        if (t.success) setCacheTranscricoes(t.data)
      }
    } catch {
      setRes({ error: 'Falha ao chamar o scraper.' })
    } finally {
      setLoading(false)
    }
  }

  // Salva/atualiza a biblioteca atual. freqDias null = só acompanha; número = agenda auto-pull.
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
    if (r.success) carregarBibs()
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

      {/* Bibliotecas acompanhadas */}
      {bibliotecas.length > 0 && (
        <div className={`rounded-2xl p-5 ${cardClass}`}>
          <div className="flex items-center gap-2 mb-3">
            <Bookmark className="w-4 h-4 text-muted-foreground" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Bibliotecas acompanhadas</span>
          </div>
          <div className="space-y-2">
            {bibliotecas.map((b) => (
              <div key={b.id} className="flex items-center gap-3 flex-wrap bg-background border border-border rounded-xl px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{b.page_name || `Página ${b.page_id}`}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.freq_dias ? `Auto a cada ${b.freq_dias}d` : 'Sem agendamento'}
                    {b.ultima_puxada ? ` · última: ${new Date(b.ultima_puxada).toLocaleDateString('pt-BR')}` : ' · nunca puxada'}
                  </p>
                </div>
                {b.freq_dias && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">{b.freq_dias}d</span>
                )}
                <button onClick={() => puxar(b.link || b.page_id)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition" title="Puxar agora">
                  <RotateCw className="w-4 h-4" />
                </button>
                <button onClick={() => removerBib(b.id)} className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition" title="Parar de acompanhar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
            {criativos.map((c) => <CardCriativo key={c.ad_archive_id} c={c} inicial={c.ad_archive_id ? cacheTranscricoes[c.ad_archive_id] : undefined} />)}
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

function CardCriativo({ c, inicial }: { c: CriativoRastreado; inicial?: string }) {
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [transcricao, setTranscricao] = useState<string | null>(inicial ?? null)
  const [erroT, setErroT] = useState<string | null>(null)

  useEffect(() => { if (inicial) setTranscricao(inicial) }, [inicial])

  async function transcrever() {
    if (!c.video_url) return
    setTranscrevendo(true); setErroT(null)
    try {
      const r = await fetch('/api/rastreador/transcrever', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: c.video_url }),
      })
      const j = await r.json()
      if (j.error) setErroT(j.error)
      else {
        const texto = j.texto || '(sem fala detectada)'
        setTranscricao(texto)
        // Salva no cache (pré-salvo) pra não re-transcrever o mesmo anúncio.
        if (c.ad_archive_id) salvarTranscricao(c.ad_archive_id, c.video_url, texto)
      }
    } catch {
      setErroT('Falha ao transcrever.')
    } finally {
      setTranscrevendo(false)
    }
  }

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
          {c.video_url && (
            <button onClick={transcrever} disabled={transcrevendo}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
              {transcrevendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {transcrevendo ? 'Transcrevendo...' : 'Transcrever'}
            </button>
          )}
        </div>

        {erroT && <p className="mt-2 text-[11px] text-rose-300/90">{erroT}</p>}
        {transcricao && (
          <div className="mt-2 rounded-lg bg-background border border-border p-2.5 max-h-40 overflow-y-auto">
            <p className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre-wrap">{transcricao}</p>
          </div>
        )}
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
