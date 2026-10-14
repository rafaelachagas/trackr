'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LayoutGrid, Search, Star, Check, Link2, Trash2, Plus, X, ExternalLink, Loader2,
} from 'lucide-react'
import { FORMATOS, type Formato } from '@/lib/criativos-formatos'
import {
  listarFormatos, salvarReferencia, removerReferencia, atualizarFormato,
  type MapaFormatos,
} from '@/app/actions/formatos'

// Formatos de Criativo — o catálogo de MOLDES, separado da copy e do ângulo.
// A tela existe pra responder duas perguntas na hora de criar: "que formato eu
// ainda não testei?" e "quem já fez isso bem?". Por isso o que o usuário salva
// (referência, anotação, testado) fica junto do formato, não numa pasta à parte.

type Filtro = 'todos' | 'favoritos' | 'testados' | 'nao-testados'

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
    return FORMATOS.filter((f) => {
      const d = mapa[f.id]
      if (filtro === 'favoritos' && !d?.favorito) return false
      if (filtro === 'testados' && !d?.testado) return false
      if (filtro === 'nao-testados' && d?.testado) return false
      if (!termo) return true
      return (f.nome + ' ' + f.resumo + ' ' + f.bomPara).toLowerCase().includes(termo)
    })
  }, [busca, filtro, mapa])

  const totais = useMemo(() => {
    const vals = Object.values(mapa)
    return {
      testados: vals.filter((d) => d.testado).length,
      refs: vals.reduce((n, d) => n + (d.referencias?.length || 0), 0),
    }
  }, [mapa])

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#1a2022' }}>
          <LayoutGrid className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Formatos de Criativo</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {FORMATOS.length} moldes de vídeo, cada um com referências que você salva.
            O formato é a forma de apresentar — a mesma oferta vira outro anúncio em outro molde.
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
          ['testados', `Já testei ${totais.testados}`],
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
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando o que você salvou...
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {lista.map((f) => {
              const d = mapa[f.id]
              const n = d?.referencias?.length || 0
              return (
                <button key={f.id} onClick={() => setAberto(f)}
                  className="text-left rounded-xl border border-border bg-card hover:border-primary/40 transition p-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-black text-foreground flex-1">{f.nome}</span>
                    {d?.favorito && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                    {d?.testado && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{f.resumo}</p>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className={`text-[10px] inline-flex items-center gap-1 ${n ? 'text-primary' : 'text-muted-foreground/60'}`}>
                      <Link2 className="w-3 h-3" /> {n || 'sem'} referência{n === 1 ? '' : 's'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          {lista.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum formato com esse filtro.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {totais.refs} referência(s) salva(s) no total.
          </p>
        </>
      )}

      {aberto && (
        <Detalhe formato={aberto} dados={mapa[aberto.id]} onFechar={() => setAberto(null)}
          onMudou={(m) => setMapa(m)} />
      )}
    </div>
  )
}

function Detalhe({ formato, dados, onFechar, onMudou }: {
  formato: Formato
  dados?: MapaFormatos[string]
  onFechar: () => void
  onMudou: (m: MapaFormatos) => void
}) {
  const [url, setUrl] = useState('')
  const [nota, setNota] = useState('')
  const [anotacoes, setAnotacoes] = useState(dados?.anotacoes || '')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function adicionar() {
    setOcupado(true); setErro(null)
    const r = await salvarReferencia(formato.id, url, nota)
    if (r.success && r.data) { onMudou(r.data); setUrl(''); setNota('') }
    else setErro(r.error || 'não consegui salvar')
    setOcupado(false)
  }

  async function alternar(campo: 'testado' | 'favorito') {
    const r = await atualizarFormato(formato.id, { [campo]: !dados?.[campo] })
    if (r.success && r.data) onMudou(r.data)
  }

  async function salvarAnotacoes() {
    const r = await atualizarFormato(formato.id, { anotacoes })
    if (r.success && r.data) onMudou(r.data)
  }

  const refs = dados?.referencias || []

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4"
      onClick={onFechar}>
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card my-8"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-5 border-b border-border">
          <div className="flex-1">
            <h2 className="text-lg font-black text-foreground">{formato.nome}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{formato.resumo}</p>
          </div>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-black/20 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Como fazer</p>
              <p className="text-xs text-foreground leading-relaxed">{formato.comoFazer}</p>
            </div>
            <div className="rounded-lg border border-border bg-black/20 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Bom para</p>
              <p className="text-xs text-foreground leading-relaxed">{formato.bomPara}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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

          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">
              Referências <span className="text-muted-foreground font-normal">({refs.length})</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Cole o link de um anúncio ou vídeo que usa este formato. É o seu swipe file,
              organizado por molde em vez de por pessoa.
            </p>
            <div className="flex flex-wrap gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..." onKeyDown={(e) => e.key === 'Enter' && url.trim() && adicionar()}
                className="flex-1 min-w-[200px] rounded-lg bg-black/30 border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50" />
              <input value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="nota (opcional)"
                className="w-36 rounded-lg bg-black/30 border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50" />
              <button onClick={adicionar} disabled={!url.trim() || ocupado}
                className="px-3 py-2 rounded-lg bg-primary hover:opacity-90 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5">
                {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Salvar
              </button>
            </div>
            {erro && <p className="text-[11px] text-rose-300">{erro}</p>}

            <div className="space-y-1">
              {refs.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
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
              {refs.length === 0 && (
                <p className="text-[11px] text-muted-foreground/70">Nenhuma referência ainda.</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Suas anotações</p>
            <textarea value={anotacoes} onChange={(e) => setAnotacoes(e.target.value)}
              onBlur={salvarAnotacoes} rows={3}
              placeholder="O que funcionou, o que não funcionou, qual oferta combina..."
              className="w-full rounded-lg bg-black/30 border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50" />
            <p className="text-[10px] text-muted-foreground">Salva sozinho quando você clica fora.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
