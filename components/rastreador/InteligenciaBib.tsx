'use client'

import React, { useEffect, useState } from 'react'
import { Gauge, Layers, RefreshCw, Sparkles, FileDown, Loader2, Skull, Globe, Clock, TrendingUp, AlertCircle, Trophy, ExternalLink, X, PlayCircle, Download, Copy, Binoculars, FileText, Check } from 'lucide-react'
import { resumoInteligencia, listarCriativosHist, reconstruirHistorico, type ResumoInteligencia, type CriativoHist } from '@/app/actions/rastreador-intel'
import { getTranscricoes, salvarTranscricao } from '@/app/actions/rastreador'
import { transcreverNaFila } from '@/lib/fila-transcricao'
import { clusterizarBiblioteca } from '@/app/actions/rastreador-ia'
import { gerarRelatorioConcorrente } from '@/app/actions/rastreador-relatorio'
import { capturarPagina, listarVersoesPagina, type VersaoPagina } from '@/app/actions/rastreador-pagina'
import { baixarRelatorioHTML } from '@/lib/reportConcorrente'
import { CLASSIFICACAO_META, ANGULOS, anguloMeta, scoreLabel, type ClassificacaoTeste } from '@/lib/rastreador-intel'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

const ORDEM_CLASS: ClassificacaoTeste[] = ['espetacular', 'bom', 'mediano', 'em_teste', 'reprovado']

