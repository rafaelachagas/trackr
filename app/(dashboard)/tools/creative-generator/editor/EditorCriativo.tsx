'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Download, Eye, EyeOff, Film, Loader2, Pause, Play, Redo2, Scissors, Star,
  Trash2, Undo2, ZoomIn, ZoomOut, Check, AlertTriangle,
} from 'lucide-react'
import {
  type Projeto, type Trecho, type Palavra, type Legenda,
  legendaCompleta, corpoRelativo, fimTrecho, trechoEm, corteEm, legendaEm, escalaPop,
  ZOOM_FORCA, TRANSICAO_DUR,
} from '@/lib/criativos-projeto'

// Editor do criativo. A prévia NÃO é o vídeo renderizado: o navegador toca a
// locução e troca os b-rolls no tempo certo, com a legenda desenhada por cima
// usando as mesmas contas da VPS. Assim cada mudança aparece na hora, e só o
// "Renderizar" gasta servidor.

type ItemBiblioteca = { nome: string; pasta: string; caminho: string }
type Dados = {
  projeto: Projeto
  urls: Record<string, string>
  biblioteca: ItemBiblioteca[]
  fontes: { nome: string; caminho: string }[]
  videoUrl: string | null
  downloadUrl: string | null
}
type Selecao = { tipo: 'trecho' | 'palavra' | 'corte'; i: number } | null

const CORES = ['#7c3aed', '#0891b2', '#db2777', '#059669', '#d97706', '#2563eb', '#dc2626', '#4d7c0f']
const nomeDe = (c: string) => c.split('/').pop()!.replace(/\.[^.]+$/, '')
const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

async function json(r: Response) {
  const t = await r.text()
  try { return JSON.parse(t) } catch { throw new Error(`resposta inesperada (${r.status})`) }
}

