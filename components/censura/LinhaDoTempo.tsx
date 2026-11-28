'use client'

import { PointerEvent, ReactNode, RefObject, WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Film, AudioLines, Droplets, ShieldAlert, Trash2, ZoomIn, ZoomOut, Maximize2, Minimize2, Captions, MoveHorizontal } from 'lucide-react'
import type { AreaBorrao } from '@/lib/censura-borrao'
import type { Segmento } from '@/lib/censura'
import { fmtTempo } from '@/lib/censura'

// Linha do tempo do Editor de Censura, no jeito do Premiere/CapCut: cada coisa
// aplicada no vídeo é um elemento numa trilha — dá pra selecionar, arrastar,
// esticar pelas pontas e apagar (Delete). Zoom com Ctrl+roda ou pelo controle.

export type ElementoTL = { tipo: 'borrao'; i: number } | { tipo: 'censura'; ini: number }

interface Props {
  duracao: number
  videoRef: RefObject<HTMLVideoElement | null>
  nomeVideo: string
  /** Palavras faladas (ini/fim) — desenham a trilha de áudio. */
  palavras: { ini: number; fim: number }[]
  segs: Segmento[]
  rotuloSeg: (s: Segmento) => string
  /** Janelas em que a área da legenda borra (seguem as palavras censuradas). */
  janelasLegenda: [number, number][]
  areas: AreaBorrao[]
  selecionado: ElementoTL | null
  onSelecionar: (e: ElementoTL | null) => void
  onSeek: (t: number) => void
  onMudarMomento: (i: number, ini: number, fim: number) => void
  onApagar: (e: ElementoTL) => void
  onAbrirBorrao: (i: number) => void
  onAbrirCensura: (s: Segmento) => void
  onAbrirLegenda: () => void
  /** Clique num bloco amarelo: vira borrão de momento editável. */
  onSoltarLegenda: (ini: number, fim: number) => void
  /** Aumenta/volta a altura da linha do tempo. */
  maximizada: boolean
  onMaximizar: () => void
}

const LARG_ROTULO = 116
const ehMomento = (a: AreaBorrao) => typeof a.ini === 'number' && typeof a.fim === 'number'

/** Passo da régua conforme o zoom: marca a cada N segundos, sem embolar. */
function passoRegua(pxSeg: number) {
  for (const p of [0.5, 1, 2, 5, 10, 15, 30, 60]) if (p * pxSeg >= 70) return p
  return 120
}

