'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clapperboard, FolderPlus, Folder, Trash2, UploadCloud, Loader2, Type, Mic2,
  FileText, Sparkles, Check, AlertTriangle, ChevronLeft, Wand2, Film, Plus, Clock, Download, Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { TEMPLATES, TEMPLATE_PADRAO, ESTILO_DO_TEMPLATE, type TemplateId } from '@/lib/criativos-templates'
import { lerEstiloGemini, type ResultadoImport } from '@/lib/criativos-estilo-gemini'

// Gerador de Criativos Automáticos — a base: de onde vem a voz, de onde vêm as
// imagens de apoio, qual fonte a legenda usa e de onde sai o roteiro. A
// montagem do vídeo consome tudo isto e roda na VPS.

type Aba = 'roteiro' | 'biblioteca' | 'fontes' | 'config'
type Pasta = { nome: string; clipes: number }
type Clipe = { nome: string; pasta: string; caminho: string }
type Arquivo = { nome: string; caminho: string; tamanho: number; url?: string | null }
type Voz = { id: string; nome: string; categoria?: string }
type FonteCatalogo = {
  familia: string; categoria: string; peso: number; pesos: string[]; instalada: boolean
}

// Formatos de entrega. A proporção manda no enquadramento dos b-rolls (corte
// central) e no tamanho da legenda, por isso é escolha de projeto, não de
// exportação — muda o vídeo inteiro, não só o arquivo final.
const FORMATOS = [
  { id: '9:16', rotulo: '9:16', onde: 'Reels · TikTok · Shorts', w: 1080, h: 1920 },
  { id: '4:5', rotulo: '4:5', onde: 'Feed do Instagram', w: 1080, h: 1350 },
  { id: '1:1', rotulo: '1:1', onde: 'Feed quadrado', w: 1080, h: 1080 },
  { id: '16:9', rotulo: '16:9', onde: 'YouTube · horizontal', w: 1920, h: 1080 },
] as const
type FormatoId = (typeof FORMATOS)[number]['id']

// Estilos de legenda. A amostra é desenhada em CSS aqui mesmo — é o que mais
// se aproxima do que o libass vai render, e evita subir imagem de exemplo.
const ESTILOS = [
  { id: 'palavra', nome: 'Palavra a palavra', desc: 'Uma palavra por vez, grande e centralizada.' },
  { id: 'destaque', nome: 'Frase com destaque', desc: 'A frase fica, a palavra falada acende.' },
  { id: 'bloco', nome: 'Bloco fixo', desc: 'Duas linhas na base, troca a cada frase.' },
] as const
type EstiloId = (typeof ESTILOS)[number]['id']

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

async function json(r: Response) {
  const t = await r.text()
  try { return JSON.parse(t) } catch { throw new Error(`resposta inesperada (${r.status})`) }
}

