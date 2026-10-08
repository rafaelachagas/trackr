'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Download, Eye, EyeOff, Film, Loader2, Pause, Play, Redo2, Scissors, Star,
  Trash2, Undo2, ZoomIn, ZoomOut, Check, AlertTriangle, Plus,
} from 'lucide-react'
import {
  type Projeto, type Trecho, type Palavra, type Legenda,
  legendaCompleta, corpoRelativo, fimTrecho, trechoEm, corteEm, legendaEm, escalaPop, PUNCH_DUR,
  textosEm, TEXTO_PADRAO, type TextoFixo, TRANSICOES_CRUZADAS, type Transicao, type Som,
  encaixaNaPalavra,
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
type Selecao = { tipo: 'trecho' | 'palavra' | 'corte' | 'texto'; i: number } | null

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
  // Picos da locução pra desenhar a onda. Sem ela, achar o "éééé" pra cortar
  // é ouvir o áudio inteiro. 600 colunas chegam pra qualquer criativo.
  const [picos, setPicos] = useState<number[] | null>(null)
  // Catálogo de efeitos sonoros disponíveis (a biblioteca, não os usados aqui).
  const [catalogoSons, setCatalogoSons] = useState<{ nome: string; caminho: string; url: string | null }[]>([])
  useEffect(() => {
    fetch('/api/creative-generator/sfx')
      .then((r) => r.json())
      .then((j) => setCatalogoSons(j.sons || []))
      .catch(() => setCatalogoSons([]))
  }, [])
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
    const ini = encaixaNaPalavra(p, Math.min(marca, t), 'ini')
    const fim = encaixaNaPalavra(p, Math.max(marca, t), 'fim')
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
    } else if (sel.tipo === 'texto') {
      mudar((d) => { (d.textos || []).splice(sel.i, 1) })
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

  const urlLocucao = dados && p ? dados.urls[p.locucao_path] : null
  useEffect(() => {
    if (!urlLocucao) return
    let vivo = true
    ;(async () => {
      try {
        const buf = await fetch(urlLocucao).then((r) => r.arrayBuffer())
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        const audio = await ctx.decodeAudioData(buf)
        const dados0 = audio.getChannelData(0)
        const colunas = 600
        const porColuna = Math.floor(dados0.length / colunas) || 1
        const fora: number[] = []
        for (let c = 0; c < colunas; c++) {
          let pico = 0
          const ini = c * porColuna
          for (let i = ini; i < ini + porColuna && i < dados0.length; i += 8) {
            const v = Math.abs(dados0[i])
            if (v > pico) pico = v
          }
          fora.push(pico)
        }
        const teto = Math.max(...fora) || 1
        if (vivo) setPicos(fora.map((v) => v / teto))
        ctx.close()
      } catch {
        // Onda é conforto, não função: se o navegador não decodificar, segue sem.
        if (vivo) setPicos(null)
      }
    })()
    return () => { vivo = false }
  }, [urlLocucao])

  const idx = trechoEm(p, t)
  const trAtual = p.trechos[idx]
  const prog = trAtual ? Math.min(1, Math.max(0, (t - trAtual.ini) / Math.max(0.1, fimTrecho(p, idx) - trAtual.ini))) : 0
  // Mesma conta do ffmpeg (_corta_broll): prog diz o quanto está ampliado agora.
  const forcaZoom = trAtual?.zoom_forca ?? ZOOM_FORCA
  const progZoom = trAtual?.zoom === 'in' ? prog
    : trAtual?.zoom === 'out' ? 1 - prog
    : trAtual?.zoom === 'punch' ? Math.max(0, 1 - (t - trAtual.ini) / PUNCH_DUR)
    : 0
  const escalaZoom = 1 + forcaZoom * Math.min(1, Math.max(0, progZoom))
  const opTransicao = trAtual && trAtual.transicao && trAtual.transicao !== 'corte'
    ? Math.max(0, 1 - (t - trAtual.ini) / TRANSICAO_DUR) : 0

  const escalaPx = boxH / p.altura
  const corpoPx = corpoRelativo(leg) * boxH
  const contornoPx = Math.max(3, Math.floor(corpoRelativo(leg) * p.altura * 0.09)) * escalaPx
  const aberrPx = Math.max(2, corpoPx * (leg.aberracao_forca ?? 0.055))
  const naTela = legendaEm(p, t)
  const desliza = leg.animacao === 'subir' || leg.animacao === 'lado'
  const avancoEntrada = naTela ? Math.min(1, Math.max(0, (t - naTela[0].desde) / 0.13)) : 1
  const duracaoFinal = p.duracao - p.cortes.reduce((s, c) => s + (c.fim - c.ini), 0)

  const trSel = sel?.tipo === 'trecho' ? p.trechos[sel.i] : null
  const palSel = sel?.tipo === 'palavra' ? p.palavras[sel.i] : null
  const corteSel = sel?.tipo === 'corte' ? p.cortes[sel.i] : null
  const textoSel = sel?.tipo === 'texto' ? (p.textos || [])[sel.i] : null

  function novoTexto() {
    if (!p) return
    const fim = Math.min(p.duracao, t + 2.5)
    if (fim - t < 0.3) return
    mudar((d) => {
      d.textos = [...(d.textos || []), { ...TEXTO_PADRAO, id: `tx${Date.now()}`, ini: +t.toFixed(3), fim: +fim.toFixed(3) }]
    })
    setSel({ tipo: 'texto', i: (p.textos || []).length })
  }

  function porSom(som: { nome: string; caminho: string }, quando: number) {
    mudar((d) => {
      d.sons = [...(d.sons || []), {
        id: `sm${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        caminho: som.caminho, nome: som.nome, quando: +quando.toFixed(3), volume: 0.8,
      }]
    })
  }

  /** Um efeito em cada emenda de b-roll — menos a primeira, que é o começo. */
  function somEmTodasAsTrocas(som: { nome: string; caminho: string }) {
    if (!p) return
    mudar((d) => {
      const novos: Som[] = d.trechos.slice(1).map((tr, k) => ({
        id: `sm${Date.now()}${k}`,
        caminho: som.caminho, nome: som.nome,
        // Um pouquinho antes da troca: o som anuncia o corte, não o segue.
        quando: +Math.max(0, tr.ini - 0.08).toFixed(3), volume: 0.8,
      }))
      d.sons = [...(d.sons || []), ...novos]
    })
  }

  function mudarTexto(campos: Partial<TextoFixo>) {
    if (sel?.tipo !== 'texto') return
    mudar((d) => {
      const lista = d.textos || []
      lista[sel.i] = { ...lista[sel.i], ...campos }
      d.textos = lista
    })
  }

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
            {textosEm(p, t).map((x) => {
              const corpoTx = (x.tamanho ?? 0.14) * boxH
              const desde = x.ini
              const avanco = Math.min(1, Math.max(0, (t - desde) / 0.16))
              const anim = x.animacao || 'pop'
              return (
                <div key={x.id} className="absolute pointer-events-none text-center whitespace-pre-wrap"
                  style={{
                    left: `${(x.x ?? 0.5) * 100}%`,
                    top: `${(x.y ?? 0.25) * 100}%`,
                    transform: `translate(-50%, -50%)`
                      + (anim === 'subir' ? ` translateY(${(1 - avanco) * corpoTx * 0.4}px)` : '')
                      + (anim === 'lado' ? ` translateX(${-(1 - avanco) * corpoTx * 0.8}px)` : '')
                      + ` rotate(${x.rotacao ?? 0}deg)`
                      + ` scale(${anim === 'pop' ? escalaPop(desde, t, 0.7, 1.12) : 1})`,
                    opacity: anim === 'subir' || anim === 'lado' ? Math.min(1, avanco * 1.6) : 1,
                    fontFamily: 'FonteLegendaPrevia, Montserrat, Arial Black, sans-serif',
                    fontWeight: 800,
                    fontSize: corpoTx,
                    lineHeight: 1.1,
                    color: x.cor || '#FFFFFF',
                    WebkitTextStroke: `${Math.max(2, corpoTx * 0.07) * 2}px #000`,
                    paintOrder: 'stroke fill',
                  }}>
                  {x.maiusculas ? x.texto.toUpperCase() : x.texto}
                </div>
              )
            })}
            {naTela && (
              <div className="absolute left-1/2 pointer-events-none text-center"
                style={{
                  top: `${leg.posicao * 100}%`,
                  width: `${((p.largura - 160) / p.largura) * 100}%`,
                  // Deslizar: mesma entrada do \move do ASS (130ms) com o ad.
                  transform: `translate(-50%, -50%)`
                    + (desliza ? ` translate(${leg.animacao === 'lado' ? -(1 - avancoEntrada) * corpoPx * 0.9 : 0}px, ${leg.animacao === 'subir' ? (1 - avancoEntrada) * corpoPx * 0.45 : 0}px)` : '')
                    + ` scale(${leg.animacao === 'pop' && leg.estilo === 'palavra' ? escalaPop(naTela[0].desde, t) : 1})`,
                  opacity: desliza ? Math.min(1, avancoEntrada * 1.5) : 1,
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
                          textShadow: [
                            // Aberração cromática: as duas cópias fantasmas do ASS.
                            leg.aberracao ? `${-aberrPx}px 0 0 rgba(255,0,0,0.7), ${aberrPx}px 0 0 rgba(0,0,255,0.7)` : '',
                            leg.brilho ? `0 0 ${Math.max(4, corpoPx * 0.18)}px ${leg.destaque}` : '',
                            leg.caixa ? '' : `0 ${Math.max(1, corpoPx * 0.04)}px 0 rgba(0,0,0,0.5)`,
                          ].filter(Boolean).join(', ') || undefined,
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">Texto por cima</p>
              <button onClick={novoTexto}
                className="rounded-md px-2 py-1 border border-border hover:bg-muted inline-flex items-center gap-1 text-[11px]">
                <Plus className="w-3 h-3" /> Novo no cursor
              </button>
            </div>
            {!textoSel && (
              <p className="text-muted-foreground text-[11px]">
                {(p.textos || []).length
                  ? 'Clique num texto na linha do tempo pra editar.'
                  : 'Um título que não vem da fala — o "Dia 3" escrito por cima do vídeo.'}
              </p>
            )}
            {textoSel && (
              <div className="space-y-2">
                <textarea value={textoSel.texto} rows={2}
                  onChange={(e) => mudarTexto({ texto: e.target.value })}
                  className="w-full rounded-md bg-black/30 border border-border px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-fuchsia-500/50" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-muted-foreground">Entra em {fmt(textoSel.ini)}</span>
                    <input type="range" min={0} max={Math.max(0.1, p.duracao)} step={0.05} value={textoSel.ini}
                      onChange={(e) => mudarTexto({ ini: Math.min(Number(e.target.value), textoSel.fim - 0.2) })}
                      className="w-full" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-muted-foreground">Sai em {fmt(textoSel.fim)}</span>
                    <input type="range" min={0} max={Math.max(0.1, p.duracao)} step={0.05} value={textoSel.fim}
                      onChange={(e) => mudarTexto({ fim: Math.max(Number(e.target.value), textoSel.ini + 0.2) })}
                      className="w-full" />
                  </label>
                </div>
                <Faixa rotulo="Tamanho" valor={Math.round((textoSel.tamanho ?? 0.14) * 100)} min={2} max={45} passo={1}
                  mostrar={(v) => `${v}%`} onChange={(v) => mudarTexto({ tamanho: v / 100 })} />
                <Faixa rotulo="Altura na tela" valor={Math.round((textoSel.y ?? 0.25) * 100)} min={0} max={100} passo={1}
                  mostrar={(v) => `${v}%`} onChange={(v) => mudarTexto({ y: v / 100 })} />
                <Faixa rotulo="Lado" valor={Math.round((textoSel.x ?? 0.5) * 100)} min={0} max={100} passo={1}
                  mostrar={(v) => `${v}%`} onChange={(v) => mudarTexto({ x: v / 100 })} />
                <Faixa rotulo="Giro" valor={textoSel.rotacao ?? 0} min={-45} max={45} passo={1}
                  mostrar={(v) => `${v}°`} onChange={(v) => mudarTexto({ rotacao: v })} />
                <div className="flex items-center gap-2">
                  <input type="color" value={textoSel.cor || '#FFFFFF'}
                    onChange={(e) => mudarTexto({ cor: e.target.value })}
                    className="w-9 h-7 rounded bg-transparent border border-border cursor-pointer" />
                  <Alternar ativo={!!textoSel.maiusculas} onClick={() => mudarTexto({ maiusculas: !textoSel.maiusculas })}>MAIÚSCULAS</Alternar>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(['nenhuma', 'pop', 'subir', 'lado'] as const).map((a) => (
                    <Alternar key={a} ativo={(textoSel.animacao || 'pop') === a} onClick={() => mudarTexto({ animacao: a })}>
                      {a === 'nenhuma' ? 'Sem' : a === 'pop' ? 'Estala' : a === 'subir' ? 'Sobe' : 'Lado'}
                    </Alternar>
                  ))}
                </div>
                <button onClick={apagarSelecionado}
                  className="rounded-md px-2.5 py-1.5 border border-border hover:bg-muted inline-flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> Apagar este texto
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-foreground">Efeitos sonoros</p>
            {catalogoSons.length === 0 ? (
              <p className="text-muted-foreground text-[11px]">
                Nenhum efeito na biblioteca. Envie whoosh, pop e cha-ching no gerador
                (Modo avançado) e eles aparecem aqui.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground text-[11px]">Clique pra pôr no cursor ({fmt(t)}):</p>
                <div className="flex flex-wrap gap-1">
                  {catalogoSons.map((sm) => (
                    <button key={sm.caminho} onClick={() => porSom(sm, t)}
                      className="px-2 py-1 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-sky-500/50">
                      {sm.nome}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {catalogoSons.map((sm) => (
                    <button key={sm.caminho} onClick={() => somEmTodasAsTrocas(sm)}
                      className="px-2 py-1 rounded-md border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground">
                      {sm.nome} em todas as trocas
                    </button>
                  ))}
                </div>
              </>
            )}
            {(p.sons || []).length > 0 && (
              <div className="space-y-1 pt-1">
                {(p.sons || []).map((sm, i) => (
                  <div key={sm.id} className="flex items-center gap-2 text-[11px]">
                    <button onClick={() => irPara(sm.quando)} className="text-sky-300 hover:underline tabular-nums">
                      {fmt(sm.quando)}
                    </button>
                    <span className="text-foreground truncate flex-1">{sm.nome}</span>
                    <input type="range" min={0} max={150} step={5} value={Math.round((sm.volume ?? 0.8) * 100)}
                      onChange={(e) => mudar((d) => { (d.sons || [])[i].volume = Number(e.target.value) / 100 })}
                      className="w-20" title="volume" />
                    <button onClick={() => mudar((d) => { (d.sons || []).splice(i, 1) })}
                      className="text-muted-foreground hover:text-rose-300">×</button>
                  </div>
                ))}
                <button onClick={() => mudar((d) => { d.sons = [] })}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline">limpar todos</button>
              </div>
            )}
          </div>

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
            <div className="space-y-1">
              <span className="text-muted-foreground">Entrada da legenda</span>
              <div className="grid grid-cols-4 gap-1">
                {(['nenhuma', 'pop', 'subir', 'lado'] as const).map((a) => (
                  <Alternar key={a} ativo={leg.animacao === a} onClick={() => mudarLegenda({ animacao: a })}>
                    {a === 'nenhuma' ? 'Sem' : a === 'pop' ? 'Estala' : a === 'subir' ? 'Sobe' : 'Lado'}
                  </Alternar>
                ))}
              </div>
            </div>
            {p.musica_path && (
              <Faixa rotulo="Volume da trilha" valor={Math.round((p.musica_volume ?? 0.12) * 100)}
                min={0} max={60} passo={1} mostrar={(v) => `${v}%`}
                onChange={(v) => mudar((d) => { d.musica_volume = v / 100 })} />
            )}
            {leg.aberracao && (
              <Faixa rotulo="Força da aberração" valor={Math.round(leg.aberracao_forca * 1000) / 10} min={2} max={20} passo={0.5}
                mostrar={(v) => `${v}%`} onChange={(v) => mudarLegenda({ aberracao_forca: v / 100 })} />
            )}
            <div className="flex flex-wrap gap-1.5">
              <Alternar ativo={leg.caixa} onClick={() => mudarLegenda({ caixa: !leg.caixa })}>Caixa de fundo</Alternar>
              <Alternar ativo={leg.maiusculas} onClick={() => mudarLegenda({ maiusculas: !leg.maiusculas })}>MAIÚSCULAS</Alternar>
              <Alternar ativo={leg.aberracao} onClick={() => mudarLegenda({ aberracao: !leg.aberracao })}>Aberração</Alternar>
              <Alternar ativo={leg.brilho} onClick={() => mudarLegenda({ brilho: !leg.brilho })}>Brilho</Alternar>
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

            {/* onda da locução */}
            <div className="relative h-10 mb-1 border-b border-border/60 cursor-pointer"
              onClick={(e) => irPara((e.clientX - e.currentTarget.getBoundingClientRect().left) / pps)}>
              {picos ? (
                <div className="absolute inset-0 flex items-center gap-px overflow-hidden">
                  {picos.map((v, i) => (
                    <div key={i} className="shrink-0 bg-sky-400/50 rounded-[1px]"
                      style={{ width: Math.max(1, (p.duracao * pps) / picos.length - 1), height: `${Math.max(4, v * 100)}%` }} />
                  ))}
                </div>
              ) : (
                <span className="absolute left-2 top-2 text-[10px] text-muted-foreground">carregando a onda...</span>
              )}
            </div>

            {/* textos por cima */}
            {(p.textos || []).length > 0 && (
              <div className="relative h-6 mb-1">
                {(p.textos || []).map((x, i) => (
                  <div key={x.id} onClick={() => { setSel({ tipo: 'texto', i }); irPara(x.ini) }}
                    className={`absolute top-0 h-full rounded px-1.5 text-[10px] flex items-center overflow-hidden cursor-pointer border
                      ${sel?.tipo === 'texto' && sel.i === i ? 'border-amber-300 bg-amber-400/30' : 'border-amber-500/40 bg-amber-500/15'}`}
                    style={{ left: x.ini * pps, width: Math.max(10, (x.fim - x.ini) * pps - 1) }}
                    title={x.texto}>
                    <span className="truncate text-amber-100">{x.texto.split(/\r?\n/)[0]}</span>
                  </div>
                ))}
              </div>
            )}

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

            {/* efeitos sonoros */}
            {(p.sons || []).map((sm) => (
              <div key={sm.id} className="absolute top-6 h-3 w-0.5 bg-sky-400 pointer-events-none"
                style={{ left: sm.quando * pps }} title={sm.nome}>
                <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-sky-400" />
              </div>
            ))}

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
        <div className="grid grid-cols-4 gap-1">
          {(['nenhum', 'in', 'out', 'punch'] as const).map((z) => (
            <Alternar key={z} ativo={(tr.zoom || 'nenhum') === z} onClick={() => onMudar((x) => { x.zoom = z })}>
              {z === 'nenhum' ? 'Sem' : z === 'in' ? 'Fecha' : z === 'out' ? 'Abre' : 'Soco'}
            </Alternar>
          ))}
        </div>
        {tr.zoom && tr.zoom !== 'nenhum' && (
          <>
            <label className="flex items-center gap-2 pt-1">
              <span className="text-muted-foreground w-14 shrink-0">Força</span>
              <input type="range" min={2} max={40} step={1} className="w-full"
                value={Math.round((tr.zoom_forca ?? ZOOM_FORCA) * 100)}
                onChange={(e) => onMudar((x) => { x.zoom_forca = Number(e.target.value) / 100 })} />
              <span className="tabular-nums w-10 text-right">{Math.round((tr.zoom_forca ?? ZOOM_FORCA) * 100)}%</span>
            </label>
            <div className="grid grid-cols-5 gap-1">
              {(['centro', 'cima', 'baixo', 'esquerda', 'direita'] as const).map((d) => (
                <Alternar key={d} ativo={(tr.zoom_direcao || 'centro') === d}
                  onClick={() => onMudar((x) => { x.zoom_direcao = d })}>
                  {d === 'centro' ? 'Meio' : d === 'esquerda' ? 'Esq' : d === 'direita' ? 'Dir' : d === 'cima' ? 'Cima' : 'Baixo'}
                </Alternar>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="space-y-1">
        <span className="text-muted-foreground">Entrada</span>
        <div className="grid grid-cols-3 gap-1">
          {([['corte', 'Corte seco'], ['fade', 'Do preto'], ['flash', 'Flash'],
             ['whip', 'Chicote'], ['slide', 'Desliza'], ['zoom', 'Estoura'],
             ['glitch', 'Falha'], ['dissolve', 'Dissolve']] as const).map(([z, rot]) => (
            <Alternar key={z} ativo={(tr.transicao || 'corte') === z} onClick={() => onMudar((x) => { x.transicao = z })}>
              {rot}
            </Alternar>
          ))}
        </div>
        {TRANSICOES_CRUZADAS.includes(tr.transicao as Transicao) && (
          <p className="text-[11px] text-amber-300/80">
            Cruza os dois clipes — o vídeo inteiro é recomprimido e o render demora bem mais.
          </p>
        )}
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
