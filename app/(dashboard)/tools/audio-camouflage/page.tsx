'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AudioLines, Loader2, UploadCloud, Download, Film, X, Play, ChevronDown, ChevronUp,
  SlidersHorizontal, Shield, Volume2, Info, ImageIcon, Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Camuflagem: sobe criativos (vídeo ou imagem), aplica as camadas de proteção
// escolhidas e baixa o arquivo processado. O upload vai DIRETO pro Supabase
// Storage (HTTPS, sem passar pelo Vercel); a VPS baixa de lá, roda o ffmpeg e
// sobe o resultado; aqui a gente baixa o final.

type Chave =
  | 'entry_layer' | 'exit_layer' | 'invisible_shield' | 'pulses'
  | 'chroma' | 'safe_context' | 'audio_shield' | 'white_audio'

type Opcao = { chave: Chave; titulo: string; desc: string; tom?: 'video' | 'audio' | 'white' }

const VIDEO: Opcao[] = [
  { chave: 'entry_layer', titulo: 'Camada de entrada', desc: 'Proteção inteligente no início do criativo' },
  { chave: 'exit_layer', titulo: 'Camada de saída', desc: 'Proteção inteligente no final do criativo' },
  { chave: 'invisible_shield', titulo: 'Blindagem invisível', desc: 'Camada de proteção visual imperceptível ao usuário' },
  { chave: 'pulses', titulo: 'Pulsos de proteção', desc: 'Micro-pulsos visuais que confundem sistemas de análise' },
  { chave: 'chroma', titulo: 'Variação cromática', desc: 'Ajuste sutil de cor para gerar identidade única' },
  { chave: 'safe_context', titulo: 'Contexto visual seguro', desc: 'Ancora o criativo a um contexto visual aprovável no início, mantendo presença sutil durante todo o vídeo' },
]

const AUDIO: Opcao[] = [
  { chave: 'audio_shield', titulo: 'Blindagem de áudio', tom: 'audio', desc: 'O áudio permanece idêntico ao ouvido humano, mas fica invisível para sistemas automáticos de análise de conteúdo.' },
  { chave: 'white_audio', titulo: 'Substituição de áudio (White Audio)', tom: 'white', desc: 'O áudio original permanece para quem assiste. Uma conversa neutra é embutida como pista alternativa — é o que sistemas de transcrição e IA de revisão detectam.' },
]

const PADRAO: Record<Chave, boolean> = {
  entry_layer: true,
  exit_layer: false,
  invisible_shield: true,
  pulses: true,
  chroma: true,
  safe_context: true,
  audio_shield: true,
  white_audio: true,
}

const ACEITOS = /\.(mp4|mov|webm|jpe?g|png|webp|gif)$/i
const EH_IMAGEM = /\.(jpe?g|png|webp|gif)$/i

type Item = {
  id: string
  file: File
  status: 'fila' | 'rodando' | 'pronto' | 'erro'
  fase?: string
  erro?: string
  url?: string
  downloadName?: string
  kind?: 'video' | 'image'
  tempos?: Record<string, number>
}

