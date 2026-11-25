'use client'

import { useCallback, useEffect, useMemo, useRef, useState, MouseEvent, ReactNode } from 'react'
import {
  Loader2, Upload, Sparkles, Download, EyeOff, X, Check, Play, HelpCircle, Flag,
  ShieldOff, ShieldCheck, Undo2, Redo2, Trash2, Volume2, VolumeX, Music, FileAudio,
  Wand2, RefreshCw, Keyboard,
} from 'lucide-react'
import {
  PalavraBruta, Token, Edicao, paraTokens, emLinhas, emParagrafos, tokenNoTempo, fmtTempo,
  LIMIAR_DUVIDA, lerRedFlags, acharRedFlags, normalizar, SFX_EMBUTIDOS, EDICAO_PADRAO,
  fmtDb, montarSegmentos, Segmento,
} from '@/lib/censura'
import { MotorPrevia, decodificarSom } from '@/lib/censura-audio'

// Editor de Censura. Fluxo: sobe o vídeo → transcreve palavra por palavra →
// corrige/remove o que o Whisper errou → marca o que censurar (à mão ou pela
// lista de red flags) → escolhe o que acontece no áudio de cada trecho, com
// prévia ao vivo. Exportação vem na próxima fase.
//
// O vídeo toca do arquivo local (blob). A cópia no Storage só existe pra VPS
// baixar e é apagada no fim, como na Transcrição rápida.
//
// Todo o trabalho (transcrição, correções, marcas, edições) fica no
// navegador, na chave nome+tamanho do arquivo: recarregar ou reabrir o mesmo
// vídeo não refaz a transcrição, que leva minutos. Toda mudança passa por
// mudar(), que guarda o estado anterior pro Ctrl+Z.

const ACEITA = '.mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm'
const TETO_MB = 200
const CHAVE_FLAGS = 'censura:redflags'
const CHAVE_PADRAO = 'censura:padrao'
const chaveTrabalho = (f: File) => `censura:trabalho:${f.name}:${f.size}`

interface Trabalho { tokens: Token[]; marcas: number[]; ignoradas: number[]; edicoes: Record<number, Edicao> }
const VAZIO: Trabalho = { tokens: [], marcas: [], ignoradas: [], edicoes: {} }

function lerJson<T>(chave: string): T | null {
  try { const s = localStorage.getItem(chave); return s ? JSON.parse(s) as T : null } catch { return null }
}
function gravar(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor) } catch { /* cheio ou bloqueado: segue sem salvar */ }
}

