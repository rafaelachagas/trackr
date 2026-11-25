'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Upload, Sparkles, Film, Download, EyeOff, X } from 'lucide-react'
import { PalavraBruta, Token, paraTokens, emLinhas, tokenNoTempo, fmtTempo } from '@/lib/censura'

// Editor de Censura — fase 1: sobe o vídeo, transcreve com o tempo de cada
// palavra e mostra a transcrição como tokens clicáveis sincronizados com o
// player. As próximas fases (red flags, volume/SFX/blur, exportação) usam os
// mesmos tokens.
//
// O vídeo toca a partir do arquivo local (blob) — não precisa esperar subir.
// A cópia que sobe pro Storage só existe pra VPS baixar, e é apagada no fim,
// como na Transcrição rápida.

const ACEITA = '.mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm'
const TETO_MB = 200

export default function CensorPage() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [tokens, setTokens] = useState<Token[]>([])
  const [rodando, setRodando] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(0)
  const [segundos, setSegundos] = useState(0)
  const [ativo, setAtivo] = useState(-1)
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const painelRef = useRef<HTMLDivElement>(null)

  const linhas = useMemo(() => emLinhas(tokens), [tokens])

  useEffect(() => () => { clearInterval(timerRef.current); if (src) URL.revokeObjectURL(src) }, [src])

  // Palavra tocando agora. requestAnimationFrame em vez de timeupdate: o
  // timeupdate dispara a ~4Hz e a palavra destacada ficaria atrasada.
  useEffect(() => {
    if (!tokens.length) return
    let raf = 0
    const tick = () => {
      const v = videoRef.current
      if (v) setAtivo((a) => { const i = tokenNoTempo(tokens, v.currentTime); return i === a ? a : i })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [tokens])

  // Mantém a palavra tocando visível no painel, sem roubar a rolagem de quem
  // está lendo outra parte com o vídeo pausado.
  useEffect(() => {
    if (ativo < 0 || videoRef.current?.paused) return
    const el = painelRef.current?.querySelector<HTMLElement>(`[data-t="${ativo}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [ativo])

  function escolher(f: File | null | undefined) {
    if (!f) return
    if (!/\.(mp4|mov|webm|m4v)$/i.test(f.name)) {
      setErro('Por enquanto: mp4, mov ou webm. MKV/AVI o navegador não toca — converta antes.')
      return
    }
    if (f.size > TETO_MB * 1024 * 1024) {
      setErro(`${(f.size / 1048576).toFixed(0)}MB é grande demais — o teto aqui é ${TETO_MB}MB.`)
      return
    }
    if (src) URL.revokeObjectURL(src)
    setErro(null); setTokens([]); setSelecionado(null); setAtivo(-1); setEnviado(0)
    setArquivo(f); setSrc(URL.createObjectURL(f))
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
    setRodando(true); setErro(null); setTokens([]); setSelecionado(null); setSegundos(0); setEnviado(0)
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
          // Sem `palavras` = a VPS ainda roda o código antigo (rebuild não pegou).
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

  function irPara(t: Token) {
    setSelecionado(t.id)
    const v = videoRef.current
    if (v) v.currentTime = t.start_time + 0.001
  }

  function baixarJson() {
    const nome = (arquivo?.name || 'video').replace(/\.[^.]+$/, '')
    const blob = new Blob([JSON.stringify({ video: arquivo?.name, transcript: tokens }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `${nome}-transcricao.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // Linha da legenda sobre o vídeo: a que contém a palavra tocando, ou a
  // última que já começou (nas pausas curtas a legenda não pisca).
  const linhaAtual = useMemo(() => {
    if (ativo < 0) return null
    return linhas.find((l) => l.tokens[0].id <= ativo && l.tokens[l.tokens.length - 1].id >= ativo) || null
  }, [linhas, ativo])

  const sel = selecionado != null ? tokens[selecionado] : null

  return (
    <div className="max-w-6xl mx-auto space-y-5 py-2">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          <EyeOff className="w-6 h-6 text-primary" /> Editor de Censura
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Envie o vídeo e receba a transcrição <b>palavra por palavra</b>, com o tempo exato de cada uma. Clique numa palavra pra pular até ela.</p>
      </div>

      {!src ? (
        <div className="bg-card border border-border rounded-2xl p-5">
          <input ref={inputRef} type="file" accept={ACEITA} className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]) }}
            className={`rounded-xl border border-dashed px-5 py-12 text-center cursor-pointer transition ${arrastando ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
            <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-foreground">Arraste o vídeo aqui, ou clique pra escolher</p>
            <p className="text-[11px] text-muted-foreground mt-1">mp4, mov ou webm · até {TETO_MB}MB</p>
          </div>
          {erro && <p className="text-xs text-rose-300/90 mt-3">{erro}</p>}
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="relative mx-auto max-w-3xl bg-black rounded-xl overflow-hidden">
              <video ref={videoRef} src={src} controls playsInline className="w-full max-h-[60vh] block" />
              {linhaAtual && (
                <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-4">
                  <p className="max-w-[90%] text-center text-base sm:text-lg font-bold leading-snug bg-black/70 text-white px-3 py-1.5 rounded-lg">
                    {linhaAtual.tokens.map((t) => (
                      <span key={t.id} className={t.id === ativo ? 'text-amber-300' : ''}>{t.word} </span>
                    ))}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Film className="w-4 h-4 text-primary shrink-0" />
              <p className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">{arquivo?.name} <span className="text-muted-foreground font-normal">· {((arquivo?.size || 0) / 1048576).toFixed(1)} MB</span></p>
              <button onClick={() => { if (!rodando) { setSrc(null); setArquivo(null); setTokens([]); setErro(null) } }} disabled={rodando}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1 disabled:opacity-50">
                <X className="w-3.5 h-3.5" /> Trocar vídeo
              </button>
              {!tokens.length && (
                <button onClick={transcrever} disabled={rodando}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-50">
                  {rodando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {rodando ? 'Transcrevendo...' : 'Transcrever'}
                </button>
              )}
            </div>
            {rodando && enviado > 0 && enviado < 1 && (
              <div className="h-1 rounded-full bg-background overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${enviado * 100}%` }} /></div>
            )}
            {status && <p className="text-xs text-primary/90 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {status} {segundos > 0 && `· ${Math.floor(segundos / 60)}m ${segundos % 60}s`}</p>}
            {erro && <p className="text-xs text-rose-300/90">{erro}</p>}
          </div>

          {tokens.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
              <div className="bg-card border border-border rounded-2xl p-4 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <p className="text-sm font-bold text-foreground">Transcrição <span className="text-muted-foreground font-normal">· {tokens.length} palavras</span></p>
                  <button onClick={baixarJson} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> JSON
                  </button>
                </div>
                <div ref={painelRef} className="max-h-[50vh] overflow-y-auto pr-1 space-y-1.5">
                  {linhas.map((l, i) => (
                    <div key={i} className="flex gap-3">
                      <button onClick={() => irPara(l.tokens[0])} className="text-[10px] tabular-nums text-muted-foreground hover:text-primary pt-1 w-10 shrink-0 text-right">{fmtTempo(l.start)}</button>
                      <p className="text-sm leading-relaxed text-foreground/90">
                        {l.tokens.map((t) => (
                          <button key={t.id} data-t={t.id} onClick={() => irPara(t)}
                            title={`${fmtTempo(t.start_time)} → ${fmtTempo(t.end_time)} · confiança ${Math.round(t.confidence * 100)}%`}
                            className={`rounded px-0.5 mr-0.5 transition ${
                              t.id === selecionado ? 'bg-primary text-white'
                                : t.id === ativo ? 'bg-amber-400/25 text-foreground'
                                  : 'hover:bg-white/10'} ${t.confidence < 0.5 ? 'underline decoration-dotted decoration-muted-foreground/60' : ''}`}>
                            {t.word}
                          </button>
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">Sublinhado pontilhado = o Whisper ficou em dúvida nessa palavra (confiança abaixo de 50%).</p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 h-fit">
                <p className="text-sm font-bold text-foreground mb-3">Palavra</p>
                {sel ? (
                  <dl className="space-y-2 text-sm">
                    <div><dt className="text-[11px] text-muted-foreground">Texto</dt><dd className="font-bold text-foreground text-lg break-words">{sel.word}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Tempo</dt><dd className="tabular-nums text-foreground">{fmtTempo(sel.start_time)} → {fmtTempo(sel.end_time)} <span className="text-muted-foreground">({Math.round((sel.end_time - sel.start_time) * 1000)} ms)</span></dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Confiança</dt><dd className="tabular-nums text-foreground">{Math.round(sel.confidence * 100)}%</dd></div>
                    <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">Volume, efeito sonoro e borrar legenda entram nas próximas fases.</p>
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">Clique numa palavra da transcrição.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
