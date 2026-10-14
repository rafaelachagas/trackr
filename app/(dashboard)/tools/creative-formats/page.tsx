'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutGrid, Search, Star, Check, Trash2, Plus, X, ExternalLink, Loader2,
  UploadCloud, Play, ArrowUpRight, Link2, FileText, Copy,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { FORMATOS, type Formato } from '@/lib/criativos-formatos'
import {
  listarFormatos, salvarReferencia, removerReferencia, atualizarFormato, salvarTranscricao,
  type MapaFormatos,
} from '@/app/actions/formatos'

// Formatos de Criativo — o catálogo de MOLDES, separado da copy e do ângulo.
// A tela responde duas perguntas na hora de criar: "que formato eu ainda não
// testei?" e "como é isso na prática?". A segunda só tem resposta com vídeo:
// formato descrito em texto continua abstrato até você ver três anúncios.

type Filtro = 'todos' | 'favoritos' | 'testados' | 'nao-testados'
type Exemplo = { nome: string; caminho: string; url: string | null; imagem?: boolean }

const dois = (n: number) => String(n).padStart(2, '0')

export default function FormatosPage() {
  const [mapa, setMapa] = useState<MapaFormatos>({})
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [aberto, setAberto] = useState<Formato | null>(null)

  const carregar = useCallback(async () => {
    const r = await listarFormatos()
    if (r.success) setMapa(r.data)
    setCarregando(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return FORMATOS.map((f, i) => ({ f, n: i + 1 })).filter(({ f }) => {
      const d = mapa[f.id]
      if (filtro === 'favoritos' && !d?.favorito) return false
      if (filtro === 'testados' && !d?.testado) return false
      if (filtro === 'nao-testados' && d?.testado) return false
      if (!termo) return true
      return (f.nome + ' ' + f.resumo + ' ' + f.bomPara).toLowerCase().includes(termo)
    })
  }, [busca, filtro, mapa])

  const testados = useMemo(() => Object.values(mapa).filter((d) => d.testado).length, [mapa])

  return (
    <div className="space-y-5 max-w-[1140px] mx-auto">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#1a2022' }}>
          <LayoutGrid className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Formatos de Criativo</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {FORMATOS.length} moldes de vídeo. O formato é a forma de apresentar —
            a mesma oferta vira outro anúncio em outro molde.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou pelo que ele serve..."
            className="w-full rounded-lg bg-black/30 border border-border pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50" />
        </div>
        {([
          ['todos', `Todos ${FORMATOS.length}`],
          ['favoritos', 'Favoritos'],
          ['testados', `Já testei ${testados}`],
          ['nao-testados', 'Nunca testei'],
        ] as const).map(([id, rotulo]) => (
          <button key={id} onClick={() => setFiltro(id)}
            className={`px-3 py-2 rounded-lg border text-xs transition ${
              filtro === id ? 'border-primary/60 bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground'
            }`}>
            {rotulo}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {lista.map(({ f, n }) => (
            <Cartao key={f.id} formato={f} numero={n} dados={mapa[f.id]}
              onAbrir={() => setAberto(f)} />
          ))}
          {lista.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">Nenhum formato com esse filtro.</p>
          )}
        </div>
      )}

      {aberto && (
        <Detalhe
          formato={aberto}
          numero={FORMATOS.findIndex((x) => x.id === aberto.id) + 1}
          dados={mapa[aberto.id]}
          onFechar={() => setAberto(null)}
          onMudou={setMapa}
        />
      )}
    </div>
  )
}

/** O cartão: selo numerado, o nome, e a barra de ação embaixo. */
function Cartao({ formato, numero, dados, onAbrir }: {
  formato: Formato; numero: number; dados?: MapaFormatos[string]; onAbrir: () => void
}) {
  return (
    <button onClick={onAbrir}
      className="group h-full flex flex-col text-left rounded-xl border border-border bg-card overflow-hidden
                 transition hover:border-primary/60 hover:shadow-[0_0_20px_-8px] hover:shadow-primary/50">
      <div className="flex-1 p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          {/* Selo numerado: o mesmo papel do da referência, feito com clip-path
              pra não precisar de imagem. */}
          <span className="relative w-8 h-8 shrink-0 grid place-items-center">
            <span className="absolute inset-0 bg-primary"
              style={{ clipPath: 'polygon(50% 0%, 61% 10%, 76% 6%, 82% 20%, 97% 24%, 95% 39%, 108% 50%, 95% 61%, 97% 76%, 82% 80%, 76% 94%, 61% 90%, 50% 100%, 39% 90%, 24% 94%, 18% 80%, 3% 76%, 5% 61%, -8% 50%, 5% 39%, 3% 24%, 18% 20%, 24% 6%, 39% 10%)' }} />
            <span className="relative text-[10px] font-black text-white">{dois(numero)}</span>
          </span>
          <span className="text-sm font-black text-foreground leading-tight flex-1">{formato.nome}</span>
          {dados?.favorito && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
          {dados?.testado && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
          {formato.resumo}
        </p>
      </div>
      <div className="px-3.5 py-2 bg-primary/15 group-hover:bg-primary
                      border-t border-primary/20 flex items-center justify-between transition">
        <span className="text-[9px] font-black tracking-[0.14em] uppercase text-primary group-hover:text-white transition">
          Clique para ver
        </span>
        <ArrowUpRight className="w-3 h-3 text-primary group-hover:text-white transition" />
      </div>
    </button>
  )
}

function Detalhe({ formato, numero, dados, onFechar, onMudou }: {
  formato: Formato; numero: number; dados?: MapaFormatos[string]
  onFechar: () => void; onMudou: (m: MapaFormatos) => void
}) {
  const [exemplos, setExemplos] = useState<Exemplo[] | null>(null)
  const [atual, setAtual] = useState(0)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [anotacoes, setAnotacoes] = useState(dados?.anotacoes || '')
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [fase, setFase] = useState('')
  const arquivoRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    try {
      const j = await fetch(`/api/creative-formats/examples?formato=${formato.id}`, { cache: 'no-store' })
        .then((r) => r.json())
      const lista: Exemplo[] = j.exemplos || []
      setExemplos(lista)
      setAtual((i) => Math.min(i, Math.max(0, lista.length - 1)))
    } catch { setExemplos([]) }
  }, [formato.id])
  useEffect(() => { carregar() }, [carregar])

  async function subir(lista: FileList | null) {
    if (!lista?.length) return
    setErro(null)
    for (const f of Array.from(lista)) {
      setEnviando(f.name)
      try {
        const sign = await fetch('/api/creative-formats/examples', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ formato: formato.id, nome: f.name }),
        }).then((r) => r.json())
        if (sign.error) throw new Error(sign.error)
        const { error } = await supabase.storage.from('criativos')
          .uploadToSignedUrl(sign.path, sign.token, f)
        if (error) throw new Error(error.message)
      } catch (e) {
        setErro(e instanceof Error ? e.message : `${e}`)
        break
      }
    }
    setEnviando(null)
    carregar()
  }

  async function apagar(caminho: string) {
    await fetch(`/api/creative-formats/examples?caminho=${encodeURIComponent(caminho)}`, { method: 'DELETE' })
    carregar()
  }

  /** Manda o exemplo pro transcritor da VPS e guarda o texto no formato. */
  async function transcrever() {
    if (!atualEx?.url || !atualEx.caminho) return
    setTranscrevendo(true); setErro(null); setFase('enviando pro transcritor...')
    try {
      const ini = await fetch('/api/rastreador/transcrever-async', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: atualEx.url }),
      }).then((r) => r.json())
      if (!ini?.job_id) throw new Error(ini?.error || 'o transcritor não aceitou o vídeo')

      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 4000))
        const j = await fetch(`/api/rastreador/transcrever-async?id=${ini.job_id}`, { cache: 'no-store' })
          .then((r) => r.json()).catch(() => ({ status: 'rodando' }))
        if (j.status === 'erro') throw new Error(j.erro || 'falhou ao transcrever')
        if (j.status === 'ok') {
          const r = await salvarTranscricao(formato.id, atualEx.caminho, j.texto || '')
          if (r.success && r.data) onMudou(r.data)
          setFase('')
          return
        }
        setFase(`transcrevendo... ${(i + 1) * 4}s`)
      }
      throw new Error('demorou demais')
    } catch (e) {
      setErro(e instanceof Error ? e.message : `${e}`)
      setFase('')
    } finally { setTranscrevendo(false) }
  }

  async function alternar(campo: 'testado' | 'favorito') {
    const r = await atualizarFormato(formato.id, { [campo]: !dados?.[campo] })
    if (r.success && r.data) onMudou(r.data)
  }

  async function adicionarLink() {
    const r = await salvarReferencia(formato.id, url)
    if (r.success && r.data) { onMudou(r.data); setUrl('') }
    else setErro(r.error || 'não consegui salvar')
  }

  const refs = dados?.referencias || []
  const atualEx = exemplos?.[atual]
  const transcricao = atualEx ? dados?.transcricoes?.[atualEx.caminho] : undefined

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4"
      onClick={onFechar}>
      <div className="w-full max-w-xl rounded-3xl border-2 border-primary/50 bg-card my-6
                      shadow-[0_0_60px_-12px] shadow-primary/40"
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-start gap-3 p-5 pb-3">
          <span className="relative w-11 h-11 shrink-0 grid place-items-center">
            <span className="absolute inset-0 bg-primary"
              style={{ clipPath: 'polygon(50% 0%, 61% 10%, 76% 6%, 82% 20%, 97% 24%, 95% 39%, 108% 50%, 95% 61%, 97% 76%, 82% 80%, 76% 94%, 61% 90%, 50% 100%, 39% 90%, 24% 94%, 18% 80%, 3% 76%, 5% 61%, -8% 50%, 5% 39%, 3% 24%, 18% 20%, 24% 6%, 39% 10%)' }} />
            <span className="relative text-sm font-black text-white">{dois(numero)}</span>
          </span>
          <h2 className="text-2xl font-black text-foreground flex-1 leading-tight">{formato.nome}</h2>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-4 space-y-1.5">
          <p className="text-sm text-foreground/90 leading-relaxed">{formato.resumo}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{formato.comoFazer}</p>
          <p className="text-xs text-primary/90 pt-1">
            <span className="font-bold">Bom para:</span> {formato.bomPara}
          </p>
        </div>

        {/* Exemplos */}
        <div className="px-5 pb-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-primary">Exemplos:</p>
            <button onClick={() => arquivoRef.current?.click()} disabled={!!enviando}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 disabled:opacity-50">
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              {enviando ? `enviando ${enviando.slice(0, 18)}...` : 'Subir exemplo'}
            </button>
            <input ref={arquivoRef} type="file" accept="video/*,image/*" multiple className="hidden"
              onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
          </div>

          <div className="rounded-2xl border-2 border-primary/40 p-3">
            {exemplos === null ? (
              <div className="h-56 grid place-items-center text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : exemplos.length === 0 ? (
              <button onClick={() => arquivoRef.current?.click()}
                className="w-full h-56 grid place-items-center rounded-xl border border-dashed border-border
                           text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 gap-2">
                <Play className="w-7 h-7 opacity-50" />
                Nenhum exemplo ainda — suba um vídeo ou print deste formato
              </button>
            ) : (
              <div className="space-y-2.5">
                <div className="relative">
                  {atualEx?.imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={atualEx.caminho} src={atualEx.url || undefined} alt={atualEx.nome}
                      className="w-full max-h-[60vh] object-contain rounded-xl bg-black" />
                  ) : (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video key={atualEx?.caminho} src={atualEx?.url || undefined} controls playsInline
                      preload="metadata" className="w-full max-h-[60vh] rounded-xl bg-black" />
                  )}
                  <button onClick={() => atualEx && apagar(atualEx.caminho)}
                    title="apagar este exemplo"
                    className="absolute top-2 right-2 w-7 h-7 grid place-items-center rounded-lg
                               bg-black/70 text-white/80 hover:text-rose-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {exemplos.length > 1 && (
                  <div className="flex justify-center gap-1.5">
                    {exemplos.map((_, i) => (
                      <button key={i} onClick={() => setAtual(i)}
                        className={`h-1.5 rounded-full transition-all ${
                          i === atual ? 'w-5 bg-primary' : 'w-1.5 bg-border hover:bg-primary/40'
                        }`} aria-label={`Exemplo ${i + 1}`} />
                    ))}
                  </div>
                )}

                {/* Transcrição do exemplo que está na tela. Vale pro vídeo:
                    print não tem o que transcrever. */}
                {atualEx && !atualEx.imagem && (
                  <div className="space-y-1.5">
                    {transcricao ? (
                      <div className="rounded-lg border border-border bg-black/20 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="text-[11px] font-bold text-foreground flex-1">Copy deste exemplo</span>
                          <button onClick={() => navigator.clipboard?.writeText(transcricao)}
                            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                            <Copy className="w-3 h-3" /> copiar
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {transcricao}
                        </p>
                      </div>
                    ) : (
                      <button onClick={transcrever} disabled={transcrevendo}
                        className="w-full rounded-lg border border-dashed border-border py-2 text-[11px]
                                   text-muted-foreground hover:text-foreground hover:border-primary/50
                                   disabled:opacity-60 inline-flex items-center justify-center gap-1.5">
                        {transcrevendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        {transcrevendo ? (fase || 'transcrevendo...') : 'Transcrever a copy deste exemplo'}
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap justify-center gap-1.5">
                  {exemplos.map((_, i) => (
                    <button key={i} onClick={() => setAtual(i)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-black tracking-wide uppercase transition ${
                        i === atual ? 'bg-primary text-white' : 'border border-border text-muted-foreground hover:text-foreground'
                      }`}>
                      Exemplo {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {erro && <p className="text-[11px] text-rose-300">{erro}</p>}

          {/* Links e anotações ficam depois do vídeo: são apoio, não o conteúdo. */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => alternar('favorito')}
              className={`px-3 py-1.5 rounded-lg border text-xs inline-flex items-center gap-1.5 ${
                dados?.favorito ? 'border-amber-400/60 bg-amber-400/10 text-amber-200' : 'border-border text-muted-foreground hover:text-foreground'
              }`}>
              <Star className={`w-3.5 h-3.5 ${dados?.favorito ? 'fill-amber-400 text-amber-400' : ''}`} /> Favorito
            </button>
            <button onClick={() => alternar('testado')}
              className={`px-3 py-1.5 rounded-lg border text-xs inline-flex items-center gap-1.5 ${
                dados?.testado ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' : 'border-border text-muted-foreground hover:text-foreground'
              }`}>
              <Check className="w-3.5 h-3.5" /> Já testei
            </button>
          </div>

          <details className="group/d">
            <summary className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Links e anotações
              {refs.length > 0 && <span className="text-primary">({refs.length})</span>}
            </summary>
            <div className="pt-2 space-y-2">
              <div className="flex gap-2">
                <input value={url} onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && url.trim() && adicionarLink()}
                  placeholder="https://... (anúncio que usa este formato)"
                  className="flex-1 rounded-lg bg-black/30 border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50" />
                <button onClick={adicionarLink} disabled={!url.trim()}
                  className="px-3 py-2 rounded-lg bg-primary hover:opacity-90 disabled:opacity-40 text-white text-xs font-bold">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {refs.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate flex-1 inline-flex items-center gap-1.5">
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{r.nota || r.url}</span>
                  </a>
                  <button onClick={async () => {
                    const x = await removerReferencia(formato.id, r.id)
                    if (x.success && x.data) onMudou(x.data)
                  }} className="text-muted-foreground hover:text-rose-300 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <textarea value={anotacoes} onChange={(e) => setAnotacoes(e.target.value)}
                onBlur={async () => {
                  const r = await atualizarFormato(formato.id, { anotacoes })
                  if (r.success && r.data) onMudou(r.data)
                }}
                rows={3} placeholder="O que funcionou, qual oferta combina..."
                className="w-full rounded-lg bg-black/30 border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50" />
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
