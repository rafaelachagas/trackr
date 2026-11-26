'use client'

import { useCallback, useEffect, useMemo, useRef, useState, MouseEvent, PointerEvent, ReactNode } from 'react'
import {
  Loader2, Upload, Sparkles, Download, EyeOff, X, Check, Play, HelpCircle, Flag,
  ShieldOff, ShieldCheck, Undo2, Redo2, Trash2, Volume2, VolumeX, Music, FileAudio,
  Wand2, RefreshCw, Keyboard, FolderOpen, Cloud, CloudOff, Film, Plus, AlertTriangle, ChevronDown, MessageSquarePlus, Pause, Maximize, RotateCcw, RotateCw,
} from 'lucide-react'
import {
  PalavraBruta, Token, Edicao, paraTokens, emLinhas, emParagrafos, tokenNoTempo, fmtTempo,
  LIMIAR_DUVIDA, lerRedFlags, normalizar, SFX_EMBUTIDOS, EDICAO_PADRAO,
  fmtDb, montarSegmentos, Segmento, inserirPalavras,
} from '@/lib/censura'
import { MotorPrevia, decodificarSom } from '@/lib/censura-audio'
import {
  Risco, Gravidade, GRAVIDADES, NOME_GRAVIDADE, BibliotecaExtra, aplicarExtra, censuraSozinho, autoCensura, riscosLocais, riscoPorPalavra,
} from '@/lib/censura-riscos'

// Editor de Censura. Fluxo: sobe o vídeo → transcreve palavra por palavra →
// corrige/remove o que o Whisper errou → marca o que censurar (à mão ou pela
// lista de red flags) → escolhe o que acontece no áudio de cada trecho, com
// prévia ao vivo. Exportação vem na próxima fase.
//
// Cada vídeo vira um PROJETO no servidor (lib/censura-projetos.ts): o vídeo
// sobe uma vez só, a transcrição e todas as mudanças salvam sozinhas, e a tela
// inicial lista os projetos pra reabrir de qualquer computador — sem subir e
// transcrever de novo. A URL leva ?p=<id>, então recarregar a página mantém o
// projeto aberto. O navegador também guarda uma cópia (nome+tamanho do
// arquivo) como reserva.
//
// Toda mudança passa por mudar(), que guarda o estado anterior pro Ctrl+Z.

const ACEITA = '.mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm'
const TETO_MB = 200
const CHAVE_FLAGS = 'censura:redflags'
const CHAVE_PADRAO = 'censura:padrao'
const CHAVE_DESLIGADAS = 'censura:categorias-desligadas'
const CHAVE_MOTIVOS = 'censura:motivos-meta'
const chaveTrabalho = (f: File) => `censura:trabalho:${f.name}:${f.size}`

/** riscos = o que a IA achou (a biblioteca e a lista são recalculadas na hora). */
interface Trabalho { tokens: Token[]; marcas: number[]; ignoradas: number[]; edicoes: Record<number, Edicao>; riscos?: Risco[]; analisadoEm?: string }
interface MetaProjeto { id: string; nome: string; tamanho: number; video: string; criado: string; atualizado: string; palavras: number; censuradas: number }
type EstadoSalvo = 'salvo' | 'salvando' | 'erro' | null

function quando(iso: string): string {
  const d = new Date(iso), min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function urlComProjeto(id: string | null) {
  const u = new URL(window.location.href)
  if (id) u.searchParams.set('p', id); else u.searchParams.delete('p')
  window.history.replaceState(null, '', u.toString())
}
const VAZIO: Trabalho = { tokens: [], marcas: [], ignoradas: [], edicoes: {} }

function lerJson<T>(chave: string): T | null {
  try { const s = localStorage.getItem(chave); return s ? JSON.parse(s) as T : null } catch { return null }
}
function gravar(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor) } catch { /* cheio ou bloqueado: segue sem salvar */ }
}