function Toggle({ on, onChange, tom }: { on: boolean; onChange: (v: boolean) => void; tom?: string }) {
  const cor = on ? (tom === 'audio' ? 'bg-amber-500' : tom === 'white' ? 'bg-violet-500' : 'bg-emerald-500') : 'bg-muted'
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${cor}`}>
      <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function CardOpcao({ o, on, set }: { o: Opcao; on: boolean; set: (v: boolean) => void }) {
  const borda = on && o.tom === 'audio' ? 'border-amber-500/40 bg-amber-500/10'
    : on && o.tom === 'white' ? 'border-violet-500/40 bg-violet-500/10'
    : 'border-border bg-white/[0.02]'
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 transition ${borda}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{o.titulo}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p>
      </div>
      <Toggle on={on} onChange={set} tom={o.tom} />
    </div>
  )
}

export default function AudioCamouflagePage() {
  const [itens, setItens] = useState<Item[]>([])
  const [ops, setOps] = useState<Record<Chave, boolean>>({ ...PADRAO })
  const [intensidade, setIntensidade] = useState(5)
  const [aberto, setAberto] = useState(true)
  const [cta, setCta] = useState<File | null>(null)
  const [rodando, setRodando] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [preview, setPreview] = useState<Item | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ctaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!preview) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [preview])

  function escolher(fs: FileList | null) {
    setErroGeral(null)
    if (!fs?.length) return
    const bons: Item[] = []
    let ruim = 0
    Array.from(fs).forEach((f) => {
      if (!ACEITOS.test(f.name)) { ruim++; return }
      bons.push({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`, file: f, status: 'fila' })
    })
    if (ruim) setErroGeral('Alguns arquivos foram ignorados — use JPG, PNG, WebP, GIF, MP4, MOV ou WebM.')
    setItens((s) => [...s, ...bons])
  }

  function atualizar(id: string, patch: Partial<Item>) {
    setItens((s) => s.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  // A resposta pode não ser JSON (erro de gateway, função estourando o tempo).
  // Parse tolerante pra mostrar mensagem de gente em vez de "is not valid JSON".
  async function json(r: Response) {
    const txt = await r.text()
    try {
      return JSON.parse(txt)
    } catch {
      if (r.status === 504 || /timeout|timed out/i.test(txt)) throw new Error('o servidor demorou demais pra responder')
      throw new Error(`resposta inesperada do servidor (${r.status})`)
    }
  }

  async function subir(f: File, kind: 'in' | 'cta') {
    const sign = await fetch('/api/audio-camouflage/sign-upload', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: f.name, kind }),
    }).then(json)
    if (sign.error) throw new Error(sign.error)
    const ct = f.type || (EH_IMAGEM.test(f.name) ? 'image/jpeg' : 'video/mp4')
    const up = await supabase.storage.from('camuflagem').uploadToSignedUrl(sign.path, sign.token, f, { contentType: ct })
    if (up.error) throw new Error('falha ao enviar o arquivo: ' + up.error.message)
    return sign.inputPath as string
  }

  async function processar() {
    const fila = itens.filter((i) => i.status === 'fila' || i.status === 'erro')
    if (!fila.length || rodando) return
    setRodando(true); setErroGeral(null)
    try {
      // A imagem de CTA sobe uma vez e serve pra todos os arquivos da leva.
      let ctaPath: string | null = null
      if (cta && (ops.entry_layer || ops.exit_layer || ops.safe_context)) {
        ctaPath = await subir(cta, 'cta')
      }

      for (const item of fila) {
        try {
          atualizar(item.id, { status: 'rodando', fase: 'Enviando...', erro: undefined })
          const inputPath = await subir(item.file, 'in')

          atualizar(item.id, { fase: 'Processando no servidor...' })
          const proc = await fetch('/api/audio-camouflage', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              inputPath, originalName: item.file.name, ctaPath,
              options: { ...ops, intensity: intensidade },
            }),
          }).then(json)
          if (proc.error) throw new Error(proc.error)

          // O ffmpeg roda em segundo plano na VPS: aqui a gente só pergunta de
          // tempos em tempos se já terminou (sem prender nenhuma requisição).
          const params = new URLSearchParams({
            job: proc.jobId, outputPath: proc.outputPath, downloadName: proc.downloadName,
          })
          const inicio = Date.now()
          let pronto: any = null
          while (!pronto) {
            await new Promise((r) => setTimeout(r, 5000))
            if (Date.now() - inicio > 2 * 60 * 60 * 1000) throw new Error('o processamento demorou demais')
            const st = await fetch(`/api/audio-camouflage/status?${params}`, { cache: 'no-store' }).then(json)
            if (st.error && st.status !== 'rodando') throw new Error(st.error)
            if (st.status === 'pronto') pronto = st
            else atualizar(item.id, { fase: `Processando no servidor... ${Math.round((Date.now() - inicio) / 1000)}s` })
          }

          atualizar(item.id, {
            status: 'pronto', fase: undefined, url: pronto.url,
            downloadName: pronto.downloadName, kind: proc.kind, tempos: pronto.tempos,
          })
        } catch (e: any) {
          atualizar(item.id, { status: 'erro', fase: undefined, erro: e.message || 'falha no processamento' })
        }
      }
    } catch (e: any) {
      setErroGeral(e.message || 'Falha no processamento.')
    } finally {
      setRodando(false)
    }
  }

  const pendentes = itens.filter((i) => i.status === 'fila' || i.status === 'erro').length

  return (
    <div className="max-w-5xl mx-auto space-y-5 py-2">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          <AudioLines className="w-6 h-6 text-primary" /> Camuflagem de Criativos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aplica camadas de proteção de vídeo e áudio no criativo — imperceptíveis para quem assiste.
        </p>
      </div>

      {/* Opções de processamento */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <button onClick={() => setAberto((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-5 py-4 hover:bg-white/[0.02] transition">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" /> Opções de processamento
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">IA ativa</span>
          </span>
          {aberto ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {aberto && (
          <div className="px-5 pb-5 space-y-5">
            {/* Intensidade */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="text-sm font-semibold text-foreground">Intensidade do processamento</label>
                <span className="text-sm font-bold text-foreground tabular-nums">{intensidade}/10</span>
              </div>
              <input type="range" min={1} max={10} step={1} value={intensidade}
                onChange={(e) => setIntensidade(parseInt(e.target.value))}
                className="w-full accent-primary cursor-pointer" />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>Mínimo (sutil)</span><span>Máximo (forte)</span>
              </div>
            </div>

            {/* Proteção de vídeo */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> PROTEÇÃO DE VÍDEO
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {VIDEO.map((o) => (
                  <CardOpcao key={o.chave} o={o} on={ops[o.chave]}
                    set={(v) => setOps((s) => ({ ...s, [o.chave]: v }))} />
                ))}
              </div>

              {/* Imagem CTA personalizada */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Imagem CTA personalizada</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Suba sua própria imagem (ex: botão CTA, logo do produto) para ser usada como sobreposição.
                    Se não enviar nenhuma, o sistema usa imagens padrão.
                  </p>
                  <p className="text-xs italic text-muted-foreground/70 mt-1.5 flex items-center gap-1.5">
                    {cta ? (
                      <>
                        <ImageIcon className="w-3.5 h-3.5" /> <span className="truncate max-w-[220px]">{cta.name}</span>
                        <button onClick={() => setCta(null)} className="text-rose-300/80 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    ) : 'Usando imagens padrão do sistema'}
                  </p>
                </div>
                <button onClick={() => ctaRef.current?.click()}
                  className="shrink-0 px-3 py-2 rounded-lg text-xs font-bold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1.5">
                  <UploadCloud className="w-3.5 h-3.5" /> Enviar
                </button>
                <input ref={ctaRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => setCta(e.target.files?.[0] || null)} />
              </div>
            </div>

            {/* Proteção de áudio */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" /> PROTEÇÃO DE ÁUDIO
              </p>
              {AUDIO.map((o) => (
                <CardOpcao key={o.chave} o={o} on={ops[o.chave]}
                  set={(v) => setOps((s) => ({ ...s, [o.chave]: v }))} />
              ))}
            </div>

            <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                As camadas são aplicadas juntas e ficam imperceptíveis para o usuário final, mas tornam cada
                criativo único e não rastreável pelas plataformas de anúncio.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${arrastando ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
      >
        <input ref={inputRef} type="file" multiple className="hidden"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm"
          onChange={(e) => { escolher(e.target.files); e.currentTarget.value = '' }} />
        <UploadCloud className="w-7 h-7 mx-auto mb-2 text-primary/70" />
        <p className="text-sm font-medium text-foreground/90">Arraste arquivos ou clique para selecionar</p>
        <p className="text-xs text-muted-foreground mt-1">JPG · PNG · WebP · GIF · MP4 · MOV · WebM</p>
        <p className="text-[11px] text-muted-foreground/70 mt-3">
          ✓ Remove metadados&nbsp;&nbsp; ✓ Identidade única&nbsp;&nbsp; ✓ Re-encode inteligente&nbsp;&nbsp; ✓ Proteção visual
        </p>
      </div>

      {erroGeral && <p className="text-xs text-rose-300/90">{erroGeral}</p>}

      {/* Fila */}
      {itens.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {EH_IMAGEM.test(i.file.name) ? <ImageIcon className="w-4 h-4 text-primary shrink-0" /> : <Film className="w-4 h-4 text-primary shrink-0" />}
                <span className="text-sm font-semibold text-foreground truncate">{i.file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">· {(i.file.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {i.status === 'rodando' && (
                  <span className="text-xs text-primary/90 inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {i.fase}
                  </span>
                )}
                {i.status === 'erro' && <span className="text-xs text-rose-300/90 max-w-[240px] truncate" title={i.erro}>{i.erro}</span>}
                {i.status === 'pronto' && i.tempos?.ffmpeg != null && (
                  <span className="text-[11px] text-muted-foreground tabular-nums" title="tempo de cada fase no servidor">
                    baixar {i.tempos.baixar}s · encode {i.tempos.ffmpeg}s · subir {i.tempos.subir}s
                  </span>
                )}
                {i.status === 'pronto' && i.url && (
                  <>
                    <button onClick={() => setPreview(i)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/40 text-emerald-300/90 hover:bg-emerald-500/10 inline-flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Preview
                    </button>
                    <a href={i.url} download={i.downloadName}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:opacity-90 inline-flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5" /> Baixar
                    </a>
                  </>
                )}
                {i.status !== 'rodando' && (
                  <button onClick={() => setItens((s) => s.filter((x) => x.id !== i.id))}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
          ))}

          <button onClick={processar} disabled={!pendentes || rodando}
            className="w-full mt-1 px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 transition">
            {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {rodando ? 'Processando...' : `Processar ${pendentes || ''}`.trim()}
          </button>
        </div>
      )}

      {/* Modal de preview do resultado */}
      {preview?.url && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75" onClick={() => setPreview(null)}>
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-bold text-foreground truncate flex items-center gap-2">
                <Film className="w-4 h-4 text-primary shrink-0" /> <span className="truncate">{preview.downloadName}</span>
              </p>
              <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-black">
              {preview.kind === 'image'
                ? <img src={preview.url} alt="" className="w-full max-h-[65vh] object-contain mx-auto" />
                : <video src={preview.url} controls autoPlay className="w-full max-h-[65vh] mx-auto" />}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">Confira o resultado — as camadas são sutis de propósito.</p>
              <a href={preview.url} download={preview.downloadName}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:opacity-90 inline-flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Baixar
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
