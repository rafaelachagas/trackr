'use client'

import { useEffect, useState } from 'react'
import { Loader2, Clapperboard, Search, Play, FileText, Eye, Heart, X, Copy, Check, Trash2, RefreshCw, ArrowLeft, Bookmark, Link2, CalendarClock, Info, Clock, AtSign, Lock } from 'lucide-react'
import { listarPerfisConteudo, salvarPerfilConteudo, removerPerfilConteudo, atualizarViraisPerfil, buscarViraisPerfil, statusInstagram, salvarCookieInstagram, type PerfilConteudo, type VideoViral } from '@/app/actions/conteudo'

const FREQ_NUM: Record<string, number> = { '1 dia': 1, '3 dias': 3, '5 dias': 5, '7 dias': 7, '14 dias': 14 }
const FREQ = ['1 dia', '3 dias', '5 dias', '7 dias', '14 dias']

const nf = new Intl.NumberFormat('pt-BR', { notation: 'compact' })
const fmtDur = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
const PLAT: Record<string, { label: string; cor: string }> = {
  tiktok: { label: 'TikTok', cor: '#25F4EE' }, instagram: { label: 'Instagram', cor: '#E1306C' },
  youtube: { label: 'YouTube', cor: '#FF0000' }, outro: { label: 'Perfil', cor: '#8FCBFF' },
}
function haQuanto(iso: string | null) {
  if (!iso) return 'nunca'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 1440) return `há ${Math.floor(min / 60)} h`
  return `há ${Math.floor(min / 1440)} d`
}