export default function CensorPage() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  // Projeto no servidor. `info` existe com ou sem o arquivo local (projeto
  // reaberto pela lista não tem File, só a URL do vídeo).
  const [projId, setProjId] = useState<string | null>(null)
  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [info, setInfo] = useState<{ nome: string; tamanho: number } | null>(null)
  const [projetos, setProjetos] = useState<MetaProjeto[] | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [estadoSalvo, setEstadoSalvo] = useState<EstadoSalvo>(null)
  const ultimoSalvo = useRef('')
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
  /** Menu do botão direito numa palavra. */
  const [menu, setMenu] = useState<{ x: number; y: number; ids: number[]; obs?: boolean } | null>(null)
  /** Termos que o revisor semanal/você aprovaram por cima da biblioteca fixa. */
  const [extra, setExtra] = useState<BibliotecaExtra | null>(null)
  const [ancora, setAncora] = useState<number | null>(null)
  const [flagsTexto, setFlagsTexto] = useState('')
  const [desligadas, setDesligadas] = useState<string[]>([])
  const [motivos, setMotivos] = useState('')
  const [analisando, setAnalisando] = useState(false)
  const [erroIA, setErroIA] = useState<string | null>(null)
  const [padrao, setPadrao] = useState<Edicao>(EDICAO_PADRAO)
  const [rascunho, setRascunho] = useState('')
  const [novaPalavra, setNovaPalavra] = useState('')
  const [tocando, setTocando] = useState(false)
  const [velocidade, setVelocidade] = useState(1)
  const [volume, setVolume] = useState(1)
  const [mudo, setMudo] = useState(false)
  const [hover, setHover] = useState<{ t: number; palavras: string } | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const tempoRef = useRef<HTMLSpanElement>(null)
  const progressoRef = useRef<HTMLDivElement>(null)
  const arrasto = useRef<{ x: number; tocava: boolean; moveu: boolean } | null>(null)
  const adicionarRef = useRef<HTMLInputElement>(null)
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
  // Riscos: IA (salvos no projeto) + biblioteca e lista (recalculadas). Alto e
  // muito alto entram censurados sozinhos — `idsFlag` —, o usuário libera.
  const bib = useMemo(() => aplicarExtra(extra), [extra])
  const ligadas = useMemo(() => new Set(bib.map((c) => c.id).filter((id) => !desligadas.includes(id))), [bib, desligadas])
  const riscosLocal = useMemo(() => riscosLocais(vivos, ligadas, flagsTexto, bib), [vivos, ligadas, flagsTexto, bib])
  const todosRiscos = useMemo(() => [
    ...(trab.riscos || []).filter((r) => r.ids.every((id) => tokens[id] && !tokens[id].removida)),
    ...riscosLocal,
  ], [trab.riscos, riscosLocal, tokens])
  const riscoDe = useMemo(() => riscoPorPalavra(todosRiscos), [todosRiscos])
  // Frase em que "só o bip não resolve" não é bipada inteira: fica destacada
  // pra regravar. O que der pra bipar dentro dela (marca, valor) vem das
  // outras fontes.
  const idsFlag = useMemo(() => new Set(todosRiscos.filter((r) => autoCensura(r)).flatMap((r) => r.ids)), [todosRiscos])
  // Lista do painel: um item por trecho, o mais grave quando há repetição.
  const listaRiscos = useMemo(() => {
    const m = new Map<string, Risco>()
    for (const r of todosRiscos) {
      const k = r.ids.join(',')
      const a = m.get(k)
      if (!a || GRAVIDADES.indexOf(r.gravidade) < GRAVIDADES.indexOf(a.gravidade) || (r.fonte === 'ia' && a.fonte !== 'ia' && r.gravidade === a.gravidade)) m.set(k, r)
    }
    return [...m.values()].sort((a, b) => GRAVIDADES.indexOf(a.gravidade) - GRAVIDADES.indexOf(b.gravidade) || a.ids[0] - b.ids[0])
  }, [todosRiscos])
  // Censurada = marcada à mão, ou red flag que o usuário não liberou.
  const censuradas = useMemo(() => {
    const s = new Set([...marcas].filter((id) => tokens[id] && !tokens[id].removida))
    idsFlag.forEach((id) => { if (!ignoradas.has(id)) s.add(id) })
    return s
  }, [marcas, idsFlag, ignoradas, tokens])
  const duvidas = useMemo(() => vivos.filter((t) => t.confidence < LIMIAR_DUVIDA && !t.corrigida), [vivos])
  const segs = useMemo(() => montarSegmentos(tokens, censuradas, edicoes, padrao), [tokens, censuradas, edicoes, padrao])

  useEffect(() => { segsRef.current = segs }, [segs])
  useEffect(() => { previaRef.current = previa }, [previa])

  useEffect(() => {
    try {
      setFlagsTexto(localStorage.getItem(CHAVE_FLAGS) ?? '')
      setMotivos(localStorage.getItem(CHAVE_MOTIVOS) ?? '')
    } catch { /* sem storage */ }
    const d = lerJson<string[]>(CHAVE_DESLIGADAS)
    if (Array.isArray(d)) setDesligadas(d)
    fetch('/api/censura/exemplos').then((r) => r.json()).then((j) => { if (j?.extra) setExtra(j.extra) }).catch(() => {})
    const p = lerJson<Edicao>(CHAVE_PADRAO)
    if (p) setPadrao({ ...EDICAO_PADRAO, ...p })
  }, [])
  useEffect(() => () => { clearInterval(timerRef.current); if (src) URL.revokeObjectURL(src) }, [src])
  useEffect(() => () => { motorRef.current?.fechar() }, [])

  useEffect(() => {
    if (!arquivo || !trab.tokens.length) return
    gravar(chaveTrabalho(arquivo), JSON.stringify(trab))
  }, [arquivo, trab])

  // Salva no servidor 1s depois da última mudança. Só manda o que mudou
  // desde o último envio (abrir um projeto não conta como mudança).
  const nCensuradas = useRef(0)
  useEffect(() => { nCensuradas.current = censuradas.size }, [censuradas])
  useEffect(() => {
    if (!projId || !trab.tokens.length) return
    const corpo = JSON.stringify(trab)
    if (corpo === ultimoSalvo.current) return
    setEstadoSalvo('salvando')
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/censura/projetos/${projId}`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ trab, resumo: { palavras: trab.tokens.filter((x) => !x.removida).length, censuradas: nCensuradas.current } }),
        })
        if (!r.ok) throw new Error()
        ultimoSalvo.current = corpo; setEstadoSalvo('salvo')
      } catch { setEstadoSalvo('erro') }
    }, 1000)
    return () => clearTimeout(t)
  }, [projId, trab])

  // Fechar a aba com mudança ainda não salva: o navegador pergunta antes.
  useEffect(() => {
    if (estadoSalvo !== 'salvando' && estadoSalvo !== 'erro') return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [estadoSalvo])

  // Lista de projetos na tela inicial.
  const carregarLista = useCallback(() => {
    fetch('/api/censura/projetos', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => setProjetos(Array.isArray(j?.projetos) ? j.projetos : []))
      .catch(() => setProjetos([]))
  }, [])
  useEffect(() => { if (!src) carregarLista() }, [src, carregarLista])

  // ?p=<id> na URL reabre o projeto (recarregar a página não perde nada).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('p')
    if (id) abrirProjeto(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        if (v.duration) {
          const pct = `${(v.currentTime / v.duration) * 100}%`
          if (cabecaRef.current) cabecaRef.current.style.left = pct
          if (progressoRef.current) progressoRef.current.style.width = pct
        }
        if (tempoRef.current) tempoRef.current.textContent = fmtTempo(v.currentTime)
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

  // ---------- projeto / arquivo / transcrição ----------
  function limparEditor() {
    setErro(null); setEnviado(0); setSel([]); setAncora(null); setAtivo(-1); setDuracao(0); setEstadoSalvo(null)
  }

  async function abrirProjeto(id: string) {
    if (rodando) return
    setAbrindo(id); setErro(null)
    try {
      const j = await fetch(`/api/censura/projetos/${id}`, { cache: 'no-store' }).then((r) => r.json())
      if (!j?.videoUrl) throw new Error(j?.error || 'Não consegui abrir o projeto.')
      const meta = j.meta as MetaProjeto
      const salvo = (j.trab || {}) as Partial<Trabalho>
      const novo: Trabalho = { ...VAZIO, ...salvo, edicoes: salvo.edicoes ?? {} }
      limparEditor()
      ultimoSalvo.current = JSON.stringify(novo)
      substituir(novo)
      setAviso(null); setArquivo(null)
      setProjId(meta.id); setVideoPath(meta.video); setInfo({ nome: meta.nome, tamanho: meta.tamanho })
      setSrc(j.videoUrl); urlComProjeto(meta.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e)); urlComProjeto(null)
    } finally { setAbrindo(null) }
  }

  async function apagarProjeto(m: MetaProjeto) {
    if (!confirm(`Apagar o projeto "${m.nome}"? O vídeo e todas as marcações somem do servidor.`)) return
    setProjetos((l) => l?.filter((x) => x.id !== m.id) ?? l)
    await fetch(`/api/censura/projetos/${m.id}`, { method: 'DELETE' }).catch(() => {})
    carregarLista()
  }

  function escolher(f: File | null | undefined) {
    if (!f) return
    if (!/\.(mp4|mov|webm|m4v)$/i.test(f.name)) { setErro('Por enquanto: mp4, mov ou webm. MKV/AVI o navegador não toca — converta antes.'); return }
    if (f.size > TETO_MB * 1024 * 1024) { setErro(`${(f.size / 1048576).toFixed(0)}MB é grande demais — o teto aqui é ${TETO_MB}MB.`); return }
    const salvo = lerJson<Partial<Trabalho>>(chaveTrabalho(f))
    const novo: Trabalho = { ...VAZIO, ...salvo, edicoes: salvo?.edicoes ?? {} }
    limparEditor()
    ultimoSalvo.current = ''
    substituir(novo)
    setProjId(null); setVideoPath(null); setInfo({ nome: f.name, tamanho: f.size })
    setArquivo(f); setSrc(URL.createObjectURL(f))
    // Trabalho antigo que só existia neste navegador: vira projeto agora.
    if (novo.tokens.length) { setAviso('Trabalho recuperado deste vídeo.'); criarProjeto(f).catch(() => setEstadoSalvo('erro')) }
    else setAviso(null)
  }

  function voltarAosProjetos() {
    if (rodando) return
    if (estadoSalvo === 'salvando' && !confirm('Ainda salvando a última mudança. Sair mesmo assim?')) return
    videoRef.current?.pause()
    setSrc(null); setArquivo(null); setProjId(null); setVideoPath(null); setInfo(null)
    substituir(VAZIO); setErro(null); setAviso(null); setSel([]); setEstadoSalvo(null)
    urlComProjeto(null)
  }

  /** Cria o projeto no servidor e sobe o vídeo pra ele (URL assinada + XHR
   *  pra ter progresso). Depois disso o salvamento automático assume. */
  async function criarProjeto(f: File): Promise<{ id: string; caminho: string }> {
    const a = await fetch('/api/censura/projetos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome: f.name, tamanho: f.size }),
    }).then((r) => r.json()).catch(() => null)
    if (!a?.signedUrl) throw new Error(a?.error || 'Não consegui criar o projeto.')
    await new Promise<void>((ok, falha) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', a.signedUrl, true)
      xhr.setRequestHeader('x-upsert', 'true')
      if (f.type) xhr.setRequestHeader('content-type', f.type)
      xhr.upload.onprogress = (e) => e.lengthComputable && setEnviado(e.loaded / e.total)
      xhr.onload = () => (xhr.status < 300 ? ok() : falha(new Error(`envio falhou (${xhr.status})`)))
      xhr.onerror = () => falha(new Error('envio falhou — conexão caiu'))
      xhr.send(f)
    })
    setEnviado(1)
    setProjId(a.id); setVideoPath(a.caminho); urlComProjeto(a.id)
    return { id: a.id, caminho: a.caminho }
  }

  async function transcrever() {
    if ((!arquivo && !videoPath) || rodando) return
    if (trab.tokens.length && !confirm('Transcrever de novo apaga as correções e marcas deste vídeo. Continuar?')) return
    setRodando(true); setErro(null); setAviso(null); setSel([]); substituir(VAZIO)
    setSegundos(0)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    try {
      // O vídeo sobe uma vez só: projeto já criado reaproveita o que está lá.
      let caminho = videoPath
      if (!caminho) {
        setStatus('Enviando o vídeo'); setEnviado(0)
        caminho = (await criarProjeto(arquivo!)).caminho
      }
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
    }
  }

  // ---------- player ----------
  useEffect(() => { const v = videoRef.current; if (v) { v.volume = volume; v.muted = mudo } }, [volume, mudo, src])

  function alternarPlay() {
    const v = videoRef.current
    if (!v) return
    pararEm.current = null
    if (v.paused) v.play().catch(() => {}); else v.pause()
  }

  function pular(seg: number) {
    const v = videoRef.current
    if (v) { pararEm.current = null; v.currentTime = Math.min(Math.max(0, v.currentTime + seg), v.duration || 0) }
  }

  function trocarVelocidade() {
    const opcoes = [1, 1.25, 1.5, 2, 0.5, 0.75]
    const prox = opcoes[(opcoes.indexOf(velocidade) + 1) % opcoes.length]
    setVelocidade(prox)
    if (videoRef.current) videoRef.current.playbackRate = prox
  }

  function telaCheia() {
    const el = playerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen().catch(() => {})
  }

  function tempoNaBarra(e: { clientX: number; currentTarget: HTMLElement }) {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.min(Math.max(0, (e.clientX - r.left) / r.width), 1) * duracao
  }
  const segNoTempo = (t: number) => segs.find((sg) => t >= sg.ini && t <= sg.fim)

  // Arrastar: pausa enquanto arrasta (o vídeo acompanha o mouse) e volta a
  // tocar se estava tocando. Clique sem arrastar num trecho vermelho seleciona.
  function barraDown(e: PointerEvent<HTMLDivElement>) {
    if (!duracao) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const v = videoRef.current
    arrasto.current = { x: e.clientX, tocava: !!v && !v.paused, moveu: false }
    v?.pause()
    seek(tempoNaBarra(e))
  }
  function barraMove(e: PointerEvent<HTMLDivElement>) {
    if (!duracao) return
    const t = tempoNaBarra(e)
    const sg = segNoTempo(t)
    setHover({ t, palavras: sg ? sg.ids.map((id) => tokens[id].word).join(' ') : '' })
    const a = arrasto.current
    if (!a) return
    if (Math.abs(e.clientX - a.x) > 3) a.moveu = true
    if (a.moveu) seek(t)
  }
  function barraUp(e: PointerEvent<HTMLDivElement>) {
    const a = arrasto.current
    arrasto.current = null
    if (!a) return
    const sg = !a.moveu ? segNoTempo(tempoNaBarra(e)) : undefined
    if (sg) { selecionar(sg.ids, true); return }
    if (a.tocava) videoRef.current?.play().catch(() => {})
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
    // Fase 1: liberar o que a biblioteca/IA marcou = alarme falso; censurar o
    // que ninguém pegou = algo que faltou na inteligência.
    const falsos = ids.filter((id) => !censurar && idsFlag.has(id))
    const faltou = ids.filter((id) => censurar && !riscoDe.has(id))
    if (falsos.length) registrar(falsos, 'liberou', { fonte_risco: riscoDe.get(falsos[0])?.fonte })
    if (faltou.length) registrar(faltou, 'censurou')
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
      const riscos = t.riscos?.map((x) => ({ ...x, ids: x.ids.filter((id) => !alvo.has(id)) })).filter((x) => x.ids.length)
      return { ...t, tokens: ts, marcas: t.marcas.filter((id) => !alvo.has(id)), edicoes: ed, riscos }
    })
    setSel([])
  }

  /** Palavra que o Whisper engoliu. Aceita várias ("muito bom") de uma vez. */
  function adicionar(ref: number, lado: 'antes' | 'depois', texto: string) {
    const palavras = texto.trim().split(/\s+/).filter(Boolean)
    if (!palavras.length || !tokens[ref]) return
    let novos: number[] = []
    mudar((t) => {
      const r = inserirPalavras(t.tokens, ref, lado, palavras)
      novos = r.novos
      const ed: Record<number, Edicao> = {}
      for (const [k, v] of Object.entries(t.edicoes)) ed[r.mapa(Number(k))] = v
      return {
        ...t, tokens: r.tokens, marcas: t.marcas.map(r.mapa), ignoradas: t.ignoradas.map(r.mapa), edicoes: ed,
        riscos: t.riscos?.map((x) => ({ ...x, ids: x.ids.map(r.mapa) })),
      }
    })
    setNovaPalavra('')
    setSel(novos); setAncora(novos[0] ?? null)
  }

  /** Botão direito → "Marcar como risco". Alto/muito alto já censura. */
  function marcarRisco(ids: number[], g: Gravidade, contexto = false, obs?: { motivo: string; politica: string }) {
    if (!ids.length) return
    const alvo = new Set(ids)
    // Contexto = as palavras sozinhas não são risco, juntas são ("começar
    // hoje"). Bipar não tira o sentido: fica destacado pra regravar.
    const ord = [...ids].sort((a, b) => a - b)
    const novo: Risco = obs
      ? { ids: ord, gravidade: g, categoria: obs.politica || 'Observação sua', politica: obs.politica || '—', motivo: obs.motivo, bipResolve: contexto ? false : undefined, troca: contexto ? 'Regrave ou reescreva o trecho.' : undefined, fonte: 'manual' }
      : contexto
        ? { ids: ord, gravidade: g, categoria: 'Contexto marcado por você', politica: '—', motivo: 'Juntas, essas palavras passam a ideia proibida.', troca: 'Regrave ou reescreva o trecho tirando a promessa (prazo, facilidade, ganho).', bipResolve: false, fonte: 'manual' }
        : { ids: ord, gravidade: g, categoria: 'Marcado por você', politica: '—', motivo: 'Você marcou como risco.', fonte: 'manual' }
    registrar(ord, contexto ? 'contexto' : 'risco', { gravidade: g, motivo: obs?.motivo, politica: obs?.politica, fonte_risco: riscoDe.get(ord[0])?.fonte })
    mudar((t) => ({
      ...t,
      ignoradas: censuraSozinho(g) && !contexto ? t.ignoradas.filter((id) => !alvo.has(id)) : t.ignoradas,
      riscos: [...(t.riscos || []).filter((r) => !(r.fonte === 'manual' && r.ids.some((id) => alvo.has(id)))), novo],
    }))
  }

  /** "Não é risco": tira o que a IA/você marcou e libera o resto. */
  function tirarRisco(ids: number[]) {
    const alvo = new Set(ids)
    const r0 = ids.map((id) => riscoDe.get(id)).find(Boolean)
    registrar(ids, 'nao_risco', { fonte_risco: r0?.fonte, categoria: r0?.categoria })
    mudar((t) => {
      const g = new Set(t.ignoradas)
      ids.forEach((id) => { if (idsFlag.has(id)) g.add(id) })
      return {
        ...t,
        marcas: t.marcas.filter((id) => !alvo.has(id)),
        ignoradas: [...g],
        riscos: (t.riscos || []).filter((r) => !((r.fonte === 'manual' || r.fonte === 'ia') && r.ids.some((id) => alvo.has(id)))),
      }
    })
  }

  /** Fase 1: manda a decisão pro servidor virar exemplo da IA. Não trava nada. */
  function registrar(ids: number[], decisao: string, extra: { gravidade?: string; motivo?: string; politica?: string; fonte_risco?: string; categoria?: string } = {}) {
    const ord = [...ids].filter((id) => tokens[id]).sort((a, b) => a - b)
    if (!ord.length) return
    // Trechos contíguos viram um exemplo cada ("começar hoje" + "natura").
    const grupos: number[][] = []
    for (const id of ord) {
      const g = grupos[grupos.length - 1]
      const iv = vivos.findIndex((x) => x.id === id)
      if (g && vivos.findIndex((x) => x.id === g[g.length - 1]) === iv - 1) g.push(id); else grupos.push([id])
    }
    const itens = grupos.slice(0, 20).map((g) => {
      const i0 = vivos.findIndex((x) => x.id === g[0]), i1 = vivos.findIndex((x) => x.id === g[g.length - 1])
      return {
        trecho: g.map((id) => tokens[id].word).join(' '),
        contexto: vivos.slice(Math.max(0, i0 - 8), i1 + 9).map((x) => x.word).join(' '),
        decisao, ...extra,
      }
    })
    fetch('/api/censura/exemplos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projetoId: projId || '', itens }),
    }).catch(() => {})
  }

  function abrirMenu(t: Token, e: MouseEvent) {
    e.preventDefault()
    const ids = selSet.has(t.id) ? sel : [t.id]
    if (!selSet.has(t.id)) { setSel([t.id]); setAncora(t.id) }
    setMenu({ x: e.clientX, y: e.clientY, ids })
  }

  /** IA lê a transcrição com a política da Meta. Entra no Ctrl+Z e no projeto. */
  async function analisarRiscos() {
    if (analisando || !vivos.length) return
    setAnalisando(true); setErroIA(null)
    try {
      const j = await fetch('/api/censura/analisar', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ palavras: vivos.map((t) => ({ id: t.id, w: t.word })), motivos }),
      }).then((r) => r.json()).catch(() => null)
      if (!Array.isArray(j?.riscos)) throw new Error(j?.error || 'A análise falhou — tente de novo.')
      mudar((t) => ({ ...t, riscos: [...(t.riscos || []).filter((r) => r.fonte === 'manual'), ...(j.riscos as Risco[])], analisadoEm: new Date().toISOString() }))
    } catch (e) {
      setErroIA(e instanceof Error ? e.message : String(e))
    } finally { setAnalisando(false) }
  }

  function alternarCategoria(id: string) {
    setDesligadas((d) => {
      const novo = d.includes(id) ? d.filter((x) => x !== id) : [...d, id]
      gravar(CHAVE_DESLIGADAS, JSON.stringify(novo))
      return novo
    })
  }

  /** "Sempre censurar essa palavra": vai pra lista do usuário. */
  function paraMinhaLista(palavra: string) {
    const n = normalizar(palavra)
    if (!n) return
    const novo = (flagsTexto.trim() ? flagsTexto.replace(/\s+$/, '') + '\n' : '') + n
    setFlagsTexto(novo); gravar(CHAVE_FLAGS, novo)
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
    const nome = (info?.nome || 'video').replace(/\.[^.]+$/, '')
    const corpo = { video: info?.nome, transcript: vivos, segmentos: segs }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(corpo, null, 2)], { type: 'application/json' }))
    a.download = `${nome}-censura.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // Atalhos: Ctrl+Z / Ctrl+Y desfazem/refazem, Delete remove, Esc limpa a
  // seleção. Dentro de um campo de texto, o Ctrl+Z é o do próprio campo.
  const selRef = useRef(sel); useEffect(() => { selRef.current = sel }, [sel])
  const removerRef = useRef(remover); useEffect(() => { removerRef.current = remover })
  const alternarPlayRef = useRef(alternarPlay); useEffect(() => { alternarPlayRef.current = alternarPlay })
  const pularRef = useRef(pular); useEffect(() => { pularRef.current = pular })
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
      else if (e.key === ' ' || e.key === 'k') { e.preventDefault(); if (alvo?.closest('button')) alvo.blur(); alternarPlayRef.current() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); pularRef.current(e.shiftKey ? -5 : -2) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); pularRef.current(e.shiftKey ? 5 : 2) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desfazer, refazer])

  const linhaAtual = useMemo(() => {
    if (ativo < 0) return null
    return linhasLegenda.find((l) => l.tokens[0].id <= ativo && l.tokens[l.tokens.length - 1].id >= ativo) || null
  }, [linhasLegenda, ativo])

  const selSet = useMemo(() => new Set(sel), [sel])
  const riscoSel = sel.map((id) => riscoDe.get(id)).find(Boolean) ?? null
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
        {erro && <p className="text-xs text-rose-300 text-center">{erro}</p>}

        {/* Projetos salvos: abrem sem subir nem transcrever de novo. */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-bold text-foreground">Seus projetos</h2>
            {projetos && projetos.length > 0 && <p className="text-[11px] text-muted-foreground">salvam sozinhos a cada mudança</p>}
          </div>
          {projetos === null ? (
            <div className="bg-card border border-border rounded-2xl p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : projetos.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center text-xs text-muted-foreground">
              Nenhum projeto ainda. Depois de transcrever, o vídeo fica salvo aqui e é só clicar pra continuar de onde parou.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
              {projetos.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition group">
                  <button onClick={() => abrirProjeto(m.id)} disabled={!!abrindo} className="flex items-center gap-3 min-w-0 flex-1 text-left disabled:opacity-60">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.05] text-muted-foreground group-hover:text-primary flex items-center justify-center shrink-0">
                      {abrindo === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" title={m.nome}>{m.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {m.palavras ? `${m.palavras} palavras` : 'sem transcrição'}
                        {m.censuradas > 0 && <span className="text-rose-300"> · {m.censuradas} censuradas</span>}
                        {' · '}{quando(m.atualizado)}
                      </p>
                    </div>
                  </button>
                  <button onClick={() => apagarProjeto(m)} title="Apagar projeto"
                    className="w-8 h-8 rounded-lg text-muted-foreground/60 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
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
          <p className="text-[11px] text-muted-foreground truncate leading-tight" title={info?.nome}>{info?.nome} · {((info?.tamanho || 0) / 1048576).toFixed(1)} MB{aviso && <span className="text-emerald-400"> · {aviso}</span>}</p>
        </div>
        <Selo projId={projId} estado={estadoSalvo} enviado={enviado} transcrevendo={rodando} />
        <BotaoIcone titulo="Desfazer (Ctrl+Z)" onClick={desfazer} disabled={!podeDesfazer}><Undo2 className="w-4 h-4" /></BotaoIcone>
        <BotaoIcone titulo="Refazer (Ctrl+Y)" onClick={refazer} disabled={!podeRefazer}><Redo2 className="w-4 h-4" /></BotaoIcone>
        <span className="w-px h-6 bg-border mx-1" />
        {tokens.length > 0 && (
          <BotaoIcone titulo="Transcrever de novo" onClick={transcrever} disabled={rodando}><RefreshCw className="w-4 h-4" /></BotaoIcone>
        )}
        {tokens.length > 0 && <BotaoIcone titulo="Baixar JSON" onClick={baixarJson}><Download className="w-4 h-4" /></BotaoIcone>}
        <a href="/tools/censor/inteligencia" target="_blank" rel="noreferrer" title="O que a IA aprendeu, reprovações da Meta, revisor e placar"
          className="h-8 px-3 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Inteligência
        </a>
        <button onClick={voltarAosProjetos} disabled={rodando}
          className="h-8 px-3 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1.5 disabled:opacity-40">
          <FolderOpen className="w-3.5 h-3.5" /> Projetos
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)_340px] gap-3 items-start">
        {/* ---------- Vídeo (player próprio) ---------- */}
        <div className="lg:sticky lg:top-3 space-y-2">
          <div ref={playerRef} className="relative bg-black rounded-2xl overflow-hidden border border-border [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:flex [&:fullscreen]:items-center [&:fullscreen_video]:max-h-none [&:fullscreen_video]:h-full">
            <video ref={videoRef} src={src} playsInline crossOrigin="anonymous"
              onClick={alternarPlay}
              onPlay={() => { aoTocar(); setTocando(true) }} onPause={() => setTocando(false)} onEnded={() => setTocando(false)}
              onLoadedMetadata={(e) => { setDuracao(e.currentTarget.duration || 0); e.currentTarget.playbackRate = velocidade }}
              className="w-full max-h-[64vh] block mx-auto cursor-pointer" />
            {linhaAtual && (
              <div className="pointer-events-none absolute inset-x-0 bottom-[14%] flex justify-center px-3">
                <p className="max-w-[94%] text-center text-[13px] font-bold leading-snug bg-black/75 text-white px-2.5 py-1 rounded-md">
                  {linhaAtual.tokens.map((t) => (
                    <span key={t.id} className={`${t.id === ativo ? 'text-amber-300' : ''} ${censuradas.has(t.id) ? 'blur-[5px]' : ''}`}>{t.word} </span>
                  ))}
                </p>
              </div>
            )}
            {!tocando && (
              <button onClick={alternarPlay} aria-label="Tocar"
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 hover:scale-105 transition">
                <Play className="w-7 h-7 ml-1" fill="currentColor" />
              </button>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-3 space-y-3">
            {/* Barra de reprodução: clique ou arraste em qualquer ponto. Os
                trechos censurados ficam em vermelho; clique sem arrastar num
                deles seleciona as palavras. */}
            <div
              className="relative h-10 rounded-lg bg-white/[0.04] cursor-pointer select-none touch-none group/barra"
              onPointerDown={barraDown} onPointerMove={barraMove} onPointerUp={barraUp}
              onPointerLeave={() => { if (!arrasto.current) setHover(null) }}>
              <div ref={progressoRef} className="absolute inset-y-0 left-0 bg-primary/15 rounded-l-lg pointer-events-none" />
              {duracao > 0 && segs.map((sg) => (
                <div key={`${sg.ini}`} className="absolute top-2 bottom-2 rounded-sm bg-rose-500/85 min-w-[3px] pointer-events-none"
                  style={{ left: `${(sg.ini / duracao) * 100}%`, width: `${((sg.fim - sg.ini) / duracao) * 100}%` }} />
              ))}
              <div ref={cabecaRef} className="absolute -top-1 -bottom-1 w-0.5 -ml-px bg-white pointer-events-none">
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow ring-2 ring-primary group-hover/barra:scale-125 transition" />
              </div>
              {hover && duracao > 0 && (
                <div className="absolute -top-8 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/90 text-white text-[10px] font-semibold tabular-nums whitespace-nowrap pointer-events-none max-w-[220px] truncate"
                  style={{ left: `${(hover.t / duracao) * 100}%` }}>
                  {fmtTempo(hover.t)}{hover.palavras && <span className="text-rose-300"> · {hover.palavras}</span>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              <BotaoIcone titulo="Voltar 2s (←)" onClick={() => pular(-2)}><RotateCcw className="w-4 h-4" /></BotaoIcone>
              <button onClick={alternarPlay} title={tocando ? 'Pausar (Espaço)' : 'Tocar (Espaço)'}
                className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:opacity-90 shrink-0">
                {tocando ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
              </button>
              <BotaoIcone titulo="Avançar 2s (→)" onClick={() => pular(2)}><RotateCw className="w-4 h-4" /></BotaoIcone>
              <p className="text-xs tabular-nums text-foreground ml-1.5 mr-auto whitespace-nowrap">
                <span ref={tempoRef}>0:00.0</span><span className="text-muted-foreground"> / {fmtTempo(duracao)}</span>
              </p>
              <button onClick={trocarVelocidade} title="Velocidade"
                className="h-8 min-w-[40px] px-1.5 rounded-lg text-xs font-bold text-foreground/90 hover:bg-white/5 tabular-nums">{velocidade}x</button>
              <BotaoIcone titulo={mudo ? 'Ligar som' : 'Tirar som'} onClick={() => setMudo((m) => !m)}>
                {mudo || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </BotaoIcone>
              <input type="range" min={0} max={1} step={0.05} value={mudo ? 0 : volume} aria-label="Volume"
                onChange={(e) => { setVolume(Number(e.target.value)); setMudo(false) }}
                className="w-16 accent-primary hidden sm:block" />
              <BotaoIcone titulo="Tela cheia" onClick={telaCheia}><Maximize className="w-4 h-4" /></BotaoIcone>
            </div>

            {tokens.length > 0 && (
              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border">
                <p className="text-[11px] text-muted-foreground">{segs.length} {segs.length === 1 ? 'trecho censurado' : 'trechos censurados'}</p>
                <button onClick={() => setPrevia((p) => !p)} className="inline-flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
                  {previa ? 'Ouvindo com edições' : 'Ouvindo o original'}
                  <span className={`w-8 h-[18px] rounded-full relative transition ${previa ? 'bg-primary' : 'bg-white/15'}`}>
                    <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${previa ? 'left-[16px]' : 'left-[2px]'}`} />
                  </span>
                </button>
              </div>
            )}
          </div>
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
                        const rk = riscoDe.get(t.id)
                        const alerta = rk && !idsFlag.has(t.id) && !cens && !s
                        return (
                          <span key={t.id} data-t={t.id} onClick={(e) => clicarPalavra(t, e)} onContextMenu={(e) => abrirMenu(t, e)}
                            title={`${fmtTempo(t.start_time)} · confiança ${Math.round(t.confidence * 100)}%${t.corrigida ? ' · corrigida' : ''}${rk ? ` · risco ${NOME_GRAVIDADE[rk.gravidade].toLowerCase()}: ${rk.categoria}` : ''}`}
                            className={`cursor-pointer rounded-[5px] px-[3px] py-[2px] transition-colors ${
                              s ? 'bg-primary text-white'
                                : cens ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                                  : 'hover:bg-white/[0.07]'
                            } ${t.id === ativo && !s ? 'shadow-[inset_0_-2px_0_0_#fcd34d] text-foreground' : ''} ${
                              duvida && !s ? 'underline decoration-dotted decoration-amber-300/80 decoration-2 underline-offset-[5px]' : ''} ${
                              idsFlag.has(t.id) && !cens && !s ? 'line-through decoration-orange-400/60' : ''} ${
                              alerta ? (rk.gravidade !== 'baixo' ? 'bg-orange-400/10 text-orange-200 shadow-[inset_0_-2px_0_0_rgba(251,146,60,0.7)]' : 'shadow-[inset_0_-2px_0_0_rgba(251,146,60,0.35)]') : ''}`}>
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
                    {sel.length === 1 && <AcaoBarra onClick={() => adicionarRef.current?.focus()} titulo="Inserir uma palavra que o Whisper não pegou"><Plus className="w-3.5 h-3.5" /> Palavra</AcaoBarra>}
                    <AcaoBarra onClick={() => remover(sel)} titulo="Apaga da transcrição (Delete)"><Trash2 className="w-3.5 h-3.5" /> Remover</AcaoBarra>
                    <button onClick={() => setSel([])} title="Limpar seleção (Esc)" className="w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <Keyboard className="w-3.5 h-3.5" /> <Kbd>Espaço</Kbd> toca/pausa · Clique numa palavra · <Kbd>Shift</Kbd> trecho · <Kbd>Ctrl</Kbd> soma · <Kbd>Delete</Kbd> remove · botão direito: opções · <Kbd>Ctrl Z</Kbd> desfaz
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
            {riscoSel && <CartaoRisco r={riscoSel} tokens={tokens} />}
            {unica && !riscoDe.has(unica.id) && marcas.has(unica.id) && normalizar(unica.word) && (
              <button onClick={() => paraMinhaLista(unica.word)}
                className="w-full mb-3 text-left text-[11px] rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground hover:text-foreground hover:border-primary/50">
                Sempre censurar “{normalizar(unica.word)}”? <b className="text-primary">Adicionar à minha lista</b>
              </button>
            )}
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
                <div className="pt-3 border-t border-border space-y-1.5">
                  <p className="text-[11px] font-semibold text-foreground/90">Faltou palavra?</p>
                  <div className="flex gap-1.5">
                    <input ref={adicionarRef} value={novaPalavra} onChange={(e) => setNovaPalavra(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') adicionar(unica.id, e.shiftKey ? 'antes' : 'depois', novaPalavra) }}
                      placeholder="palavra que faltou"
                      className="flex-1 min-w-0 h-9 px-3 rounded-lg text-sm bg-background border border-border text-foreground focus:border-primary/60 outline-none" />
                    <button onClick={() => adicionar(unica.id, 'antes', novaPalavra)} disabled={!novaPalavra.trim()} title={`Coloca antes de “${unica.word}” (Shift+Enter)`}
                      className="h-9 px-2.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 disabled:opacity-30">Antes</button>
                    <button onClick={() => adicionar(unica.id, 'depois', novaPalavra)} disabled={!novaPalavra.trim()} title="Coloca depois (Enter)"
                      className="h-9 px-2.5 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-30">Depois</button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Entra antes ou depois de “{unica.word}”. Pode digitar mais de uma.</p>
                </div>
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

          {/* Riscos da Meta */}
          <Secao titulo="Riscos da Meta" icone={<Flag className="w-3.5 h-3.5" />}>
            <div className="space-y-3">
              <button onClick={analisarRiscos} disabled={!tokens.length || analisando}
                className="w-full h-9 rounded-lg text-xs font-bold bg-primary text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {analisando ? <><Loader2 className="w-4 h-4 animate-spin" /> Lendo com a política da Meta…</> : <><Sparkles className="w-4 h-4" /> {trab.analisadoEm ? 'Analisar de novo com IA' : 'Analisar riscos com IA'}</>}
              </button>
              {trab.analisadoEm && !analisando && (
                <p className="text-[11px] text-muted-foreground -mt-1.5">IA achou {(trab.riscos || []).filter((r) => r.fonte === 'ia').length} {(trab.riscos || []).filter((r) => r.fonte === 'ia').length === 1 ? 'trecho' : 'trechos'} · {quando(trab.analisadoEm)}</p>
              )}
              {erroIA && <p className="text-[11px] text-rose-300">{erroIA}</p>}

              <details className="group/d rounded-lg border border-border">
                <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-foreground/90 flex items-center gap-1.5">
                  Motivos de bloqueio que a Meta mandou {motivos.trim() && <span className="text-primary">· preenchido</span>}
                  <ChevronDown className="w-3.5 h-3.5 ml-auto transition group-open/d:rotate-180" />
                </summary>
                <div className="px-3 pb-3 space-y-1.5">
                  <textarea value={motivos} onChange={(e) => { setMotivos(e.target.value); gravar(CHAVE_MOTIVOS, e.target.value) }} rows={4}
                    placeholder={'Cole aqui o aviso da Meta, ex.:\n"Seu anúncio foi reprovado — Fraudes, golpes e práticas enganosas"'}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border text-foreground focus:border-primary/60 outline-none resize-y leading-relaxed" />
                  <p className="text-[11px] text-muted-foreground">A IA dá peso extra a isso. Fica salvo pros próximos vídeos.</p>
                </div>
              </details>

              {tokens.length > 0 && (listaRiscos.length ? (
                <div className="space-y-3">
                  {GRAVIDADES.map((g) => {
                    const itens = listaRiscos.filter((r) => r.gravidade === g)
                    if (!itens.length) return null
                    return (
                      <div key={g} className="space-y-1">
                        <div className="flex items-center gap-2"><SeloGravidade g={g} /><span className="text-[11px] text-muted-foreground">{itens.length}{censuraSozinho(g) ? '' : ' · só destacados'}</span></div>
                        {itens.map((r) => {
                          const liberada = autoCensura(r) && r.ids.every((id) => ignoradas.has(id))
                          const cens = r.ids.every((id) => censuradas.has(id))
                          return (
                            <button key={`${r.fonte}-${r.ids.join(',')}`} onClick={() => selecionar(r.ids, true)}
                              className={`w-full text-left rounded-md px-2 py-1.5 hover:bg-white/[0.05] flex items-start gap-2 ${liberada ? 'opacity-50' : ''}`}>
                              <span className="text-[10px] tabular-nums text-muted-foreground mt-0.5 shrink-0">{fmtTempo(tokens[r.ids[0]].start_time)}</span>
                              <span className="min-w-0">
                                <span className={`text-xs font-semibold ${liberada ? 'line-through text-muted-foreground' : cens ? 'text-rose-200' : 'text-foreground'}`}>“{r.ids.map((id) => tokens[id].word).join(' ')}”</span>
                                <span className="block text-[10px] text-muted-foreground truncate">
                                  {r.categoria}{r.fonte === 'ia' ? ' · IA' : r.fonte === 'manual' ? ' · você' : ''}{r.bipResolve === false ? ' · regravar' : ''}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                  <p className="text-[11px] text-muted-foreground">Clique num trecho pra ver o motivo. Liberar ou censurar fica na barra embaixo do texto.</p>
                </div>
              ) : <Vazio>Nenhum risco encontrado ainda. Rode a análise com IA.</Vazio>)}

              <details className="group/d rounded-lg border border-border">
                <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-foreground/90 flex items-center gap-1.5">
                  Biblioteca · {bib.filter((c) => !desligadas.includes(c.id)).length}/{bib.length} ligadas
                  <ChevronDown className="w-3.5 h-3.5 ml-auto transition group-open/d:rotate-180" />
                </summary>
                <div className="px-3 pb-3 space-y-1">
                  {bib.map((c) => {
                    const on = !desligadas.includes(c.id)
                    return (
                      <button key={c.id} onClick={() => alternarCategoria(c.id)} title={c.motivo}
                        className="w-full flex items-center gap-2 py-1 text-left">
                        <span className={`w-7 h-4 rounded-full relative transition shrink-0 ${on ? 'bg-primary' : 'bg-white/15'}`}>
                          <span className={`absolute top-[2px] w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-[14px]' : 'left-[2px]'}`} />
                        </span>
                        <span className="text-[11px] text-foreground/90 flex-1">{c.nome}</span>
                        <SeloGravidade g={c.gravidade} />
                      </button>
                    )
                  })}
                </div>
              </details>

              <details className="group/d rounded-lg border border-border">
                <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-foreground/90 flex items-center gap-1.5">
                  Sua lista {flagsTexto.trim() && <span className="text-muted-foreground font-normal">· {lerRedFlags(flagsTexto).length}</span>}
                  <ChevronDown className="w-3.5 h-3.5 ml-auto transition group-open/d:rotate-180" />
                </summary>
                <div className="px-3 pb-3 space-y-1.5">
                  <textarea value={flagsTexto} onChange={(e) => { setFlagsTexto(e.target.value); gravar(CHAVE_FLAGS, e.target.value) }} rows={4}
                    placeholder={'uma por linha\nrenda extra\nganh*   ← ganhar, ganhei...'}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border text-foreground focus:border-primary/60 outline-none resize-y font-mono leading-relaxed" />
                  <p className="text-[11px] text-muted-foreground">Vale como risco alto: já entra censurado.</p>
                </div>
              </details>
            </div>
          </Secao>
        </div>
      </div>

      {menu && (() => {
        const ids = menu.ids.filter((id) => tokens[id] && !tokens[id].removida)
        if (!ids.length) return null
        const todasCens = ids.every((id) => censuradas.has(id))
        const temRisco = ids.some((id) => riscoDe.has(id) || marcas.has(id))
        const uma = ids.length === 1 ? tokens[ids[0]] : null
        // Até 6 palavras vira frase da lista ("comecar hoje").
        const frase = ids.length <= 6 ? normalizar(ids.map((id) => tokens[id].word).join(' ')) : ''
        const fechar = () => setMenu(null)
        const titulo = `“${ids.slice(0, 8).map((id) => tokens[id].word).join(' ')}${ids.length > 8 ? '…' : ''}”`
        if (menu.obs) return (
          <MenuPalavra x={menu.x} y={menu.y} onFechar={fechar} titulo={titulo} largo>
            <FormObservacao politicas={[...new Set(bib.map((c) => c.politica))]} onVoltar={() => setMenu({ ...menu, obs: false })}
              onSalvar={(o) => { marcarRisco(ids, o.gravidade, o.regravar, { motivo: o.motivo, politica: o.politica }); fechar() }} />
          </MenuPalavra>
        )
        return (
          <MenuPalavra x={menu.x} y={menu.y} onFechar={fechar} titulo={titulo}>
            {todasCens
              ? <ItemMenu onClick={() => { marcar(ids, false); fechar() }}><ShieldOff className="w-3.5 h-3.5" /> Liberar</ItemMenu>
              : <ItemMenu tom="rose" onClick={() => { marcar(ids, true); fechar() }}><ShieldCheck className="w-3.5 h-3.5" /> Censurar</ItemMenu>}
            <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Marcar como risco</div>
            <div className="px-2 pb-1.5 grid grid-cols-2 gap-1">
              {GRAVIDADES.map((g) => (
                <button key={g} onClick={() => { marcarRisco(ids, g); fechar() }}
                  className={`h-7 rounded border text-[10px] font-bold uppercase tracking-wide hover:brightness-125 ${COR_GRAVIDADE[g]}`}>
                  {NOME_GRAVIDADE[g]}
                </button>
              ))}
            </div>
            {temRisco && <ItemMenu onClick={() => { tirarRisco(ids); fechar() }}><X className="w-3.5 h-3.5" /> Não é risco</ItemMenu>}
            <ItemMenu onClick={() => { marcarRisco(ids, 'alto', true); fechar() }}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
              <span>Contexto de risco <span className="text-muted-foreground">· regravar</span></span>
            </ItemMenu>
            {ids.length > 1 && <p className="px-2.5 pb-1 text-[10px] text-muted-foreground leading-snug">Juntas viram promessa (“começar hoje”): destaca o trecho pra regravar, sem bipar.</p>}
            <ItemMenu onClick={() => setMenu({ ...menu, obs: true })}>
              <MessageSquarePlus className="w-3.5 h-3.5 text-primary" />
              <span>Marcar com observação…</span>
            </ItemMenu>
            {frase && (
              <ItemMenu onClick={() => { paraMinhaLista(frase); fechar() }}><Flag className="w-3.5 h-3.5" /> <span className="truncate">Sempre censurar “{frase}”</span></ItemMenu>
            )}
            <div className="my-1 border-t border-border" />
            <ItemMenu onClick={() => { ouvir(ids); fechar() }}><Play className="w-3.5 h-3.5" /> Ouvir</ItemMenu>
            {uma && <ItemMenu onClick={() => { fechar(); setTimeout(() => adicionarRef.current?.focus(), 0) }}><Plus className="w-3.5 h-3.5" /> Inserir palavra que faltou</ItemMenu>}
            <ItemMenu onClick={() => { remover(ids); fechar() }}><Trash2 className="w-3.5 h-3.5" /> Remover da transcrição</ItemMenu>
          </MenuPalavra>
        )
      })()}
    </div>
  )
}

/** Menu flutuante do botão direito. Fecha clicando fora, Esc ou rolando. */
/** "Por que isso é risco" — vira exemplo pra IA aprender o critério. */
function FormObservacao({ politicas, onSalvar, onVoltar }: {
  politicas: string[]
  onSalvar: (o: { motivo: string; politica: string; gravidade: Gravidade; regravar: boolean }) => void
  onVoltar: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [politica, setPolitica] = useState('')
  const [gravidade, setGravidade] = useState<Gravidade>('alto')
  const [regravar, setRegravar] = useState(false)
  const sugestoes = [...new Set(['Exploração humana', 'Nudez e atividade sexual', 'Segurança infantil', ...politicas])]
  const ok = motivo.trim().length > 2
  return (
    <div className="px-2.5 pb-2 space-y-2" onKeyDown={(e) => e.stopPropagation()}>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Por que é risco?</label>
      <textarea autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
        placeholder={'Ex.: "menina" — a Meta lê como menor de idade, mesmo sendo papo de amiga com adulta'}
        className="w-full px-2 py-1.5 rounded-md text-xs bg-background border border-border text-foreground focus:border-primary/60 outline-none resize-none leading-relaxed" />
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Política da Meta</label>
      <input list="politicas-meta" value={politica} onChange={(e) => setPolitica(e.target.value)} placeholder="Ex.: Exploração humana"
        className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border text-foreground focus:border-primary/60 outline-none" />
      <datalist id="politicas-meta">{sugestoes.map((p) => <option key={p} value={p} />)}</datalist>
      <div className="grid grid-cols-4 gap-1">
        {GRAVIDADES.map((g) => (
          <button key={g} onClick={() => setGravidade(g)}
            className={`h-7 rounded border text-[9px] font-bold uppercase ${COR_GRAVIDADE[g]} ${gravidade === g ? 'ring-2 ring-primary' : 'opacity-60'}`}>
            {NOME_GRAVIDADE[g]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-foreground/90 cursor-pointer">
        <input type="checkbox" checked={regravar} onChange={(e) => setRegravar(e.target.checked)} />
        Só o bip não resolve (regravar)
      </label>
      <div className="flex gap-1.5 pt-1">
        <button onClick={onVoltar} className="h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-white/5">Voltar</button>
        <button disabled={!ok} onClick={() => onSalvar({ motivo: motivo.trim(), politica: politica.trim(), gravidade, regravar })}
          className="flex-1 h-8 rounded-md text-xs font-bold bg-primary text-white disabled:opacity-40">Salvar e ensinar a IA</button>
      </div>
    </div>
  )
}

function MenuPalavra({ x, y, titulo, onFechar, largo, children }: { x: number; y: number; titulo: string; onFechar: () => void; largo?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useEffect(() => {
    const el = ref.current
    if (el) {
      const r = el.getBoundingClientRect()
      setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) })
    }
    const fora = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onFechar() }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', fora)
    document.addEventListener('contextmenu', fora)
    window.addEventListener('keydown', tecla)
    window.addEventListener('scroll', onFechar, true)
    window.addEventListener('resize', onFechar)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('contextmenu', fora)
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', onFechar, true)
      window.removeEventListener('resize', onFechar)
    }
  }, [x, y, onFechar])
  return (
    <div ref={ref} style={pos} onContextMenu={(e) => e.preventDefault()}
      className={`fixed z-50 ${largo ? 'w-80' : 'w-60'} rounded-lg border border-border bg-card shadow-2xl shadow-black/50 py-1`}>
      <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground truncate border-b border-border mb-1">{titulo}</p>
      {children}
    </div>
  )
}

function ItemMenu({ onClick, tom, children }: { onClick: () => void; tom?: 'rose'; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full px-2.5 h-8 text-left text-xs inline-flex items-center gap-2 hover:bg-white/[0.06] ${tom === 'rose' ? 'text-rose-200' : 'text-foreground/90'}`}>
      {children}
    </button>
  )
}

// ---------- peças de UI ----------

/** Selo de salvamento na barra de ferramentas. */
function Selo({ projId, estado, enviado, transcrevendo }: { projId: string | null; estado: EstadoSalvo; enviado: number; transcrevendo: boolean }) {
  const base = 'hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium mr-1'
  if (!projId) {
    if (enviado > 0 && enviado < 1) return <span className={`${base} text-muted-foreground`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando o vídeo {Math.round(enviado * 100)}%</span>
    if (transcrevendo) return null
    return <span className={`${base} text-muted-foreground/70`} title="O projeto é criado quando você transcreve"><CloudOff className="w-3.5 h-3.5" /> Ainda não salvo</span>
  }
  if (estado === 'salvando') return <span className={`${base} text-muted-foreground`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando</span>
  if (estado === 'erro') return <span className={`${base} text-rose-300`} title="Tenta de novo na próxima mudança"><CloudOff className="w-3.5 h-3.5" /> Não salvou</span>
  return <span className={`${base} text-emerald-400/90`}><Cloud className="w-3.5 h-3.5" /> Salvo</span>
}

const COR_GRAVIDADE: Record<Gravidade, string> = {
  muito_alto: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
  alto: 'bg-rose-500/10 text-rose-200 border-rose-400/25',
  medio: 'bg-orange-400/10 text-orange-200 border-orange-400/30',
  baixo: 'bg-white/[0.04] text-muted-foreground border-border',
}

function SeloGravidade({ g }: { g: Gravidade }) {
  return <span className={`inline-flex items-center h-5 px-1.5 rounded border text-[10px] font-bold uppercase tracking-wide ${COR_GRAVIDADE[g]}`}>{NOME_GRAVIDADE[g]}</span>
}

/** Por que a palavra selecionada é risco — e o que fazer. */
function CartaoRisco({ r, tokens }: { r: Risco; tokens: Token[] }) {
  return (
    <div className={`mb-3 rounded-lg border p-3 space-y-1.5 ${COR_GRAVIDADE[r.gravidade]}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <SeloGravidade g={r.gravidade} />
        <p className="text-xs font-bold text-foreground">{r.categoria}</p>
        <span className="ml-auto text-[10px] text-muted-foreground">{r.fonte === 'ia' ? 'IA' : r.fonte === 'lista' ? 'sua lista' : r.fonte === 'manual' ? 'você marcou' : 'biblioteca'}</span>
      </div>
      <p className="text-[11px] text-foreground/90">“{r.ids.map((id) => tokens[id]?.word).join(' ')}” — {r.motivo}</p>
      {r.politica && r.politica !== '—' && <p className="text-[10px] text-muted-foreground">Política: {r.politica}</p>}
      {r.bipResolve === false && (
        <p className="text-[11px] text-amber-200 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> Só o bip não resolve: a frase continua passando a ideia. Melhor regravar esse trecho.</p>
      )}
      {r.troca && <p className="text-[11px] text-foreground/90"><b>Troca:</b> {r.troca}</p>}
    </div>
  )
}

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