export default function CensorPage() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [rodando, setRodando] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(0)
  const [segundos, setSegundos] = useState(0)
  const [ativo, setAtivo] = useState(-1)
  const [arrastando, setArrastando] = useState(false)
  const [duracao, setDuracao] = useState(0)

  // Trabalho + histórico (Ctrl+Z / Ctrl+Y).
  const [trab, setTrab] = useState<Trabalho>(VAZIO)
  const trabRef = useRef<Trabalho>(VAZIO)
  const passado = useRef<Trabalho[]>([])
  const futuro = useRef<Trabalho[]>([])
  const ultimaAcao = useRef({ chave: '', t: 0 })
  const [, setVersaoHist] = useState(0)

  const [sel, setSel] = useState<number[]>([])
  const [ancora, setAncora] = useState<number | null>(null)
  const [flagsTexto, setFlagsTexto] = useState('')
  const [padrao, setPadrao] = useState<Edicao>(EDICAO_PADRAO)
  const [rascunho, setRascunho] = useState('')
  const [previa, setPrevia] = useState(true)
  const [sons, setSons] = useState<string[]>([])

  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const somRef = useRef<HTMLInputElement>(null)
  const corrigirRef = useRef<HTMLInputElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)
  const cabecaRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const pararEm = useRef<number | null>(null)
  const motorRef = useRef<MotorPrevia | null>(null)
  const sonsRef = useRef<Map<string, AudioBuffer>>(new Map())
  const segsRef = useRef<Segmento[]>([])
  const previaRef = useRef(true)

  const { tokens, edicoes } = trab
  const vivos = useMemo(() => tokens.filter((t) => !t.removida), [tokens])
  const marcas = useMemo(() => new Set(trab.marcas), [trab.marcas])
  const ignoradas = useMemo(() => new Set(trab.ignoradas), [trab.ignoradas])
  const paragrafos = useMemo(() => emParagrafos(vivos), [vivos])
  const linhasLegenda = useMemo(() => emLinhas(vivos), [vivos])
  const ocorrencias = useMemo(() => acharRedFlags(vivos, lerRedFlags(flagsTexto)), [vivos, flagsTexto])
  const idsFlag = useMemo(() => new Set(ocorrencias.flatMap((o) => o.ids)), [ocorrencias])
  // Censurada = marcada à mão, ou red flag que o usuário não liberou.
  const censuradas = useMemo(() => {
    const s = new Set([...marcas].filter((id) => tokens[id] && !tokens[id].removida))
    idsFlag.forEach((id) => { if (!ignoradas.has(id)) s.add(id) })
    return s
  }, [marcas, idsFlag, ignoradas, tokens])
  const duvidas = useMemo(() => vivos.filter((t) => t.confidence < LIMIAR_DUVIDA && !t.corrigida), [vivos])
  const segs = useMemo(() => montarSegmentos(tokens, censuradas, edicoes, padrao), [tokens, censuradas, edicoes, padrao])
  const porFlag = useMemo(() => {
    const m = new Map<string, number[][]>()
    for (const o of ocorrencias) m.set(o.flag, [...(m.get(o.flag) || []), o.ids])
    return [...m.entries()]
  }, [ocorrencias])

  useEffect(() => { segsRef.current = segs }, [segs])
  useEffect(() => { previaRef.current = previa }, [previa])

  useEffect(() => {
    try { setFlagsTexto(localStorage.getItem(CHAVE_FLAGS) ?? '') } catch { /* sem storage */ }
    const p = lerJson<Edicao>(CHAVE_PADRAO)
    if (p) setPadrao({ ...EDICAO_PADRAO, ...p })
  }, [])
  useEffect(() => () => { clearInterval(timerRef.current); if (src) URL.revokeObjectURL(src) }, [src])
  useEffect(() => () => { motorRef.current?.fechar() }, [])

  useEffect(() => {
    if (!arquivo || !trab.tokens.length) return
    gravar(chaveTrabalho(arquivo), JSON.stringify(trab))
  }, [arquivo, trab])

  // ---------- histórico ----------
  /** Aplica uma mudança guardando o estado anterior. Mudanças com a mesma
   *  `chave` em menos de 0,8s viram um passo só (arrastar um slider não pode
   *  encher o Ctrl+Z de 50 passos). */
  const mudar = useCallback((fn: (t: Trabalho) => Trabalho, chave = '') => {
    const atual = trabRef.current
    const agora = Date.now()
    const agrupa = chave && ultimaAcao.current.chave === chave && agora - ultimaAcao.current.t < 800
    if (!agrupa) { passado.current.push(atual); if (passado.current.length > 200) passado.current.shift() }
    ultimaAcao.current = { chave, t: agora }
    futuro.current = []
    const novo = fn(atual)
    trabRef.current = novo; setTrab(novo); setVersaoHist((v) => v + 1)
  }, [])

  function substituir(novo: Trabalho) {
    passado.current = []; futuro.current = []; ultimaAcao.current = { chave: '', t: 0 }
    trabRef.current = novo; setTrab(novo); setVersaoHist((v) => v + 1)
  }

  const desfazer = useCallback(() => {
    const ant = passado.current.pop()
    if (!ant) return
    futuro.current.push(trabRef.current)
    ultimaAcao.current = { chave: '', t: 0 }
    trabRef.current = ant; setTrab(ant); setVersaoHist((v) => v + 1)
  }, [])

  const refazer = useCallback(() => {
    const prox = futuro.current.pop()
    if (!prox) return
    passado.current.push(trabRef.current)
    ultimaAcao.current = { chave: '', t: 0 }
    trabRef.current = prox; setTrab(prox); setVersaoHist((v) => v + 1)
  }, [])

  // ---------- player ----------
  // A cada quadro: palavra tocando, cabeça da linha do tempo, parada do
  // "Ouvir trecho" e o motor de prévia do áudio.
  useEffect(() => {
    if (!src) return
    let raf = 0
    const tick = () => {
      const v = videoRef.current
      if (v) {
        if (pararEm.current != null && v.currentTime >= pararEm.current) { v.pause(); pararEm.current = null }
        if (vivos.length) setAtivo((a) => { const i = tokenNoTempo(vivos, v.currentTime); const id = i < 0 ? -1 : vivos[i].id; return id === a ? a : id })
        if (cabecaRef.current && v.duration) cabecaRef.current.style.left = `${(v.currentTime / v.duration) * 100}%`
        if (motorRef.current?.video === v) motorRef.current.tick(segsRef.current, previaRef.current, sonsRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [vivos, src])

  /** O motor só pode nascer depois de um gesto do usuário (regra do navegador
   *  pra áudio), então nasce no primeiro play. */
  function aoTocar() {
    const v = videoRef.current
    if (!v) return
    if (motorRef.current?.video !== v) {
      motorRef.current?.fechar()
      try { motorRef.current = new MotorPrevia(v) } catch { motorRef.current = null }
    }
    motorRef.current?.retomar()
  }

  // Segue a palavra tocando no painel — só com o vídeo rodando, pra não
  // roubar a rolagem de quem está revisando outra parte.
  useEffect(() => {
    if (ativo < 0 || videoRef.current?.paused) return
    painelRef.current?.querySelector<HTMLElement>(`[data-t="${ativo}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [ativo])

  const unica = sel.length === 1 ? tokens[sel[0]] : null
  useEffect(() => { setRascunho(unica?.word ?? '') }, [unica?.id, unica?.word])

  // ---------- arquivo / transcrição ----------
  function escolher(f: File | null | undefined) {
    if (!f) return
    if (!/\.(mp4|mov|webm|m4v)$/i.test(f.name)) { setErro('Por enquanto: mp4, mov ou webm. MKV/AVI o navegador não toca — converta antes.'); return }
    if (f.size > TETO_MB * 1024 * 1024) { setErro(`${(f.size / 1048576).toFixed(0)}MB é grande demais — o teto aqui é ${TETO_MB}MB.`); return }
    const salvo = lerJson<Partial<Trabalho>>(chaveTrabalho(f))
    setErro(null); setEnviado(0); setSel([]); setAncora(null); setAtivo(-1); setDuracao(0)
    substituir({ ...VAZIO, ...salvo, edicoes: salvo?.edicoes ?? {} })
    setAviso(salvo?.tokens?.length ? 'Trabalho recuperado deste vídeo.' : null)
    setArquivo(f); setSrc(URL.createObjectURL(f))
  }

  function trocarVideo() {
    if (rodando) return
    videoRef.current?.pause()
    setSrc(null); setArquivo(null); substituir(VAZIO); setErro(null); setAviso(null); setSel([])
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
    if (trab.tokens.length && !confirm('Transcrever de novo apaga as correções e marcas deste vídeo. Continuar?')) return
    setRodando(true); setErro(null); setAviso(null); setSel([]); substituir(VAZIO)
    setSegundos(0); setEnviado(0)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    let caminho = ''
    try {
      setStatus('Enviando o vídeo')
      caminho = await subir(arquivo)
      setStatus('Mandando pra VPS')
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
          substituir({ ...VAZIO, tokens: ts }); setStatus(null); break
        }
        if (j?.status === 'erro') throw new Error(j.erro || 'Falha na transcrição.')
        if (j?.error) throw new Error(j.error)
        setStatus(j?.status === 'rodando' ? 'Transcrevendo palavra por palavra' : j?.status === 'fila' ? 'Na fila da VPS' : 'Processando')
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e)); setStatus(null)
    } finally {
      setRodando(false); clearInterval(timerRef.current)
      if (caminho) fetch(`/api/rastreador/transcrever-arquivo?caminho=${encodeURIComponent(caminho)}`, { method: 'DELETE' }).catch(() => {})
    }
  }

  // ---------- seleção ----------
  function seek(t: number) {
    const v = videoRef.current
    if (v) { pararEm.current = null; v.currentTime = Math.max(0, t) + 0.001 }
  }

  function rolarAte(id: number) {
    painelRef.current?.querySelector<HTMLElement>(`[data-t="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function selecionar(ids: number[], rolar = false) {
    if (!ids.length) return
    setSel(ids); setAncora(ids[0]); seek(tokens[ids[0]].start_time)
    if (rolar) rolarAte(ids[0])
  }

  function clicarPalavra(t: Token, e: MouseEvent) {
    if (e.shiftKey && ancora != null) {
      const [a, b] = ancora < t.id ? [ancora, t.id] : [t.id, ancora]
      setSel(vivos.filter((x) => x.id >= a && x.id <= b).map((x) => x.id))
      window.getSelection()?.removeAllRanges()
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setSel((s) => s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id].sort((x, y) => x - y))
      setAncora(t.id)
      return
    }
    selecionar([t.id])
  }

  // ---------- ações (todas passam pelo histórico) ----------
  function marcar(ids: number[], censurar: boolean) {
    mudar((t) => {
      const m = new Set(t.marcas), g = new Set(t.ignoradas)
      for (const id of ids) {
        if (idsFlag.has(id)) { if (censurar) g.delete(id); else g.add(id); m.delete(id) }
        else if (censurar) m.add(id); else m.delete(id)
      }
      return { ...t, marcas: [...m], ignoradas: [...g] }
    })
  }

  function corrigir(id: number, texto: string) {
    const limpo = texto.trim()
    if (!limpo || limpo === tokens[id]?.word) return
    mudar((t) => ({ ...t, tokens: t.tokens.map((x) => x.id === id ? { ...x, word: limpo, corrigida: true } : x) }))
  }

  /** Remove palavras que o Whisper inventou/duplicou ("rodando dando" →
   *  "rodando"). O tempo delas passa pra palavra anterior, senão um corte
   *  na anterior deixaria escapar o pedaço que sobrou. */
  function remover(ids: number[]) {
    if (!ids.length) return
    const alvo = new Set(ids)
    mudar((t) => {
      const ts = t.tokens.map((x) => ({ ...x }))
      for (const id of [...alvo].sort((a, b) => a - b)) {
        const r = ts[id]
        if (!r || r.removida) continue
        r.removida = true
        let j = id - 1
        while (j >= 0 && ts[j].removida) j--
        if (j >= 0) ts[j].end_time = Math.max(ts[j].end_time, r.end_time)
        else {
          let k = id + 1
          while (k < ts.length && (ts[k].removida || alvo.has(k))) k++
          if (k < ts.length) ts[k].start_time = Math.min(ts[k].start_time, r.start_time)
        }
      }
      const ed = { ...t.edicoes }; alvo.forEach((id) => delete ed[id])
      return { ...t, tokens: ts, marcas: t.marcas.filter((id) => !alvo.has(id)), edicoes: ed }
    })
    setSel([])
  }

  function editarAudio(ids: number[], parcial: Partial<Edicao>, chave: string) {
    mudar((t) => {
      const ed = { ...t.edicoes }
      for (const id of ids) ed[id] = { ...(ed[id] ?? padrao), ...parcial }
      return { ...t, edicoes: ed }
    }, chave)
  }

  /** Mesma edição pra toda ocorrência censurada das mesmas palavras. */
  function aplicarATodas(ids: number[], ed: Edicao) {
    const palavras = new Set(ids.map((id) => normalizar(tokens[id].word)))
    const alvo = [...censuradas].filter((id) => palavras.has(normalizar(tokens[id].word)))
    editarAudio(alvo, ed, '')
    return alvo.length
  }

  function usarComoPadrao(ed: Edicao) { setPadrao(ed); gravar(CHAVE_PADRAO, JSON.stringify(ed)) }

  async function enviarSom(f: File | null | undefined, ids: number[]) {
    if (!f) return
    try {
      const buf = await decodificarSom(f)
      const id = `arq:${f.name}`
      sonsRef.current.set(id, buf)
      setSons((s) => s.includes(id) ? s : [...s, id])
      editarAudio(ids, { sfx: id }, '')
    } catch { setErro('Não consegui ler esse áudio — use mp3 ou wav.') }
  }

  function proximaDuvida(apos = -1) {
    const prox = duvidas.find((t) => t.id > apos) ?? duvidas.find((t) => t.id !== apos)
    if (!prox) return
    selecionar([prox.id], true)
    setTimeout(() => corrigirRef.current?.select(), 60)
  }

  function salvarCorrecao() {
    if (!unica) return
    corrigir(unica.id, rascunho)
    if (duvidas.some((t) => t.id !== unica.id)) proximaDuvida(unica.id)
  }

  function ouvir(ids: number[]) {
    const v = videoRef.current
    if (!v || !ids.length) return
    const ini = tokens[ids[0]].start_time, fim = tokens[ids[ids.length - 1]].end_time
    v.currentTime = Math.max(0, ini - 0.7)
    pararEm.current = fim + 0.7
    v.play().catch(() => {})
  }

  function baixarJson() {
    const nome = (arquivo?.name || 'video').replace(/\.[^.]+$/, '')
    const corpo = { video: arquivo?.name, transcript: vivos, segmentos: segs }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(corpo, null, 2)], { type: 'application/json' }))
    a.download = `${nome}-censura.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // Atalhos: Ctrl+Z / Ctrl+Y desfazem/refazem, Delete remove, Esc limpa a
  // seleção. Dentro de um campo de texto, o Ctrl+Z é o do próprio campo.
  const selRef = useRef(sel); useEffect(() => { selRef.current = sel }, [sel])
  const removerRef = useRef(remover); useEffect(() => { removerRef.current = remover })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (alvo?.closest('input, textarea, select, [contenteditable=true]')) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer() }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); refazer() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selRef.current.length) { e.preventDefault(); removerRef.current(selRef.current) }
      else if (e.key === 'Escape') setSel([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desfazer, refazer])

  const linhaAtual = useMemo(() => {
    if (ativo < 0) return null
    return linhasLegenda.find((l) => l.tokens[0].id <= ativo && l.tokens[l.tokens.length - 1].id >= ativo) || null
  }, [linhasLegenda, ativo])

  const selSet = useMemo(() => new Set(sel), [sel])
  const selCensuradas = sel.filter((id) => censuradas.has(id))
  const selTodasCensuradas = sel.length > 0 && selCensuradas.length === sel.length
  const edSel: Edicao | null = selCensuradas.length ? (edicoes[selCensuradas[0]] ?? padrao) : null
  const podeDesfazer = passado.current.length > 0
  const podeRefazer = futuro.current.length > 0

  // ================= tela de envio =================
  if (!src) {
    return (
      <div className="max-w-2xl mx-auto py-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mx-auto"><EyeOff className="w-6 h-6" /></div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Editor de Censura</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Transcreva o vídeo palavra por palavra, marque o que censurar e escolha o que acontece no áudio de cada trecho.</p>
        </div>
        <input ref={inputRef} type="file" accept={ACEITA} className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]) }}
          className={`w-full rounded-2xl border-2 border-dashed px-6 py-16 text-center transition group ${arrastando ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50 hover:bg-primary/[0.03]'}`}>
          <Upload className="w-7 h-7 text-muted-foreground group-hover:text-primary mx-auto mb-3 transition" />
          <p className="text-sm font-semibold text-foreground">Arraste o vídeo aqui ou clique pra escolher</p>
          <p className="text-xs text-muted-foreground mt-1.5">mp4, mov ou webm · até {TETO_MB}MB</p>
        </button>
        <p className="text-xs text-muted-foreground text-center">Já trabalhou nesse vídeo antes? Abra o mesmo arquivo e tudo volta como estava.</p>
        {erro && <p className="text-xs text-rose-300 text-center">{erro}</p>}
      </div>
    )
  }

  // ================= editor =================
  return (
    <div className="max-w-[1680px] mx-auto py-1 space-y-3">
      {/* Barra de ferramentas */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-3 py-2">
        <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0"><EyeOff className="w-4 h-4" /></div>
        <div className="min-w-0 mr-auto">
          <p className="text-sm font-bold text-foreground leading-tight">Editor de Censura</p>
          <p className="text-[11px] text-muted-foreground truncate leading-tight" title={arquivo?.name}>{arquivo?.name} · {((arquivo?.size || 0) / 1048576).toFixed(1)} MB{aviso && <span className="text-emerald-400"> · {aviso}</span>}</p>
        </div>
        <BotaoIcone titulo="Desfazer (Ctrl+Z)" onClick={desfazer} disabled={!podeDesfazer}><Undo2 className="w-4 h-4" /></BotaoIcone>
        <BotaoIcone titulo="Refazer (Ctrl+Y)" onClick={refazer} disabled={!podeRefazer}><Redo2 className="w-4 h-4" /></BotaoIcone>
        <span className="w-px h-6 bg-border mx-1" />
        {tokens.length > 0 && (
          <BotaoIcone titulo="Transcrever de novo" onClick={transcrever} disabled={rodando}><RefreshCw className="w-4 h-4" /></BotaoIcone>
        )}
        {tokens.length > 0 && <BotaoIcone titulo="Baixar JSON" onClick={baixarJson}><Download className="w-4 h-4" /></BotaoIcone>}
        <button onClick={trocarVideo} disabled={rodando}
          className="h-8 px-3 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1.5 disabled:opacity-40">
          <X className="w-3.5 h-3.5" /> Trocar vídeo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)_340px] gap-3 items-start">
        {/* ---------- Vídeo ---------- */}
        <div className="lg:sticky lg:top-3 space-y-2">
          <div className="relative bg-black rounded-2xl overflow-hidden border border-border">
            <video ref={videoRef} src={src} controls playsInline onPlay={aoTocar}
              onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration || 0)}
              className="w-full max-h-[64vh] block mx-auto" />
            {linhaAtual && (
              <div className="pointer-events-none absolute inset-x-0 bottom-[17%] flex justify-center px-3">
                <p className="max-w-[94%] text-center text-[13px] font-bold leading-snug bg-black/75 text-white px-2.5 py-1 rounded-md">
                  {linhaAtual.tokens.map((t) => (
                    <span key={t.id} className={`${t.id === ativo ? 'text-amber-300' : ''} ${censuradas.has(t.id) ? 'blur-[5px]' : ''}`}>{t.word} </span>
                  ))}
                </p>
              </div>
            )}
          </div>

          {/* Linha do tempo: trechos censurados em vermelho. */}
          {tokens.length > 0 && duracao > 0 && (
            <div className="bg-card border border-border rounded-2xl p-3 space-y-2.5">
              <div
                className="relative h-7 rounded-md bg-white/[0.04] cursor-pointer overflow-hidden"
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duracao) }}>
                {segs.map((s) => (
                  <button key={`${s.ini}`} title={s.ids.map((id) => tokens[id].word).join(' ')}
                    onClick={(e) => { e.stopPropagation(); selecionar(s.ids, true) }}
                    className="absolute top-1 bottom-1 rounded-sm bg-rose-500/80 hover:bg-rose-400 min-w-[3px]"
                    style={{ left: `${(s.ini / duracao) * 100}%`, width: `${((s.fim - s.ini) / duracao) * 100}%` }} />
                ))}
                <div ref={cabecaRef} className="absolute top-0 bottom-0 w-0.5 bg-primary pointer-events-none" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{segs.length} {segs.length === 1 ? 'trecho censurado' : 'trechos censurados'}</p>
                <button onClick={() => setPrevia((p) => !p)} className="inline-flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
                  {previa ? 'Ouvindo com edições' : 'Ouvindo o original'}
                  <span className={`w-8 h-[18px] rounded-full relative transition ${previa ? 'bg-primary' : 'bg-white/15'}`}>
                    <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${previa ? 'left-[16px]' : 'left-[2px]'}`} />
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---------- Transcrição ---------- */}
        <div className="bg-card border border-border rounded-2xl flex flex-col lg:h-[calc(100vh-150px)] min-w-0 overflow-hidden">
          {!tokens.length ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                {rodando ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              </div>
              <div className="space-y-1">
                <p className="text-base text-foreground font-bold">{rodando ? (status || 'Processando') : 'Pronto pra transcrever'}</p>
                <p className="text-sm text-muted-foreground max-w-sm">{rodando ? `${Math.floor(segundos / 60)}m ${String(segundos % 60).padStart(2, '0')}s · um criativo de 1–2 min leva uns 2–4 min` : 'O transcritor da VPS pega o tempo exato de cada palavra.'}</p>
              </div>
              {rodando && enviado > 0 && enviado < 1 && (
                <div className="w-64 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${enviado * 100}%` }} /></div>
              )}
              {!rodando && (
                <button onClick={transcrever} className="px-6 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 bg-primary text-white hover:opacity-90">
                  <Sparkles className="w-4 h-4" /> Transcrever
                </button>
              )}
              {erro && <p className="text-xs text-rose-300 max-w-md">{erro}</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-wrap">
                <p className="text-sm font-bold text-foreground mr-auto">Transcrição</p>
                <Chip>{vivos.length} palavras</Chip>
                <Chip tom="rose">{censuradas.size} censuradas</Chip>
                {duvidas.length > 0 ? (
                  <button onClick={() => proximaDuvida(sel[0] ?? -1)}
                    className="h-7 px-2.5 rounded-full text-[11px] font-bold bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 inline-flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" /> Revisar {duvidas.length} {duvidas.length === 1 ? 'dúvida' : 'dúvidas'}
                  </button>
                ) : <Chip tom="emerald"><Check className="w-3 h-3" /> sem dúvidas</Chip>}
              </div>

              <div ref={painelRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 select-none">
                {paragrafos.map((p, i) => (
                  <div key={i} className="group">
                    <button onClick={() => selecionar([p.tokens[0].id])}
                      className="text-[10px] font-semibold tabular-nums text-muted-foreground/70 hover:text-primary mb-1 block">{fmtTempo(p.start)}</button>
                    <p className="text-[16px] leading-[2.1] text-foreground/85">
                      {p.tokens.map((t) => {
                        const duvida = t.confidence < LIMIAR_DUVIDA && !t.corrigida
                        const cens = censuradas.has(t.id)
                        const s = selSet.has(t.id)
                        return (
                          <span key={t.id} data-t={t.id} onClick={(e) => clicarPalavra(t, e)}
                            title={`${fmtTempo(t.start_time)} · confiança ${Math.round(t.confidence * 100)}%${t.corrigida ? ' · corrigida' : ''}`}
                            className={`cursor-pointer rounded-[5px] px-[3px] py-[2px] transition-colors ${
                              s ? 'bg-primary text-white'
                                : cens ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                                  : 'hover:bg-white/[0.07]'
                            } ${t.id === ativo && !s ? 'shadow-[inset_0_-2px_0_0_#fcd34d] text-foreground' : ''} ${
                              duvida && !s ? 'underline decoration-dotted decoration-amber-300/80 decoration-2 underline-offset-[5px]' : ''} ${
                              idsFlag.has(t.id) && !cens && !s ? 'line-through decoration-orange-400/60' : ''}`}>
                            {t.word}
                          </span>
                        )
                      }).reduce<ReactNode[]>((acc, el, k) => (k ? [...acc, ' ', el] : [el]), [])}
                    </p>
                  </div>
                ))}
              </div>

              {/* Barra da seleção — as ações ficam onde o olho já está. */}
              <div className="border-t border-border px-4 py-2.5 bg-white/[0.02]">
                {sel.length ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-foreground min-w-0 flex-1 truncate">
                      <b>{sel.length === 1 ? '1 palavra' : `${sel.length} palavras`}</b>
                      <span className="text-muted-foreground"> · “{sel.slice(0, 12).map((id) => tokens[id].word).join(' ')}{sel.length > 12 ? '…' : ''}” · {fmtTempo(tokens[sel[0]].start_time)}</span>
                    </p>
                    <AcaoBarra onClick={() => ouvir(sel)}><Play className="w-3.5 h-3.5" /> Ouvir</AcaoBarra>
                    {selTodasCensuradas
                      ? <AcaoBarra onClick={() => marcar(sel, false)}><ShieldOff className="w-3.5 h-3.5" /> Liberar</AcaoBarra>
                      : <AcaoBarra tom="rose" onClick={() => marcar(sel, true)}><ShieldCheck className="w-3.5 h-3.5" /> Censurar</AcaoBarra>}
                    <AcaoBarra onClick={() => remover(sel)} titulo="Apaga da transcrição (Delete)"><Trash2 className="w-3.5 h-3.5" /> Remover</AcaoBarra>
                    <button onClick={() => setSel([])} title="Limpar seleção (Esc)" className="w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <Keyboard className="w-3.5 h-3.5" /> Clique numa palavra · <Kbd>Shift</Kbd> trecho · <Kbd>Ctrl</Kbd> soma · <Kbd>Delete</Kbd> remove · <Kbd>Ctrl Z</Kbd> desfaz
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ---------- Propriedades ---------- */}
        <div className="2xl:sticky 2xl:top-3 lg:col-span-2 2xl:col-span-1 2xl:max-h-[calc(100vh-150px)] 2xl:overflow-y-auto grid sm:grid-cols-2 2xl:grid-cols-1 gap-3 items-start">
          {/* Palavra */}
          <Secao titulo="Palavra" icone={<Wand2 className="w-3.5 h-3.5" />}>
            {!tokens.length ? (
              <Vazio>Depois da transcrição, clique numa palavra pra corrigir, remover ou censurar.</Vazio>
            ) : !unica ? (
              <Vazio>{sel.length > 1 ? `${sel.length} palavras selecionadas — a correção de texto é uma de cada vez.` : 'Clique numa palavra da transcrição.'}</Vazio>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <p className="text-2xl font-black text-foreground break-words mr-auto leading-tight">{unica.word}</p>
                  {unica.confidence < LIMIAR_DUVIDA && !unica.corrigida && <Chip tom="amber">dúvida {Math.round(unica.confidence * 100)}%</Chip>}
                  {unica.corrigida && <Chip tom="emerald">corrigida</Chip>}
                </div>
                <p className="text-xs tabular-nums text-muted-foreground -mt-1">{fmtTempo(unica.start_time)} → {fmtTempo(unica.end_time)} · confiança {Math.round(unica.confidence * 100)}%</p>
                <div className="flex gap-1.5">
                  <input ref={corrigirRef} value={rascunho} onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') salvarCorrecao(); if (e.key === 'Escape') setRascunho(unica.word) }}
                    placeholder="texto certo"
                    className="flex-1 min-w-0 h-9 px-3 rounded-lg text-sm bg-background border border-border text-foreground focus:border-primary/60 outline-none" />
                  <button onClick={salvarCorrecao} disabled={!rascunho.trim() || rascunho.trim() === unica.word} title="Salvar (Enter)"
                    className="w-9 h-9 rounded-lg bg-primary text-white disabled:opacity-30 inline-flex items-center justify-center"><Check className="w-4 h-4" /></button>
                </div>
                <p className="text-[11px] text-muted-foreground"><Kbd>Enter</Kbd> salva e vai pra próxima dúvida. Palavra a mais? <button onClick={() => remover([unica.id])} className="text-foreground underline underline-offset-2 hover:text-rose-300">Remover</button></p>
              </div>
            )}
          </Secao>

          {/* Áudio */}
          <Secao titulo="Áudio" icone={<Volume2 className="w-3.5 h-3.5" />}>
            {!edSel ? (
              <Vazio>{sel.length ? 'Censure a seleção pra escolher o que acontece no áudio.' : 'Selecione uma palavra censurada (em vermelho) pra editar o áudio dela.'}</Vazio>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">Efeito sonoro</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[...SFX_EMBUTIDOS.map((s) => ({ id: s.id as string, nome: s.nome as string })), ...sons.map((id) => ({ id, nome: id.slice(4) }))].map((s) => (
                      <button key={s.id} onClick={() => editarAudio(selCensuradas, { sfx: s.id }, '')} title={s.nome}
                        className={`h-8 px-2 rounded-lg text-[11px] font-semibold truncate border transition ${edSel.sfx === s.id ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
                        {s.nome}
                      </button>
                    ))}
                    <button onClick={() => somRef.current?.click()}
                      className="h-8 px-2 rounded-lg text-[11px] font-semibold border border-dashed border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1">
                      <FileAudio className="w-3.5 h-3.5" /> Enviar
                    </button>
                  </div>
                  <input ref={somRef} type="file" accept="audio/*,.mp3,.wav" className="hidden"
                    onChange={(e) => { enviarSom(e.target.files?.[0], selCensuradas); e.target.value = '' }} />
                  {edSel.sfx.startsWith('arq:') && !sons.includes(edSel.sfx) && (
                    <p className="text-[11px] text-amber-300 mt-1.5">Som “{edSel.sfx.slice(4)}” não está carregado — envie de novo.</p>
                  )}
                </div>

                {edSel.sfx !== 'nenhum' && (
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/[0.04]">
                    {([['substituir', 'Substituir', 'some a voz'], ['sobrepor', 'Sobrepor', 'voz + efeito']] as const).map(([v, r, n]) => (
                      <button key={v} onClick={() => editarAudio(selCensuradas, { modo: v }, '')}
                        className={`rounded-md py-1.5 text-center transition ${edSel.modo === v ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        <span className="block text-xs font-bold">{r}</span><span className="block text-[10px] opacity-70">{n}</span>
                      </button>
                    ))}
                  </div>
                )}

                {(edSel.sfx === 'nenhum' || edSel.modo === 'sobrepor') && (
                  <Slider rotulo="Volume da voz" icone={edSel.db <= -60 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    valor={edSel.db} min={-60} max={6} texto={fmtDb(edSel.db)}
                    onChange={(v) => editarAudio(selCensuradas, { db: v }, 'db')} />
                )}
                {edSel.sfx !== 'nenhum' && (
                  <Slider rotulo="Volume do efeito" icone={<Music className="w-3.5 h-3.5" />}
                    valor={edSel.sfxDb} min={-30} max={6} texto={fmtDb(edSel.sfxDb)}
                    onChange={(v) => editarAudio(selCensuradas, { sfxDb: v }, 'sfxDb')} />
                )}

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button onClick={() => { if (previa) ouvir(selCensuradas); else { setPrevia(true); ouvir(selCensuradas) } }}
                    className="h-9 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 inline-flex items-center justify-center gap-1.5 col-span-2">
                    <Play className="w-3.5 h-3.5" /> Ouvir com a edição
                  </button>
                  <button onClick={() => { const n = aplicarATodas(selCensuradas, edSel); setAviso(`Aplicado em ${n} ${n === 1 ? 'trecho' : 'trechos'}.`) }}
                    className="h-8 rounded-lg text-[11px] font-semibold border border-border text-foreground/90 hover:bg-white/5">
                    Aplicar em todas iguais
                  </button>
                  <button onClick={() => { usarComoPadrao(edSel); setAviso('Virou o padrão das novas censuras.') }}
                    className="h-8 rounded-lg text-[11px] font-semibold border border-border text-foreground/90 hover:bg-white/5">
                    Usar como padrão
                  </button>
                </div>
              </div>
            )}
          </Secao>

          {/* Red flags */}
          <Secao titulo="Red flags" icone={<Flag className="w-3.5 h-3.5" />}>
            <div className="space-y-3">
              <textarea value={flagsTexto} onChange={(e) => { setFlagsTexto(e.target.value); gravar(CHAVE_FLAGS, e.target.value) }} rows={4}
                placeholder={'uma por linha\nrenda extra\nganh*   ← ganhar, ganhei...'}
                className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border text-foreground focus:border-primary/60 outline-none resize-y font-mono leading-relaxed" />
              <p className="text-[11px] text-muted-foreground -mt-1">Toda ocorrência já entra censurada. Libere as que quiser manter.</p>
              {tokens.length > 0 && (porFlag.length ? (
                <div className="space-y-2.5">
                  {porFlag.map(([flag, ocs]) => (
                    <div key={flag}>
                      <p className="text-xs font-bold text-foreground">{flag} <span className="text-muted-foreground font-normal">· {ocs.length}×</span></p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ocs.map((ids) => {
                          const liberada = ids.every((id) => ignoradas.has(id))
                          return (
                            <button key={ids[0]} onClick={() => selecionar(ids, true)}
                              className={`h-6 px-2 rounded-md text-[11px] tabular-nums border transition ${liberada ? 'border-border text-muted-foreground line-through' : 'border-rose-400/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'}`}>
                              {fmtTempo(tokens[ids[0]].start_time)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : flagsTexto.trim() ? <Vazio>Nenhuma palavra da lista aparece neste vídeo.</Vazio> : null)}
            </div>
          </Secao>
        </div>
      </div>
    </div>
  )
}

// ---------- peças de UI ----------

function Secao({ titulo, icone, children }: { titulo: string; icone: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5 mb-3">{icone} {titulo}</p>
      {children}
    </div>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
}

function Chip({ children, tom }: { children: ReactNode; tom?: 'rose' | 'amber' | 'emerald' }) {
  const cor = tom === 'rose' ? 'bg-rose-500/15 text-rose-200' : tom === 'amber' ? 'bg-amber-400/15 text-amber-200' : tom === 'emerald' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/[0.06] text-muted-foreground'
  return <span className={`h-7 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${cor}`}>{children}</span>
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="px-1.5 py-[1px] rounded border border-border bg-white/[0.04] text-[10px] font-sans text-foreground/80">{children}</kbd>
}

function BotaoIcone({ titulo, onClick, disabled, children }: { titulo: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} title={titulo} aria-label={titulo}
      className="w-8 h-8 rounded-lg text-foreground/80 hover:text-foreground hover:bg-white/[0.06] inline-flex items-center justify-center disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  )
}

function AcaoBarra({ onClick, children, tom, titulo }: { onClick: () => void; children: ReactNode; tom?: 'rose'; titulo?: string }) {
  return (
    <button onClick={onClick} title={titulo}
      className={`h-7 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition ${tom === 'rose' ? 'bg-rose-500 text-white hover:bg-rose-400' : 'border border-border text-foreground/90 hover:bg-white/[0.06]'}`}>
      {children}
    </button>
  )
}

function Slider({ rotulo, icone, valor, min, max, texto, onChange }: {
  rotulo: string; icone: ReactNode; valor: number; min: number; max: number; texto: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">{icone} {rotulo}</span>
        <span className="text-[11px] font-bold text-foreground tabular-nums">{texto}</span>
      </div>
      <input type="range" min={min} max={max} step={1} value={valor} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary" />
    </div>
  )
}
