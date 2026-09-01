'use client'

import { useState } from 'react'
import { Loader2, Clapperboard, Search, Play, FileText, Eye, Heart, X, Copy, Check } from 'lucide-react'

// Aba 2 do Rastreador de Conteúdos: cola um perfil (TikTok/Instagram/YouTube),
// vê os vídeos mais virais (por views) e transcreve cada um. yt-dlp na VPS puxa
// a lista; a transcrição reusa o pipeline assíncrono (Whisper).

interface VideoViral {
  id: string; url: string; titulo: string; views: number | null; likes: number | null
  comentarios: number | null; duracao: number | null; thumb: string | null
}

const nf = new Intl.NumberFormat('pt-BR', { notation: 'compact' })
const fmtDur = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)

export default function ContentTrackerPage() {
  const [url, setUrl] = useState('')
  const [igCookie, setIgCookie] = useState('')
  const [videos, setVideos] = useState<VideoViral[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [trans, setTrans] = useState<{ v: VideoViral; status: string; texto?: string; erro?: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const ehInstagram = /instagram\.com/i.test(url)

  async function buscar() {
    const u = url.trim()
    if (!u || loading) return
    setLoading(true); setErro(null); setVideos(null)
    try {
      const j = await fetch('/api/conteudo/perfil', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: u, ig_cookie: ehInstagram ? igCookie.trim() : '', limit: 24 }),
      }).then((r) => r.json())
      if (j?.error) throw new Error(j.error)
      setVideos(j.videos || [])
    } catch (e: any) { setErro(e.message) } finally { setLoading(false) }
  }

  async function transcrever(v: VideoViral) {
    setTrans({ v, status: 'Baixando o vídeo...' })
    try {
      const ini = await fetch('/api/rastreador/transcrever-async', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: v.url, ig_cookie: ehInstagram ? igCookie.trim() : '' }),
      }).then((r) => r.json())
      if (!ini?.job_id) throw new Error(ini?.error || 'Não consegui iniciar.')
      for (;;) {
        await new Promise((res) => setTimeout(res, 3000))
        const j = await fetch(`/api/rastreador/transcrever-async?id=${ini.job_id}`, { cache: 'no-store' }).then((r) => r.json())
        if (j?.status === 'ok') { setTrans({ v, status: '', texto: j.texto || '(vazio)' }); break }
        if (j?.status === 'erro') throw new Error(j.erro || 'Falha.')
        setTrans({ v, status: j?.status === 'rodando' ? 'Transcrevendo...' : 'Na fila...' })
      }
    } catch (e: any) { setTrans({ v, status: '', erro: e.message }) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 py-2">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          <Clapperboard className="w-6 h-6 text-primary" /> Rastreador de Conteúdos <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">BETA</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Cole um perfil de <b>TikTok</b>, <b>Instagram</b> ou <b>YouTube</b> e veja os conteúdos mais virais — com opção de transcrever cada um.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="https://www.tiktok.com/@perfil  ·  https://www.youtube.com/@canal  ·  https://www.instagram.com/perfil"
            className="flex-1 px-4 py-3 rounded-xl text-sm bg-background border border-border text-foreground focus:border-primary/50 outline-none" />
          <button onClick={buscar} disabled={loading || !url.trim()}
            className="px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {loading ? 'Buscando...' : 'Buscar virais'}
          </button>
        </div>
        {ehInstagram && (
          <div>
            <input value={igCookie} onChange={(e) => setIgCookie(e.target.value)} placeholder="Cookie sessionid do Instagram (conta dedicada logada)"
              className="w-full px-4 py-2.5 rounded-xl text-xs font-mono bg-background border border-border text-foreground focus:border-primary/50 outline-none" />
            <p className="text-[11px] text-muted-foreground mt-1">Instagram exige login: cole o <b>sessionid</b> de uma conta dedicada. TikTok e YouTube não precisam.</p>
          </div>
        )}
        {erro && <p className="text-xs text-rose-300/90">{erro}</p>}
      </div>

      {loading && <div className="text-center text-sm text-muted-foreground py-8 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Puxando e ordenando por views... (pode levar até 1 min)</div>}

      {videos && videos.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum vídeo encontrado nesse perfil (ou a plataforma bloqueou). No Instagram, confira o cookie.</p>}

      {videos && videos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {videos.map((v, i) => (
            <div key={v.id || i} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col group">
              <a href={v.url} target="_blank" rel="noreferrer" className="relative block bg-black/30 aspect-[9/16] overflow-hidden">
                {v.thumb
                  ? <img src={v.thumb} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.visibility = 'hidden' }} />
                  : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Play className="w-8 h-8" /></div>}
                <span className="absolute top-1.5 left-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-black/70 text-white">#{i + 1}</span>
                {v.duracao != null && <span className="absolute bottom-1.5 right-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">{fmtDur(v.duracao)}</span>}
              </a>
              <div className="p-2.5 flex flex-col gap-2 flex-1">
                <p className="text-xs text-foreground/90 leading-snug line-clamp-2 flex-1">{v.titulo || 'sem legenda'}</p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                  {v.views != null && <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {nf.format(v.views)}</span>}
                  {v.likes != null && <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" /> {nf.format(v.likes)}</span>}
                </div>
                <button onClick={() => transcrever(v)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition inline-flex items-center justify-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Transcrever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de transcrição */}
      {trans && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setTrans(null)}>
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-sm font-bold text-foreground line-clamp-2">{trans.v.titulo || 'Transcrição'}</p>
              <button onClick={() => setTrans(null)} className="p-1 text-muted-foreground hover:text-foreground shrink-0"><X className="w-5 h-5" /></button>
            </div>
            {trans.status
              ? <p className="text-sm text-primary/90 flex items-center gap-2 py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> {trans.status}</p>
              : trans.erro
                ? <p className="text-sm text-rose-300/90">{trans.erro}</p>
                : (
                  <>
                    <button onClick={() => { navigator.clipboard.writeText(trans.texto || ''); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }}
                      className="mb-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1">
                      {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{trans.texto}</p>
                  </>
                )}
          </div>
        </div>
      )}
    </div>
  )
}
