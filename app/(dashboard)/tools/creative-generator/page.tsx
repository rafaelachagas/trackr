'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clapperboard, FolderPlus, Folder, Trash2, UploadCloud, Loader2, Type, Mic2,
  FileText, Sparkles, Check, AlertTriangle, ChevronLeft, Wand2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Gerador de Criativos Automáticos — a base: de onde vem a voz, de onde vêm as
// imagens de apoio, qual fonte a legenda usa e de onde sai o roteiro. A
// montagem do vídeo consome tudo isto e roda na VPS.

type Aba = 'roteiro' | 'biblioteca' | 'fontes' | 'config'
type Pasta = { nome: string; clipes: number }
type Arquivo = { nome: string; caminho: string; tamanho: number }
type Voz = { id: string; nome: string; categoria?: string }

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
    } catch (e) { setErro(`${e}`) }
  }, [])

  const carregarConfig = useCallback(async () => {
    try {
      const j = await fetch('/api/creative-generator/settings').then(json)
      setConfigurada(!!j.configurada)
      setVozes(j.vozes || [])
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

          <textarea value={roteiro} onChange={(e) => setRoteiro(e.target.value)} rows={14}
            placeholder={'Uma fala por linha, do jeito que vai ser locutado.\n\nOnde quiser imagem de apoio, marque assim:\nHoje eu vou te mostrar [broll: dinheiro x3] uma forma diferente.'}
            className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground
                       placeholder:text-muted-foreground/50 font-mono leading-relaxed resize-y
                       focus:outline-none focus:border-fuchsia-500/60" />

          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-muted-foreground">
              <b className="text-foreground">Etiquetas disponíveis</b> — use exatamente estes nomes na marcação:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {pastas.length === 0
                ? <span className="text-[11px] text-muted-foreground/70">nenhuma pasta ainda — crie na aba B-rolls</span>
                : pastas.map((p) => (
                  <code key={p.nome} className="text-[11px] rounded-md bg-white/5 border border-border px-2 py-0.5 text-foreground">
                    {p.nome} <span className="text-muted-foreground">({p.clipes})</span>
                  </code>
                ))}
            </div>
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
          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 flex items-start gap-2">
            <Type className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              A fonte é usada na legenda animada. O servidor de vídeo não vem com fonte nenhuma
              instalada, então sem pelo menos uma aqui a legenda não é desenhada. Aceita .ttf, .otf e .woff2.
            </p>
          </div>
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