export default function CreativeGeneratorPage() {
  // Dois modos: o guiado é a tela de quem senta pra fazer um criativo hoje
  // (áudio -> copy -> b-rolls na ordem -> gerar). O avançado é a mesa de
  // trabalho antiga, com as marcações escritas à mão e o preparo da conta.
  const [modo, setModo] = useState<'guiado' | 'avancado'>('guiado')
  const [aba, setAba] = useState<Aba>('roteiro')
  const [erro, setErro] = useState<string | null>(null)
  // A ordem em que os b-rolls entram. É o que o usuário monta clicando, e o
  // que vira marcação no roteiro na hora de gerar.
  const [fila, setFila] = useState<string[]>([])

  // --- biblioteca ---
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [clipes, setClipes] = useState<Clipe[]>([])
  const [pastaAberta, setPastaAberta] = useState<string | null>(null)
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [novaPasta, setNovaPasta] = useState('')
  const [criandoPasta, setCriandoPasta] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)
  const brollRef = useRef<HTMLInputElement>(null)
  const brollGuiadoRef = useRef<HTMLInputElement>(null)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [nomeNovo, setNomeNovo] = useState('')
  // Duração vem do próprio player, quando ele carrega os metadados: evita uma
  // volta no servidor só pra saber quantos segundos o clipe tem.
  const [duracoes, setDuracoes] = useState<Record<string, number>>({})

  // --- fontes ---
  const [fontes, setFontes] = useState<Arquivo[]>([])
  const [catalogo, setCatalogo] = useState<FonteCatalogo[]>([])
  const [baixando, setBaixando] = useState<string | null>(null)
  const [buscaFonte, setBuscaFonte] = useState('')
  const [categoriaFonte, setCategoriaFonte] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])
  const [totalFontes, setTotalFontes] = useState(0)
  const [pesoEscolhido, setPesoEscolhido] = useState<Record<string, number>>({})
  const [fonteEscolhida, setFonteEscolhida] = useState('')

  // --- montagem ---
  const [montando, setMontando] = useState(false)
  const [faseMontagem, setFaseMontagem] = useState('')
  const [videoPronto, setVideoPronto] = useState<{
    url: string; downloadUrl?: string; projetoId?: string; tempos?: Record<string, number>
  } | null>(null)
  const [projetos, setProjetos] = useState<{ id: string; atualizado: string }[]>([])
  const fonteRef = useRef<HTMLInputElement>(null)

  // --- config ---
  const [chave, setChave] = useState('')
  const [configurada, setConfigurada] = useState(false)
  const [vozes, setVozes] = useState<Voz[]>([])
  const [vozId, setVozId] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Duas origens de locução: a API do ElevenLabs, ou um arquivo pronto. Plano
  // que não libera voz clonada via API fica preso sem a segunda.
  const [origemVoz, setOrigemVoz] = useState<'api' | 'arquivo'>('api')
  const [locucao, setLocucao] = useState<{ nome: string; caminho: string } | null>(null)
  const locucaoRef = useRef<HTMLInputElement>(null)
  // Trilha de fundo: opcional, e abaixa sozinha quando a expert fala.
  const [musica, setMusica] = useState<{ nome: string; caminho: string } | null>(null)
  const [musicaVol, setMusicaVol] = useState(0.12)
  const musicaRef = useRef<HTMLInputElement>(null)

  // --- roteiro ---
  const [origem, setOrigem] = useState<'minha' | 'concorrente' | 'nosso'>('minha')
  const [roteiro, setRoteiro] = useState('')
  const [linkVideo, setLinkVideo] = useState('')
  const [produto, setProduto] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const roteiroRef = useRef<HTMLTextAreaElement>(null)
  const [vozEscolhida, setVozEscolhida] = useState('')
  const [formato, setFormato] = useState<FormatoId>('9:16')
  const [estilo, setEstilo] = useState<EstiloId>('palavra')
  const [template, setTemplate] = useState<TemplateId>(TEMPLATE_PADRAO)
  // Estilo próprio: nenhum dos três prontos é obrigatório. Os campos são os
  // mesmos que a VPS entende; ela valida de novo do lado de lá.
  const [proprio, setProprio] = useState(false)
  // A análise que o Gemini faz de um criativo de referência, colada aqui.
  const [colando, setColando] = useState(false)
  const [analise, setAnalise] = useState('')
  const [importado, setImportado] = useState<ResultadoImport | null>(null)
  const [meu, setMeu] = useState({
    zoom: 'punch' as 'nenhum' | 'in' | 'out' | 'punch' | 'alternado',
    zoom_forca: 0.1,
    transicao: 'corte' as 'corte' | 'fade' | 'flash',
    legenda_estilo: 'palavra' as EstiloId,
    legenda_destaque: '#FFFF00',
    ritmo_min: 2,
    ritmo_max: 3.5,
  })

  // Locução em PT-BR fica perto de 160 palavras por minuto. Serve pra avisar
  // que o roteiro passou do tamanho de um criativo antes de gastar TTS.
  const palavras = roteiro.trim() ? roteiro.trim().split(/\s+/).length : 0
  const segundos = Math.round((palavras / 160) * 60)
  const clipesTotais = pastas.reduce((n, p) => n + p.clipes, 0)

  const prontos = {
    voz: origemVoz === 'arquivo' ? !!locucao : (configurada && !!vozEscolhida),
    broll: clipesTotais > 0,
    fonte: fontes.length > 0,
    roteiro: palavras >= 10,
  }
  const faltando = [
    !prontos.voz && (origemVoz === 'arquivo' ? 'enviar a locução' : 'escolher a voz'),
    !prontos.broll && 'enviar b-rolls',
    !prontos.fonte && 'enviar uma fonte',
    !prontos.roteiro && 'escrever o roteiro',
  ].filter(Boolean) as string[]

  // Duas formas de chamar imagem de apoio, e elas servem a coisas diferentes:
  // "$nome-do-clipe" fixa um arquivo; "[broll: pasta xN]" sorteia dentro da
  // pasta, que é o que dá variação entre criativos.
  const refsClipe = [...roteiro.matchAll(/\$([\w-]+)/g)].map((m) => m[1])
  const refsPasta = [...roteiro.matchAll(/\[broll:\s*([\w-]+)/gi)].map((m) => m[1])
  const desconhecidas = [
    ...refsClipe.filter((r) => !clipes.some((c) => c.nome === r)).map((r) => `$${r}`),
    ...refsPasta.filter((r) => !pastas.some((p) => p.nome === r)).map((r) => `[broll: ${r}]`),
  ]

  // A fila de b-rolls espalhada pela fala: cada clipe entra num ponto do
  // texto, em partes iguais. Não é escolha fina — é o começo. O ajuste de
  // tempo acontece depois, arrastando na linha do tempo do editor.
  function aplicarAnalise() {
    const r = lerEstiloGemini(analise)
    setImportado(r)
    const e = r.estilo
    if (!Object.keys(e).length) return
    setProprio(true)
    setMeu((m) => ({
      ...m,
      zoom: e.zoom ?? m.zoom,
      zoom_forca: e.zoom_forca ?? m.zoom_forca,
      transicao: e.transicao ?? m.transicao,
      legenda_estilo: (e.legenda_estilo as EstiloId) ?? m.legenda_estilo,
      legenda_destaque: e.legenda_destaque ?? m.legenda_destaque,
      ritmo_min: e.ritmo_min ?? m.ritmo_min,
      ritmo_max: e.ritmo_max ?? m.ritmo_max,
    }))
    if (e.musica_volume != null) setMusicaVol(e.musica_volume)
  }

  function comMarcacoes(texto: string, ordem: string[]) {
    const limpo = texto.replace(/\$[\w-]+\s*/g, '').trim()
    if (!ordem.length) return limpo
    const ps = limpo.split(/\s+/)
    if (!ps.length) return limpo
    const passo = ps.length / ordem.length
    const saida: string[] = []
    let proximo = 0
    for (let i = 0; i < ps.length; i++) {
      if (proximo < ordem.length && i >= Math.floor(proximo * passo)) {
        saida.push(`$${ordem[proximo]}`)
        proximo++
      }
      saida.push(ps[i])
    }
    return saida.join(' ')
  }

  // No guiado só aparecem os clipes da pasta escolhida — é ela que define o
  // criativo. Sem pasta escolhida, mostra tudo pra não travar quem tem uma só.
  const clipesDaPasta = pastaAberta ? clipes.filter((c) => c.pasta === pastaAberta) : clipes

  const roteiroFinal = modo === 'guiado' ? comMarcacoes(roteiro, fila) : roteiro

  function inserir(marca: string) {
    const el = roteiroRef.current
    if (!el) { setRoteiro((r) => r + marca); return }
    const ini = el.selectionStart ?? roteiro.length
    const fim = el.selectionEnd ?? ini
    setRoteiro(roteiro.slice(0, ini) + marca + roteiro.slice(fim))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(ini + marca.length, ini + marca.length)
    })
  }

  // Com uma pasta só, escolher não é decisão — já vem escolhida.
  useEffect(() => {
    if (!pastaAberta && pastas.length === 1) setPastaAberta(pastas[0].nome)
  }, [pastas, pastaAberta])

  const carregarPastas = useCallback(async () => {
    try {
      const j = await fetch('/api/creative-generator/library').then(json)
      if (j.error) throw new Error(j.error)
      setPastas(j.pastas || [])
      setClipes(j.clipes || [])
    } catch (e) { setErro(`${e}`) }
  }, [])

  const carregarFontes = useCallback(async (q = '', categoria = '') => {
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (categoria) params.set('categoria', categoria)
      const j = await fetch(`/api/creative-generator/fonts?${params}`).then(json)
      setFontes(j.fontes || [])
      setCatalogo(j.catalogo || [])
      setTotalFontes(j.total || 0)
      if (j.categorias?.length) setCategorias(j.categorias)
      if (j.erroIndice) setErro(j.erroIndice)
    } catch (e) { setErro(`${e}`) }
  }, [])

  // Busca com respiro: o índice tem ~1.900 famílias e não faz sentido
  // consultar a cada tecla.
  useEffect(() => {
    if (aba !== 'fontes') return
    const t = setTimeout(() => carregarFontes(buscaFonte, categoriaFonte), 250)
    return () => clearTimeout(t)
  }, [buscaFonte, categoriaFonte, aba, carregarFontes])

  const carregarConfig = useCallback(async () => {
    try {
      const j = await fetch('/api/creative-generator/settings').then(json)
      setConfigurada(!!j.configurada)
      setVozes(j.vozes || [])
      if (j.vozId) { setVozId(j.vozId); setVozEscolhida(j.vozId) }
      if (j.erro) setErro(j.erro)
    } catch (e) { setErro(`${e}`) }
  }, [])

  const carregarProjetos = useCallback(async () => {
    try {
      const j = await fetch('/api/creative-generator/project', { cache: 'no-store' }).then(json)
      setProjetos(j.projetos || [])
    } catch { /* lista de recentes é conveniência; sem ela a página segue */ }
  }, [])

  useEffect(() => {
    carregarPastas(); carregarFontes(); carregarConfig(); carregarProjetos()
  }, [carregarPastas, carregarFontes, carregarConfig, carregarProjetos])

  const abrirPasta = useCallback(async (nome: string) => {
    setPastaAberta(nome)
    const j = await fetch(`/api/creative-generator/library?pasta=${encodeURIComponent(nome)}`).then(json)
    setArquivos(j.arquivos || [])
  }, [])

  async function criarPasta() {
    if (!novaPasta.trim()) return
    const j = await fetch('/api/creative-generator/library', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pasta: novaPasta }),
    }).then(json)
    if (j.error) return setErro(j.error)
    setNovaPasta('')
    carregarPastas()
  }

  // No fluxo guiado não existe "pasta aberta": quem está montando um criativo
  // não deveria precisar pensar em pasta. Os clipes caem numa pasta "geral",
  // criada na hora se for o primeiro envio.
  async function subirBrolls(lista: FileList | null) {
    if (!lista?.length) return
    let pasta = pastaAberta || pastas[0]?.nome
    if (!pasta) {
      const j = await fetch('/api/creative-generator/library', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pasta: 'geral' }),
      }).then(json).catch(() => ({}))
      if (j?.error) { setErro(j.error); return }
      pasta = 'geral'
      setPastaAberta(pasta)
    }
    for (const f of Array.from(lista)) await subir(f, 'broll', pasta)
    await carregarPastas()
  }

  async function subir(f: File, tipo: 'broll' | 'fonte' | 'locucao' | 'musica', pastaAlvo?: string) {
    setEnviando(f.name)
    try {
      const sign = await fetch('/api/creative-generator/sign-upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: f.name, tipo, pasta: pastaAlvo ?? pastaAberta }),
      }).then(json)
      if (sign.error) throw new Error(sign.error)
      const { error } = await supabase.storage.from('criativos')
        .uploadToSignedUrl(sign.path, sign.token, f)
      if (error) throw new Error(error.message)
      if (tipo === 'fonte') await carregarFontes(buscaFonte, categoriaFonte)
      else if (tipo === 'locucao') setLocucao({ nome: f.name, caminho: sign.caminho })
      else if (tipo === 'musica') setMusica({ nome: f.name, caminho: sign.caminho })
      else {
        const dentro = pastaAlvo ?? pastaAberta
        if (dentro) { await abrirPasta(dentro); await carregarPastas() }
      }
    } catch (e) { setErro(`${e}`) } finally { setEnviando(null) }
  }

  async function montar() {
    setMontando(true); setErro(null); setVideoPronto(null)
    try {
      // Voz por API: gera o MP3 no ElevenLabs primeiro; daí pra frente é igual
      // ao áudio enviado à mão (a montagem só conhece um caminho no Storage).
      let locucaoPath = locucao?.caminho
      if (origemVoz === 'api') {
        setFaseMontagem('Gerando a locução no ElevenLabs...')
        const v = await fetch('/api/creative-generator/tts', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          // Marcação de b-roll é instrução de montagem, não fala: se for
          // junto, a voz lê "cifrão broll um" em voz alta.
          body: JSON.stringify({ texto: roteiro.replace(/\$[\w-]+\s*/g, ''), vozId: vozEscolhida }),
        }).then(json)
        if (v.error) throw new Error(v.error)
        locucaoPath = v.caminho
      }

      setFaseMontagem('Enviando pro servidor de vídeo...')
      const j = await fetch('/api/creative-generator/assemble', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roteiro: roteiroFinal, locucaoPath, formato, template,
          estilo: proprio ? meu.legenda_estilo : estilo,
          templateCustom: proprio ? {
            zoom: meu.zoom, zoom_forca: meu.zoom_forca, transicao: meu.transicao,
            legenda_estilo: meu.legenda_estilo, legenda_destaque: meu.legenda_destaque,
            intervalo_broll: [meu.ritmo_min, meu.ritmo_max],
          } : null,
          musicaPath: musica?.caminho || null,
          musicaVolume: musicaVol,
          fontePath: fonteEscolhida || fontes[0]?.caminho || null,
        }),
      }).then(json)
      if (j.error) throw new Error(j.error)

      // O ffmpeg roda em segundo plano na VPS; aqui só se pergunta de tempos
      // em tempos, como na camuflagem.
      const params = new URLSearchParams({ job: j.jobId, outputPath: j.outputPath })
      for (let i = 0; i < 360; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        const st = await fetch(`/api/creative-generator/assemble?${params}`, { cache: 'no-store' })
          .then(json).catch(() => ({ status: 'rodando' }))
        if (st.status === 'erro') throw new Error(st.erro || 'a montagem falhou')
        if (st.status === 'pronto') {
          setVideoPronto({ url: st.url, downloadUrl: st.downloadUrl, projetoId: j.projetoId, tempos: st.tempos })
          carregarProjetos()
          setFaseMontagem('')
          return
        }
        setFaseMontagem(`Montando... ${(i + 1) * 5}s`)
      }
      throw new Error('a montagem demorou demais')
    } catch (e) {
      setErro(e instanceof Error ? e.message : `${e}`)
      setFaseMontagem('')
    } finally { setMontando(false) }
  }

  async function baixarFonte(familia: string, peso: number) {
    setBaixando(familia); setErro(null)
    try {
      const j = await fetch('/api/creative-generator/fonts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ familia, peso }),
      }).then(json)
      if (j.error) throw new Error(j.error)
      await carregarFontes(buscaFonte, categoriaFonte)
    } catch (e) { setErro(`${e}`) } finally { setBaixando(null) }
  }

  async function renomear(caminho: string) {
    const alvo = nomeNovo.trim()
    setRenomeando(null)
    if (!alvo) return
    try {
      const j = await fetch('/api/creative-generator/library', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caminho, novoNome: alvo }),
      }).then(json)
      if (j.error) throw new Error(j.error)
      if (pastaAberta) { await abrirPasta(pastaAberta); await carregarPastas() }
    } catch (e) { setErro(`${e}`) }
  }

  async function apagar(corpo: object, recarrega: () => void) {
    const j = await fetch('/api/creative-generator/library', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    }).then(json)
    if (j.error) return setErro(j.error)
    recarrega()
  }

  async function salvarConfig() {
    setSalvando(true); setErro(null)
    try {
      const j = await fetch('/api/creative-generator/settings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: chave, vozId }),
      }).then(json)
      if (j.error) throw new Error(j.error)
      setChave('')
      setVozEscolhida(vozId)
      await carregarConfig()
    } catch (e) { setErro(`${e}`) } finally { setSalvando(false) }
  }

  async function acaoCopy(acao: 'transcrever' | 'adaptar') {
    setOcupado(acao); setErro(null)
    try {
      const j = await fetch('/api/creative-generator/copy', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          acao, url: linkVideo, texto: roteiro, produto,
          etiquetas: pastas.map((p) => p.nome),
        }),
      }).then(json)
      if (j.error) throw new Error(j.error)
      setRoteiro(j.texto)
    } catch (e) { setErro(`${e}`) } finally { setOcupado(null) }
  }

  const ABAS: { id: Aba; rotulo: string; icone: typeof Folder }[] = [
    { id: 'roteiro', rotulo: 'Roteiro', icone: FileText },
    { id: 'biblioteca', rotulo: 'B-rolls', icone: Folder },
    { id: 'fontes', rotulo: 'Fontes', icone: Type },
    { id: 'config', rotulo: 'Voz', icone: Mic2 },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 grid place-items-center">
          <Clapperboard className="w-5 h-5 text-fuchsia-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Gerador de Criativos Automáticos</h1>
          <p className="text-xs text-muted-foreground">
            Roteiro + voz da expert + b-rolls por etiqueta + legenda animada.
          </p>
        </div>
      </div>

      {/* Preparo: antes de escrever, três coisas precisam existir. Enquanto
          faltar alguma, ela fica em evidência; completo, vira uma linha fina. */}
      {faltando.filter((f) => f !== 'escrever o roteiro').length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            { ok: prontos.voz, aba: 'config' as Aba, icone: Mic2, titulo: 'Voz da expert',
              feito: origemVoz === 'arquivo' ? 'locução enviada' : 'voz escolhida',
              falta: origemVoz === 'arquivo' ? 'enviar o áudio da locução'
                : configurada ? 'escolha a voz' : 'conectar ElevenLabs' },
            { ok: prontos.broll, aba: 'biblioteca' as Aba, icone: Film, titulo: 'B-rolls',
              feito: `${clipesTotais} clipe(s) em ${pastas.length} pasta(s)`, falta: 'criar pasta e enviar clipes' },
            { ok: prontos.fonte, aba: 'fontes' as Aba, icone: Type, titulo: 'Fonte da legenda',
              feito: `${fontes.length} fonte(s)`, falta: 'enviar um .ttf ou .otf' },
          ]).map((c) => (
            <button key={c.titulo} onClick={() => setAba(c.aba)}
              className={`text-left rounded-xl border px-4 py-3 transition ${
                c.ok ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                     : 'border-border bg-white/[0.02] hover:border-fuchsia-500/40'
              }`}>
              <span className="flex items-center gap-2">
                {c.ok
                  ? <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  : <c.icone className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className="text-sm font-semibold text-foreground">{c.titulo}</span>
              </span>
              <span className={`block text-[11px] mt-0.5 ${c.ok ? 'text-emerald-300/80' : 'text-muted-foreground'}`}>
                {c.ok ? c.feito : c.falta}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-emerald-300/80 inline-flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Tudo pronto: voz, {clipesTotais} clipe(s) e {fontes.length} fonte(s).
        </p>
      )}

      {erro && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-200 flex-1">{erro}</p>
          <button onClick={() => setErro(null)} className="text-rose-300/70 hover:text-rose-200 text-xs">fechar</button>
        </div>
      )}

      {modo === 'guiado' && (
        <div className="space-y-3">
          <Passo n={1} titulo="O áudio da fala" pronto={!!locucao}
            ajuda="O áudio que a expert gravou — pode ser o do WhatsApp mesmo.">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => locucaoRef.current?.click()} disabled={!!enviando}
                className="px-3 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center gap-1.5">
                {enviando === 'locucao' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                {locucao ? 'Trocar o áudio' : 'Enviar o áudio'}
              </button>
              {locucao
                ? <span className="text-xs text-emerald-300/90 inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> {locucao.nome}
                  </span>
                : <span className="text-xs text-muted-foreground">mp3, m4a, ogg ou wav</span>}
            </div>
          </Passo>

          <Passo n={2} titulo="O que ela fala" pronto={palavras >= 10}
            ajuda="Cole a copy, igual ao que está sendo dito no áudio. É isso que vira legenda.">
            <textarea value={roteiro} onChange={(e) => setRoteiro(e.target.value)} rows={6}
              placeholder="Dia 3 da série te mostrando rendas extras reais na internet..."
              className="w-full rounded-lg bg-black/30 border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-fuchsia-500/50" />
            <span className="text-[11px] text-muted-foreground">{palavras} palavra(s) · aprox. {segundos}s de fala</span>
          </Passo>

          <Passo n={3} titulo="Os b-rolls, na ordem" pronto={fila.length > 0}
            ajuda="Escolha a pasta do criativo e clique nos clipes na ordem em que eles aparecem. Dá pra repetir o mesmo clipe.">
            {/* A pasta é o "projeto": uma por criativo (B-rolls AD12) deixa a
                lista de clipes curta e a escolha óbvia. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1">Pasta:</span>
              {pastas.map((pa) => (
                <Mini key={pa.nome} ativo={pastaAberta === pa.nome}
                  onClick={() => { setPastaAberta(pa.nome); setFila([]) }}>
                  {pa.nome} <span className="opacity-50">{pa.clipes}</span>
                </Mini>
              ))}
              {criandoPasta ? (
                <span className="inline-flex items-center gap-1">
                  <input autoFocus value={novaPasta} onChange={(e) => setNovaPasta(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') { const nome = novaPasta.trim(); await criarPasta(); if (nome) setPastaAberta(nome); setCriandoPasta(false) }
                      if (e.key === 'Escape') { setNovaPasta(''); setCriandoPasta(false) }
                    }}
                    placeholder="B-rolls AD12"
                    className="w-32 rounded-md bg-black/30 border border-fuchsia-500/40 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none" />
                </span>
              ) : (
                <button onClick={() => setCriandoPasta(true)}
                  className="px-2.5 py-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <FolderPlus className="w-3 h-3" /> Nova pasta
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => brollGuiadoRef.current?.click()} disabled={!!enviando}
                className="px-3 py-1.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 disabled:opacity-50 text-xs text-foreground inline-flex items-center gap-1.5">
                {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                Enviar b-rolls
              </button>
              <input ref={brollGuiadoRef} type="file" accept="video/*" multiple className="hidden"
                onChange={(e) => { subirBrolls(e.target.files); e.target.value = '' }} />
              <span className="text-[11px] text-muted-foreground">
                {enviando ? `enviando ${enviando}...`
                  : pastaAberta ? `${clipesDaPasta.length} clipe(s) em "${pastaAberta}"`
                  : `${clipes.length} clipe(s) no total`}
              </span>
            </div>
            {clipesDaPasta.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {pastaAberta ? `A pasta "${pastaAberta}" está vazia — envie os b-rolls acima.`
                             : 'Crie uma pasta pro criativo e envie os b-rolls dele.'}
              </span>
            ) : (
              <>
                {fila.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {fila.map((nome, i) => (
                      <span key={`${nome}-${i}`}
                        className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 text-xs text-foreground">
                        <span className="text-fuchsia-300 tabular-nums">{i + 1}.</span> {nome}
                        <button onClick={() => setFila((f) => f.filter((_, k) => k !== i))}
                          className="text-muted-foreground hover:text-rose-300 px-1" title="tirar da fila">×</button>
                      </span>
                    ))}
                    <button onClick={() => setFila([])}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline px-1">limpar</button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {clipesDaPasta.map((c) => (
                    <button key={c.caminho} onClick={() => setFila((f) => [...f, c.nome])}
                      className="px-2.5 py-1.5 rounded-lg border border-border bg-white/[0.02] hover:border-fuchsia-500/40 text-xs text-foreground inline-flex items-center gap-1.5">
                      <Plus className="w-3 h-3 text-muted-foreground" /> {c.nome}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Passo>

          <Passo n={4} titulo="O estilo da edição" pronto
            ajuda="Define o ritmo do corte, o zoom e a legenda. Dá pra ajustar tudo depois, no editor.">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => { setProprio(false); setTemplate(t.id); setEstilo(ESTILO_DO_TEMPLATE[t.id] as EstiloId) }}
                  className={`text-left rounded-lg border px-3 py-2 transition ${
                    !proprio && template === t.id ? 'border-fuchsia-500/60 bg-fuchsia-500/10' : 'border-border bg-white/[0.02] hover:border-fuchsia-500/40'
                  }`}>
                  <span className="block text-sm font-semibold text-foreground">{t.nome}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">{t.desc}</span>
                </button>
              ))}
              <button onClick={() => setProprio(true)}
                className={`text-left rounded-lg border px-3 py-2 transition ${
                  proprio ? 'border-fuchsia-500/60 bg-fuchsia-500/10' : 'border-border bg-white/[0.02] hover:border-fuchsia-500/40'
                }`}>
                <span className="block text-sm font-semibold text-foreground">Meu estilo</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Você define o ritmo, o zoom, a entrada e a legenda.
                </span>
              </button>
            </div>

            {/* Importar a análise de um criativo de referência. */}
            <div className="space-y-2">
              <button onClick={() => setColando((v) => !v)}
                className="text-xs text-fuchsia-300 hover:text-fuchsia-200 underline inline-flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" /> Copiar o estilo de um criativo que funcionou
              </button>
              {colando && (
                <div className="space-y-2 rounded-lg border border-border bg-black/20 px-3 py-3">
                  <p className="text-[11px] text-muted-foreground">
                    Cole aqui o <b>style_config.json</b> da análise do vídeo de referência.
                  </p>
                  <textarea value={analise} onChange={(e) => setAnalise(e.target.value)} rows={5}
                    placeholder='{ "metadados": { ... }, "legenda": { ... } }'
                    className="w-full rounded-md bg-black/40 border border-border px-2 py-1.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-fuchsia-500/50" />
                  <button onClick={aplicarAnalise} disabled={!analise.trim()}
                    className="px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40 text-white text-xs font-medium">
                    Aplicar no estilo
                  </button>
                  {importado && (
                    <div className="space-y-1.5 text-[11px] pt-1">
                      {importado.aplicado.length > 0 && (
                        <div>
                          <span className="text-emerald-300 font-medium">Aplicado:</span>
                          <ul className="text-muted-foreground list-disc pl-4">
                            {importado.aplicado.map((a, i) => <li key={i}>{a}</li>)}
                          </ul>
                        </div>
                      )}
                      {importado.ignorado.length > 0 && (
                        <div>
                          <span className="text-amber-300 font-medium">Ainda não dá pra reproduzir:</span>
                          <ul className="text-muted-foreground list-disc pl-4">
                            {importado.ignorado.map((a, i) => <li key={i}>{a}</li>)}
                          </ul>
                        </div>
                      )}
                      {importado.avisos.map((a, i) => (
                        <p key={i} className="text-rose-200/90 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {a}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {proprio && (
              <div className="rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/[0.04] px-3 py-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo rotulo="Movimento da imagem">
                    <div className="flex flex-wrap gap-1">
                      {([['nenhum', 'Parado'], ['punch', 'Soco'], ['in', 'Fecha'], ['out', 'Abre'], ['alternado', 'Alterna']] as const).map(([id, rot]) => (
                        <Mini key={id} ativo={meu.zoom === id} onClick={() => setMeu((m) => ({ ...m, zoom: id }))}>{rot}</Mini>
                      ))}
                    </div>
                  </Campo>
                  <Campo rotulo="Entrada de cada b-roll">
                    <div className="flex flex-wrap gap-1">
                      {([['corte', 'Corte seco'], ['fade', 'Fade'], ['flash', 'Flash branco']] as const).map(([id, rot]) => (
                        <Mini key={id} ativo={meu.transicao === id} onClick={() => setMeu((m) => ({ ...m, transicao: id }))}>{rot}</Mini>
                      ))}
                    </div>
                  </Campo>
                </div>
                {meu.zoom !== 'nenhum' && (
                  <Campo rotulo={`Força do movimento — ${Math.round(meu.zoom_forca * 100)}%`}>
                    <input type="range" min={2} max={40} step={1} value={Math.round(meu.zoom_forca * 100)}
                      onChange={(e) => setMeu((m) => ({ ...m, zoom_forca: Number(e.target.value) / 100 }))}
                      className="w-full" />
                  </Campo>
                )}
                <Campo rotulo={`Troca de b-roll a cada ${meu.ritmo_min}s a ${meu.ritmo_max}s`}>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0.6} max={10} step={0.1} value={meu.ritmo_min}
                      onChange={(e) => setMeu((m) => ({ ...m, ritmo_min: Number(e.target.value) }))} className="w-full" />
                    <input type="range" min={0.6} max={10} step={0.1} value={meu.ritmo_max}
                      onChange={(e) => setMeu((m) => ({ ...m, ritmo_max: Number(e.target.value) }))} className="w-full" />
                  </div>
                </Campo>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo rotulo="Legenda">
                    <div className="flex flex-wrap gap-1">
                      {ESTILOS.map((e) => (
                        <Mini key={e.id} ativo={meu.legenda_estilo === e.id}
                          onClick={() => setMeu((m) => ({ ...m, legenda_estilo: e.id }))}>{e.nome}</Mini>
                      ))}
                    </div>
                  </Campo>
                  <Campo rotulo="Cor do destaque">
                    <div className="flex items-center gap-2">
                      <input type="color" value={meu.legenda_destaque}
                        onChange={(e) => setMeu((m) => ({ ...m, legenda_destaque: e.target.value }))}
                        className="w-10 h-8 rounded bg-transparent border border-border cursor-pointer" />
                      <span className="text-xs text-muted-foreground tabular-nums">{meu.legenda_destaque}</span>
                    </div>
                  </Campo>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Isto é o ponto de partida. Cor, tamanho, posição, aberração e brilho da legenda,
                  e o zoom de cada trecho, você afina no editor depois de montar.
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {FORMATOS.map((f) => (
                <button key={f.id} onClick={() => setFormato(f.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                    formato === f.id ? 'border-fuchsia-500/60 bg-fuchsia-500/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                  }`}>
                  {f.rotulo} <span className="opacity-60">{f.onde}</span>
                </button>
              ))}
            </div>
          </Passo>

          <Passo n={5} titulo="Trilha de fundo (opcional)" pronto={!!musica}
            ajuda="Ela entra em loop e abaixa sozinha quando a expert fala. Sem trilha, sai só a voz.">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => musicaRef.current?.click()} disabled={!!enviando}
                className="px-3 py-1.5 rounded-lg border border-border bg-white/[0.02] hover:border-fuchsia-500/40 disabled:opacity-50 text-xs text-foreground inline-flex items-center gap-1.5">
                <UploadCloud className="w-3.5 h-3.5" /> {musica ? 'Trocar a trilha' : 'Enviar uma trilha'}
              </button>
              <input ref={musicaRef} type="file" accept="audio/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f, 'musica'); e.target.value = '' }} />
              {musica && (
                <>
                  <span className="text-xs text-emerald-300/90 inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> {musica.nome}
                  </span>
                  <button onClick={() => setMusica(null)}
                    className="text-[11px] text-muted-foreground hover:text-rose-300 underline">tirar</button>
                </>
              )}
            </div>
            {musica && (
              <label className="flex items-center gap-2 max-w-sm">
                <span className="text-[11px] text-muted-foreground w-28 shrink-0">
                  Volume {Math.round(musicaVol * 100)}%
                </span>
                <input type="range" min={2} max={60} step={1} value={Math.round(musicaVol * 100)}
                  onChange={(e) => setMusicaVol(Number(e.target.value) / 100)} className="w-full" />
              </label>
            )}
          </Passo>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={montar}
              disabled={montando || !locucao || palavras < 10 || fila.length === 0 || fontes.length === 0}
              className="px-5 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40 text-white font-semibold inline-flex items-center gap-2">
              {montando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {montando ? faseMontagem || 'Montando...' : 'Montar o criativo'}
            </button>
            {fontes.length === 0 && (
              <button onClick={() => { setModo('avancado'); setAba('fontes') }}
                className="text-xs text-amber-300 hover:text-amber-200 underline">
                Falta escolher a fonte da legenda
              </button>
            )}
            <button onClick={() => setModo('avancado')}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-auto">
              Modo avançado
            </button>
          </div>
        </div>
      )}

      {modo === 'avancado' && (
      <div className="flex gap-1.5 border-b border-border">
        <button onClick={() => setModo('guiado')}
          className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition ${
              aba === a.id ? 'border-fuchsia-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <a.icone className="w-4 h-4" /> {a.rotulo}
          </button>
        ))}
      </div>
      )}

      {modo === 'avancado' && aba === 'roteiro' && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {([['minha', 'Escrevo eu'], ['concorrente', 'Do concorrente'], ['nosso', 'De um anúncio nosso']] as const).map(([id, rot]) => (
              <button key={id} onClick={() => setOrigem(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                  origem === id ? 'border-fuchsia-500 bg-fuchsia-500/15 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}>{rot}</button>
            ))}
          </div>

          {origem !== 'minha' && (
            <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-2.5">
              <p className="text-xs text-muted-foreground">
                {origem === 'concorrente'
                  ? 'Cole o link do anúncio do concorrente. Eu transcrevo a fala e adapto pro seu produto.'
                  : 'Cole o link de um anúncio seu que funcionou. Serve pra gerar variações em cima do que já performa.'}
              </p>
              <div className="flex gap-2">
                <input value={linkVideo} onChange={(e) => setLinkVideo(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 rounded-lg border border-border bg-black/20 px-3 py-2 text-xs text-foreground
                             placeholder:text-muted-foreground/60 focus:outline-none focus:border-fuchsia-500/60" />
                <button onClick={() => acaoCopy('transcrever')} disabled={!!ocupado}
                  className="rounded-lg px-3 py-2 text-xs font-bold bg-white/10 hover:bg-white/15 disabled:opacity-60
                             inline-flex items-center gap-1.5">
                  {ocupado === 'transcrever' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  Transcrever
                </button>
              </div>
              <input value={produto} onChange={(e) => setProduto(e.target.value)}
                placeholder="Seu produto/oferta — pra IA saber pra onde adaptar"
                className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-xs text-foreground
                           placeholder:text-muted-foreground/60 focus:outline-none focus:border-fuchsia-500/60" />
              <button onClick={() => acaoCopy('adaptar')} disabled={!!ocupado || !roteiro.trim()}
                className="w-full rounded-lg px-3 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500
                           disabled:opacity-60 text-white inline-flex items-center justify-center gap-1.5">
                {ocupado === 'adaptar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Adaptar para o meu produto
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Roteiro</p>
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-3">
              <span>{palavras} palavra(s)</span>
              {palavras > 0 && (
                <span className={`inline-flex items-center gap-1 ${segundos > 90 ? 'text-amber-300' : ''}`}>
                  <Clock className="w-3 h-3" /> ~{segundos}s de locução
                </span>
              )}
            </p>
          </div>

          <textarea ref={roteiroRef} value={roteiro} onChange={(e) => setRoteiro(e.target.value)} rows={10}
            placeholder={'Uma fala por linha, do jeito que vai ser locutado.\n\nOnde quiser imagem de apoio, marque assim:\nHoje eu vou te mostrar [broll: dinheiro x3] uma forma diferente.'}
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground
                       placeholder:text-muted-foreground/50 font-mono leading-relaxed resize-y
                       focus:outline-none focus:border-fuchsia-500/60" />

          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-muted-foreground">
              <b className="text-foreground">Imagens de apoio</b> — clique pra inserir onde o cursor está.
              <span className="block mt-0.5">
                <code className="text-foreground">[broll: pasta x3]</code> sorteia 3 clipes da pasta ·{' '}
                <code className="text-foreground">$nome-do-clipe</code> usa aquele arquivo específico.
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {pastas.length === 0 ? (
                <button onClick={() => setAba('biblioteca')}
                  className="text-[11px] rounded-md border border-dashed border-border px-2 py-1
                             text-muted-foreground hover:text-foreground hover:border-fuchsia-500/40
                             inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" /> criar a primeira pasta de b-roll
                </button>
              ) : pastas.map((p) => (
                <button key={p.nome} onClick={() => inserir(`[broll: ${p.nome} x1]`)} disabled={p.clipes === 0}
                  title={p.clipes === 0 ? 'pasta vazia — envie clipes antes' : `inserir [broll: ${p.nome} x1]`}
                  className="text-[11px] rounded-md bg-white/5 border border-border px-2 py-1 text-foreground
                             hover:border-fuchsia-500/50 hover:bg-fuchsia-500/10 disabled:opacity-40
                             disabled:hover:border-border disabled:hover:bg-white/5 transition">
                  {p.nome} <span className="text-muted-foreground">({p.clipes})</span>
                </button>
              ))}
            </div>

            {clipes.length > 0 && (
              <>
                <p className="text-[11px] text-muted-foreground mt-3 mb-1.5">Clipes, por nome:</p>
                <div className="flex flex-wrap gap-1.5">
                  {clipes.map((c) => (
                    <button key={c.caminho} onClick={() => inserir(`$${c.nome}`)}
                      title={`pasta ${c.pasta}`}
                      className="text-[11px] rounded-md bg-white/5 border border-border px-2 py-1 text-foreground
                                 hover:border-fuchsia-500/50 hover:bg-fuchsia-500/10 transition font-mono">
                      ${c.nome}
                    </button>
                  ))}
                </div>
              </>
            )}

            {desconhecidas.length > 0 && (
              <p className="text-[11px] text-amber-300 mt-3 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  Sem correspondência na biblioteca: {desconhecidas.map((d) => (
                    <code key={d} className="font-mono">{d}</code>
                  )).reduce((a, b) => <>{a}, {b}</>)}. A montagem vai pular esses trechos.
                </span>
              </p>
            )}
          </div>

          {/* Formato e legenda: decisões de projeto, não de exportação — a
              proporção muda o enquadramento dos b-rolls e o corpo da legenda. */}
          <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Template de edição</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TEMPLATES.map((t) => {
                  const ativo = template === t.id
                  return (
                    <button key={t.id}
                      onClick={() => { setTemplate(t.id); setEstilo(ESTILO_DO_TEMPLATE[t.id]) }}
                      className={`rounded-lg border px-3 py-2.5 text-left transition ${
                        ativo ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-border hover:border-fuchsia-500/40'
                      }`}>
                      <span className="block text-xs font-bold text-foreground">{t.nome}</span>
                      <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5">{t.desc}</span>
                      <span className="block text-[10px] text-fuchsia-300/80 mt-1">{t.ritmo}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                O template define o ritmo dos cortes, o zoom e a entrada de cada b-roll. A legenda
                abaixo já vem no estilo dele — troque se quiser.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Formato</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FORMATOS.map((f) => {
                  const ativo = formato === f.id
                  const alturaAmostra = 40
                  const larguraAmostra = Math.round(alturaAmostra * (f.w / f.h))
                  return (
                    <button key={f.id} onClick={() => setFormato(f.id)}
                      className={`rounded-lg border px-3 py-2.5 flex items-center gap-2.5 transition ${
                        ativo ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-border hover:border-fuchsia-500/40'
                      }`}>
                      <span className={`shrink-0 rounded-sm border ${ativo ? 'border-fuchsia-400 bg-fuchsia-400/20' : 'border-muted-foreground/50'}`}
                        style={{ width: larguraAmostra, height: alturaAmostra }} />
                      <span className="min-w-0 text-left">
                        <span className="block text-xs font-bold text-foreground">{f.rotulo}</span>
                        <span className="block text-[10px] text-muted-foreground leading-tight">{f.onde}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Saída em {FORMATOS.find((f) => f.id === formato)!.w}×{FORMATOS.find((f) => f.id === formato)!.h}, 30 fps.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Estilo da legenda</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ESTILOS.map((e) => {
                  const ativo = estilo === e.id
                  return (
                    <button key={e.id} onClick={() => setEstilo(e.id)}
                      className={`rounded-lg border overflow-hidden text-left transition ${
                        ativo ? 'border-fuchsia-500' : 'border-border hover:border-fuchsia-500/40'
                      }`}>
                      <span className="block h-20 bg-black/40 grid place-items-center px-2">
                        {e.id === 'palavra' && (
                          <span className="text-lg font-extrabold text-white"
                            style={{ textShadow: '0 0 3px #000, 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000' }}>
                            DINHEIRO
                          </span>
                        )}
                        {e.id === 'destaque' && (
                          <span className="text-[11px] font-extrabold text-white text-center leading-tight"
                            style={{ textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>
                            hoje eu vou te <span className="text-lime-300">mostrar</span> uma forma
                          </span>
                        )}
                        {e.id === 'bloco' && (
                          <span className="text-[10px] font-bold text-white text-center leading-tight bg-black/70 px-2 py-1 rounded">
                            hoje eu vou te mostrar<br />uma forma diferente
                          </span>
                        )}
                      </span>
                      <span className={`block px-3 py-2 ${ativo ? 'bg-fuchsia-500/10' : ''}`}>
                        <span className="block text-xs font-semibold text-foreground">{e.nome}</span>
                        <span className="block text-[10px] text-muted-foreground leading-tight">{e.desc}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Destino da página: o botão existe desde já e diz o que falta —
              some melhor que um botão escondido que aparece do nada no fim. */}
          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Gerar vídeo</p>
              <p className="text-[11px] text-muted-foreground">
                {faseMontagem ? faseMontagem
                  : faltando.length === 0
                    ? 'A montagem roda no servidor de vídeo e leva alguns minutos.'
                    : `Ainda falta ${faltando.join(', ')}.`}
              </p>
            </div>
            <button onClick={montar} disabled={montando || faltando.length > 0 || desconhecidas.length > 0}
              className="shrink-0 rounded-lg px-4 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500
                         text-white disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
              {montando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
              {montando ? 'Montando...' : 'Gerar'}
            </button>
          </div>

          {videoPronto && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.07] p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-400" /> Vídeo pronto
                {videoPronto.tempos && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    ({Object.entries(videoPronto.tempos).map(([k, v]) => `${k} ${v}s`).join(' · ')})
                  </span>
                )}
              </p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={videoPronto.url} controls className="w-full max-w-[320px] rounded-lg border border-border" />
              <div className="flex flex-wrap gap-2">
                <a href={videoPronto.downloadUrl || videoPronto.url}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold
                             bg-emerald-600 hover:bg-emerald-500 text-white">
                  <Download className="w-3.5 h-3.5" /> Baixar
                </a>
                {videoPronto.projetoId && (
                  <a href={`/tools/creative-generator/editor?id=${videoPronto.projetoId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold
                               bg-fuchsia-600 hover:bg-fuchsia-500 text-white">
                    <Clapperboard className="w-3.5 h-3.5" /> Abrir no editor
                  </a>
                )}
              </div>
            </div>
          )}

          {projetos.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Criativos recentes</p>
              <div className="flex flex-wrap gap-2">
                {projetos.slice(0, 8).map((pr) => (
                  <a key={pr.id} href={`/tools/creative-generator/editor?id=${pr.id}`}
                    className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted inline-flex items-center gap-1.5">
                    <Clapperboard className="w-3.5 h-3.5 text-fuchsia-400" />
                    {new Date(pr.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {modo === 'avancado' && aba === 'biblioteca' && (
        <div className="space-y-3">
          {!pastaAberta ? (
            <>
              <div className="flex gap-2">
                <input value={novaPasta} onChange={(e) => setNovaPasta(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && criarPasta()}
                  placeholder="Nome da pasta — vira a etiqueta do roteiro (ex.: dinheiro)"
                  className="flex-1 rounded-lg border border-border bg-black/20 px-3 py-2 text-xs text-foreground
                             placeholder:text-muted-foreground/60 focus:outline-none focus:border-fuchsia-500/60" />
                <button onClick={criarPasta}
                  className="rounded-lg px-3 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white
                             inline-flex items-center gap-1.5">
                  <FolderPlus className="w-3.5 h-3.5" /> Criar
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {pastas.map((p) => (
                  <div key={p.nome}
                    className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 flex items-center justify-between
                               hover:border-fuchsia-500/40 transition group">
                    <button onClick={() => abrirPasta(p.nome)} className="flex items-center gap-2 min-w-0 text-left">
                      <Folder className="w-4 h-4 text-fuchsia-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground truncate">{p.nome}</span>
                        <span className="block text-[11px] text-muted-foreground">{p.clipes} clipe(s)</span>
                      </span>
                    </button>
                    <button onClick={() => apagar({ pasta: p.nome }, carregarPastas)}
                      className="opacity-0 group-hover:opacity-100 text-rose-300/70 hover:text-rose-300 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {pastas.length === 0 && (
                  <p className="text-xs text-muted-foreground col-span-full py-6 text-center">
                    Nenhuma pasta ainda. Crie uma por tema — o nome dela é a etiqueta que você usa no roteiro.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button onClick={() => { setPastaAberta(null); carregarPastas() }}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ChevronLeft className="w-3.5 h-3.5" /> Todas as pastas
                </button>
                <button onClick={() => brollRef.current?.click()} disabled={!!enviando}
                  className="rounded-lg px-3 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white
                             disabled:opacity-60 inline-flex items-center gap-1.5">
                  {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                  {enviando ? 'Enviando...' : 'Enviar clipes'}
                </button>
                <input ref={brollRef} type="file" accept="video/*" multiple className="hidden"
                  onChange={async (e) => {
                    for (const f of Array.from(e.target.files || [])) await subir(f, 'broll')
                    e.target.value = ''
                  }} />
              </div>
              <p className="text-xs text-muted-foreground">
                Pasta <code className="text-foreground">{pastaAberta}</code> — sorteio com{' '}
                <code className="text-foreground">[broll: {pastaAberta} x2]</code>, ou um clipe
                específico com <code className="text-foreground">$nome-do-arquivo</code>.
              </p>
              <p className="text-[11px] text-muted-foreground">
                O áudio dos clipes é removido na montagem — só a locução fica. Pode enviar com som.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {arquivos.map((a) => {
                  const semExt = a.nome.replace(/\.[^.]+$/, '')
                  const dur = duracoes[a.caminho]
                  return (
                    <div key={a.caminho}
                      className="rounded-xl border border-border bg-white/[0.02] overflow-hidden group">
                      {/* #t=0.5 faz o player mostrar um quadro em vez de tela
                          preta, sem precisar gerar miniatura no servidor. */}
                      {a.url ? (
                        <video src={`${a.url}#t=0.5`} preload="metadata" muted playsInline
                          controls={false}
                          onLoadedMetadata={(e) => {
                            // Lê ANTES do setState: dentro da função de
                            // atualização o React já zerou currentTarget.
                            const d = e.currentTarget.duration
                            setDuracoes((m) => ({ ...m, [a.caminho]: d }))
                          }}
                          onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}) }}
                          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0.5 }}
                          className="w-full aspect-[9/16] object-cover bg-black cursor-pointer"
                          onClick={(e) => {
                            const v = e.currentTarget
                            if (v.paused) v.play().catch(() => {}); else v.pause()
                          }} />
                      ) : (
                        <div className="w-full aspect-[9/16] bg-black grid place-items-center">
                          <Film className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}

                      <div className="px-2.5 py-2">
                        {renomeando === a.caminho ? (
                          <input autoFocus value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)}
                            onBlur={() => renomear(a.caminho)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renomear(a.caminho)
                              if (e.key === 'Escape') setRenomeando(null)
                            }}
                            className="w-full rounded border border-fuchsia-500/60 bg-black/30 px-1.5 py-1
                                       text-[11px] text-foreground focus:outline-none" />
                        ) : (
                          <button onClick={() => { setRenomeando(a.caminho); setNomeNovo(semExt) }}
                            title="clique pra renomear"
                            className="block w-full text-left text-[11px] font-mono text-foreground truncate
                                       hover:text-fuchsia-300">
                            ${semExt}
                          </button>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {mb(a.tamanho)}{dur ? ` · ${dur.toFixed(1)}s` : ''}
                          </span>
                          <button onClick={() => apagar({ caminho: a.caminho }, () => abrirPasta(pastaAberta))}
                            className="text-rose-300/60 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {arquivos.length === 0 && (
                  <p className="text-xs text-muted-foreground py-6 text-center col-span-full">Pasta vazia.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {modo === 'avancado' && aba === 'fontes' && (
        <div className="space-y-3">
          {/* A prévia usa a fonte de verdade: o Google serve woff2 pro
              navegador, e o servidor baixa o TTF da MESMA família. */}
          {catalogo.length > 0 && (
            <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${
              catalogo.map((c) =>
                `family=${encodeURIComponent(c.familia)}:wght@${pesoEscolhido[c.familia] ?? c.peso}`
              ).join('&')
            }&display=swap`} />
          )}

          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 flex items-start gap-2">
            <Type className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              A fonte é usada na legenda animada. Escolha uma do catálogo que eu baixo e instalo,
              ou envie a sua. O servidor de vídeo não vem com fonte nenhuma, então sem pelo menos
              uma aqui a legenda não é desenhada.
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input value={buscaFonte} onChange={(e) => setBuscaFonte(e.target.value)}
                  placeholder="Buscar no Google Fonts inteiro..."
                  className="w-full rounded-lg border border-border bg-black/20 pl-8 pr-3 py-2 text-xs text-foreground
                             placeholder:text-muted-foreground/60 focus:outline-none focus:border-fuchsia-500/60" />
              </div>
              <select value={categoriaFonte} onChange={(e) => setCategoriaFonte(e.target.value)}
                className="rounded-lg border border-border bg-black/20 px-2 py-2 text-xs text-foreground
                           focus:outline-none focus:border-fuchsia-500/60">
                <option value="">Todas as categorias</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              {buscaFonte || categoriaFonte
                ? `${totalFontes} resultado(s) — mostrando ${catalogo.length}`
                : 'Sugeridas pra legenda. Busque pra ver as ~1.900 famílias do Google Fonts.'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {catalogo.map((c) => {
                // O selo tem que seguir o peso ESCOLHIDO no cartão, não o
                // padrão — senão trocar pra um peso já instalado continua
                // oferecendo "Instalar".
                const peso = pesoEscolhido[c.familia] ?? c.peso
                const instalada = fontes.some(
                  (f) => f.nome === `${c.familia.replace(/\s+/g, '')}-${peso}.ttf`)
                return (
                <div key={c.familia}
                  className={`rounded-xl border overflow-hidden transition ${
                    instalada ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-border bg-white/[0.02]'
                  }`}>
                  <div className="h-16 grid place-items-center px-3 bg-black/30">
                    <span className="text-xl text-foreground truncate max-w-full"
                      style={{ fontFamily: `'${c.familia}', sans-serif`, fontWeight: peso }}>
                      Ganhei R$ 1
                    </span>
                  </div>
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground truncate">{c.familia}</span>
                      {c.pesos.length > 1 ? (
                        <select value={peso}
                          onChange={(e) => setPesoEscolhido((m) => ({ ...m, [c.familia]: Number(e.target.value) }))}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 bg-transparent text-[10px] text-muted-foreground border-none p-0
                                     focus:outline-none cursor-pointer hover:text-foreground">
                          {c.pesos.map((p) => <option key={p} value={p} className="bg-background">peso {p}</option>)}
                        </select>
                      ) : (
                        <span className="block text-[10px] text-muted-foreground">peso {c.peso}</span>
                      )}
                    </span>
                    {instalada ? (
                      <span className="text-[10px] text-emerald-300 inline-flex items-center gap-1 shrink-0">
                        <Check className="w-3 h-3" /> instalada
                      </span>
                    ) : (
                      <button onClick={() => baixarFonte(c.familia, peso)} disabled={!!baixando}
                        className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold bg-fuchsia-600
                                   hover:bg-fuchsia-500 text-white disabled:opacity-50 inline-flex items-center gap-1">
                        {baixando === c.familia
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Download className="w-3 h-3" />}
                        Instalar
                      </button>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          </div>

          <p className="text-xs font-semibold text-foreground pt-1">Ou envie a sua</p>
          <button onClick={() => fonteRef.current?.click()} disabled={!!enviando}
            className="rounded-lg px-3 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white
                       disabled:opacity-60 inline-flex items-center gap-1.5">
            {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            Enviar fonte
          </button>
          <input ref={fonteRef} type="file" accept=".ttf,.otf,.woff,.woff2" multiple className="hidden"
            onChange={async (e) => {
              for (const f of Array.from(e.target.files || [])) await subir(f, 'fonte')
              e.target.value = ''
            }} />
          <div className="space-y-1.5">
            {fontes.map((f) => (
              <div key={f.caminho}
                className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-3 ${
                  (fonteEscolhida || fontes[0]?.caminho) === f.caminho
                    ? 'border-fuchsia-500/50 bg-fuchsia-500/10' : 'border-border bg-white/[0.02]'
                }`}>
                <button onClick={() => setFonteEscolhida(f.caminho)}
                  className="text-xs text-foreground truncate text-left flex-1 min-w-0">
                  {f.nome}
                  {(fonteEscolhida || fontes[0]?.caminho) === f.caminho &&
                    <span className="text-[10px] text-fuchsia-300 ml-2">usando na legenda</span>}
                </button>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-muted-foreground">{mb(f.tamanho)}</span>
                  <button onClick={async () => {
                    await fetch('/api/creative-generator/fonts', {
                      method: 'DELETE', headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ caminho: f.caminho }),
                    })
                    carregarFontes()
                  }} className="text-rose-300/70 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
                </span>
              </div>
            ))}
            {fontes.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">Nenhuma fonte enviada.</p>}
          </div>
        </div>
      )}

      {modo === 'avancado' && aba === 'config' && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {([['api', 'Gerar por API'], ['arquivo', 'Enviar áudio pronto']] as const).map(([id, rot]) => (
              <button key={id} onClick={() => setOrigemVoz(id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                  origemVoz === id ? 'border-fuchsia-500 bg-fuchsia-500/15 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}>{rot}</button>
            ))}
          </div>

          {origemVoz === 'arquivo' && (
            <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-2.5">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-fuchsia-400" /> Locução pronta
              </p>
              <p className="text-xs text-muted-foreground">
                Gere a voz onde você preferir, baixe o arquivo e envie aqui. Os tempos de cada
                palavra saem da transcrição na sua VPS, então a legenda animada funciona igual.
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground min-w-0 truncate">
                  {locucao
                    ? <>Arquivo: <span className="text-foreground font-medium">{locucao.nome}</span></>
                    : 'Nenhum arquivo enviado.'}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {locucao && (
                    <button onClick={() => setLocucao(null)}
                      className="text-[11px] text-muted-foreground hover:text-foreground">remover</button>
                  )}
                  <button onClick={() => locucaoRef.current?.click()} disabled={!!enviando}
                    className="rounded-lg px-3 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500
                               text-white disabled:opacity-60 inline-flex items-center gap-1.5">
                    {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                    {locucao ? 'Trocar' : 'Enviar áudio'}
                  </button>
                </div>
              </div>
              <input ref={locucaoRef} type="file" accept="audio/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f, 'locucao'); e.target.value = '' }} />
              <p className="text-[11px] text-muted-foreground">
                O roteiro continua sendo usado pras marcações de b-roll — o áudio manda no tempo.
              </p>
            </div>
          )}

          <div className={`rounded-xl border border-border bg-white/[0.02] p-4 space-y-2.5 ${
            origemVoz === 'arquivo' ? 'opacity-50' : ''
          }`}>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Mic2 className="w-4 h-4 text-fuchsia-400" /> ElevenLabs
              {configurada && <span className="text-[11px] text-emerald-300 inline-flex items-center gap-1">
                <Check className="w-3 h-3" /> chave salva</span>}
            </p>
            <input type="password" value={chave} onChange={(e) => setChave(e.target.value)}
              placeholder={configurada ? 'Chave salva — preencha só pra trocar' : 'Cole a sua API key'}
              className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-xs text-foreground
                         placeholder:text-muted-foreground/60 focus:outline-none focus:border-fuchsia-500/60" />
            {vozes.length > 0 && (
              <select value={vozId} onChange={(e) => setVozId(e.target.value)}
                className="w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-xs text-foreground
                           focus:outline-none focus:border-fuchsia-500/60">
                <option value="">Escolha a voz da expert</option>
                {vozes.map((v) => <option key={v.id} value={v.id}>{v.nome}{v.categoria ? ` — ${v.categoria}` : ''}</option>)}
              </select>
            )}
            <button onClick={salvarConfig} disabled={salvando || (!chave && !vozId)}
              className="rounded-lg px-3 py-2 text-xs font-bold bg-fuchsia-600 hover:bg-fuchsia-500 text-white
                         disabled:opacity-60 inline-flex items-center gap-1.5">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Salvar
            </button>
            <p className="text-[11px] text-muted-foreground">
              A chave é validada no ElevenLabs antes de salvar e nunca volta pro navegador.
              Voz clonada exige autorização de quem cedeu a voz — é regra deles, e a conta cai sem isso.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/** Um passo do fluxo guiado: número, título, estado e o conteúdo. */
function Passo({ n, titulo, ajuda, pronto, children }: {
  n: number; titulo: string; ajuda: string; pronto?: boolean; children: React.ReactNode
}) {
  return (
    <section className={`rounded-xl border px-4 py-3 space-y-2 ${
      pronto ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-border bg-white/[0.02]'
    }`}>
      <header className="flex items-center gap-2">
        <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
          pronto ? 'bg-emerald-500/20 text-emerald-300' : 'bg-fuchsia-500/15 text-fuchsia-300'
        }`}>
          {pronto ? <Check className="w-3.5 h-3.5" /> : n}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
      </header>
      <p className="text-[11px] text-muted-foreground -mt-1 pl-8">{ajuda}</p>
      <div className="space-y-2 pl-8">{children}</div>
    </section>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  )
}

function Mini({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-md border text-xs transition ${
        ativo ? 'border-fuchsia-500/60 bg-fuchsia-500/15 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground'
      }`}>
      {children}
    </button>
  )
}
