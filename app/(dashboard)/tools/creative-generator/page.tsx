'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clapperboard, FolderPlus, Folder, Trash2, UploadCloud, Loader2, Type, Mic2,
  FileText, Sparkles, Check, AlertTriangle, ChevronLeft, Wand2, Film, Plus, Clock, Download,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Gerador de Criativos Automáticos — a base: de onde vem a voz, de onde vêm as
// imagens de apoio, qual fonte a legenda usa e de onde sai o roteiro. A
// montagem do vídeo consome tudo isto e roda na VPS.

type Aba = 'roteiro' | 'biblioteca' | 'fontes' | 'config'
type Pasta = { nome: string; clipes: number }
type Arquivo = { nome: string; caminho: string; tamanho: number }
type Voz = { id: string; nome: string; categoria?: string }
type FonteCatalogo = { familia: string; peso: number; instalada: boolean }

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
  const [aba, setAba] = useState<Aba>('roteiro')
  const [erro, setErro] = useState<string | null>(null)

  // --- biblioteca ---
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [pastaAberta, setPastaAberta] = useState<string | null>(null)
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [novaPasta, setNovaPasta] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const brollRef = useRef<HTMLInputElement>(null)

  // --- fontes ---
  const [fontes, setFontes] = useState<Arquivo[]>([])
  const [catalogo, setCatalogo] = useState<FonteCatalogo[]>([])
  const [baixando, setBaixando] = useState<string | null>(null)
  const fonteRef = useRef<HTMLInputElement>(null)

  // --- config ---
  const [chave, setChave] = useState('')
  const [configurada, setConfigurada] = useState(false)
  const [vozes, setVozes] = useState<Voz[]>([])
  const [vozId, setVozId] = useState('')
  const [salvando, setSalvando] = useState(false)

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

  // Locução em PT-BR fica perto de 160 palavras por minuto. Serve pra avisar
  // que o roteiro passou do tamanho de um criativo antes de gastar TTS.
  const palavras = roteiro.trim() ? roteiro.trim().split(/\s+/).length : 0
  const segundos = Math.round((palavras / 160) * 60)
  const clipesTotais = pastas.reduce((n, p) => n + p.clipes, 0)

  const prontos = {
    voz: configurada && !!vozEscolhida,
    broll: clipesTotais > 0,
    fonte: fontes.length > 0,
    roteiro: palavras >= 10,
  }
  const faltando = [
    !prontos.voz && 'escolher a voz',
    !prontos.broll && 'enviar b-rolls',
    !prontos.fonte && 'enviar uma fonte',
    !prontos.roteiro && 'escrever o roteiro',
  ].filter(Boolean) as string[]

  function inserirEtiqueta(nome: string) {
    const el = roteiroRef.current
    const marca = `[broll: ${nome} x1]`
    if (!el) { setRoteiro((r) => r + marca); return }
    const ini = el.selectionStart ?? roteiro.length
    const fim = el.selectionEnd ?? ini
    setRoteiro(roteiro.slice(0, ini) + marca + roteiro.slice(fim))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(ini + marca.length, ini + marca.length)
    })
  }

  const carregarPastas = useCallback(async () => {
    try {
      const j = await fetch('/api/creative-generator/library').then(json)
      if (j.error) throw new Error(j.error)
      setPastas(j.pastas || [])
    } catch (e) { setErro(`${e}`) }
  }, [])

  const carregarFontes = useCallback(async () => {
    try {
      const j = await fetch('/api/creative-generator/fonts').then(json)
      setFontes(j.fontes || [])
      setCatalogo(j.catalogo || [])
    } catch (e) { setErro(`${e}`) }
  }, [])

  const carregarConfig = useCallback(async () => {
    try {
      const j = await fetch('/api/creative-generator/settings').then(json)
      setConfigurada(!!j.configurada)
      setVozes(j.vozes || [])
      if (j.vozId) { setVozId(j.vozId); setVozEscolhida(j.vozId) }
      if (j.erro) setErro(j.erro)
    } catch (e) { setErro(`${e}`) }
  }, [])

  useEffect(() => {
    carregarPastas(); carregarFontes(); carregarConfig()
  }, [carregarPastas, carregarFontes, carregarConfig])

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

  async function subir(f: File, tipo: 'broll' | 'fonte') {
    setEnviando(f.name)
    try {
      const sign = await fetch('/api/creative-generator/sign-upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: f.name, tipo, pasta: pastaAberta }),
      }).then(json)
      if (sign.error) throw new Error(sign.error)
      const { error } = await supabase.storage.from('criativos')
        .uploadToSignedUrl(sign.path, sign.token, f)
      if (error) throw new Error(error.message)
      if (tipo === 'fonte') await carregarFontes()
      else if (pastaAberta) { await abrirPasta(pastaAberta); await carregarPastas() }
    } catch (e) { setErro(`${e}`) } finally { setEnviando(null) }
  }

  async function baixarFonte(familia: string, peso: number) {
    setBaixando(familia); setErro(null)
    try {
      const j = await fetch('/api/creative-generator/fonts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ familia, peso }),
      }).then(json)
      if (j.error) throw new Error(j.error)
      await carregarFontes()
    } catch (e) { setErro(`${e}`) } finally { setBaixando(null) }
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
              feito: 'voz escolhida', falta: configurada ? 'escolha a voz' : 'conectar ElevenLabs' },
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

      <div className="flex gap-1.5 border-b border-border">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition ${
              aba === a.id ? 'border-fuchsia-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <a.icone className="w-4 h-4" /> {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'roteiro' && (
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
              <b className="text-foreground">Etiquetas</b> — clique pra inserir a marcação onde o cursor está.
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
                <button key={p.nome} onClick={() => inserirEtiqueta(p.nome)} disabled={p.clipes === 0}
                  title={p.clipes === 0 ? 'pasta vazia — envie clipes antes' : `inserir [broll: ${p.nome} x1]`}
                  className="text-[11px] rounded-md bg-white/5 border border-border px-2 py-1 text-foreground
                             hover:border-fuchsia-500/50 hover:bg-fuchsia-500/10 disabled:opacity-40
                             disabled:hover:border-border disabled:hover:bg-white/5 transition">
                  {p.nome} <span className="text-muted-foreground">({p.clipes})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Formato e legenda: decisões de projeto, não de exportação — a
              proporção muda o enquadramento dos b-rolls e o corpo da legenda. */}
          <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-4">
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
                            style={{ WebkitTextStroke: '2px black' }}>DINHEIRO</span>
                        )}
                        {e.id === 'destaque' && (
                          <span className="text-[11px] font-extrabold text-white text-center leading-tight"
                            style={{ WebkitTextStroke: '1px black' }}>
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
                {faltando.length === 0
                  ? 'Tudo pronto — a montagem roda no servidor de vídeo.'
                  : `Falta ${faltando.join(', ')}.`}
              </p>
            </div>
            <button disabled title="A montagem do vídeo ainda está sendo construída"
              className="shrink-0 rounded-lg px-4 py-2 text-xs font-bold bg-fuchsia-600 text-white
                         disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5" /> Gerar
            </button>
          </div>
        </div>
      )}

      {aba === 'biblioteca' && (
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
                Pasta <code className="text-foreground">{pastaAberta}</code> — etiqueta{' '}
                <code className="text-foreground">[broll: {pastaAberta}]</code>
              </p>
              <div className="space-y-1.5">
                {arquivos.map((a) => (
                  <div key={a.caminho}
                    className="rounded-lg border border-border bg-white/[0.02] px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-foreground truncate">{a.nome}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-muted-foreground">{mb(a.tamanho)}</span>
                      <button onClick={() => apagar({ caminho: a.caminho }, () => abrirPasta(pastaAberta))}
                        className="text-rose-300/70 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  </div>
                ))}
                {arquivos.length === 0 && (
                  <p className="text-xs text-muted-foreground py-6 text-center">Pasta vazia.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {aba === 'fontes' && (
        <div className="space-y-3">
          {/* A prévia usa a fonte de verdade: o Google serve woff2 pro
              navegador, e o servidor baixa o TTF da MESMA família. */}
          <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${
            catalogo.map((c) => `family=${encodeURIComponent(c.familia)}:wght@${c.peso}`).join('&')
          }&display=swap`} />

          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 flex items-start gap-2">
            <Type className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              A fonte é usada na legenda animada. Escolha uma do catálogo que eu baixo e instalo,
              ou envie a sua. O servidor de vídeo não vem com fonte nenhuma, então sem pelo menos
              uma aqui a legenda não é desenhada.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Catálogo</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {catalogo.map((c) => (
                <div key={c.familia}
                  className={`rounded-xl border overflow-hidden transition ${
                    c.instalada ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-border bg-white/[0.02]'
                  }`}>
                  <div className="h-16 grid place-items-center px-3 bg-black/30">
                    <span className="text-xl text-foreground truncate max-w-full"
                      style={{ fontFamily: `'${c.familia}', sans-serif`, fontWeight: c.peso }}>
                      Ganhei R$ 1
                    </span>
                  </div>
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground truncate">{c.familia}</span>
                      <span className="block text-[10px] text-muted-foreground">peso {c.peso}</span>
                    </span>
                    {c.instalada ? (
                      <span className="text-[10px] text-emerald-300 inline-flex items-center gap-1 shrink-0">
                        <Check className="w-3 h-3" /> instalada
                      </span>
                    ) : (
                      <button onClick={() => baixarFonte(c.familia, c.peso)} disabled={!!baixando}
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
              ))}
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
                className="rounded-lg border border-border bg-white/[0.02] px-3 py-2 flex items-center justify-between gap-3">
                <span className="text-xs text-foreground truncate">{f.nome}</span>
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

      {aba === 'config' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-white/[0.02] p-4 space-y-2.5">
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