export default function ContentTrackerPage() {
  const [aba, setAba] = useState<'buscar' | 'perfis'>('buscar')
  const [perfis, setPerfis] = useState<PerfilConteudo[]>([])
  const [carregandoPerfis, setCarregandoPerfis] = useState(true)
  const [aberto, setAberto] = useState<PerfilConteudo | null>(null)

  // Busca avulsa (aba Buscar)
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<VideoViral[] | null>(null)
  // Instagram: cookie configurado UMA VEZ no servidor (não é por busca).
  const [igConfigurado, setIgConfigurado] = useState<boolean | null>(null)
  const [igSetup, setIgSetup] = useState(false)
  const [igInput, setIgInput] = useState('')
  const [salvandoIg, setSalvandoIg] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [freq, setFreq] = useState('3 dias')

  const [atualizando, setAtualizando] = useState(false)
  const [trans, setTrans] = useState<{ v: VideoViral; status: string; texto?: string; erro?: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const ehInstagram = /instagram\.com/i.test(url)

  useEffect(() => {
    (async () => {
      const [r, s] = await Promise.all([listarPerfisConteudo(), statusInstagram()])
      if (r.success) setPerfis(r.data)
      setIgConfigurado(s.configurado)
      setCarregandoPerfis(false)
    })()
  }, [])

  async function conectarInstagram() {
    if (!igInput.trim() || salvandoIg) return
    setSalvandoIg(true)
    const r = await salvarCookieInstagram(igInput.trim())
    setSalvandoIg(false)
    if (r.success) { setIgConfigurado(true); setIgSetup(false); setIgInput('') } else setErro(r.error || 'Falha ao salvar cookie.')
  }

  async function buscar() {
    const u = url.trim(); if (!u || buscando) return
    setBuscando(true); setErro(null); setPreview(null)
    const r = await buscarViraisPerfil(u, '', 24)
    setBuscando(false)
    if (!r.success) { setErro(r.error || 'Falha.'); return }
    setPreview(r.videos)
  }
  async function rastrear(freqDias: number | null) {
    const u = url.trim(); if (!u || salvando) return
    setSalvando(true); setErro(null)
    const r = await salvarPerfilConteudo(u, '', freqDias)
    setSalvando(false)
    if (!r.success) { setErro(r.error || 'Falha ao salvar.'); return }
    if (r.data) setPerfis(r.data)
    setUrl(''); setPreview(null); setAba('perfis')
  }
  async function remover(id: string) {
    if (!confirm('Parar de rastrear este perfil?')) return
    const r = await removerPerfilConteudo(id)
    if (r.success) { setPerfis(r.data); if (aberto?.id === id) setAberto(null) }
  }
  async function atualizar(id: string) {
    setAtualizando(true)
    const r = await atualizarViraisPerfil(id, '')
    setAtualizando(false)
    if (r.success && r.perfil) {
      setPerfis((ps) => ps.map((p) => (p.id === id ? r.perfil! : p)))
      if (aberto?.id === id) setAberto(r.perfil)
    } else if (r.error) setErro(r.error)
  }
  async function transcrever(v: VideoViral) {
    setTrans({ v, status: 'Baixando o vídeo...' })
    try {
      const ini = await fetch('/api/rastreador/transcrever-async', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: v.url }),
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

  const cardCls = 'bg-card border border-border rounded-2xl'

  // ---------- DETALHE DE UM PERFIL (espionagem) ----------
  if (aberto) {
    const plat = PLAT[aberto.plataforma]
    return (
      <div className="max-w-6xl mx-auto space-y-5 py-2">
        <button onClick={() => setAberto(null)} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Perfis rastreados</button>
        <div className={`${cardCls} p-5 flex items-center gap-4 flex-wrap`}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black shrink-0" style={{ backgroundColor: plat.cor + '22', color: plat.cor }}>{aberto.handle.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-foreground truncate">@{aberto.handle}</p>
            <p className="text-xs text-muted-foreground"><span style={{ color: plat.cor }}>{plat.label}</span> · {aberto.virais.length} virais · atualizado {haQuanto(aberto.ultimaBusca)}</p>
          </div>
          <a href={aberto.url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5">Abrir perfil</a>
          <button onClick={() => atualizar(aberto.id)} disabled={atualizando} className="px-3 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
            {atualizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar virais
          </button>
        </div>
        {erro && <p className="text-xs text-rose-300/90">{erro}</p>}
        <GridVirais videos={aberto.virais} onTranscrever={(v) => transcrever(v)} />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 py-2">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          <Clapperboard className="w-6 h-6 text-primary" /> Rastreador de Conteúdos <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">BETA</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Espione perfis de <b>TikTok</b>, <b>Instagram</b> e <b>YouTube</b> — os conteúdos mais virais, acompanhados ao longo do tempo, com transcrição.</p>
      </div>

      {/* Abas — mesma estrutura do Rastreador de Anúncios */}
      <div className="flex items-center gap-1.5">
        {([['buscar', 'Buscar perfil'], ['perfis', `Perfis rastreados${perfis.length ? ` (${perfis.length})` : ''}`]] as ['buscar' | 'perfis', string][]).map(([k, label]) => (
          <button key={k} onClick={() => setAba(k)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${aba === k ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted-foreground border border-transparent hover:text-foreground hover:bg-white/5'}`}>{label}</button>
        ))}
      </div>

      {aba === 'buscar' && (
        <>
          {/* Busca por perfil */}
          <div className={`${cardCls} p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Busca de perfil</span>
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">URL do perfil (TikTok · Instagram · YouTube)</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()}
                placeholder="https://www.tiktok.com/@perfil" className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono bg-background border border-border text-foreground focus:border-primary/50 outline-none" />
              <button onClick={buscar} disabled={buscando || !url.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                <Search className="w-4 h-4" /> {buscando ? 'Buscando...' : 'Buscar virais'}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Cole o perfil do concorrente. A gente puxa os conteúdos mais virais (por views).</p>

            {/* Conexão do Instagram — configurada UMA vez, vale pra todo mundo */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <AtSign className="w-4 h-4" style={{ color: '#E1306C' }} />
                  {igConfigurado == null
                    ? <span className="text-xs text-muted-foreground">verificando Instagram...</span>
                    : igConfigurado
                      ? <span className="text-xs font-semibold text-emerald-300 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Instagram conectado</span>
                      : <span className="text-xs text-muted-foreground">Instagram não conectado — TikTok e YouTube funcionam sem isso</span>}
                </div>
                <button onClick={() => setIgSetup((v) => !v)} className="text-[11px] font-semibold text-primary hover:underline">
                  {igConfigurado ? 'trocar conta' : 'conectar Instagram'}
                </button>
              </div>
              {igSetup && (
                <div className="mt-3 rounded-xl border border-white/10 bg-background/50 p-3">
                  <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5"><Lock className="w-3 h-3" /> Cole o <b>sessionid</b> de uma conta dedicada do Instagram (uma vez só). Fica guardado no servidor e vale pra todos os usuários. Dura semanas.</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={igInput} onChange={(e) => setIgInput(e.target.value)} placeholder="sessionid da conta dedicada"
                      className="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-background border border-border text-foreground outline-none" />
                    <button onClick={conectarInstagram} disabled={salvandoIg || !igInput.trim()}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                      {salvandoIg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Conectar
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">Como pegar: logado na conta, F12 → Application → Cookies → instagram.com → copie o valor de <b>sessionid</b>.</p>
                </div>
              )}
            </div>

            {/* Salvar + Agendamento (igual ao Rastreador de Anúncios) */}
            <div className="mt-5 pt-4 border-t border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Acompanhar / puxar virais automaticamente a cada</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {FREQ.map((f) => (
                  <button key={f} onClick={() => setFreq(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${freq === f ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>{f}</button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => rastrear(null)} disabled={salvando || !url.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-white/10 text-muted-foreground hover:bg-white/5 disabled:opacity-40">
                    {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bookmark className="w-4 h-4" />} Só salvar
                  </button>
                  <button onClick={() => rastrear(FREQ_NUM[freq] ?? 3)} disabled={salvando || !url.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40">
                    <CalendarClock className="w-4 h-4" /> Rastrear ({freq})
                  </button>
                </div>
              </div>
            </div>
          </div>

          {erro && (
            <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ backgroundColor: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)' }}>
              <Info className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" /><p className="text-xs text-rose-200/90">{erro}</p>
            </div>
          )}

          {buscando && <div className="text-center text-sm text-muted-foreground py-8 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Puxando e ordenando por views... (até 1 min)</div>}
          {preview && <GridVirais videos={preview} onTranscrever={(v) => transcrever(v)} />}

          {/* Estado vazio inicial */}
          {!preview && !buscando && (
            <div className={`${cardCls} p-12 flex flex-col items-center justify-center text-center`}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#1a2022' }}>
                <Clapperboard className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">Cole um perfil pra ver os conteúdos virais</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">A gente puxa os vídeos mais virais do perfil (por views) — com thumbnail, views, likes e opção de transcrever cada um.</p>
            </div>
          )}
        </>
      )}

      {aba === 'perfis' && (
        carregandoPerfis ? (
          <div className="text-center text-sm text-muted-foreground py-10 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
        ) : perfis.length === 0 ? (
          <div className={`${cardCls} p-10 text-center`}>
            <Bookmark className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">Nenhum perfil rastreado ainda</p>
            <p className="text-xs text-muted-foreground mt-1">Vá em <b>Buscar perfil</b>, cole um @ do TikTok/Insta/YouTube e clique em <b>Rastrear perfil</b>.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {perfis.map((p) => {
              const plat = PLAT[p.plataforma]
              const topThumb = p.virais[0]?.thumb
              return (
                <div key={p.id} className={`${cardCls} overflow-hidden group cursor-pointer`} onClick={() => setAberto(p)}>
                  <div className="relative h-32 bg-black/30 overflow-hidden">
                    {topThumb && <img src={topThumb} alt="" className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition" loading="lazy" />}
                    <span className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: plat.cor + 'cc' }}>{plat.label}</span>
                    <button onClick={(e) => { e.stopPropagation(); remover(p.id) }} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white/80 hover:text-rose-300 hover:bg-black/80 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-bold text-foreground truncate">@{p.handle}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.virais.length} virais · atualizado {haQuanto(p.ultimaBusca)}</p>
                    <p className="text-[10px] mt-1">
                      {p.freqDias
                        ? <span className="inline-flex items-center gap-1 text-emerald-300"><Clock className="w-3 h-3" /> rastreando a cada {p.freqDias}d</span>
                        : <span className="text-muted-foreground/70">sem agendamento</span>}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {trans && <ModalTrans trans={trans} onClose={() => setTrans(null)} copiado={copiado} onCopy={() => { navigator.clipboard.writeText(trans.texto || ''); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }} />}
    </div>
  )
}

function GridVirais({ videos, onTranscrever }: { videos: VideoViral[]; onTranscrever: (v: VideoViral) => void }) {
  if (!videos.length) return <p className="text-sm text-muted-foreground text-center py-8">Nenhum vídeo encontrado (ou a plataforma bloqueou o robô).</p>
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {videos.map((v, i) => (
        <div key={v.id || i} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col group">
          <a href={v.url} target="_blank" rel="noreferrer" className="relative block bg-black/30 aspect-[9/16] overflow-hidden">
            {v.thumb ? <img src={v.thumb} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.visibility = 'hidden' }} />
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
            <button onClick={() => onTranscrever(v)} className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition inline-flex items-center justify-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Transcrever
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ModalTrans({ trans, onClose, copiado, onCopy }: { trans: any; onClose: () => void; copiado: boolean; onCopy: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-sm font-bold text-foreground line-clamp-2">{trans.v.titulo || 'Transcrição'}</p>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground shrink-0"><X className="w-5 h-5" /></button>
        </div>
        {trans.status ? <p className="text-sm text-primary/90 flex items-center gap-2 py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> {trans.status}</p>
          : trans.erro ? <p className="text-sm text-rose-300/90">{trans.erro}</p>
            : (<>
              <button onClick={onCopy} className="mb-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1">
                {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{trans.texto}</p>
            </>)}
      </div>
    </div>
  )
}
