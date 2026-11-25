'use client'

import { useEffect, useMemo, useRef, useState, MouseEvent } from 'react'
import {
  Loader2, Upload, Sparkles, Film, Download, EyeOff, X, Check, Play, HelpCircle,
  Flag, ShieldOff, ShieldCheck, ChevronRight, MousePointerClick,
} from 'lucide-react'
import {
  PalavraBruta, Token, paraTokens, emLinhas, tokenNoTempo, fmtTempo,
  LIMIAR_DUVIDA, lerRedFlags, acharRedFlags,
} from '@/lib/censura'

// Editor de Censura. Fluxo: sobe o vídeo → transcreve palavra por palavra →
// revisa as dúvidas do Whisper → marca o que censurar (à mão ou pela lista de
// red flags). As fases seguintes (volume/SFX no áudio, estilo da legenda,
// exportação) agem sobre as palavras marcadas aqui.
//
// O vídeo toca do arquivo local (blob). A cópia no Storage só existe pra VPS
// baixar e é apagada no fim, como na Transcrição rápida.
//
// O trabalho (transcrição, correções, marcas) fica no navegador, na chave do
// arquivo: recarregar a página ou reabrir o mesmo vídeo não refaz a
// transcrição, que leva minutos.

const ACEITA = '.mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm'
const TETO_MB = 200
const CHAVE_FLAGS = 'censura:redflags'
const chaveTrabalho = (f: File) => `censura:trabalho:${f.name}:${f.size}`

interface Trabalho { tokens: Token[]; marcas: number[]; ignoradas: number[] }

function ler<T>(chave: string): T | null {
  try { const s = localStorage.getItem(chave); return s ? JSON.parse(s) as T : null } catch { return null }
}
function gravar(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, typeof valor === 'string' ? valor : JSON.stringify(valor)) } catch { /* cheio ou bloqueado: segue sem salvar */ }
}

