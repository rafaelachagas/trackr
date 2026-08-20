'use client'

import React, { useEffect, useState } from 'react'
import { Gauge, Layers, RefreshCw, Sparkles, FileDown, Loader2, Skull, Globe, Clock, TrendingUp, AlertCircle, Trophy, ExternalLink, X, PlayCircle, Download, Copy, Binoculars } from 'lucide-react'
import { resumoInteligencia, listarCriativosHist, reconstruirHistorico, type ResumoInteligencia, type CriativoHist } from '@/app/actions/rastreador-intel'
import { clusterizarBiblioteca } from '@/app/actions/rastreador-ia'
import { gerarRelatorioConcorrente } from '@/app/actions/rastreador-relatorio'
import { capturarPagina, listarVersoesPagina, type VersaoPagina } from '@/app/actions/rastreador-pagina'
import { baixarRelatorioHTML } from '@/lib/reportConcorrente'
import { CLASSIFICACAO_META, ANGULOS, anguloMeta, scoreLabel, type ClassificacaoTeste } from '@/lib/rastreador-intel'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

const ORDEM_CLASS: ClassificacaoTeste[] = ['espetacular', 'bom', 'mediano', 'em_teste', 'reprovado']

export default function InteligenciaBib({ bibId, landingUrl }: { bibId: string; landingUrl?: string | null }) {
  const [resumo, setResumo] = useState<ResumoInteligencia | null>(null)
  const [criativos, setCriativos] = useState<CriativoHist[]>([])
  const [loading, setLoading] = useState(true)
  const [clusterizando, setClusterizando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [classAberta, setClassAberta] = useState<ClassificacaoTeste | null>(null)

  // Página de vendas
  const [url, setUrl] = useState(landingUrl ?? '')
  const [versoes, setVersoes] = useState<VersaoPagina[]>([])
  const [capturando, setCapturando] = useState(false)

  async function carregar() {
    setLoading(true)
    const [r, c, v] = await Promise.all([resumoInteligencia(bibId), listarCriativosHist(bibId), listarVersoesPagina(bibId)])
    if (r.success) setResumo(r.data)
    if (c.success) setCriativos(c.data)
    if (v.success) setVersoes(v.data)
    setLoading(false)
  }
  useEffect(() => { carregar() }, [bibId])

  async function reconstruir() {
    setLoading(true); setMsg(null)
    await reconstruirHistorico(bibId)
    await carregar()
  }

  async function analisarAngulos() {
    setClusterizando(true); setMsg(null)
    const r = await clusterizarBiblioteca(bibId)
    setClusterizando(false)
    if (!r.success) { setMsg(r.error || 'Falha ao analisar ângulos.'); return }
    setMsg(`${r.classificados} criativo(s) classificados por ângulo.`)
    carregar()
  }

  async function gerarRelatorio() {
    setGerando(true); setMsg(null)
    const r = await gerarRelatorioConcorrente(bibId)
    setGerando(false)
    if (!r.success || !r.data) { setMsg(r.error || 'Falha ao gerar relatório.'); return }
    baixarRelatorioHTML(r.data)
    setMsg('Relatório gerado e baixado (report.html).')
  }

  async function capturar() {
    setCapturando(true); setMsg(null)
    const r = await capturarPagina(bibId, url.trim() || undefined)
    setCapturando(false)
    if (!r.success) { setMsg(r.error || 'Falha ao capturar página.'); return }
    setMsg(r.mudou ? `Página versionada: ${r.resumo}` : 'Página sem mudanças desde a última captura.')
    const v = await listarVersoesPagina(bibId); if (v.success) setVersoes(v.data)
  }

  if (loading && !resumo) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando inteligência...</div>
  }

  const score = resumo?.score ?? 0
  const sl = scoreLabel(score)
  const removidos = criativos.filter((c) => c.status === 'removido').sort((a, b) => (b.dias_no_ar || 0) - (a.dias_no_ar || 0))
  const totalAngulos = Object.values(resumo?.porAngulo ?? {}).reduce((s, n) => s + n, 0)
  const angulosClassificados = totalAngulos - (resumo?.porAngulo?.indefinido ?? 0)

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mr-auto flex items-center gap-1.5"><Gauge className="w-4 h-4" /> Inteligência do concorrente</span>
        <button onClick={analisarAngulos} disabled={clusterizando} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-50">
          {clusterizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analisar ângulos (IA)
        </button>
        <button onClick={gerarRelatorio} disabled={gerando} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
          {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Gerar relatório (IA)
        </button>
        <button onClick={reconstruir} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition" title="Reconstruir histórico dos snapshots"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {msg && (
        <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs" style={{ backgroundColor: 'rgba(0,174,239,0.06)', border: '1px solid rgba(0,174,239,0.2)' }}>
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /><span className="text-foreground/90">{msg}</span>
        </div>
      )}

      {/* Score + stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={`rounded-2xl p-4 ${card}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1"><Gauge className="w-3.5 h-3.5" /> Força</div>
          <div className="flex items-end gap-1.5"><span className="text-3xl font-black tabular-nums" style={{ color: sl.cor }}>{score}</span><span className="text-xs text-muted-foreground mb-1">/100</span></div>
          <div className="text-[11px] font-semibold mt-0.5" style={{ color: sl.cor }}>{sl.label}</div>
        </div>
        <div className={`rounded-2xl p-4 ${card}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1"><Layers className="w-3.5 h-3.5" /> Variações ativas</div>
          <div className="text-3xl font-black tabular-nums text-foreground">{resumo?.variacoesAtivas ?? 0}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">pico {resumo?.picoVariacoes ?? 0} simultâneas</div>
        </div>
        <div className={`rounded-2xl p-4 ${card}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1"><TrendingUp className="w-3.5 h-3.5" /> Troca</div>
          <div className="text-3xl font-black tabular-nums text-foreground">{resumo?.freqTroca ?? 0}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">criativos/dia · {resumo?.diasObservados ?? 0}d observados</div>
        </div>
        <div className={`rounded-2xl p-4 ${card}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1"><Skull className="w-3.5 h-3.5" /> Ativos / saíram</div>
          <div className="text-3xl font-black tabular-nums text-foreground">{resumo?.ativos ?? 0}<span className="text-muted-foreground text-lg"> / {resumo?.removidos ?? 0}</span></div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{criativos.length} criativos no total</div>
        </div>
      </div>

      {/* Campeão */}
      {resumo?.campeao && (
        <div className={`rounded-2xl p-4 ${card} flex items-center gap-3`}>
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Criativo campeão · {resumo.campeao.dias} dias no ar</p>
            <p className="text-sm font-semibold text-foreground truncate">{resumo.campeao.headline || '(sem headline)'}</p>
          </div>
          {(() => { const m = CLASSIFICACAO_META[resumo.campeao.classificacao as ClassificacaoTeste]; return m ? <span className="text-[11px] font-bold px-2 py-1 rounded-full shrink-0" style={{ color: m.cor, backgroundColor: m.bg }}>{m.label}</span> : null })()}
        </div>
      )}

      {/* Classificação por tempo de teste */}
      <div className={`rounded-2xl p-4 ${card}`}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Classificação por tempo no ar</p>
        <div className="space-y-2">
          {ORDEM_CLASS.map((cl) => {
            const n = resumo?.porClassificacao?.[cl] ?? 0
            const m = CLASSIFICACAO_META[cl]
            const pct = criativos.length ? (n / criativos.length) * 100 : 0
            const aberta = classAberta === cl
            return (
              <button
                key={cl}
                onClick={() => n > 0 && setClassAberta(aberta ? null : cl)}
                disabled={n === 0}
                className={`w-full flex items-center gap-3 py-0.5 rounded-lg transition ${n > 0 ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}`}
                title={n > 0 ? `Ver os ${n} criativo(s) ${m.label.toLowerCase()}` : undefined}
              >
                <span className="text-xs font-semibold w-24 shrink-0 text-left" style={{ color: m.cor }}>{m.label}</span>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: m.cor }} /></div>
                <span className="text-xs tabular-nums text-muted-foreground w-8 text-right shrink-0">{n}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-3">Regra: &lt;7d reprovado · 7–15d mediano · 15–30d bom · 30d+ espetacular.</p>
      </div>

      {/* Modal: criativos da classificação clicada, em cards (mesmo visual do "Movimento") */}
      {classAberta && (() => {
        const m = CLASSIFICACAO_META[classAberta]
        const lista = criativos.filter((c) => c.classificacao === classAberta).sort((a, b) => (b.dias_no_ar || 0) - (a.dias_no_ar || 0))
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setClassAberta(null)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                <p className="text-sm font-bold" style={{ color: m.cor }}>{m.label} · {lista.length} criativo{lista.length === 1 ? '' : 's'}</p>
                <button onClick={() => setClassAberta(null)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              <div className="overflow-y-auto p-5">
                {lista.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-10">Nenhum criativo nessa faixa.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {lista.map((c) => <CardCriativoHist key={c.ad_archive_id} c={c} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Ângulos (IA) */}
      <div className={`rounded-2xl p-4 ${card}`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ângulos de copy (IA)</p>
          <span className="text-[10px] text-muted-foreground/70">{angulosClassificados}/{totalAngulos} classificados</span>
        </div>
        {angulosClassificados === 0 ? (
          <p className="text-xs text-muted-foreground">Clique em <b className="text-violet-300">Analisar ângulos (IA)</b> pra agrupar os ganchos por ângulo (dor, prova social, urgência, oferta...).</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ANGULOS.filter((a) => (resumo?.porAngulo?.[a.id] ?? 0) > 0).sort((a, b) => (resumo?.porAngulo?.[b.id] ?? 0) - (resumo?.porAngulo?.[a.id] ?? 0)).map((a) => {
              const n = resumo?.porAngulo?.[a.id] ?? 0
              return <span key={a.id} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border" style={{ color: a.cor, borderColor: `${a.cor}44`, backgroundColor: `${a.cor}12` }}>{a.label} · {n}</span>
            })}
          </div>
        )}
      </div>

      {/* Cemitério — criativos removidos que passaram no teste */}
      {removidos.length > 0 && (
        <div className={`rounded-2xl p-4 ${card}`}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><Skull className="w-4 h-4" /> Saíram do ar ({removidos.length})</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {removidos.slice(0, 30).map((c) => {
              const m = CLASSIFICACAO_META[c.classificacao as ClassificacaoTeste]
              return (
                <div key={c.ad_archive_id} className="flex items-center gap-3 text-sm py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-xs tabular-nums text-muted-foreground w-14 shrink-0 flex items-center gap-1"><Clock className="w-3 h-3" />{c.dias_no_ar}d</span>
                  <span className="flex-1 min-w-0 truncate text-foreground/90">{c.headline || c.angulo_resumo || '(sem título)'}</span>
                  {m && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: m.cor, backgroundColor: m.bg }}>{m.label}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Versionamento da página de vendas */}
      <div className={`rounded-2xl p-4 ${card}`}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><Globe className="w-4 h-4" /> Página de vendas do concorrente</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://pagina-do-concorrente.com/oferta" className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
          <button onClick={capturar} disabled={capturando || (!url.trim() && !landingUrl)} className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 disabled:opacity-50 whitespace-nowrap">
            {capturando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />} Capturar / versionar
          </button>
        </div>
        {versoes.length > 0 && (
          <div className="mt-3 space-y-2">
            {versoes.map((v) => (
              <div key={v.id} className="rounded-lg p-2.5 border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">{new Date(v.capturado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  {v.precos?.length > 0 && <span className="text-emerald-300 font-semibold truncate">{v.precos.slice(0, 4).join(' · ')}</span>}
                  <a href={`/api/rastreador/pagina/${v.id}`} target="_blank" rel="noreferrer"
                    className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-muted-foreground hover:text-primary hover:border-primary/40 transition text-[11px] font-semibold">
                    <ExternalLink className="w-3 h-3" /> abrir
                  </a>
                </div>
                {v.stack && v.stack.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mt-1.5">
                    {v.stack.map((s) => (
                      <span key={s.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{s.label}</span>
                    ))}
                  </div>
                )}
                {v.resumo_mudanca && <p className="text-[11px] text-muted-foreground mt-1">{v.resumo_mudanca}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/70 mt-2">Cada captura guarda uma versão. Quando o concorrente muda preço, bônus ou oferta, aparece aqui.</p>
      </div>
    </div>
  )
}

// Card de criativo a partir do histórico (mesmo visual do "Movimento", mas
// lendo de CriativoHist em vez do snapshot ao vivo — dá pra abrir mesmo pra
// um criativo que já saiu do ar).
function CardCriativoHist({ c }: { c: CriativoHist }) {
  const [tocando, setTocando] = useState(false)
  const podeTocar = c.media_type === 'video' && !!c.video_url

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col bg-card border border-border">
      {tocando && c.video_url && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setTocando(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md">
            <button onClick={() => setTocando(false)} className="absolute -top-9 right-0 p-1.5 rounded-lg text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
            <video src={c.video_url} controls autoPlay playsInline className="w-full rounded-2xl bg-black max-h-[80vh]" />
            {c.headline && <p className="text-sm font-semibold text-white/90 mt-2 text-center">{c.headline}</p>}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => { if (podeTocar) setTocando(true) }}
        disabled={!podeTocar}
        className={`relative aspect-square bg-black/40 flex items-center justify-center overflow-hidden w-full ${podeTocar ? 'cursor-pointer group' : 'cursor-default'}`}>
        {c.image_url
          ? <img src={c.image_url} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          : <Binoculars className="w-8 h-8 text-muted-foreground" />}
        {c.media_type === 'video' && <PlayCircle className="absolute w-10 h-10 text-white/80 drop-shadow-lg group-hover:scale-110 transition" />}
        <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">{c.dias_no_ar}d no ar</span>
        <span className={`absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${c.status === 'removido' ? 'bg-rose-500/80 text-white' : 'bg-emerald-500/80 text-white'}`}>
          {c.status === 'removido' ? 'saiu do ar' : 'ativo'}
        </span>
        {(c.copias ?? 0) > 1 && (
          <span className="absolute bottom-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/80 text-black flex items-center gap-1">
            <Copy className="w-3 h-3" /> {c.copias}
          </span>
        )}
        {c.media_type === 'video' && <span className="absolute bottom-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/80 text-white">VÍDEO</span>}
      </button>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {c.page_name && <p className="text-xs font-semibold text-muted-foreground truncate">{c.page_name}</p>}
        {c.headline && <p className="text-sm font-bold text-foreground leading-tight line-clamp-2">{c.headline}</p>}
        {(c.body || c.angulo_resumo) && <p className="text-[11px] text-muted-foreground line-clamp-3">{c.body || c.angulo_resumo}</p>}

        <div className="mt-auto pt-2 flex flex-wrap gap-1.5">
          {c.snapshot_url && (
            <a href={c.snapshot_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-white/10 text-muted-foreground hover:text-primary hover:border-primary/40 transition">
              <ExternalLink className="w-3.5 h-3.5" /> Ver na Meta
            </a>
          )}
          {c.link_url && (
            <a href={c.link_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-white/10 text-muted-foreground hover:text-primary hover:border-primary/40 transition">
              Página
            </a>
          )}
          {c.video_url && (
            <a href={c.video_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-white/10 text-muted-foreground hover:text-primary hover:border-primary/40 transition">
              <Download className="w-3.5 h-3.5" /> Vídeo
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