export function LinhaDoTempo(p: Props) {
  const { duracao, videoRef } = p
  const rolagemRef = useRef<HTMLDivElement>(null)
  const cabecaRef = useRef<HTMLDivElement>(null)
  const tempoRef = useRef<HTMLSpanElement>(null)
  const [largVisivel, setLargVisivel] = useState(800)
  /** 1 = vídeo inteiro cabe na tela; maior = mais perto. */
  const [zoom, setZoom] = useState(1)
  const [arrasto, setArrasto] = useState<{ i: number; ini: number; fim: number } | null>(null)
  const aj = useRef<{ i: number; modo: 'm' | 'ini' | 'fim'; x0: number; ini0: number; fim0: number; mexeu: boolean } | null>(null)
  const raspando = useRef(false)

  useEffect(() => {
    const el = rolagemRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setLargVisivel(el.clientWidth - LARG_ROTULO))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pxSeg = duracao > 0 ? (Math.max(200, largVisivel - 16) / duracao) * zoom : 10
  const largura = Math.max(0, duracao * pxSeg)
  const xDe = useCallback((t: number) => t * pxSeg, [pxSeg])

  // Cabeça de reprodução: segue o vídeo a cada quadro e rola junto quando toca.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const v = videoRef.current, el = rolagemRef.current
      if (v && cabecaRef.current) {
        const x = v.currentTime * pxSeg
        cabecaRef.current.style.transform = `translateX(${x}px)`
        if (tempoRef.current) tempoRef.current.textContent = fmtTempo(v.currentTime)
        if (el && !v.paused && !raspando.current) {
          const vis0 = el.scrollLeft, vis1 = el.scrollLeft + el.clientWidth - LARG_ROTULO
          if (x > vis1 - 40 || x < vis0) el.scrollLeft = Math.max(0, x - 60)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, pxSeg])

  function tempoDoPonteiro(clientX: number) {
    const el = rolagemRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const x = clientX - r.left - LARG_ROTULO + el.scrollLeft
    return Math.min(duracao, Math.max(0, x / pxSeg))
  }

  // ---- zoom ----
  function mudarZoom(novo: number, focoClientX?: number) {
    const el = rolagemRef.current
    const z = Math.min(60, Math.max(1, novo))
    if (!el) { setZoom(z); return }
    const t = focoClientX != null ? tempoDoPonteiro(focoClientX) : (videoRef.current?.currentTime ?? 0)
    const deslocTela = focoClientX != null ? focoClientX - el.getBoundingClientRect().left - LARG_ROTULO : el.clientWidth / 3
    setZoom(z)
    requestAnimationFrame(() => {
      const novoPx = duracao > 0 ? (Math.max(200, largVisivel - 16) / duracao) * z : 10
      el.scrollLeft = Math.max(0, t * novoPx - deslocTela)
    })
  }
  function naRoda(e: WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey && !e.altKey) return
    e.preventDefault()
    mudarZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX)
  }
  // Ctrl+roda não pode dar zoom na página inteira.
  useEffect(() => {
    const el = rolagemRef.current
    if (!el) return
    const bloquear = (e: globalThis.WheelEvent) => { if (e.ctrlKey || e.altKey) e.preventDefault() }
    el.addEventListener('wheel', bloquear, { passive: false })
    return () => el.removeEventListener('wheel', bloquear)
  }, [])

  // ---- raspar (clicar/arrastar na régua ou em área vazia move a cabeça) ----
  function raspaDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    raspando.current = true
    videoRef.current?.pause()
    p.onSeek(tempoDoPonteiro(e.clientX))
    p.onSelecionar(null)
  }
  function raspaMove(e: PointerEvent<HTMLDivElement>) {
    if (raspando.current) p.onSeek(tempoDoPonteiro(e.clientX))
  }
  function raspaUp() { raspando.current = false }

  // ---- blocos de borrão: mover / esticar ----
  function blocoDown(e: PointerEvent<HTMLDivElement>, i: number, modo: 'm' | 'ini' | 'fim') {
    const a = p.areas[i]
    if (!a || !ehMomento(a)) return
    e.preventDefault(); e.stopPropagation()
    rolagemRef.current?.setPointerCapture(e.pointerId)
    videoRef.current?.pause()
    aj.current = { i, modo, x0: tempoDoPonteiro(e.clientX), ini0: a.ini!, fim0: a.fim!, mexeu: false }
    setArrasto({ i, ini: a.ini!, fim: a.fim! })
    p.onSelecionar({ tipo: 'borrao', i })
  }
  function trilhaMove(e: PointerEvent<HTMLDivElement>) {
    const a = aj.current
    if (!a) { raspaMove(e); return }
    const dt = tempoDoPonteiro(e.clientX) - a.x0
    if (Math.abs(dt * pxSeg) > 2) a.mexeu = true
    if (!a.mexeu) return
    let ini = a.ini0, fim = a.fim0
    if (a.modo === 'm') { const d = Math.min(Math.max(dt, -a.ini0), duracao - a.fim0); ini += d; fim += d }
    else if (a.modo === 'ini') ini = Math.min(a.fim0 - 0.1, Math.max(0, a.ini0 + dt))
    else fim = Math.max(a.ini0 + 0.1, Math.min(duracao, a.fim0 + dt))
    setArrasto({ i: a.i, ini, fim })
    p.onSeek(a.modo === 'fim' ? fim : ini)
  }
  function trilhaUp() {
    raspaUp()
    const a = aj.current
    aj.current = null
    const fimArr = arrasto
    setArrasto(null)
    if (!a) return
    if (!a.mexeu) { p.onSeek((a.ini0 + a.fim0) / 2); return }
    if (fimArr) p.onMudarMomento(a.i, +fimArr.ini.toFixed(2), +fimArr.fim.toFixed(2))
  }

  const regua = useMemo(() => {
    const passo = passoRegua(pxSeg)
    const marcas: number[] = []
    for (let t = 0; t <= duracao + 0.001; t += passo) marcas.push(+t.toFixed(2))
    return { passo, marcas }
  }, [pxSeg, duracao])

  const sel = p.selecionado
  const momentos = p.areas.map((a, i) => ({ a, i })).filter(({ a }) => ehMomento(a))

  const trilha = (nome: string, icone: ReactNode, cor: string, altura: number, children: ReactNode) => (
    <div className="flex border-b border-black/40" style={{ height: altura }}>
      <div className="sticky left-0 z-20 shrink-0 flex items-center gap-1.5 px-2 bg-[#1b1d22] border-r border-black/50 text-[10px] font-semibold text-white/70" style={{ width: LARG_ROTULO }}>
        <span className={`w-5 h-5 rounded flex items-center justify-center text-white ${cor}`}>{icone}</span>
        <span className="truncate">{nome}</span>
      </div>
      <div className="relative" style={{ width: largura }}>{children}</div>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-[#141519] border border-border rounded-2xl overflow-hidden select-none">
      {/* Cabeçalho: tempo, apagar o selecionado e zoom */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-black/50 bg-[#1b1d22] shrink-0">
        <span ref={tempoRef} className="text-[13px] font-bold tabular-nums text-sky-400 w-16">0:00.0</span>
        <span className="text-[11px] text-white/40 tabular-nums">/ {fmtTempo(duracao)}</span>
        <span className="w-px h-4 bg-white/10 mx-1" />
        <button disabled={!sel} onClick={() => sel && p.onApagar(sel)} title="Apagar o elemento selecionado (Delete)"
          className="h-7 px-2 rounded-md text-[11px] font-semibold text-white/80 hover:bg-white/10 disabled:opacity-30 inline-flex items-center gap-1">
          <Trash2 className="w-3.5 h-3.5" /> Apagar
        </button>
        <p className="text-[10px] text-white/35 truncate hidden md:block">
          Clique num elemento pra selecionar · arraste pra mover · puxe as pontas · <b>Delete</b> apaga · <b>Ctrl+roda</b> dá zoom
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => mudarZoom(zoom * 0.7)} title="Afastar" className="w-7 h-7 rounded-md text-white/70 hover:bg-white/10 flex items-center justify-center"><ZoomOut className="w-3.5 h-3.5" /></button>
          <input type="range" min={0} max={100} value={Math.round((Math.log(zoom) / Math.log(60)) * 100)} aria-label="Zoom da linha do tempo"
            onChange={(e) => mudarZoom(Math.exp((Number(e.target.value) / 100) * Math.log(60)))} className="w-28 accent-sky-400" />
          <button onClick={() => mudarZoom(zoom * 1.4)} title="Aproximar" className="w-7 h-7 rounded-md text-white/70 hover:bg-white/10 flex items-center justify-center"><ZoomIn className="w-3.5 h-3.5" /></button>
          <button onClick={() => { setZoom(1); if (rolagemRef.current) rolagemRef.current.scrollLeft = 0 }} title="Ajustar: o vídeo inteiro cabe na largura"
            className="h-7 px-2 rounded-md text-[11px] font-semibold text-white/80 hover:bg-white/10 inline-flex items-center gap-1"><MoveHorizontal className="w-3.5 h-3.5" /> Ajustar</button>
          <span className="w-px h-4 bg-white/10" />
          <button onClick={p.onMaximizar} title={p.maximizada ? 'Voltar a linha do tempo ao tamanho normal' : 'Aumentar a linha do tempo'}
            className="w-7 h-7 rounded-md text-white/70 hover:bg-white/10 flex items-center justify-center">
            {p.maximizada ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div ref={rolagemRef} className="flex-1 min-h-0 overflow-auto relative" onWheel={naRoda}
        onPointerMove={trilhaMove} onPointerUp={trilhaUp} onPointerCancel={trilhaUp}>
        <div className="relative" style={{ width: largura + LARG_ROTULO, minWidth: '100%' }}>
          {/* Régua */}
          <div className="sticky top-0 z-30 flex h-7 bg-[#1b1d22] border-b border-black/50">
            <div className="sticky left-0 z-20 shrink-0 bg-[#1b1d22] border-r border-black/50" style={{ width: LARG_ROTULO }} />
            <div className="relative cursor-pointer" style={{ width: largura }} onPointerDown={raspaDown}>
              {regua.marcas.map((t) => (
                <div key={t} className="absolute top-0 bottom-0 border-l border-white/20" style={{ left: xDe(t) }}>
                  <span className="absolute top-0.5 left-1 text-[9px] tabular-nums text-white/50 whitespace-nowrap">{fmtTempo(t).replace(/\.0$/, '')}</span>
                </div>
              ))}
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-amber-300/80" />
            </div>
          </div>

          {/* Trilhas: o fundo vazio também raspa a cabeça */}
          <div onPointerDown={raspaDown}>
            {trilha('Borrões', <Droplets className="w-3 h-3" />, 'bg-cyan-600', 42, <>
              {momentos.map(({ a, i }) => {
                const ini = arrasto?.i === i ? arrasto.ini : a.ini!
                const fim = arrasto?.i === i ? arrasto.fim : a.fim!
                const ativo = sel?.tipo === 'borrao' && sel.i === i
                return (
                  <div key={i} onPointerDown={(e) => blocoDown(e, i, 'm')} onDoubleClick={() => p.onAbrirBorrao(i)}
                    title={`Borrão ${fmtTempo(ini)} → ${fmtTempo(fim)} · duplo clique ajusta a área no vídeo`}
                    className={`absolute top-1.5 bottom-1.5 rounded-[4px] bg-cyan-500/85 border cursor-grab active:cursor-grabbing overflow-hidden ${ativo ? 'border-white ring-2 ring-white/70 z-10' : 'border-cyan-200/60'}`}
                    style={{ left: xDe(ini), width: Math.max(8, xDe(fim - ini)) }}>
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/95 whitespace-nowrap pointer-events-none">Borrão</span>
                    <div onPointerDown={(e) => blocoDown(e, i, 'ini')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/40 hover:bg-white/80" />
                    <div onPointerDown={(e) => blocoDown(e, i, 'fim')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/40 hover:bg-white/80" />
                  </div>
                )
              })}
            </>)}

            {trilha('Legenda borrada', <Captions className="w-3 h-3" />, 'bg-amber-600', 30, <>
              {p.janelasLegenda.map(([a, z], k) => (
                <div key={k} onPointerDown={(e) => { e.stopPropagation(); videoRef.current?.pause(); p.onSoltarLegenda(a, z) }}
                  title={`Borrão automático da legenda ${fmtTempo(a)} → ${fmtTempo(z)} · clique pra editar (vira um bloco azul que dá pra mover, esticar e apagar)`}
                  className="absolute top-1.5 bottom-1.5 rounded-[3px] bg-amber-500/70 border border-amber-200/40 cursor-pointer hover:bg-amber-400 hover:border-white"
                  style={{ left: xDe(a), width: Math.max(3, xDe(z - a)) }} />
              ))}
            </>)}

            {trilha(p.nomeVideo || 'Vídeo', <Film className="w-3 h-3" />, 'bg-sky-700', 42, <>
              <div className="absolute inset-y-1.5 left-0 right-0 rounded-[4px] bg-sky-800/80 border border-sky-500/40 overflow-hidden">
                <span className="absolute left-2 top-1 text-[10px] font-semibold text-white/85 whitespace-nowrap">{p.nomeVideo} [V]</span>
              </div>
            </>)}

            {trilha('Áudio', <AudioLines className="w-3 h-3" />, 'bg-sky-700', 42, <>
              <div className="absolute inset-y-1.5 left-0 right-0 rounded-[4px] bg-sky-900/70 border border-sky-500/30 overflow-hidden">
                {/* Cada palavra falada vira um tracinho — dá a cara da onda sonora. */}
                {p.palavras.map((w, k) => (
                  <div key={k} className="absolute top-1/2 -translate-y-1/2 bg-sky-300/60 rounded-full"
                    style={{ left: xDe(w.ini), width: Math.max(1, xDe(w.fim - w.ini) - 1), height: `${40 + ((k * 37) % 50)}%` }} />
                ))}
              </div>
            </>)}

            {trilha('Censura (áudio)', <ShieldAlert className="w-3 h-3" />, 'bg-rose-700', 42, <>
              {p.segs.map((s) => {
                const ativo = sel?.tipo === 'censura' && Math.abs(sel.ini - s.ini) < 0.001
                return (
                  <div key={s.ini} onPointerDown={(e) => { e.stopPropagation(); videoRef.current?.pause(); p.onSelecionar({ tipo: 'censura', ini: s.ini }); p.onAbrirCensura(s) }}
                    title={`${p.rotuloSeg(s)} · ${fmtTempo(s.ini)} → ${fmtTempo(s.fim)} · Delete libera`}
                    className={`absolute top-1.5 bottom-1.5 rounded-[4px] bg-rose-800/90 border cursor-pointer overflow-hidden ${ativo ? 'border-white ring-2 ring-white/70 z-10' : 'border-rose-400/50'}`}
                    style={{ left: xDe(s.ini), width: Math.max(4, xDe(s.fim - s.ini)) }}>
                    <div className="absolute inset-x-0 top-1/2 h-px bg-rose-200/50" />
                    <span className="absolute left-1.5 top-0.5 text-[9px] font-bold text-rose-50 whitespace-nowrap pointer-events-none">{p.rotuloSeg(s)}</span>
                  </div>
                )
              })}
            </>)}
          </div>

          {/* Cabeça de reprodução */}
          <div className="absolute top-0 bottom-0 z-40 pointer-events-none" style={{ left: LARG_ROTULO }}>
            <div ref={cabecaRef} className="absolute top-0 bottom-0 w-px bg-sky-400">
              <div className="absolute -top-0 -left-[6px] w-[13px] h-3 bg-sky-400 [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