export default function InteligenciaBib({ bibId, landingUrl, isPrivate = false }: { bibId: string; landingUrl?: string | null; isPrivate?: boolean }) {
  const [resumo, setResumo] = useState<ResumoInteligencia | null>(null)
  const [criativos, setCriativos] = useState<CriativoHist[]>([])
  const [loading, setLoading] = useState(true)
  const [clusterizando, setClusterizando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [classAberta, setClassAberta] = useState<ClassificacaoTeste | null>(null)
  const [cacheT, setCacheT] = useState<Record<string, string>>({})
  const [modalT, setModalT] = useState<{ titulo: string; texto: string } | null>(null)

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
    // Cache de transcrições já feitas (mesma tabela usada no "Movimento").
    if (c.success && c.data.length) {
      const t = await getTranscricoes(c.data.map((x) => x.ad_archive_id).filter(Boolean))
      if (t.success) setCacheT(t.data)
    }
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
  // Linha completa do campeão (pra mostrar thumbnail e links, não só o texto).
  const campeaoRow = criativos.length ? [...criativos].sort((a, b) => (b.dias_no_ar || 0) - (a.dias_no_ar || 0))[0] : null
  // Resumo em uma frase, em português de gente.
  const fraseResumo = resumo
    ? `${sl.label} — ${resumo.ativos} criativo${resumo.ativos === 1 ? '' : 's'} no ar agora` +
      (resumo.campeao ? `, o mais antigo rodando há ${resumo.campeao.dias} dias` : '') +
      `. Nos últimos ${resumo.diasObservados} dias, trocou em média ${resumo.freqTroca} criativo${Number(resumo.freqTroca) === 1 ? '' : 's'} por dia.`
    : ''

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

      {/* Hero: anel de força + leitura em palavras + stats */}
      <div className={`rounded-2xl ${card} p-5 lg:p-6`}>
        <div className="flex flex-col sm:flex-row items-center gap-5 lg:gap-8">
          {/* Anel do score */}
          <div className="relative w-32 h-32 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={sl.cor} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black tabular-nums leading-none" style={{ color: sl.cor }}>{score}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mt-0.5">Força</span>
            </div>
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-lg font-bold" style={{ color: sl.cor }}>{sl.label}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{fraseResumo}</p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-3 mt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" /> Variações ativas</p>
                <p className="text-xl font-black tabular-nums">{resumo?.variacoesAtivas ?? 0} <span className="text-[11px] font-medium text-muted-foreground">pico {resumo?.picoVariacoes ?? 0}</span></p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Ritmo de troca</p>
                <p className="text-xl font-black tabular-nums">{resumo?.freqTroca ?? 0} <span className="text-[11px] font-medium text-muted-foreground">criativos/dia</span></p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Skull className="w-3 h-3" /> Ativos · saíram</p>
                <p className="text-xl font-black tabular-nums">{resumo?.ativos ?? 0} <span className="text-muted-foreground font-bold">· {resumo?.removidos ?? 0}</span> <span className="text-[11px] font-medium text-muted-foreground">de {criativos.length}</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Campeão — com a cara do criativo, não só o texto */}
      {campeaoRow && (
        <div className={`rounded-2xl ${card} overflow-hidden flex items-stretch`}>
          {campeaoRow.image_url && (
            <div className="w-24 sm:w-28 shrink-0 bg-black/40">
              <img src={campeaoRow.image_url} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
            </div>
          )}
          <div className="flex items-center gap-3 p-4 min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Criativo campeão · {campeaoRow.dias_no_ar} dias no ar</p>
              <p className="text-sm font-semibold text-foreground truncate mt-1">{campeaoRow.headline || '(sem headline)'}</p>
              {(campeaoRow.body || campeaoRow.angulo_resumo) && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{campeaoRow.body || campeaoRow.angulo_resumo}</p>}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              {(() => { const m = CLASSIFICACAO_META[campeaoRow.classificacao as ClassificacaoTeste]; return m ? <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ color: m.cor, backgroundColor: m.bg }}>{m.label}</span> : null })()}
              {campeaoRow.snapshot_url && (
                <a href={campeaoRow.snapshot_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary transition">
                  <ExternalLink className="w-3 h-3" /> Ver na Meta
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Classificação por tempo de teste */}
      <div className={`rounded-2xl p-5 ${card}`}>
        <div className="mb-4">
          <p className="text-sm font-bold text-foreground">Quanto tempo os criativos aguentam no ar</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Criativo que fica muito tempo rodando é criativo que dá lucro. Clique numa faixa pra ver quais são.</p>
        </div>
        <div className="space-y-1">
          {ORDEM_CLASS.map((cl) => {
            const n = resumo?.porClassificacao?.[cl] ?? 0
            const m = CLASSIFICACAO_META[cl]
            const faixa = { espetacular: '30+ dias no ar', bom: '15–30 dias', mediano: '7–15 dias', em_teste: 'ainda em teste', reprovado: 'saiu em menos de 7 dias' }[cl]
            const pct = criativos.length ? (n / criativos.length) * 100 : 0
            const aberta = classAberta === cl
            return (
              <button
                key={cl}
                onClick={() => n > 0 && setClassAberta(aberta ? null : cl)}
                disabled={n === 0}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl transition group ${n > 0 ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default opacity-40'}`}
                title={n > 0 ? `Ver os ${n} criativo(s) ${m.label.toLowerCase()}` : undefined}
              >
                <span className="w-28 shrink-0 text-left">
                  <span className="block text-xs font-bold" style={{ color: m.cor }}>{m.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{faixa}</span>
                </span>
                <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(pct, n > 0 ? 3 : 0)}%`, backgroundColor: m.cor, transition: 'width 0.6s ease' }} /></div>
                <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0" style={n > 0 ? { color: m.cor, backgroundColor: m.bg } : { color: 'var(--muted-foreground, #7c858c)' }}>{n}</span>
                <ExternalLink className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition ${n > 0 ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`} />
              </button>
            )
          })}
        </div>
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
                    {lista.map((c) => (
                      <CardCriativoHist key={c.ad_archive_id} c={c} isPrivate={isPrivate}
                        inicial={cacheT[c.ad_archive_id]}
                        onSalvar={(texto) => setCacheT((m) => ({ ...m, [c.ad_archive_id]: texto }))}
                        onAbrir={(texto) => setModalT({ titulo: c.headline || c.page_name || 'Anúncio', texto })} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Ângulos (IA) */}
      <div className={`rounded-2xl p-5 ${card}`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-bold text-foreground">Que ângulo de copy ele mais usa</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">A IA agrupa os ganchos dos anúncios por tipo de apelo. Onde ele concentra é onde ele acredita.</p>
          </div>
          <span className="text-[10px] text-muted-foreground/70 shrink-0 mt-1">{angulosClassificados}/{totalAngulos} classificados</span>
        </div>
        {angulosClassificados === 0 ? (
          <p className="text-xs text-muted-foreground">Clique em <b className="text-violet-300">Analisar ângulos (IA)</b> pra agrupar os ganchos por ângulo (dor, prova social, urgência, oferta...).</p>
        ) : (() => {
          const lista = ANGULOS
            .filter((a) => (resumo?.porAngulo?.[a.id] ?? 0) > 0)
            .sort((a, b) => (resumo?.porAngulo?.[b.id] ?? 0) - (resumo?.porAngulo?.[a.id] ?? 0))
          return (
            <>
              {/* Barra empilhada com a proporção de cada ângulo */}
              <div className="flex h-3 rounded-full overflow-hidden bg-white/5 mb-4">
                {lista.map((a) => {
                  const n = resumo?.porAngulo?.[a.id] ?? 0
                  return <div key={a.id} title={`${a.label} · ${n}`} style={{ width: `${(n / Math.max(angulosClassificados, 1)) * 100}%`, backgroundColor: a.cor }} />
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {lista.map((a) => {
                  const n = resumo?.porAngulo?.[a.id] ?? 0
                  const pctA = Math.round((n / Math.max(angulosClassificados, 1)) * 100)
                  return (
                    <span key={a.id} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1.5" style={{ color: a.cor, borderColor: `${a.cor}44`, backgroundColor: `${a.cor}12` }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.cor }} />{a.label} · {n} <span className="opacity-70">({pctA}%)</span>
                    </span>
                  )
                })}
              </div>
            </>
          )
        })()}
      </div>

      {/* Cemitério — criativos removidos que passaram no teste */}
      {removidos.length > 0 && (
        <div className={`rounded-2xl p-5 ${card}`}>
          <div className="mb-4">
            <p className="text-sm font-bold text-foreground flex items-center gap-1.5"><Skull className="w-4 h-4 text-muted-foreground" /> Saíram do ar ({removidos.length})</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">O que ele desligou — e quanto tempo cada um durou antes de cair.</p>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {removidos.slice(0, 30).map((c) => {
              const m = CLASSIFICACAO_META[c.classificacao as ClassificacaoTeste]
              return (
                <div key={c.ad_archive_id} className="flex items-center gap-3 text-sm py-1.5 px-1 rounded-lg hover:bg-white/[0.03] transition">
                  {c.image_url
                    ? <img src={c.image_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 bg-black/40" loading="lazy" referrerPolicy="no-referrer" />
                    : <div className="w-9 h-9 rounded-lg bg-white/5 shrink-0 flex items-center justify-center"><Binoculars className="w-4 h-4 text-muted-foreground" /></div>}
                  <span className="flex-1 min-w-0 truncate text-foreground/90">{c.headline || c.angulo_resumo || '(sem título)'}</span>
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0 flex items-center gap-1"><Clock className="w-3 h-3" />{c.dias_no_ar}d</span>
                  {m && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: m.cor, backgroundColor: m.bg }}>{m.label}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Versionamento da página de vendas */}
      <div className={`rounded-2xl p-5 ${card}`}>
        <div className="mb-4">
          <p className="text-sm font-bold text-foreground flex items-center gap-1.5"><Globe className="w-4 h-4 text-muted-foreground" /> Página de vendas do concorrente</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Guarda uma versão a cada captura — quando ele mudar preço, bônus ou oferta, você vê a diferença aqui.</p>
        </div>
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
      </div>

      {/* Modal de transcrição (leitura + copiar + .txt) */}
      {modalT && <ModalTranscricaoHist titulo={modalT.titulo} texto={modalT.texto} onFechar={() => setModalT(null)} />}
    </div>
  )
}

function ModalTranscricaoHist({ titulo, texto, onFechar }: { titulo: string; texto: string; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFechar])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true); setTimeout(() => setCopiado(false), 2000)
    } catch { /* clipboard bloqueado */ }
  }

  function baixarTxt() {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcricao-${titulo.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-2xl rounded-2xl ${card} shadow-2xl flex flex-col max-h-[85vh]`}>
        <div className="flex items-start gap-3 p-5 border-b border-border">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#1a2022' }}>
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold truncate">Transcrição</h3>
            <p className="text-xs text-muted-foreground truncate">{titulo}</p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{texto}</p>
          <p className="text-[11px] text-muted-foreground mt-2">{texto.trim().split(/\s+/).filter(Boolean).length} palavras</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap p-5 border-t border-border">
          <button onClick={copiar} className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-white/10 text-foreground hover:bg-white/5 transition">
            {copiado ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado!' : 'Copiar tudo'}
          </button>
          <button onClick={baixarTxt} className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-white/10 text-foreground hover:bg-white/5 transition">
            <Download className="w-4 h-4" /> .txt
          </button>
        </div>
      </div>
    </div>
  )
}

// Card de criativo a partir do histórico (mesmo visual do "Movimento", mas
// lendo de CriativoHist em vez do snapshot ao vivo — dá pra abrir mesmo pra
// um criativo que já saiu do ar).
function CardCriativoHist({ c, isPrivate = false, inicial, onAbrir, onSalvar }: {
  c: CriativoHist
  isPrivate?: boolean
  inicial?: string
  onAbrir: (texto: string) => void
  onSalvar: (texto: string) => void
}) {
  const [tocando, setTocando] = useState(false)
  const [status, setStatus] = useState<string | null>(null)   // "Na fila (2º)..." / "Transcrevendo..."
  const [texto, setTexto] = useState<string | null>(inicial ?? null)
  const [erroT, setErroT] = useState<string | null>(null)
  const podeTocar = c.media_type === 'video' && !!c.video_url

  useEffect(() => { if (inicial) setTexto(inicial) }, [inicial])

  async function transcrever() {
    if (!c.video_url || status) return
    if (texto) { onAbrir(texto); return }
    setErroT(null)
    const r = await transcreverNaFila(c.video_url, setStatus)
    setStatus(null)
    if (r.error) { setErroT(r.error); return }
    const t = r.texto!
    setTexto(t)
    if (c.ad_archive_id) { salvarTranscricao(c.ad_archive_id, c.video_url, t); onSalvar(t) }
    onAbrir(t)
  }

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
        {c.page_name && <p className="text-xs font-semibold text-muted-foreground truncate">{isPrivate ? 'Perfil oculto' : c.page_name}</p>}
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
          {c.video_url && (
            <button onClick={transcrever} disabled={!!status}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
              {status ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {status ?? (texto ? 'Ver transcrição' : 'Transcrever')}
            </button>
          )}
        </div>
        {erroT && <p className="mt-2 text-[11px] text-rose-300/90">{erroT}</p>}
      </div>
    </div>
  )
}
