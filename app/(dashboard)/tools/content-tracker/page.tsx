'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Clapperboard, Search, Play, Pause, FileText, Eye, Heart, X, Copy, Check, Trash2, RefreshCw, ArrowLeft, Bookmark, Link2, CalendarClock, Info, Clock, AtSign, Lock, Download, Volume2, VolumeX, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { listarPerfisConteudo, salvarPerfilConteudo, removerPerfilConteudo, atualizarViraisPerfil, buscarViraisPerfil, statusInstagram, salvarCookieInstagram, conectarInstagramLogin, verStoriesPerfil, linkBaixarStory, agruparPerfis, desagruparPerfil, type PerfilConteudo, type VideoViral, type StoryItem } from '@/app/actions/conteudo'

const FREQ_NUM: Record<string, number> = { '1 dia': 1, '3 dias': 3, '5 dias': 5, '7 dias': 7, '14 dias': 14 }
const FREQ = ['1 dia', '3 dias', '5 dias', '7 dias', '14 dias']

const nf = new Intl.NumberFormat('pt-BR', { notation: 'compact' })
const fmtDur = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
// timestamp unix (s) → "agora" / "3 h" / "1 d", estilo Instagram
const fmtQuando = (ts: number | null | undefined) => {
  if (!ts) return ''
  const seg = Math.max(0, Date.now() / 1000 - ts)
  if (seg < 60) return 'agora'
  if (seg < 3600) return `${Math.floor(seg / 60)} min`
  if (seg < 86400) return `${Math.floor(seg / 3600)} h`
  return `${Math.floor(seg / 86400)} d`
}
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
  const [aberto, setAberto] = useState<PerfilConteudo[] | null>(null)  // um GRUPO (1+ plataformas da mesma pessoa)
  const [tab, setTab] = useState(0)
  const [sugestao, setSugestao] = useState<{ novoId: string; comId: string; comHandle: string; comNome?: string | null } | null>(null)

  // Busca avulsa (aba Buscar)
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<VideoViral[] | null>(null)
  // Instagram: cookie configurado UMA VEZ no servidor (não é por busca).
  const [igConfigurado, setIgConfigurado] = useState<boolean | null>(null)
  const [igSetup, setIgSetup] = useState(false)
  const [igModo, setIgModo] = useState<'login' | 'cookie'>('login')
  const [igUser, setIgUser] = useState('')
  const [igPass, setIgPass] = useState('')
  const [igCode, setIgCode] = useState('')
  const [ig2fa, setIg2fa] = useState(false)
  const [igInput, setIgInput] = useState('')
  const [salvandoIg, setSalvandoIg] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [freq, setFreq] = useState('1 dia')

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
  async function conectarLogin() {
    if (!igUser.trim() || !igPass || salvandoIg) return
    setSalvandoIg(true); setErro(null)
    const r = await conectarInstagramLogin(igUser, igPass, igCode)
    setSalvandoIg(false)
    if (r.success) { setIgConfigurado(true); setIgSetup(false); setIg2fa(false); setIgUser(''); setIgPass(''); setIgCode('') }
    else if (r.twoFactor) { setIg2fa(true); setErro(r.error || 'Digite o código do 2FA.') }
    else setErro(r.error || 'Falha no login.')
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
    if (r.sugestao && r.novoId) setSugestao({ novoId: r.novoId, comId: r.sugestao.comId, comHandle: r.sugestao.comHandle, comNome: r.sugestao.comNome })
    setUrl(''); setPreview(null); setAba('perfis')
  }
  async function remover(id: string) {
    if (!confirm('Parar de rastrear este perfil?')) return
    const r = await removerPerfilConteudo(id)
    if (r.success) { setPerfis(r.data); if (aberto?.some((p) => p.id === id)) setAberto(null) }
  }
  async function atualizar(id: string) {
    setAtualizando(true)
    const r = await atualizarViraisPerfil(id, '')
    setAtualizando(false)
    if (r.success && r.perfil) {
      setPerfis((ps) => ps.map((p) => (p.id === id ? r.perfil! : p)))
      setAberto((g) => g ? g.map((p) => (p.id === id ? r.perfil! : p)) : g)
    } else if (r.error) setErro(r.error)
  }
  async function juntar(novoId: string, comId: string) {
    const r = await agruparPerfis(novoId, comId)
    if (r.success) setPerfis(r.data)
    setSugestao(null)
  }
  async function separar(id: string) {
    const r = await desagruparPerfil(id)
    if (r.success) { setPerfis(r.data); setAberto(null) }
  }
  async function removerGrupo(ids: string[]) {
    if (!confirm(ids.length > 1 ? 'Parar de rastrear esta pessoa (todas as plataformas)?' : 'Parar de rastrear este perfil?')) return
    let data = perfis
    for (const id of ids) { const r = await removerPerfilConteudo(id); if (r.success) data = r.data }
    setPerfis(data)
    if (aberto?.some((p) => ids.includes(p.id))) setAberto(null)
  }

  // Agrupa perfis da mesma pessoa (mesmo grupoId) num card só.
  const grupos = useMemo(() => {
    const map = new Map<string, PerfilConteudo[]>()
    for (const p of perfis) { const k = p.grupoId || p.id; const arr = map.get(k); if (arr) arr.push(p); else map.set(k, [p]) }
    return Array.from(map.values())
  }, [perfis])
  const novoPerfil = sugestao ? perfis.find((p) => p.id === sugestao.novoId) : null
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

  // ---------- DETALHE DE UM PERFIL/GRUPO (espionagem) ----------
  if (aberto) {
    const membros = aberto
    const atual = membros[Math.min(tab, membros.length - 1)]
    const plat = PLAT[atual.plataforma]
    const nome = membros.find((m) => m.nome)?.nome
    return (
      <div className="max-w-6xl mx-auto space-y-5 py-2">
        <button onClick={() => setAberto(null)} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Perfis rastreados</button>
        <div className={`${cardCls} p-5 flex items-center gap-4 flex-wrap`}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black shrink-0" style={{ backgroundColor: plat.cor + '22', color: plat.cor }}>{(nome || atual.handle).slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-foreground truncate">{nome || `@${atual.handle}`}</p>
            <p className="text-xs text-muted-foreground"><span style={{ color: plat.cor }}>{plat.label}</span> · @{atual.handle} · {atual.virais.length} virais · atualizado {haQuanto(atual.ultimaBusca)}</p>
          </div>
          <a href={atual.url} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5">Abrir perfil</a>
          <button onClick={() => atualizar(atual.id)} disabled={atualizando} className="px-3 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
            {atualizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar virais
          </button>
        </div>
        {/* abas de plataforma (quando é a mesma pessoa em mais de uma rede) */}
        {membros.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            {membros.map((m, i) => {
              const pl = PLAT[m.plataforma]
              return (
                <button key={m.id} onClick={() => setTab(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 transition ${i === tab ? 'text-white' : 'text-muted-foreground border-border hover:bg-white/5'}`}
                  style={i === tab ? { backgroundColor: pl.cor + '22', borderColor: pl.cor + '66', color: pl.cor } : {}}>
                  {pl.label} · @{m.handle}
                </button>
              )
            })}
            <button onClick={() => separar(atual.id)} className="ml-auto text-[11px] text-muted-foreground hover:text-rose-300">separar esta aba</button>
          </div>
        )}
        {erro && <p className="text-xs text-rose-300/90">{erro}</p>}
        <Viewer key={atual.id} videos={atual.virais} url={atual.url} onTranscrever={transcrever} />
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
                  <div className="flex items-center gap-1.5 mb-2 text-[11px]">
                    <button onClick={() => setIgModo('login')} className={`px-2 py-1 rounded ${igModo === 'login' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground'}`}>Login (@ e senha)</button>
                    <button onClick={() => setIgModo('cookie')} className={`px-2 py-1 rounded ${igModo === 'cookie' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground'}`}>Cookie (avançado)</button>
                  </div>

                  {igModo === 'login' ? (
                    <>
                      <p className="text-[11px] text-muted-foreground mb-2 flex items-start gap-1.5"><Lock className="w-3 h-3 mt-0.5 shrink-0" /> Entre com a <b>conta dedicada</b> (não a principal). A senha só é usada pra logar — <b>não fica guardada</b>, só a sessão. Vale pra todos os usuários.</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <input value={igUser} onChange={(e) => setIgUser(e.target.value)} placeholder="@usuário" autoComplete="off"
                          className="px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground outline-none" />
                        <input value={igPass} onChange={(e) => setIgPass(e.target.value)} type="password" placeholder="senha" autoComplete="new-password"
                          className="px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground outline-none" />
                      </div>
                      {ig2fa && (
                        <input value={igCode} onChange={(e) => setIgCode(e.target.value)} placeholder="código do 2FA (app autenticador)" inputMode="numeric"
                          className="mt-2 w-full px-3 py-2 rounded-lg text-sm bg-background border border-amber-500/40 text-foreground outline-none" />
                      )}
                      <button onClick={conectarLogin} disabled={salvandoIg || !igUser.trim() || !igPass}
                        className="mt-2 px-4 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                        {salvandoIg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {ig2fa ? 'Confirmar código' : 'Conectar conta'}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground mb-2 flex items-start gap-1.5"><Lock className="w-3 h-3 mt-0.5 shrink-0" /> Cole o <b>sessionid</b> da conta dedicada (F12 → Application → Cookies → instagram.com → sessionid).</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input value={igInput} onChange={(e) => setIgInput(e.target.value)} placeholder="sessionid"
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-mono bg-background border border-border text-foreground outline-none" />
                        <button onClick={conectarInstagram} disabled={salvandoIg || !igInput.trim()}
                          className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {salvandoIg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Conectar
                        </button>
                      </div>
                    </>
                  )}
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

          {buscando && <div className="text-center text-sm text-muted-foreground py-8 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Puxando o feed do perfil... (até 1 min)</div>}
          {preview && <Viewer videos={preview} url={url} onTranscrever={transcrever} />}

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
          <div className="space-y-4">
            {/* sugestão de agrupamento (correlação de sinal médio) */}
            {sugestao && novoPerfil && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 flex items-center gap-3 flex-wrap">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <p className="text-xs text-foreground/90 flex-1 min-w-[200px]">
                  <b>@{novoPerfil.handle}</b> parece ser a mesma pessoa que <b>@{sugestao.comHandle}</b>{sugestao.comNome ? ` (${sugestao.comNome})` : ''}. Juntar num card só, com abas?
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => juntar(sugestao.novoId, sugestao.comId)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90">Juntar</button>
                  <button onClick={() => setSugestao(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-white/5">Agora não</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {grupos.map((g) => {
                const rep = g.reduce((a, b) => (b.virais.length > a.virais.length ? b : a))
                const nome = g.find((m) => m.nome)?.nome
                const topThumb = rep.virais[0]?.thumb
                const totalVirais = g.reduce((s, m) => s + m.virais.length, 0)
                const ultima = g.map((m) => m.ultimaBusca).filter(Boolean).sort().slice(-1)[0] || null
                const rastreando = g.filter((m) => m.freqDias)
                return (
                  <div key={g.map((m) => m.id).join('_')} className={`${cardCls} overflow-hidden group cursor-pointer`} onClick={() => { setAberto(g); setTab(0) }}>
                    <div className="relative h-32 bg-black/30 overflow-hidden">
                      {topThumb && <img src={topThumb} alt="" className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition" loading="lazy" />}
                      <div className="absolute top-2 left-2 flex gap-1">
                        {g.map((m) => { const pl = PLAT[m.plataforma]; return <span key={m.id} className="text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: pl.cor + 'cc' }}>{pl.label}</span> })}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removerGrupo(g.map((m) => m.id)) }} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white/80 hover:text-rose-300 hover:bg-black/80 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-bold text-foreground truncate">{nome || `@${rep.handle}`}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{g.length > 1 ? `${g.length} plataformas · ` : ''}{totalVirais} virais · atualizado {haQuanto(ultima)}</p>
                      <p className="text-[10px] mt-1">
                        {rastreando.length
                          ? <span className="inline-flex items-center gap-1 text-emerald-300"><Clock className="w-3 h-3" /> rastreando {rastreando.length > 1 ? `${rastreando.length} redes` : `a cada ${rastreando[0].freqDias}d`}</span>
                          : <span className="text-muted-foreground/70">sem agendamento</span>}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      )}

      {trans && <ModalTrans trans={trans} onClose={() => setTrans(null)} copiado={copiado} onCopy={() => { navigator.clipboard.writeText(trans.texto || ''); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }} />}
    </div>
  )
}

// Visualizador de feed: toggle Recentes/Virais + stories (Instagram) + grade.
function Viewer({ videos, url, onTranscrever }: { videos: VideoViral[]; url: string; onTranscrever: (v: VideoViral) => void }) {
  const [ordem, setOrdem] = useState<'recentes' | 'virais'>('recentes')
  const [periodo, setPeriodo] = useState<'todo' | '7' | '30' | '90' | 'custom'>('todo')
  const [desde, setDesde] = useState('') // yyyy-mm-dd, quando periodo==='custom'
  const [stories, setStories] = useState<StoryItem[] | null>(null)
  const [loadingStories, setLoadingStories] = useState(false)
  const [avisoStories, setAvisoStories] = useState<string | null>(null)
  const ehIg = /instagram\.com/i.test(url)
  const temData = useMemo(() => videos.some((v) => v.data), [videos])

  const lista = useMemo(() => {
    let arr = videos
    // filtro por período (usa a data de publicação, quando existe)
    if (periodo !== 'todo' && temData) {
      let corte = 0
      if (periodo === 'custom') { if (desde) corte = new Date(desde + 'T00:00:00').getTime() / 1000 }
      else corte = Date.now() / 1000 - Number(periodo) * 86400
      if (corte) arr = arr.filter((v) => (v.data ?? 0) >= corte)
    }
    // ordenação: mais virais = views desc (sem views vai pro fim); recentes = data desc
    if (ordem === 'virais') return [...arr].sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    return [...arr].sort((a, b) => (b.data ?? 0) - (a.data ?? 0))
  }, [videos, ordem, periodo, desde, temData])

  async function carregarStories() {
    setLoadingStories(true); setAvisoStories(null)
    const r = await verStoriesPerfil(url)
    setLoadingStories(false)
    if (r.success) { setStories(r.itens); if (!r.itens.length) setAvisoStories('Nenhum story ativo agora (ou a conta conectada não segue esse perfil).') }
    else setAvisoStories(r.error || 'Falha ao buscar stories.')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
          {(['recentes', 'virais'] as const).map((o) => (
            <button key={o} onClick={() => setOrdem(o)} className={`px-3 py-1.5 transition ${ordem === o ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-white/5'}`}>{o === 'recentes' ? 'Recentes' : 'Mais virais'}</button>
          ))}
        </div>
        {ehIg && (
          <button onClick={carregarStories} disabled={loadingStories}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 inline-flex items-center gap-1.5 disabled:opacity-50">
            {loadingStories ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Ver stories
          </button>
        )}
      </div>
      {/* filtro por período — combina com "Mais virais" pra ver o top de cada janela */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> período:</span>
        {([['todo', 'Todo período'], ['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['custom', 'Data…']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setPeriodo(k)} className={`px-2.5 py-1 rounded-lg font-semibold border transition ${periodo === k ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-white/5'}`}>{label}</button>
        ))}
        {periodo === 'custom' && (
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="px-2 py-1 rounded-lg bg-black/30 border border-border text-foreground/90" title="a partir desta data" />
        )}
        {!temData && <span className="text-muted-foreground/60">(sem data disponível nesta plataforma)</span>}
        <span className="ml-auto text-muted-foreground/70">{lista.length} conteúdos</span>
      </div>
      {stories && stories.length > 0 && <StoriesStrip itens={stories} handle={(url.match(/instagram\.com\/([A-Za-z0-9_.]+)/i)?.[1]) || 'perfil'} onTranscrever={onTranscrever} />}
      {avisoStories && <p className="text-[11px] text-muted-foreground">{avisoStories}</p>}
      <GridVirais videos={lista} onTranscrever={onTranscrever} />
    </div>
  )
}

function StoriesStrip({ itens, handle, onTranscrever }: { itens: StoryItem[]; handle: string; onTranscrever: (v: VideoViral) => void }) {
  const [aberto, setAberto] = useState<number | null>(null)
  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {itens.map((s, i) => (
          <button key={s.id || i} onClick={() => setAberto(i)} className="shrink-0 w-24 group">
            <div className="block relative rounded-xl overflow-hidden aspect-[9/16] bg-black/30 border-2 group-hover:brightness-110 transition" style={{ borderColor: '#E1306C' }}>
              {s.thumb ? <img src={s.thumb} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><Play className="w-5 h-5 text-white/70" /></div>}
              {s.tipo === 'video' && <span className="absolute bottom-1 right-1 bg-black/60 rounded-full p-0.5"><Play className="w-3 h-3 text-white fill-white" /></span>}
            </div>
            <span className="mt-1 block text-[10px] font-medium text-muted-foreground">{fmtQuando(s.quando)}</span>
          </button>
        ))}
      </div>
      {aberto !== null && (
        <StoryViewer itens={itens} inicio={aberto} handle={handle} onClose={() => setAberto(null)} onTranscrever={onTranscrever} />
      )}
    </>
  )
}

// Visualizador de stories no formato do Instagram (9:16, barras de progresso,
// auto-play, navegação por toque/setas) + baixar e transcrever.
function StoryViewer({ itens, inicio, handle, onClose, onTranscrever }: { itens: StoryItem[]; inicio: number; handle: string; onClose: () => void; onTranscrever: (v: VideoViral) => void }) {
  const [idx, setIdx] = useState(inicio)
  const [prog, setProg] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [mudo, setMudo] = useState(true)
  const [baixando, setBaixando] = useState(false)
  const vidRef = useRef<HTMLVideoElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const s = itens[idx]
  const ehVideo = s?.tipo === 'video'
  const durFoto = 5 // segundos que uma foto fica na tela

  const irPara = (n: number) => { if (n < 0) { setIdx(0) } else if (n >= itens.length) { onClose() } else { setIdx(n); setProg(0) } }
  const proximo = () => irPara(idx + 1)
  const anterior = () => { setProg(0); setIdx((i) => Math.max(0, i - 1)) }

  // Progresso: vídeo segue o próprio tempo; foto usa timer de durFoto.
  useEffect(() => {
    setProg(0)
    if (ehVideo) return // o <video> dispara onTimeUpdate/onEnded
    let t0 = performance.now(); let acc = 0
    const tick = (now: number) => {
      if (!pausado) { acc += now - t0; setProg(Math.min(1, acc / (durFoto * 1000))) }
      t0 = now
      if (acc >= durFoto * 1000) { proximo(); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, pausado, ehVideo])

  // Teclado: setas navegam, espaço pausa, esc fecha.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') proximo()
      else if (e.key === 'ArrowLeft') anterior()
      else if (e.key === 'Escape') onClose()
      else if (e.key === ' ') { e.preventDefault(); setPausado((p) => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  useEffect(() => { const v = vidRef.current; if (!v) return; if (pausado) v.pause(); else v.play().catch(() => {}) }, [pausado, idx])

  async function baixar() {
    if (!s) return
    setBaixando(true)
    try {
      const link = await linkBaixarStory(s.url)
      const a = document.createElement('a'); a.href = link; a.rel = 'noreferrer'; document.body.appendChild(a); a.click(); a.remove()
    } finally { setTimeout(() => setBaixando(false), 1200) }
  }

  if (!s) return null
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      {/* setas laterais (desktop) */}
      <button onClick={(e) => { e.stopPropagation(); anterior() }} className="hidden md:flex absolute left-4 lg:left-10 w-10 h-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30" disabled={idx === 0}><ChevronLeft className="w-6 h-6" /></button>
      <button onClick={(e) => { e.stopPropagation(); proximo() }} className="hidden md:flex absolute right-4 lg:right-10 w-10 h-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight className="w-6 h-6" /></button>

      <div className="relative h-full max-h-[92vh] aspect-[9/16] bg-black rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* barras de progresso */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-2">
          {itens.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div className="h-full bg-white transition-[width] duration-100" style={{ width: i < idx ? '100%' : i === idx ? `${prog * 100}%` : '0%' }} />
            </div>
          ))}
        </div>
        {/* header */}
        <div className="absolute top-3 left-0 right-0 z-20 flex items-center gap-2.5 px-3 pt-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-amber-400 flex items-center justify-center text-[11px] font-bold text-white uppercase ring-2 ring-white/20">{handle.slice(0, 2)}</div>
          <span className="text-white text-sm font-semibold drop-shadow">{handle}</span>
          <span className="text-white/70 text-xs">{fmtQuando(s.quando)}</span>
          <div className="ml-auto flex items-center gap-1">
            {ehVideo && <button onClick={() => setMudo((m) => !m)} className="p-1.5 text-white/90 hover:text-white">{mudo ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}</button>}
            <button onClick={() => setPausado((p) => !p)} className="p-1.5 text-white/90 hover:text-white">{pausado ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}</button>
            <button onClick={onClose} className="p-1.5 text-white/90 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* mídia */}
        {ehVideo ? (
          <video ref={vidRef} key={s.id} src={s.url} className="w-full h-full object-contain bg-black" autoPlay playsInline muted={mudo}
            onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProg(v.currentTime / v.duration) }}
            onEnded={proximo} onError={proximo} />
        ) : (
          <img src={s.url || s.thumb || ''} alt="" className="w-full h-full object-contain bg-black" />
        )}

        {/* zonas de toque (mobile): esquerda volta, direita avança */}
        <button className="md:hidden absolute inset-y-0 left-0 w-1/3 z-10" onClick={anterior} aria-label="anterior" />
        <button className="md:hidden absolute inset-y-0 right-0 w-1/3 z-10" onClick={proximo} aria-label="próximo" />

        {/* ações */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent">
          <button onClick={baixar} disabled={baixando}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {baixando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Baixar
          </button>
          <button onClick={() => onTranscrever({ id: s.id, url: s.url, titulo: `Story de @${handle}`, views: null, likes: null, comentarios: null, duracao: s.duracao, thumb: s.thumb })}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-violet-500/90 hover:bg-violet-500 text-white inline-flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" /> Transcrever
          </button>
        </div>
      </div>
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
  const v = trans.v as VideoViral
  function salvarTxt() {
    const nome = (v.titulo || 'conteudo').slice(0, 40).replace(/[^\wÀ-ſ]+/g, '_').replace(/^_|_$/g, '') || 'transcricao'
    const blob = new Blob([trans.texto || ''], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `transcricao-${nome}.txt`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[88vh] overflow-hidden flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
        {/* ESQUERDA: o post */}
        <div className="md:w-[300px] shrink-0 border-b md:border-b-0 md:border-r border-border bg-black/20 p-4 flex flex-col gap-3">
          <div className="relative rounded-xl overflow-hidden aspect-[9/16] bg-black/40 max-h-[46vh] md:max-h-none">
            {v.thumb ? <img src={v.thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Play className="w-8 h-8 text-white/40" /></div>}
            {v.duracao != null && <span className="absolute bottom-1.5 right-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">{fmtDur(v.duracao)}</span>}
          </div>
          <p className="text-xs text-foreground/90 leading-snug line-clamp-3">{v.titulo || 'sem legenda'}</p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
            {v.views != null && <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {nf.format(v.views)}</span>}
            {v.likes != null && <span className="inline-flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {nf.format(v.likes)}</span>}
            {v.comentarios != null && <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {nf.format(v.comentarios)}</span>}
          </div>
          {v.data ? <p className="text-[10px] text-muted-foreground/70">publicado {fmtQuando(v.data)} atrás</p> : null}
          <a href={v.url} target="_blank" rel="noreferrer" className="mt-auto px-3 py-2 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center justify-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Abrir o post</a>
        </div>
        {/* DIREITA: a transcrição */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
            <p className="text-sm font-bold text-foreground inline-flex items-center gap-2"><FileText className="w-4 h-4 text-violet-300" /> Transcrição</p>
            <div className="flex items-center gap-2">
              {!trans.status && !trans.erro && (<>
                <button onClick={onCopy} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1">
                  {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copiado ? 'Copiado' : 'Copiar'}
                </button>
                <button onClick={salvarTxt} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 inline-flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Salvar .txt
                </button>
              </>)}
              <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground shrink-0"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="p-4 overflow-auto">
            {trans.status ? <p className="text-sm text-primary/90 flex items-center gap-2 py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> {trans.status}</p>
              : trans.erro ? <p className="text-sm text-rose-300/90 py-4">{trans.erro}</p>
                : <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{trans.texto}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