export default function EditorCriativo({ id }: { id: string }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [p, setP] = useState<Projeto | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [t, setT] = useState(0)
  const [tocando, setTocando] = useState(false)
  const [sel, setSel] = useState<Selecao>(null)
  const [pps, setPps] = useState(80)
  const [marca, setMarca] = useState<number | null>(null)
  const [salvo, setSalvo] = useState<'salvo' | 'salvando' | 'pendente'>('salvo')
  const [render, setRender] = useState<{ fase: string } | null>(null)
  const [saida, setSaida] = useState<{ video: string | null; download: string | null }>({ video: null, download: null })
  const [durClipe, setDurClipe] = useState<Record<string, number>>({})
  const [boxH, setBoxH] = useState(480)
  const [filtroPasta, setFiltroPasta] = useState('')

  const audioRef = useRef<HTMLAudioElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const trilhaRef = useRef<HTMLDivElement>(null)
  const videos = useRef<Record<string, HTMLVideoElement | null>>({})
  const passado = useRef<Projeto[]>([])
  const futuro = useRef<Projeto[]>([])
  const primeiraCarga = useRef(true)
  const arrasto = useRef<{ i: number } | null>(null)

  // ---- carregar ---------------------------------------------------------
  useEffect(() => {
    if (!id) { setErro('projeto não informado'); return }
    fetch(`/api/creative-generator/project?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(json)
      .then((j) => {
        if (j.error) throw new Error(j.error)
        setDados(j)
        setP(j.projeto)
        setSaida({ video: j.videoUrl, download: j.downloadUrl })
      })
      .catch((e) => setErro(e instanceof Error ? e.message : `${e}`))
  }, [id])

  // Fonte da legenda carregada no navegador pra prévia usar a mesma letra.
  const fonteUrl = p?.fonte_path ? dados?.urls[p.fonte_path] : undefined
  useEffect(() => {
    if (!fonteUrl) return
    const f = new FontFace('FonteLegendaPrevia', `url(${fonteUrl})`)
    f.load().then((ff) => { document.fonts.add(ff); setBoxH((h) => h + 0.001) }).catch(() => {})
  }, [fonteUrl])

  // Altura real da caixa de prévia — a legenda é medida em fração dela.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [p?.largura])

  // ---- histórico --------------------------------------------------------
  const mudar = useCallback((fn: (d: Projeto) => void, semHistorico = false) => {
    setP((atual) => {
      if (!atual) return atual
      if (!semHistorico) {
        passado.current.push(atual)
        if (passado.current.length > 100) passado.current.shift()
        futuro.current = []
      }
      const d = structuredClone(atual)
      fn(d)
      return d
    })
  }, [])

  const desfazer = useCallback(() => {
    setP((atual) => {
      const ant = passado.current.pop()
      if (!ant || !atual) return atual
      futuro.current.push(atual)
      return ant
    })
  }, [])
  const refazer = useCallback(() => {
    setP((atual) => {
      const prox = futuro.current.pop()
      if (!prox || !atual) return atual
      passado.current.push(atual)
      return prox
    })
  }, [])

  // ---- salvar sozinho ---------------------------------------------------
  useEffect(() => {
    if (!p) return
    if (primeiraCarga.current) { primeiraCarga.current = false; return }
    setSalvo('pendente')
    const tm = setTimeout(async () => {
      setSalvo('salvando')
      try {
        const j = await fetch('/api/creative-generator/project', {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, projeto: p }),
        }).then(json)
        if (j.error) throw new Error(j.error)
        setSalvo('salvo')
      } catch (e) {
        setErro(`não salvou: ${e instanceof Error ? e.message : e}`)
        setSalvo('pendente')
      }
    }, 1200)
    return () => clearTimeout(tm)
  }, [p, id])

  // ---- reprodução -------------------------------------------------------
  const sincronizar = useCallback((tempo: number, tocar: boolean) => {
    if (!p) return
    const idx = trechoEm(p, tempo)
    const tr = p.trechos[idx]
    const alvo = tr ? videos.current[tr.caminho] : null
    for (const [cam, v] of Object.entries(videos.current)) {
      if (!v || v === alvo) continue
      if (!v.paused) v.pause()
      void cam
    }
    if (alvo && tr) {
      const desejado = tr.origem + (tempo - tr.ini)
      const dur = alvo.duration || Infinity
      const alvoT = Math.min(desejado, dur - 0.05)
      if (Math.abs(alvo.currentTime - alvoT) > (tocar ? 0.3 : 0.04)) alvo.currentTime = Math.max(0, alvoT)
      if (tocar && alvo.paused) alvo.play().catch(() => {})
      if (!tocar && !alvo.paused) alvo.pause()
    }
  }, [p])

  useEffect(() => {
    if (!tocando) return
    let raf = 0
    const passo = () => {
      const a = audioRef.current
      if (a && p) {
        let agora = a.currentTime
        const c = corteEm(p, agora)
        if (c) { a.currentTime = c.fim; agora = c.fim }
        if (agora >= p.duracao - 0.02 || a.ended) {
          setTocando(false); a.pause()
        }
        setT(agora)
        sincronizar(agora, true)
      }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [tocando, p, sincronizar])

  useEffect(() => { if (!tocando) sincronizar(t, false) }, [t, tocando, sincronizar])

  const tocarPausar = useCallback(() => {
    const a = audioRef.current
    if (!a || !p) return
    if (tocando) { a.pause(); setTocando(false); sincronizar(a.currentTime, false); return }
    if (t >= p.duracao - 0.05) { a.currentTime = 0; setT(0) } else a.currentTime = t
    a.play().then(() => setTocando(true)).catch((e) => setErro(`${e}`))
  }, [tocando, t, p, sincronizar])

  const irPara = useCallback((tempo: number) => {
    if (!p) return
    const x = Math.max(0, Math.min(p.duracao, tempo))
    if (audioRef.current) audioRef.current.currentTime = x
    setT(x)
  }, [p])

  // ---- ações ------------------------------------------------------------
  const dividir = useCallback(() => {
    if (!p) return
    const i = trechoEm(p, t)
    const tr = p.trechos[i]
    if (t - tr.ini < 0.2 || fimTrecho(p, i) - t < 0.2) return
    mudar((d) => {
      d.trechos.splice(i + 1, 0, {
        ...tr, id: `t${Date.now()}`, ini: +t.toFixed(3),
        origem: +(tr.origem + (t - tr.ini)).toFixed(3), transicao: 'corte',
      })
    })
    setSel({ tipo: 'trecho', i: i + 1 })
  }, [p, t, mudar])

  const cortar = useCallback(() => {
    if (!p) return
    if (marca === null) { setMarca(t); return }
    const ini = Math.min(marca, t), fim = Math.max(marca, t)
    setMarca(null)
    if (fim - ini < 0.05) return
    mudar((d) => {
      const todos = [...d.cortes, { ini: +ini.toFixed(3), fim: +fim.toFixed(3) }].sort((a, b) => a.ini - b.ini)
      const unidos: typeof todos = []
      for (const c of todos) {
        const u = unidos[unidos.length - 1]
        if (u && c.ini <= u.fim) u.fim = Math.max(u.fim, c.fim)
        else unidos.push({ ...c })
      }
      d.cortes = unidos
    })
  }, [p, t, marca, mudar])

  const apagarSelecionado = useCallback(() => {
    if (!p || !sel) return
    if (sel.tipo === 'trecho') {
      if (p.trechos.length <= 1) return
      mudar((d) => {
        d.trechos.splice(sel.i, 1)
        d.trechos[0].ini = 0
      })
    } else if (sel.tipo === 'corte') {
      mudar((d) => { d.cortes.splice(sel.i, 1) })
    } else {
      mudar((d) => { d.palavras[sel.i].oculta = !d.palavras[sel.i].oculta })
      return
    }
    setSel(null)
  }, [p, sel, mudar])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (alvo.closest('input, textarea, select')) return
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); tocarPausar() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); if (e.shiftKey) refazer(); else desfazer()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); refazer() }
      else if (e.key.toLowerCase() === 's' && !e.ctrlKey) dividir()
      else if (e.key.toLowerCase() === 'c' && !e.ctrlKey) cortar()
      else if (e.key === 'Delete' || e.key === 'Backspace') apagarSelecionado()
      else if (e.key === 'ArrowLeft') irPara(t - (e.shiftKey ? 1 : 0.1))
      else if (e.key === 'ArrowRight') irPara(t + (e.shiftKey ? 1 : 0.1))
      else if (e.key === 'Escape') { setSel(null); setMarca(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tocarPausar, desfazer, refazer, dividir, cortar, apagarSelecionado, irPara, t])

  async function renderizar() {
    if (!p) return
    setErro(null)
    setRender({ fase: 'Enviando pro servidor de vídeo...' })
    try {
      const j = await fetch('/api/creative-generator/project', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, projeto: p }),
      }).then(json)
      if (j.error) throw new Error(j.error)
      const params = new URLSearchParams({ job: j.jobId, outputPath: j.outputPath })
      for (let i = 0; i < 360; i++) {
        await new Promise((r) => setTimeout(r, 4000))
        const st = await fetch(`/api/creative-generator/assemble?${params}`, { cache: 'no-store' })
          .then(json).catch(() => ({ status: 'rodando' }))
        if (st.status === 'erro') throw new Error(st.erro || 'a renderização falhou')
        if (st.status === 'pronto') {
          setSaida({ video: st.url, download: st.downloadUrl })
          mudar((d) => { d.saida_path = j.outputPath }, true)
          setRender(null)
          return
        }
        setRender({ fase: `Renderizando... ${(i + 1) * 4}s` })
      }
      throw new Error('a renderização demorou demais')
    } catch (e) {
      setErro(e instanceof Error ? e.message : `${e}`)
      setRender(null)
    }
  }

  // ---- arrastar o corte entre dois b-rolls --------------------------------
  function comecarArrasto(e: React.PointerEvent, i: number) {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    arrasto.current = { i }
    mudar(() => {}) // guarda o estado de antes no histórico
  }
  function moverArrasto(e: React.PointerEvent) {
    if (!arrasto.current || !p || !trilhaRef.current) return
    const { i } = arrasto.current
    const x = e.clientX - trilhaRef.current.getBoundingClientRect().left
    const min = p.trechos[i - 1].ini + 0.2
    const max = fimTrecho(p, i) - 0.2
    const novo = Math.max(min, Math.min(max, x / pps))
    mudar((d) => {
      const tr = d.trechos[i]
      // Mantém o mesmo quadro no ponto em que o clipe já estava tocando:
      // puxar a borda pra trás mostra mais do começo do clipe.
      tr.origem = Math.max(0, +(tr.origem + (novo - tr.ini)).toFixed(3))
      tr.ini = +novo.toFixed(3)
    }, true)
    irPara(novo)
  }
  function soltarArrasto() { arrasto.current = null }

  // ---- derivados --------------------------------------------------------
  const leg = useMemo(() => (p ? legendaCompleta(p.legenda) : null), [p])
  const caminhosUsados = useMemo(() => [...new Set(p?.trechos.map((x) => x.caminho) || [])], [p])
  const pastas = useMemo(() => [...new Set(dados?.biblioteca.map((b) => b.pasta) || [])], [dados])

  if (erro && !p) {
    return (
      <div className="p-6 space-y-3">
        <Link href="/tools/creative-generator" className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" /> Voltar
        </Link>
        <p className="text-sm text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {erro}</p>
      </div>
    )
  }
  if (!p || !dados || !leg) {
    return <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Abrindo o projeto...</div>
  }

  const idx = trechoEm(p, t)
  const trAtual = p.trechos[idx]
  const prog = trAtual ? Math.min(1, Math.max(0, (t - trAtual.ini) / Math.max(0.1, fimTrecho(p, idx) - trAtual.ini))) : 0
  const escalaZoom = trAtual?.zoom === 'in' ? 1 + ZOOM_FORCA * prog : trAtual?.zoom === 'out' ? 1 + ZOOM_FORCA * (1 - prog) : 1
  const opTransicao = trAtual && trAtual.transicao && trAtual.transicao !== 'corte'
    ? Math.max(0, 1 - (t - trAtual.ini) / TRANSICAO_DUR) : 0

  const escalaPx = boxH / p.altura
  const corpoPx = corpoRelativo(leg) * boxH
  const contornoPx = Math.max(3, Math.floor(corpoRelativo(leg) * p.altura * 0.09)) * escalaPx
  const naTela = legendaEm(p, t)
  const duracaoFinal = p.duracao - p.cortes.reduce((s, c) => s + (c.fim - c.ini), 0)

  const trSel = sel?.tipo === 'trecho' ? p.trechos[sel.i] : null
  const palSel = sel?.tipo === 'palavra' ? p.palavras[sel.i] : null
  const corteSel = sel?.tipo === 'corte' ? p.cortes[sel.i] : null

  function mudarLegenda(campos: Partial<Legenda>) {
    mudar((d) => { d.legenda = { ...d.legenda, ...campos } })
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* topo */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/tools/creative-generator" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" /> Gerador
        </Link>
        <h1 className="text-lg font-bold text-foreground">Editor do criativo</h1>
        <span className="text-[11px] text-muted-foreground">
          {salvo === 'salvo' ? 'tudo salvo' : salvo === 'salvando' ? 'salvando...' : 'alterações não salvas'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {saida.download && (
            <a href={saida.download} className="rounded-lg px-3 py-2 text-xs font-bold border border-border hover:bg-muted inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Baixar último render
            </a>
          )}
          <button onClick={renderizar} disabled={!!render}
            className="rounded-lg px-4 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white disabled:opacity-50 inline-flex items-center gap-1.5">
            {render ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
            {render ? render.fase : 'Renderizar'}
          </button>
        </div>
      </div>
      {erro && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {erro}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* prévia */}
        <div className="rounded-xl border border-border bg-black/40 p-3 flex flex-col items-center gap-3">
          <div ref={boxRef} className="relative overflow-hidden bg-black rounded-md"
            style={{ height: 'min(62vh, 720px)', aspectRatio: `${p.largura} / ${p.altura}`, maxWidth: '100%' }}>
            {caminhosUsados.map((cam) => (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video key={cam} ref={(el) => { videos.current[cam] = el }} src={dados.urls[cam]}
                muted playsInline preload="auto"
                onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setDurClipe((m) => ({ ...m, [cam]: d })) }}
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  opacity: trAtual?.caminho === cam ? 1 : 0,
                  transform: trAtual?.caminho === cam ? `scale(${escalaZoom})` : undefined,
                }} />
            ))}
            {opTransicao > 0 && (
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: trAtual?.transicao === 'flash' ? '#fff' : '#000', opacity: opTransicao }} />
            )}
            {naTela && (
              <div className="absolute left-1/2 pointer-events-none text-center"
                style={{
                  top: `${leg.posicao * 100}%`,
                  width: `${((p.largura - 160) / p.largura) * 100}%`,
                  transform: `translate(-50%, -50%) scale(${leg.animacao === 'pop' && leg.estilo === 'palavra' ? escalaPop(naTela[0].desde, t) : 1})`,
                  fontFamily: 'FonteLegendaPrevia, Montserrat, Arial Black, sans-serif',
                  fontWeight: 700,
                  fontSize: corpoPx,
                  lineHeight: 1.18,
                  color: leg.cor,
                }}>
                <span style={leg.caixa ? {
                  background: 'rgba(0,0,0,0.8)', padding: `0 ${corpoPx * 0.22}px`,
                  boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
                } : undefined}>
                  {naTela.map((w, k) => {
                    const destacar = w.ativa || w.enfase
                    const fundo = w.ativa && leg.tipo_destaque === 'fundo' && !leg.caixa
                    const escala = (w.ativa && leg.animacao === 'pop' ? escalaPop(w.desde, t, 1, 1.14) : 1)
                      * (leg.estilo === 'palavra' && w.enfase ? 1.18 : 1)
                    return (
                      <span key={k}>
                        {k > 0 && ' '}
                        <span style={{
                          display: 'inline-block',
                          transform: escala !== 1 ? `scale(${escala})` : undefined,
                          color: destacar && !fundo ? leg.destaque : leg.cor,
                          WebkitTextStroke: leg.caixa ? undefined : `${(fundo ? contornoPx * 3 : contornoPx) * 2}px ${fundo ? leg.destaque : '#000'}`,
                          paintOrder: 'stroke fill',
                          textShadow: leg.caixa ? undefined : `0 ${Math.max(1, corpoPx * 0.04)}px 0 rgba(0,0,0,0.5)`,
                        }}>{w.texto}</span>
                      </span>
                    )
                  })}
                </span>
              </div>
            )}
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} src={dados.urls[p.locucao_path]} preload="auto" />

          {/* controles */}
          <div className="w-full flex flex-wrap items-center gap-2 text-xs">
            <button onClick={tocarPausar} className="rounded-lg w-9 h-9 bg-fuchsia-600 hover:bg-fuchsia-500 text-white inline-flex items-center justify-center" title="Espaço">
              {tocando ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <span className="font-mono text-foreground tabular-nums">{fmt(t)} / {fmt(p.duracao)}</span>
            {p.cortes.length > 0 && <span className="text-muted-foreground">(final {fmt(duracaoFinal)})</span>}
            <div className="mx-2 h-5 w-px bg-border" />
            <button onClick={dividir} className="rounded-md px-2.5 py-1.5 border border-border hover:bg-muted inline-flex items-center gap-1" title="S">
              <Scissors className="w-3.5 h-3.5" /> Dividir b-roll
            </button>
            <button onClick={cortar}
              className={`rounded-md px-2.5 py-1.5 border inline-flex items-center gap-1 ${marca !== null ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-border hover:bg-muted'}`}
              title="C">
              <Scissors className="w-3.5 h-3.5" />
              {marca === null ? 'Marcar corte' : `Cortar de ${fmt(marca)} até aqui`}
            </button>
            <button onClick={desfazer} disabled={!passado.current.length} className="rounded-md p-1.5 border border-border hover:bg-muted disabled:opacity-40" title="Ctrl+Z">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={refazer} disabled={!futuro.current.length} className="rounded-md p-1.5 border border-border hover:bg-muted disabled:opacity-40" title="Ctrl+Shift+Z">
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setPps((v) => Math.max(20, v / 1.4))} className="rounded-md p-1.5 border border-border hover:bg-muted"><ZoomOut className="w-3.5 h-3.5" /></button>
              <button onClick={() => setPps((v) => Math.min(400, v * 1.4))} className="rounded-md p-1.5 border border-border hover:bg-muted"><ZoomIn className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        {/* painel */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 text-xs lg:max-h-[calc(62vh+80px)] overflow-y-auto">
          {trSel && sel?.tipo === 'trecho' && (
            <PainelTrecho
              tr={trSel} dur={fimTrecho(p, sel.i) - trSel.ini} durClipe={durClipe[trSel.caminho]}
              biblioteca={dados.biblioteca} urls={dados.urls} pastas={pastas}
              filtroPasta={filtroPasta} setFiltroPasta={setFiltroPasta}
              podeApagar={p.trechos.length > 1}
              onDurClipe={(cam, d) => setDurClipe((m) => ({ ...m, [cam]: d }))}
              onMudar={(fn, semHist) => mudar((d) => fn(d.trechos[sel.i]), semHist)}
              onApagar={apagarSelecionado}
              onVer={(dt) => irPara(trSel.ini + dt)}
            />
          )}
          {palSel && sel?.tipo === 'palavra' && (
            <PainelPalavra w={palSel} onMudar={(fn) => mudar((d) => fn(d.palavras[sel.i]))} />
          )}
          {corteSel && (
            <div className="space-y-2">
              <p className="font-semibold text-foreground">Trecho cortado</p>
              <p className="text-muted-foreground">De {fmt(corteSel.ini)} até {fmt(corteSel.fim)} — sai do vídeo inteiro (imagem, voz e legenda).</p>
              <button onClick={apagarSelecionado} className="rounded-md px-2.5 py-1.5 border border-border hover:bg-muted inline-flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> Desfazer este corte
              </button>
            </div>
          )}

          <div className="space-y-3">
            <p className="font-semibold text-foreground">Legenda</p>
            <div className="grid grid-cols-3 gap-1">
              {(['palavra', 'destaque', 'bloco'] as const).map((e) => (
                <button key={e} onClick={() => mudarLegenda({ estilo: e, posicao: undefined, maiusculas: undefined, por_linha: undefined })}
                  className={`rounded-md py-1.5 border ${leg.estilo === e ? 'border-fuchsia-500 bg-fuchsia-500/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  {e === 'palavra' ? 'Palavra' : e === 'destaque' ? 'Destaque' : 'Bloco'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
                Texto <input type="color" value={leg.cor} onChange={(e) => mudarLegenda({ cor: e.target.value })} className="w-7 h-5 bg-transparent" />
              </label>
              <label className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
                Destaque <input type="color" value={leg.destaque} onChange={(e) => mudarLegenda({ destaque: e.target.value })} className="w-7 h-5 bg-transparent" />
              </label>
            </div>
            <Faixa rotulo="Tamanho" valor={leg.tamanho} min={0.5} max={2} passo={0.05} mostrar={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => mudarLegenda({ tamanho: v })} />
            <Faixa rotulo="Altura na tela" valor={leg.posicao} min={0.1} max={0.92} passo={0.01} mostrar={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => mudarLegenda({ posicao: v })} />
            {leg.estilo !== 'palavra' && (
              <Faixa rotulo="Palavras por frase" valor={leg.por_linha} min={2} max={10} passo={1} mostrar={(v) => `${v}`}
                onChange={(v) => mudarLegenda({ por_linha: v })} />
            )}
            <div className="flex flex-wrap gap-1.5">
              <Alternar ativo={leg.caixa} onClick={() => mudarLegenda({ caixa: !leg.caixa })}>Caixa de fundo</Alternar>
              <Alternar ativo={leg.maiusculas} onClick={() => mudarLegenda({ maiusculas: !leg.maiusculas })}>MAIÚSCULAS</Alternar>
              <Alternar ativo={leg.animacao === 'pop'} onClick={() => mudarLegenda({ animacao: leg.animacao === 'pop' ? 'nenhuma' : 'pop' })}>Animação pop</Alternar>
              {leg.estilo === 'destaque' && !leg.caixa && (
                <Alternar ativo={leg.tipo_destaque === 'fundo'} onClick={() => mudarLegenda({ tipo_destaque: leg.tipo_destaque === 'fundo' ? 'cor' : 'fundo' })}>
                  Destaque em contorno
                </Alternar>
              )}
            </div>
            <label className="block space-y-1">
              <span className="text-muted-foreground">Fonte</span>
              <select value={p.fonte_path || ''} onChange={(e) => mudar((d) => { d.fonte_path = e.target.value || null })}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5">
                <option value="">Padrão do servidor</option>
                {dados.fontes.map((f) => <option key={f.caminho} value={f.caminho}>{f.nome.replace(/\.[^.]+$/, '')}</option>)}
              </select>
            </label>
            <p className="text-[11px] text-muted-foreground">
              Clique numa palavra na linha do tempo pra corrigir o texto, dar ênfase ou esconder.
            </p>
          </div>
        </div>
      </div>

      {/* linha do tempo */}
      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <div ref={trilhaRef} className="relative select-none" style={{ width: p.duracao * pps + 40, minWidth: '100%' }}
            onPointerMove={moverArrasto} onPointerUp={soltarArrasto}>
            {/* régua */}
            <div className="relative h-6 border-b border-border cursor-pointer"
              onClick={(e) => irPara((e.clientX - e.currentTarget.getBoundingClientRect().left) / pps)}>
              {Array.from({ length: Math.ceil(p.duracao) + 1 }).map((_, s) => {
                const passoRotulo = pps < 40 ? 5 : pps < 90 ? 2 : 1
                return (
                  <div key={s} className="absolute top-0 h-full" style={{ left: s * pps }}>
                    <div className={`w-px ${s % passoRotulo === 0 ? 'h-3 bg-muted-foreground' : 'h-1.5 bg-border'}`} />
                    {s % passoRotulo === 0 && <span className="absolute top-2.5 left-1 text-[10px] text-muted-foreground">{s}s</span>}
                  </div>
                )
              })}
            </div>

            {/* b-rolls */}
            <div className="relative h-16 my-1" onClick={(e) => { if (e.target === e.currentTarget) irPara((e.clientX - e.currentTarget.getBoundingClientRect().left) / pps) }}>
              {p.trechos.map((tr, i) => {
                const fim = fimTrecho(p, i)
                const ativo = sel?.tipo === 'trecho' && sel.i === i
                const corIdx = caminhosUsados.indexOf(tr.caminho) % CORES.length
                return (
                  <div key={tr.id + i}
                    onClick={(e) => { e.stopPropagation(); setSel({ tipo: 'trecho', i }); irPara(Math.max(tr.ini, Math.min(t, fim - 0.01))) }}
                    className={`absolute top-0 h-full rounded-md overflow-hidden cursor-pointer border-2 ${ativo ? 'border-white' : 'border-transparent'}`}
                    style={{ left: tr.ini * pps, width: Math.max(2, (fim - tr.ini) * pps - 2), background: CORES[corIdx] }}>
                    <div className="px-1.5 py-1 text-[10px] leading-tight text-white">
                      <p className="font-bold truncate">{nomeDe(tr.caminho)}</p>
                      <p className="opacity-80 truncate">
                        {(fim - tr.ini).toFixed(1)}s
                        {tr.zoom && tr.zoom !== 'nenhum' ? ` · zoom ${tr.zoom}` : ''}
                        {tr.transicao && tr.transicao !== 'corte' ? ` · ${tr.transicao}` : ''}
                      </p>
                    </div>
                    {i > 0 && (
                      <div onPointerDown={(e) => comecarArrasto(e, i)}
                        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/40 hover:bg-white" title="Arraste pra mover o corte" />
                    )}
                  </div>
                )
              })}
            </div>

            {/* legenda */}
            <div className="relative h-8 mb-1">
              {p.palavras.map((w, i) => {
                const ativo = sel?.tipo === 'palavra' && sel.i === i
                return (
                  <div key={i} onClick={() => { setSel({ tipo: 'palavra', i }); irPara(w.ini) }}
                    className={`absolute top-0 h-full rounded px-1 text-[10px] flex items-center overflow-hidden cursor-pointer border
                      ${ativo ? 'border-white bg-white/20' : 'border-border bg-muted/60'}
                      ${w.oculta ? 'opacity-40 line-through' : ''}`}
                    style={{ left: w.ini * pps, width: Math.max(3, (w.fim - w.ini) * pps - 1), color: w.enfase ? leg.destaque : undefined }}
                    title={w.t}>
                    <span className="truncate">{w.t}</span>
                  </div>
                )
              })}
            </div>

            {/* cortes */}
            {p.cortes.map((c, i) => (
              <div key={i} onClick={() => setSel({ tipo: 'corte', i })}
                className={`absolute top-6 bottom-0 cursor-pointer border-x-2 border-red-500 ${sel?.tipo === 'corte' && sel.i === i ? 'bg-red-500/45' : 'bg-red-500/25'}`}
                style={{ left: c.ini * pps, width: Math.max(2, (c.fim - c.ini) * pps), backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 6px, rgba(0,0,0,.25) 6px 12px)' }}
                title="Cortado" />
            ))}
            {marca !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 pointer-events-none" style={{ left: marca * pps }} />}

            {/* cursor */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-fuchsia-400 pointer-events-none" style={{ left: t * pps }}>
              <div className="absolute -top-0.5 -left-1.5 w-3.5 h-2.5 bg-fuchsia-400 rounded-sm" />
            </div>
          </div>
        </div>
        <p className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
          Atalhos: <b>Espaço</b> toca · <b>S</b> divide o b-roll no cursor · <b>C</b> marca/fecha um corte · <b>←/→</b> anda 0,1s (Shift: 1s) · <b>Del</b> apaga o selecionado · <b>Ctrl+Z</b> desfaz
        </p>
      </div>

      {saida.video && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" /> Último vídeo renderizado
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video key={saida.video} src={saida.video} controls className="max-h-[60vh] rounded-lg border border-border" />
        </div>
      )}
    </div>
  )
}

function Faixa({ rotulo, valor, min, max, passo, mostrar, onChange }: {
  rotulo: string; valor: number; min: number; max: number; passo: number
  mostrar: (v: number) => string; onChange: (v: number) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-muted-foreground"><span>{rotulo}</span><span className="text-foreground">{mostrar(valor)}</span></span>
      <input type="range" min={min} max={max} step={passo} value={valor}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-fuchsia-500" />
    </label>
  )
}

function Alternar({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-md px-2 py-1 border ${ativo ? 'border-fuchsia-500 bg-fuchsia-500/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
      {children}
    </button>
  )
}

function PainelPalavra({ w, onMudar }: { w: Palavra; onMudar: (fn: (w: Palavra) => void) => void }) {
  const [texto, setTexto] = useState(w.t)
  useEffect(() => setTexto(w.t), [w.t])
  return (
    <div className="space-y-2">
      <p className="font-semibold text-foreground">Palavra da legenda</p>
      <input value={texto} onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { if (texto.trim() && texto !== w.t) onMudar((x) => { x.t = texto.trim() }) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
      <div className="flex gap-1.5">
        <Alternar ativo={!!w.enfase} onClick={() => onMudar((x) => { x.enfase = !x.enfase })}>
          <span className="inline-flex items-center gap-1"><Star className="w-3 h-3" /> Ênfase</span>
        </Alternar>
        <Alternar ativo={!!w.oculta} onClick={() => onMudar((x) => { x.oculta = !x.oculta })}>
          <span className="inline-flex items-center gap-1">{w.oculta ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} Esconder</span>
        </Alternar>
      </div>
      <p className="text-[11px] text-muted-foreground">Ênfase pinta a palavra com a cor de destaque o tempo todo. Esconder tira ela da legenda, a voz continua.</p>
    </div>
  )
}

function PainelTrecho({
  tr, dur, durClipe, biblioteca, urls, pastas, filtroPasta, setFiltroPasta, podeApagar,
  onDurClipe, onMudar, onApagar, onVer,
}: {
  tr: Trecho; dur: number; durClipe?: number
  biblioteca: ItemBiblioteca[]; urls: Record<string, string>; pastas: string[]
  filtroPasta: string; setFiltroPasta: (s: string) => void; podeApagar: boolean
  onDurClipe: (cam: string, d: number) => void
  onMudar: (fn: (t: Trecho) => void, semHistorico?: boolean) => void
  onApagar: () => void
  onVer: (dt: number) => void
}) {
  const folga = durClipe ? Math.max(0, durClipe - dur) : 0
  const lista = biblioteca.filter((b) => !filtroPasta || b.pasta === filtroPasta)
  return (
    <div className="space-y-3 pb-3 border-b border-border">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-foreground truncate">B-roll: {nomeDe(tr.caminho)}</p>
        <button onClick={onApagar} disabled={!podeApagar} className="rounded-md p-1.5 border border-border hover:bg-muted disabled:opacity-40" title="Apagar (o anterior cobre o espaço)">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-muted-foreground">{dur.toFixed(1)}s na linha do tempo{durClipe ? ` · clipe tem ${durClipe.toFixed(1)}s` : ''}</p>

      <label className="block space-y-1">
        <span className="flex justify-between text-muted-foreground">
          <span>Pedaço do clipe usado</span><span className="text-foreground">começa em {tr.origem.toFixed(1)}s</span>
        </span>
        <input type="range" min={0} max={Math.max(0.01, folga)} step={0.05} value={Math.min(tr.origem, folga)}
          disabled={!folga}
          onPointerDown={() => onMudar(() => {})}
          onChange={(e) => { onMudar((x) => { x.origem = Number(e.target.value) }, true); onVer(0.01) }}
          className="w-full accent-fuchsia-500 disabled:opacity-40" />
        {!folga && durClipe !== undefined && <span className="text-[11px] text-muted-foreground">O clipe é mais curto que o trecho — ele usa tudo.</span>}
      </label>

      <div className="space-y-1">
        <span className="text-muted-foreground">Zoom</span>
        <div className="grid grid-cols-3 gap-1">
          {(['nenhum', 'in', 'out'] as const).map((z) => (
            <Alternar key={z} ativo={(tr.zoom || 'nenhum') === z} onClick={() => onMudar((x) => { x.zoom = z })}>
              {z === 'nenhum' ? 'Sem' : z === 'in' ? 'Aproximar' : 'Afastar'}
            </Alternar>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Entrada</span>
        <div className="grid grid-cols-3 gap-1">
          {(['corte', 'fade', 'flash'] as const).map((z) => (
            <Alternar key={z} ativo={(tr.transicao || 'corte') === z} onClick={() => onMudar((x) => { x.transicao = z })}>
              {z === 'corte' ? 'Corte seco' : z === 'fade' ? 'Do preto' : 'Flash'}
            </Alternar>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Trocar por</span>
          <select value={filtroPasta} onChange={(e) => setFiltroPasta(e.target.value)}
            className="rounded-md border border-border bg-background px-1.5 py-1">
            <option value="">todas as pastas</option>
            {pastas.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {lista.map((b) => (
            <button key={b.caminho} onClick={() => onMudar((x) => { if (x.caminho !== b.caminho) { x.caminho = b.caminho; x.origem = 0 } })}
              className={`rounded-md overflow-hidden border text-left ${b.caminho === tr.caminho ? 'border-fuchsia-500' : 'border-border hover:border-muted-foreground'}`}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={urls[b.caminho] ? `${urls[b.caminho]}#t=0.5` : undefined} preload="metadata" muted playsInline
                onLoadedMetadata={(e) => { const d = e.currentTarget.duration; onDurClipe(b.caminho, d) }}
                onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => e.currentTarget.pause()}
                className="w-full aspect-[9/16] object-cover bg-black" />
              <p className="px-1 py-0.5 text-[10px] truncate">{b.nome}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