export default function CensorPage() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [tokens, setTokens] = useState<Token[]>([])
  const [rodando, setRodando] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(0)
  const [segundos, setSegundos] = useState(0)
  const [ativo, setAtivo] = useState(-1)
  const [arrastando, setArrastando] = useState(false)

  // Seleção (clique / shift = intervalo / ctrl = soma) e marcas de censura.
  const [sel, setSel] = useState<number[]>([])
  const [ancora, setAncora] = useState<number | null>(null)
  const [marcas, setMarcas] = useState<Set<number>>(new Set())
  const [ignoradas, setIgnoradas] = useState<Set<number>>(new Set())
  const [flagsTexto, setFlagsTexto] = useState('')
  const [rascunho, setRascunho] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const corrigirRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const painelRef = useRef<HTMLDivElement>(null)
  const pararEm = useRef<number | null>(null)

  const linhas = useMemo(() => emLinhas(tokens), [tokens])
  const ocorrencias = useMemo(() => acharRedFlags(tokens, lerRedFlags(flagsTexto)), [tokens, flagsTexto])
  const idsFlag = useMemo(() => new Set(ocorrencias.flatMap((o) => o.ids)), [ocorrencias])
  // Censurada = marcada à mão, ou red flag que o usuário não liberou.
  const censuradas = useMemo(() => {
    const s = new Set(marcas)
    idsFlag.forEach((id) => { if (!ignoradas.has(id)) s.add(id) })
    return s
  }, [marcas, idsFlag, ignoradas])
  const duvidas = useMemo(() => tokens.filter((t) => t.confidence < LIMIAR_DUVIDA && !t.corrigida), [tokens])
  const porFlag = useMemo(() => {
    const m = new Map<string, { flag: string; ids: number[] }[]>()
    for (const o of ocorrencias) m.set(o.flag, [...(m.get(o.flag) || []), o])
    return [...m.entries()]
  }, [ocorrencias])

  // A lista é guardada como texto puro (não JSON).
  useEffect(() => { try { setFlagsTexto(localStorage.getItem(CHAVE_FLAGS) ?? '') } catch { /* sem storage */ } }, [])
  useEffect(() => () => { clearInterval(timerRef.current); if (src) URL.revokeObjectURL(src) }, [src])

  // Salva o trabalho a cada mudança (é pequeno: ~100 bytes por palavra).
  useEffect(() => {
    if (!arquivo || !tokens.length) return
    gravar(chaveTrabalho(arquivo), { tokens, marcas: [...marcas], ignoradas: [...ignoradas] } satisfies Trabalho)
  }, [arquivo, tokens, marcas, ignoradas])

  // Palavra tocando agora (rAF: o timeupdate dispara a ~4Hz e atrasaria o
  // destaque). Também para o "Ouvir trecho" no fim do trecho.
  useEffect(() => {
    if (!src) return
    let raf = 0
    const tick = () => {
      const v = videoRef.current
      if (v) {
        if (pararEm.current != null && v.currentTime >= pararEm.current) { v.pause(); pararEm.current = null }
        if (tokens.length) setAtivo((a) => { const i = tokenNoTempo(tokens, v.currentTime); return i === a ? a : i })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tokens, src])

  // Segue a palavra tocando no painel — só com o vídeo rodando, pra não
  // roubar a rolagem de quem está revisando outra parte.
  useEffect(() => {
    if (ativo < 0 || videoRef.current?.paused) return
    painelRef.current?.querySelector<HTMLElement>(`[data-t="${ativo}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [ativo])

  // Rascunho da correção acompanha a palavra selecionada.
  const unica = sel.length === 1 ? tokens[sel[0]] : null
  useEffect(() => { setRascunho(unica?.word ?? '') }, [unica?.id, unica?.word])

  function escolher(f: File | null | undefined) {
    if (!f) return
    if (!/\.(mp4|mov|webm|m4v)$/i.test(f.name)) { setErro('Por enquanto: mp4, mov ou webm. MKV/AVI o navegador não toca — converta antes.'); return }
    if (f.size > TETO_MB * 1024 * 1024) { setErro(`${(f.size / 1048576).toFixed(0)}MB é grande demais — o teto aqui é ${TETO_MB}MB.`); return }
    const salvo = ler<Trabalho>(chaveTrabalho(f))
    setErro(null); setEnviado(0); setSel([]); setAncora(null); setAtivo(-1)
    setTokens(salvo?.tokens ?? [])
    setMarcas(new Set(salvo?.marcas ?? [])); setIgnoradas(new Set(salvo?.ignoradas ?? []))
    setAviso(salvo?.tokens?.length ? 'Transcrição recuperada deste vídeo — correções e marcas mantidas.' : null)
    setArquivo(f); setSrc(URL.createObjectURL(f))
  }

  function trocarVideo() {
    if (rodando) return
    setSrc(null); setArquivo(null); setTokens([]); setErro(null); setAviso(null); setSel([])
  }

  /** Mesmo envio da Transcrição rápida: URL assinada + XHR pra ter progresso. */
  function subir(f: File): Promise<string> {
    return new Promise(async (ok, falha) => {
      const a = await fetch('/api/rastreador/transcrever-arquivo', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: f.name }),
      }).then((r) => r.json()).catch(() => null)
      if (!a?.signedUrl) return falha(new Error(a?.error || 'Não consegui preparar o envio.'))
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', a.signedUrl, true)
      xhr.setRequestHeader('x-upsert', 'true')
      if (f.type) xhr.setRequestHeader('content-type', f.type)
      xhr.upload.onprogress = (e) => e.lengthComputable && setEnviado(e.loaded / e.total)
      xhr.onload = () => (xhr.status < 300 ? ok(a.caminho) : falha(new Error(`envio falhou (${xhr.status})`)))
      xhr.onerror = () => falha(new Error('envio falhou — conexão caiu'))
      xhr.send(f)
    })
  }

  async function transcrever() {
    if (!arquivo || rodando) return
    setRodando(true); setErro(null); setAviso(null); setTokens([]); setSel([]); setMarcas(new Set()); setIgnoradas(new Set())
    setSegundos(0); setEnviado(0)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    let caminho = ''
    try {
      setStatus('Enviando o vídeo...')
      caminho = await subir(arquivo)
      setStatus('Mandando pra VPS...')
      const ini = await fetch('/api/rastreador/transcrever-arquivo', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caminho, palavras: true }),
      }).then((r) => r.json())
      if (!ini?.job_id) throw new Error(ini?.error || 'Não consegui iniciar a transcrição.')
      for (;;) {
        await new Promise((res) => setTimeout(res, 3000))
        const j = await fetch(`/api/rastreador/transcrever-async?id=${ini.job_id}`, { cache: 'no-store' }).then((r) => r.json())
        if (j?.status === 'ok') {
          if (!Array.isArray(j.palavras)) throw new Error('A VPS devolveu só o texto, sem o tempo das palavras — falta o rebuild do vps-transcritor.')
          const ts = paraTokens(j.palavras as PalavraBruta[])
          if (!ts.length) throw new Error('Não encontrei fala nesse vídeo.')
          setTokens(ts); setStatus(null); break
        }
        if (j?.status === 'erro') throw new Error(j.erro || 'Falha na transcrição.')
        if (j?.error) throw new Error(j.error)
        setStatus(j?.status === 'rodando' ? 'Transcrevendo palavra por palavra...' : j?.status === 'fila' ? 'Na fila da VPS...' : 'Processando...')
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e)); setStatus(null)
    } finally {
      setRodando(false); clearInterval(timerRef.current)
      if (caminho) fetch(`/api/rastreador/transcrever-arquivo?caminho=${encodeURIComponent(caminho)}`, { method: 'DELETE' }).catch(() => {})
    }
  }

  function seek(t: number) {
    const v = videoRef.current
    if (v) { pararEm.current = null; v.currentTime = Math.max(0, t) + 0.001 }
  }

  function selecionar(id: number, rolar = false) {
    setSel([id]); setAncora(id); seek(tokens[id].start_time)
    if (rolar) painelRef.current?.querySelector<HTMLElement>(`[data-t="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function clicarPalavra(t: Token, e: MouseEvent) {
    if (e.shiftKey && ancora != null) {
      const [a, b] = ancora < t.id ? [ancora, t.id] : [t.id, ancora]
      setSel(Array.from({ length: b - a + 1 }, (_, k) => a + k))
      window.getSelection()?.removeAllRanges()
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setSel((s) => s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id].sort((x, y) => x - y))
      setAncora(t.id)
      return
    }
    selecionar(t.id)
  }

  function marcar(ids: number[], censurar: boolean) {
    setMarcas((m) => { const n = new Set(m); ids.forEach((id) => (censurar && !idsFlag.has(id) ? n.add(id) : n.delete(id))); return n })
    setIgnoradas((g) => { const n = new Set(g); ids.forEach((id) => { if (idsFlag.has(id)) { if (censurar) n.delete(id); else n.add(id) } }); return n })
  }

  function corrigir(id: number, texto: string) {
    const limpo = texto.trim()
    if (!limpo) return
    setTokens((ts) => ts.map((t) => t.id === id ? { ...t, word: limpo, corrigida: true } : t))
  }

  /** Vai pra próxima dúvida depois de `apos` (ou a primeira) e foca a correção. */
  function proximaDuvida(apos = -1) {
    const prox = duvidas.find((t) => t.id > apos) ?? duvidas.find((t) => t.id !== apos)
    if (!prox) return
    selecionar(prox.id, true)
    setTimeout(() => corrigirRef.current?.select(), 50)
  }

  function salvarCorrecao() {
    if (!unica) return
    corrigir(unica.id, rascunho)
    // Se ainda há dúvidas, segue pra próxima — revisar vira Enter, Enter, Enter.
    if (duvidas.some((t) => t.id !== unica.id)) proximaDuvida(unica.id)
  }

  function ouvir(ids: number[]) {
    const v = videoRef.current
    if (!v || !ids.length) return
    const ini = tokens[ids[0]].start_time, fim = tokens[ids[ids.length - 1]].end_time
    v.currentTime = Math.max(0, ini - 0.6)
    pararEm.current = fim + 0.6
    v.play().catch(() => {})
  }

  function salvarFlags(t: string) { setFlagsTexto(t); gravar(CHAVE_FLAGS, t) }

  function baixarJson() {
    const nome = (arquivo?.name || 'video').replace(/\.[^.]+$/, '')
    const corpo = { video: arquivo?.name, transcript: tokens, censuradas: [...censuradas].sort((a, b) => a - b) }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(corpo, null, 2)], { type: 'application/json' }))
    a.download = `${nome}-censura.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const linhaAtual = useMemo(() => {
    if (ativo < 0) return null
    return linhas.find((l) => l.tokens[0].id <= ativo && l.tokens[l.tokens.length - 1].id >= ativo) || null
  }, [linhas, ativo])

  const selSet = useMemo(() => new Set(sel), [sel])
  const selTodasCensuradas = sel.length > 0 && sel.every((id) => censuradas.has(id))

  // ---------- tela de envio ----------
  if (!src) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 py-2">
        <Cabecalho />
        <div className="bg-card border border-border rounded-2xl p-5">
          <input ref={inputRef} type="file" accept={ACEITA} className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]) }}
            className={`rounded-xl border border-dashed px-5 py-14 text-center cursor-pointer transition ${arrastando ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
            <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Arraste o vídeo aqui, ou clique pra escolher</p>
            <p className="text-[11px] text-muted-foreground mt-1">mp4, mov ou webm · até {TETO_MB}MB · se já transcreveu esse vídeo antes, o trabalho volta</p>
          </div>
          {erro && <p className="text-xs text-rose-300/90 mt-3">{erro}</p>}
        </div>
      </div>
    )
  }

  // ---------- editor ----------
  return (
    <div className="max-w-[1600px] mx-auto space-y-4 py-2">
      <Cabecalho />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)] xl:grid-cols-[minmax(260px,360px)_minmax(0,1fr)_320px] gap-4 items-start">
        {/* Coluna 1 — vídeo fixo enquanto a transcrição rola */}
        <div className="lg:sticky lg:top-4 space-y-3">
          <div className="relative bg-black rounded-2xl overflow-hidden border border-border">
            <video ref={videoRef} src={src} controls playsInline className="w-full max-h-[72vh] block mx-auto" />
            {linhaAtual && (
              <div className="pointer-events-none absolute inset-x-0 bottom-[16%] flex justify-center px-3">
                <p className="max-w-[94%] text-center text-sm font-bold leading-snug bg-black/70 text-white px-2.5 py-1 rounded-lg">
                  {linhaAtual.tokens.map((t) => (
                    <span key={t.id} className={`${t.id === ativo ? 'text-amber-300' : ''} ${censuradas.has(t.id) ? 'blur-[5px]' : ''}`}>{t.word} </span>
                  ))}
                </p>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs font-semibold text-foreground truncate flex-1 min-w-0" title={arquivo?.name}>{arquivo?.name}</p>
              <span className="text-[11px] text-muted-foreground shrink-0">{((arquivo?.size || 0) / 1048576).toFixed(1)} MB</span>
            </div>
            <div className="flex gap-2">
              <button onClick={trocarVideo} disabled={rodando}
                className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center justify-center gap-1 disabled:opacity-50">
                <X className="w-3.5 h-3.5" /> Trocar vídeo
              </button>
              {tokens.length > 0 && (
                <button onClick={baixarJson}
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center justify-center gap-1">
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
              )}
            </div>
            {aviso && <p className="text-[11px] text-emerald-300/90">{aviso}</p>}
          </div>
        </div>

        {/* Coluna 2 — transcrição */}
        <div className="bg-card border border-border rounded-2xl flex flex-col lg:h-[calc(100vh-120px)] min-w-0">
          {!tokens.length ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
              <Sparkles className="w-7 h-7 text-primary" />
              <p className="text-sm text-foreground font-semibold">Transcrever palavra por palavra</p>
              <p className="text-xs text-muted-foreground max-w-sm">O vídeo vai pro transcritor da VPS. Um criativo de 1–2 minutos leva uns 2–4 minutos.</p>
              <button onClick={transcrever} disabled={rodando}
                className="mt-1 px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50">
                {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {rodando ? 'Transcrevendo...' : 'Transcrever'}
              </button>
              {rodando && enviado > 0 && enviado < 1 && (
                <div className="w-64 h-1 rounded-full bg-background overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${enviado * 100}%` }} /></div>
              )}
              {status && <p className="text-xs text-primary/90 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {status} {segundos > 0 && `· ${Math.floor(segundos / 60)}m ${segundos % 60}s`}</p>}
              {erro && <p className="text-xs text-rose-300/90 max-w-md">{erro}</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-wrap">
                <p className="text-sm font-bold text-foreground mr-auto">Transcrição <span className="text-muted-foreground font-normal">· {tokens.length} palavras</span></p>
                <Legenda cor="bg-rose-500/30 text-rose-100" rotulo={`Censurar · ${censuradas.size}`} />
                <Legenda cor="underline decoration-dotted decoration-amber-300" rotulo={`Dúvida · ${duvidas.length}`} />
                {duvidas.length > 0 && (
                  <button onClick={() => proximaDuvida(sel[0] ?? -1)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 inline-flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" /> Revisar dúvidas <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div ref={painelRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 select-none">
                {linhas.map((l, i) => (
                  <div key={i} className={`flex gap-3 rounded-lg px-1 -mx-1 ${linhaAtual === l ? 'bg-white/[0.03]' : ''}`}>
                    <button onClick={() => selecionar(l.tokens[0].id)} className="text-[10px] tabular-nums text-muted-foreground hover:text-primary pt-[5px] w-9 shrink-0 text-right">{fmtTempo(l.start)}</button>
                    <p className="text-[15px] leading-8 text-foreground/90">
                      {l.tokens.map((t) => {
                        const duvida = t.confidence < LIMIAR_DUVIDA && !t.corrigida
                        const cens = censuradas.has(t.id)
                        return (
                          <button key={t.id} data-t={t.id} onClick={(e) => clicarPalavra(t, e)}
                            title={`${fmtTempo(t.start_time)} → ${fmtTempo(t.end_time)} · confiança ${Math.round(t.confidence * 100)}%${t.corrigida ? ' · corrigida' : ''}`}
                            className={`rounded px-[3px] mr-[2px] transition ${
                              selSet.has(t.id) ? 'bg-primary text-white ring-1 ring-primary'
                                : cens ? 'bg-rose-500/30 text-rose-100'
                                  : t.id === ativo ? 'bg-amber-400/20 text-foreground'
                                    : 'hover:bg-white/10'
                            } ${duvida ? 'underline decoration-dotted decoration-amber-300 underline-offset-4' : ''} ${
                              idsFlag.has(t.id) && !cens ? 'outline outline-1 outline-dashed outline-orange-400/70' : ''}`}>
                            {t.word}
                          </button>
                        )
                      })}
                    </p>
                  </div>
                ))}
              </div>
              <p className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
                <MousePointerClick className="w-3.5 h-3.5" /> Clique = uma palavra · <b>Shift</b>+clique = trecho · <b>Ctrl</b>+clique = soma à seleção
              </p>
            </>
          )}
        </div>

        {/* Coluna 3 — seleção e red flags */}
        <div className="xl:sticky xl:top-4 space-y-3 lg:col-span-2 xl:col-span-1 xl:max-h-[calc(100vh-120px)] xl:overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            {!tokens.length ? (
              <p className="text-xs text-muted-foreground">Depois da transcrição, selecione palavras aqui pra corrigir o texto e marcar o que censurar.</p>
            ) : !sel.length ? (
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-foreground">Nada selecionado</p>
                <p className="text-xs text-muted-foreground">Clique numa palavra da transcrição. Use <b>Shift</b> pra pegar um trecho inteiro.</p>
              </div>
            ) : (
              <>
                {unica ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">Palavra</p>
                        <p className="text-xl font-black text-foreground break-words">{unica.word}</p>
                      </div>
                      {unica.confidence < LIMIAR_DUVIDA && !unica.corrigida && <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-200">dúvida · {Math.round(unica.confidence * 100)}%</span>}
                      {unica.corrigida && <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200">corrigida</span>}
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">{fmtTempo(unica.start_time)} → {fmtTempo(unica.end_time)} · confiança {Math.round(unica.confidence * 100)}%</p>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Corrigir texto</label>
                      <div className="flex gap-1.5 mt-1">
                        <input ref={corrigirRef} value={rascunho} onChange={(e) => setRascunho(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') salvarCorrecao(); if (e.key === 'Escape') setRascunho(unica.word) }}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm bg-background border border-border text-foreground focus:border-primary/50 outline-none" />
                        <button onClick={salvarCorrecao} disabled={!rascunho.trim()} title="Salvar (Enter)"
                          className="px-2.5 rounded-lg bg-primary text-white disabled:opacity-40"><Check className="w-4 h-4" /></button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Enter salva e pula pra próxima dúvida.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">{sel.length} palavras selecionadas</p>
                    <p className="text-sm font-semibold text-foreground leading-snug">“{sel.slice(0, 30).map((id) => tokens[id].word).join(' ')}{sel.length > 30 ? '…' : ''}”</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{fmtTempo(tokens[sel[0]].start_time)} → {fmtTempo(tokens[sel[sel.length - 1]].end_time)}</p>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button onClick={() => ouvir(sel)}
                    className="px-2.5 py-2 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center justify-center gap-1">
                    <Play className="w-3.5 h-3.5" /> Ouvir trecho
                  </button>
                  {selTodasCensuradas ? (
                    <button onClick={() => marcar(sel, false)}
                      className="px-2.5 py-2 rounded-lg text-xs font-bold bg-white/5 border border-border text-foreground hover:bg-white/10 inline-flex items-center justify-center gap-1">
                      <ShieldOff className="w-3.5 h-3.5" /> Liberar
                    </button>
                  ) : (
                    <button onClick={() => marcar(sel, true)}
                      className="px-2.5 py-2 rounded-lg text-xs font-bold bg-rose-500/80 text-white hover:bg-rose-500 inline-flex items-center justify-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Censurar
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-foreground flex items-center gap-1.5"><Flag className="w-4 h-4 text-orange-400" /> Red flags</p>
            <textarea value={flagsTexto} onChange={(e) => salvarFlags(e.target.value)} rows={4}
              placeholder={'uma por linha\nrenda extra\nganh*  (pega ganhar, ganhei...)'}
              className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border text-foreground focus:border-primary/50 outline-none resize-y font-mono" />
            <p className="text-[10px] text-muted-foreground -mt-1">Sem diferença de acento/maiúscula. Toda ocorrência entra como censurada — clique em “Liberar” nas que quiser manter.</p>
            {tokens.length > 0 && (porFlag.length ? (
              <div className="space-y-2.5">
                {porFlag.map(([flag, ocs]) => (
                  <div key={flag}>
                    <p className="text-xs font-bold text-foreground">{flag} <span className="text-muted-foreground font-normal">· {ocs.length}×</span></p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ocs.map((o) => {
                        const liberada = o.ids.every((id) => ignoradas.has(id))
                        return (
                          <button key={o.ids[0]} onClick={() => { setSel(o.ids); setAncora(o.ids[0]); seek(tokens[o.ids[0]].start_time); painelRef.current?.querySelector<HTMLElement>(`[data-t="${o.ids[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }}
                            className={`px-2 py-0.5 rounded-md text-[11px] tabular-nums border transition ${liberada ? 'border-border text-muted-foreground line-through' : 'border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25'}`}>
                            {fmtTempo(tokens[o.ids[0]].start_time)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : flagsTexto.trim() ? <p className="text-xs text-muted-foreground">Nenhuma palavra da lista aparece neste vídeo.</p> : null)}
          </div>

          {tokens.length > 0 && (
            <div className="rounded-2xl border border-dashed border-border p-4">
              <p className="text-xs text-muted-foreground"><b className="text-foreground">Próximo passo:</b> pra cada palavra censurada, escolher o que acontece no áudio (abaixar volume, bip ou outro efeito) e na legenda (borrar, ████ ou ***), e exportar o vídeo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Cabecalho() {
  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
        <EyeOff className="w-6 h-6 text-primary" /> Editor de Censura
      </h1>
      <p className="text-sm text-muted-foreground mt-1">Transcreva o vídeo palavra por palavra, corrija o que o Whisper errou e marque o que censurar.</p>
    </div>
  )
}

function Legenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><span className={`px-1 rounded text-[10px] ${cor}`}>abc</span>{rotulo}</span>
}
