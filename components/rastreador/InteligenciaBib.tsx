'use client'

import React, { useEffect, useState } from 'react'
import { Gauge, Layers, RefreshCw, Sparkles, FileDown, Loader2, Skull, Globe, Clock, TrendingUp, AlertCircle, Trophy, ExternalLink, X, PlayCircle, Download, Copy, Binoculars, FileText, Check } from 'lucide-react'
import { resumoInteligencia, listarCriativosHist, reconstruirHistorico, serieEscala, listarTrafegoManual, salvarTrafegoManual, type ResumoInteligencia, type CriativoHist, type PontoEscala, type LeituraTrafego } from '@/app/actions/rastreador-intel'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts'
import { getTranscricoes, salvarTranscricao } from '@/app/actions/rastreador'
import { transcreverNaFila } from '@/lib/fila-transcricao'
import { baixarTxt, baixarDocx, baixarMd, baixarPdf } from '@/lib/exportDoc'
import { clusterizarBiblioteca } from '@/app/actions/rastreador-ia'
import { gerarRelatorioConcorrente } from '@/app/actions/rastreador-relatorio'
import { capturarPagina, listarVersoesPagina, listarVslsConcorrente, resolverEscolhaVsl, detectarAbVslConcorrente, type VersaoPagina, type VslCandidata, type AbDetectado } from '@/app/actions/rastreador-pagina'
import { baixarRelatorioHTML, relatorioParaMarkdown, relatorioParaTexto } from '@/lib/reportConcorrente'
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
  const [modalFormato, setModalFormato] = useState(false)
  const [vslStatus, setVslStatus] = useState<string | null>(null)   // "Achando a VSL..." / "Na fila..." / "Transcrevendo..."
  const [vslErro, setVslErro] = useState<string | null>(null)

  // Página de vendas
  const [url, setUrl] = useState(landingUrl ?? '')
  const [versoes, setVersoes] = useState<VersaoPagina[]>([])
  const [capturando, setCapturando] = useState(false)

  const [escala, setEscala] = useState<PontoEscala[]>([])
  const [trafego, setTrafego] = useState<LeituraTrafego[]>([])
  const [trafegoMes, setTrafegoMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [trafegoVisitas, setTrafegoVisitas] = useState('')

  async function carregar() {
    setLoading(true)
    const [r, c, v, e, tr] = await Promise.all([resumoInteligencia(bibId), listarCriativosHist(bibId), listarVersoesPagina(bibId), serieEscala(bibId), listarTrafegoManual(bibId)])
    if (r.success) setResumo(r.data)
    if (c.success) setCriativos(c.data)
    if (v.success) setVersoes(v.data)
    if (e.success) setEscala(e.data)
    if (tr.success) setTrafego(tr.data)
    setLoading(false)
    // Cache de transcrições já feitas (mesma tabela usada no "Movimento").
    // Inclui a da VSL da página, guardada sob a chave sintética vsl:<bibId>.
    const idsT = [...c.data.map((x) => x.ad_archive_id).filter(Boolean), `vsl:${bibId}`]
    const t = await getTranscricoes(idsT)
    if (t.success) setCacheT(t.data)
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

  async function gerarRelatorio(formato: 'html' | 'docx' | 'md' | 'txt' | 'pdf') {
    setModalFormato(false)
    setGerando(true); setMsg(null)
    const r = await gerarRelatorioConcorrente(bibId)
    setGerando(false)
    if (!r.success || !r.data) { setMsg(r.error || 'Falha ao gerar relatório.'); return }
    const d = r.data
    const nomeBase = `report-${d.slug || 'concorrente'}-${d.data.replace(/\//g, '-')}`
    const tituloDoc = `Relatório de Inteligência — ${d.nome}`
    if (formato === 'html') baixarRelatorioHTML(d)
    else if (formato === 'md') baixarMd(nomeBase, tituloDoc, relatorioParaMarkdown(d))
    else if (formato === 'txt') baixarTxt(nomeBase, `${tituloDoc}\n\n${relatorioParaTexto(d)}`)
    else if (formato === 'docx') baixarDocx(nomeBase, tituloDoc, relatorioParaTexto(d))
    else baixarPdf(nomeBase, tituloDoc, relatorioParaTexto(d))
    setMsg(`Relatório gerado e baixado (.${formato}).`)
  }

  // Vídeos da página do concorrente: acha todos (mp4/m3u8/VTurb) na última
  // versão salva; com 1 resultado age direto, com vários abre o seletor.
  const [seletorVsl, setSeletorVsl] = useState<{ itens: VslCandidata[] } | null>(null)
  const [baixandoVsl, setBaixandoVsl] = useState(false)

  // Recebe a escolha feita no "modo seleção" (aba da página do concorrente
  // aberta via botão Escolher na página — o clique lá manda postMessage).
  useEffect(() => {
    async function onMsg(ev: MessageEvent) {
      const escolha = (ev.data as any)?.theTrackVsl
      if (!escolha?.tipo || !escolha?.valor) return
      setVslErro(null)
      setVslStatus('Resolvendo o vídeo escolhido...')
      const r = await resolverEscolhaVsl(escolha)
      setVslStatus(null)
      if (!r.success || !r.item) { setVslErro(r.error ?? 'Não consegui resolver o vídeo escolhido.'); return }
      setSeletorVsl({ itens: [r.item] })
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [bibId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function obterVsls(): Promise<VslCandidata[] | null> {
    setVslErro(null)
    const r = await listarVslsConcorrente(bibId)
    if (!r.success) { setVslErro(r.error ?? 'Não achei vídeo na página.'); return null }
    return r.itens
  }

  // VSL pode ter 20-40 min — transcrição assíncrona: inicia o job na VPS e
  // fica perguntando o status a cada 10s (sem prender nenhuma requisição).
  async function transcreverItem(item: VslCandidata) {
    setSeletorVsl(null)
    setVslStatus('Enviando pra transcrição...')
    try {
      const ini = await fetch('/api/rastreador/transcrever-async', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: item.url }),
      }).then((r) => r.json())
      if (!ini?.job_id) { setVslStatus(null); setVslErro(ini?.error || 'Falha ao iniciar a transcrição.'); return }
      const comecou = Date.now()
      for (;;) {
        await new Promise((res) => setTimeout(res, 10000))
        const min = Math.floor((Date.now() - comecou) / 60000)
        const j = await fetch(`/api/rastreador/transcrever-async?id=${ini.job_id}`).then((r) => r.json()).catch(() => null)
        if (!j) { setVslStatus(`Transcrevendo... (${min} min)`); continue }
        if (j.status === 'ok') {
          setVslStatus(null)
          const texto = j.texto || '(sem fala detectada)'
          setCacheT((m) => ({ ...m, [`vsl:${bibId}`]: texto }))
          salvarTranscricao(`vsl:${bibId}`, item.url, texto)
          setModalT({ titulo: 'VSL da página de vendas', texto })
          return
        }
        if (j.status === 'erro' || j.error) { setVslStatus(null); setVslErro(j.erro || j.error || 'Falha ao transcrever.'); return }
        setVslStatus(j.status === 'fila' ? 'Na fila da VPS...' : `Transcrevendo... (${min} min)`)
        // VSL de 1h em CPU pode levar bem mais de 1h de máquina — teto folgado.
        if (Date.now() - comecou > 150 * 60000) { setVslStatus(null); setVslErro('Passou de 2h30 — algo travou na VPS.'); return }
      }
    } catch {
      setVslStatus(null)
      setVslErro('Falha ao transcrever.')
    }
  }

  async function transcreverVsl() {
    if (vslStatus) return
    const cacheado = cacheT[`vsl:${bibId}`]
    if (cacheado) { setModalT({ titulo: 'VSL da página de vendas', texto: cacheado }); return }
    setVslStatus('Achando os vídeos da página...')
    const itens = await obterVsls()
    if (!itens) { setVslStatus(null); return }
    if (itens.length === 1) { await transcreverItem(itens[0]); return }
    setVslStatus(null)
    setSeletorVsl({ itens })
  }

  async function baixarVsl() {
    if (baixandoVsl) return
    setBaixandoVsl(true)
    const itens = await obterVsls()
    setBaixandoVsl(false)
    if (!itens) return
    // m3u8 remontado na VPS pode levar 1-2 min pra começar — abre em aba própria.
    if (itens.length === 1) { window.open(itens[0].download, '_blank', 'noopener'); return }
    setSeletorVsl({ itens })
  }

  // Caça teste A/B: visita a página 6x como visitante novo e mostra as
  // variantes de vídeo/headline com a proporção do sorteio.
  const [abResultado, setAbResultado] = useState<AbDetectado | null>(null)
  const [abRodando, setAbRodando] = useState(false)
  async function detectarAb() {
    if (abRodando) return
    setAbRodando(true); setVslErro(null)
    const r = await detectarAbVslConcorrente(bibId)
    setAbRodando(false)
    if (!r.success || !r.data) { setVslErro(r.error ?? 'Falha ao detectar.'); return }
    setAbResultado(r.data)
  }

  // Abre a última versão salva da página em "modo seleção": os players ganham
  // um botão de escolher e o clique volta pra cá via postMessage.
  function escolherNaPagina() {
    const v = versoes[0]
    if (!v) { setVslErro('Ainda não há versão capturada da página — clique em Capturar/versionar primeiro.'); return }
    window.open(`/api/rastreador/pagina/${v.id}?selecionar=1`, '_blank')
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
        <button onClick={() => setModalFormato(true)} disabled={gerando} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
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

      {/* Pressão de escala — quantos anúncios ele mantém no ar ao longo do tempo */}
      {escala.length >= 2 && (() => {
        const ultimo = escala[escala.length - 1]
        const alvo7 = new Date(ultimo.dia + 'T12:00:00')
        alvo7.setDate(alvo7.getDate() - 7)
        const ref = [...escala].reverse().find((p) => new Date(p.dia + 'T12:00:00') <= alvo7) ?? escala[0]
        const delta = ref.totalComCopias > 0 ? ((ultimo.totalComCopias - ref.totalComCopias) / ref.totalComCopias) * 100 : null
        return (
          <div className={`rounded-2xl p-5 ${card}`}>
            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
              <div>
                <p className="text-sm font-bold text-foreground flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-muted-foreground" /> Pressão de escala</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Quantos anúncios ele mantém no ar, dia a dia. Subida forte = pisando no acelerador; queda = recuando ou trocando de estratégia.</p>
              </div>
              {delta != null && (
                <span className={`text-xs font-bold px-2.5 py-1.5 rounded-full shrink-0 ${delta >= 25 ? 'text-emerald-300 bg-emerald-500/10' : delta <= -25 ? 'text-rose-300 bg-rose-500/10' : 'text-muted-foreground bg-white/5'}`}>
                  {delta >= 0 ? '+' : ''}{delta.toFixed(0)}% em 7 dias{delta >= 100 ? ' 🚀' : ''}
                </span>
              )}
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={escala} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="escalaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00aeef" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#00aeef" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="dia" tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={28} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <RTooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0]?.payload as PontoEscala
                    return (
                      <div className="rounded-lg px-3 py-2 text-xs bg-popover border border-border shadow-xl">
                        <p className="font-semibold mb-0.5">{`${String(label).slice(8, 10)}/${String(label).slice(5, 7)}`}</p>
                        <p className="text-primary">{p.totalComCopias} anúncio(s) no ar</p>
                        <p className="text-muted-foreground">{p.ativos} criativo(s) único(s)</p>
                      </div>
                    )
                  }} />
                  <Area type="monotone" dataKey="totalComCopias" stroke="#00aeef" strokeWidth={2} fill="url(#escalaFill)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="ativos" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-2">Linha cheia: anúncios no ar (com cópias/duplicações). Tracejada: criativos únicos.</p>

            {/* Tráfego estimado (leituras manuais da extensão do SimilarWeb) */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-muted-foreground shrink-0">Tráfego estimado (SimilarWeb):</span>
                {trafego.length === 0 && <span className="text-[11px] text-muted-foreground/60">nenhuma leitura registrada ainda</span>}
                {trafego.map((l, i) => {
                  const ant = trafego[i - 1]
                  const d = ant && ant.visitas > 0 ? ((l.visitas - ant.visitas) / ant.visitas) * 100 : null
                  return (
                    <span key={l.mes} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-white/5 tabular-nums">
                      {`${l.mes.slice(5, 7)}/${l.mes.slice(2, 4)}`}: {l.visitas >= 1000 ? `${(l.visitas / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}K` : l.visitas}
                      {d != null && <span className={d >= 0 ? 'text-emerald-300' : 'text-rose-300'}> {d >= 0 ? '+' : ''}{d.toFixed(0)}%</span>}
                    </span>
                  )
                })}
                <span className="ml-auto flex items-center gap-1.5">
                  <input type="month" value={trafegoMes} onChange={(e) => setTrafegoMes(e.target.value)}
                    className="px-2 py-1 rounded-lg text-[11px]" style={inputStyle} />
                  <input type="number" min={1} placeholder="visitas/mês" value={trafegoVisitas} onChange={(e) => setTrafegoVisitas(e.target.value)}
                    className="w-24 px-2 py-1 rounded-lg text-[11px]" style={inputStyle} />
                  <button onClick={async () => {
                    const v = Number(trafegoVisitas)
                    if (!v || !trafegoMes) return
                    const r = await salvarTrafegoManual(bibId, trafegoMes, v)
                    if (r.success) { setTrafego(r.data); setTrafegoVisitas('') } else setMsg(r.error ?? 'Falha ao salvar leitura.')
                  }} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition">
                    Registrar
                  </button>
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-1.5">Anote aqui a leitura da extensão do SimilarWeb quando olhar — cruzada com o gráfico acima, mostra se a escala de anúncios está virando tráfego de verdade.</p>
            </div>
          </div>
        )
      })()}

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
          <button onClick={transcreverVsl} disabled={!!vslStatus} title="Acha a VSL embutida na página e transcreve com o Whisper da VPS"
            className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 whitespace-nowrap">
            {vslStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {vslStatus ?? (cacheT[`vsl:${bibId}`] ? 'Ver transcrição da VSL' : 'Transcrever VSL')}
          </button>
          <button onClick={baixarVsl} disabled={baixandoVsl} title="Baixa a VSL da página como arquivo .mp4 (streaming da VTurb é remontado na VPS — pode demorar 1-2 min pra começar)"
            className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 border border-white/10 text-foreground/90 hover:bg-white/5 disabled:opacity-50 whitespace-nowrap">
            {baixandoVsl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Baixar VSL
          </button>
          <button onClick={escolherNaPagina} disabled={versoes.length === 0} title="Abre a página do concorrente em modo seleção: clique no vídeo que quiser e volte aqui pra transcrever ou baixar"
            className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 border border-white/10 text-foreground/90 hover:bg-white/5 disabled:opacity-50 whitespace-nowrap">
            <PlayCircle className="w-4 h-4" /> Escolher na página
          </button>
          <button onClick={detectarAb} disabled={abRodando} title="Visita a página 6 vezes como visitante novo e revela as variantes de vídeo e headline do teste A/B"
            className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 whitespace-nowrap">
            {abRodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            {abRodando ? 'Visitando 6x...' : 'Detectar teste A/B'}
          </button>
        </div>
        {vslErro && <p className="mt-2 text-[11px] text-rose-300/90">{vslErro}</p>}
        {versoes.length > 0 && (
          <div className="mt-3 space-y-2">
            {versoes.map((v) => (
              <div key={v.id} className="rounded-lg p-2.5 border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 text-xs">
                  {v.print_url && (
                    <a href={v.print_url} target="_blank" rel="noreferrer" title="Ver o print (screenshot real) desta versão" className="shrink-0">
                      <img src={v.print_url} alt="" className="w-9 h-9 rounded object-cover object-top bg-black/40 border border-white/10 hover:border-primary/50 transition"
                        loading="lazy" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
                    </a>
                  )}
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

      {/* Modal de transcrição (leitura + copiar + downloads) */}
      {modalT && <ModalTranscricaoHist titulo={modalT.titulo} texto={modalT.texto} onFechar={() => setModalT(null)} />}

      {/* Modal: resultado do detector de teste A/B */}
      {abResultado && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setAbResultado(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-xl rounded-2xl ${card} shadow-2xl p-6 max-h-[85vh] overflow-y-auto`}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-base font-bold flex items-center gap-2"><Layers className="w-5 h-5 text-amber-300" /> Teste A/B do concorrente</h3>
              <button onClick={() => setAbResultado(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {abResultado.rodadas} visitas como visitante novo{abResultado.erros > 0 ? ` (${abResultado.erros} falharam)` : ''} —{' '}
              {abResultado.videos.length > 1 || abResultado.headlines.length > 1
                ? <b className="text-amber-300">tem teste A/B rodando: {abResultado.videos.length} vídeo(s) e {abResultado.headlines.length} headline(s) diferentes.</b>
                : 'nenhuma variação detectada nessas visitas (pode ser página única, ou o sorteio não alternou).'}
            </p>

            {abResultado.videos.length > 0 && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Vídeos servidos</p>
                <div className="space-y-2 mb-4">
                  {abResultado.videos.map((v) => (
                    <div key={v.url} className="rounded-xl border border-white/10 p-3 flex items-center gap-3">
                      <span className="text-xs font-bold tabular-nums px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 shrink-0">{Math.round(v.pct)}%</span>
                      <span className="text-[11px] font-mono text-muted-foreground truncate flex-1" title={v.url}>{v.url.replace(/^https?:\/\//, '')}</span>
                      <button onClick={() => { setAbResultado(null); transcreverItem(v) }}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition">
                        Transcrever
                      </button>
                      <a href={v.download} target="_blank" rel="noreferrer"
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-foreground/90 hover:bg-white/5 transition inline-flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" /> Baixar
                      </a>
                    </div>
                  ))}
                </div>
              </>
            )}

            {abResultado.headlines.length > 0 && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Headlines servidas</p>
                <div className="space-y-2">
                  {abResultado.headlines.map((h) => (
                    <div key={h.texto} className="rounded-xl border border-white/10 p-3 flex items-start gap-3">
                      <span className="text-xs font-bold tabular-nums px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 shrink-0">{Math.round(h.pct)}%</span>
                      <span className="text-sm text-foreground/90">{h.texto}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="text-[10px] text-muted-foreground/70 mt-4">A proporção é do sorteio nas {abResultado.rodadas} visitas — rode de novo pra refinar. Split feito 100% no navegador (sem trocar o HTML) pode não aparecer aqui.</p>
          </div>
        </div>
      )}

      {/* Modal: escolher qual vídeo da página transcrever/baixar */}
      {seletorVsl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setSeletorVsl(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-lg rounded-2xl ${card} shadow-2xl p-6`}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-base font-bold flex items-center gap-2"><PlayCircle className="w-5 h-5 text-primary" /> Vídeos achados na página</h3>
              <button onClick={() => setSeletorVsl(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{seletorVsl.itens.length > 1 ? 'A página tem mais de um vídeo — escolha o que fazer com qual.' : 'Vídeo escolhido — o que você quer fazer com ele?'}</p>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {seletorVsl.itens.map((item) => (
                <div key={item.url} className="rounded-xl border border-white/10 p-3 flex items-center gap-3">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase shrink-0">{item.origem === 'vturb' ? 'VTurb' : item.url.toLowerCase().includes('.m3u8') ? 'stream' : 'mp4'}</span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate flex-1" title={item.url}>{item.url.replace(/^https?:\/\//, '')}</span>
                  <button onClick={() => transcreverItem(item)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition">
                    Transcrever
                  </button>
                  <a href={item.download} target="_blank" rel="noreferrer" onClick={() => setSeletorVsl(null)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-foreground/90 hover:bg-white/5 transition inline-flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> Baixar
                  </a>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-3">Dica: o vídeo principal (a VSL) costuma ser o primeiro da lista. "Stream" é remontado em .mp4 na VPS — o download pode levar 1-2 min pra começar.</p>
          </div>
        </div>
      )}

      {/* Modal: escolher o formato do relatório IA */}
      {modalFormato && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setModalFormato(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-sm rounded-2xl ${card} shadow-2xl p-6`}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-base font-bold flex items-center gap-2"><FileDown className="w-5 h-5 text-primary" /> Gerar relatório</h3>
              <button onClick={() => setModalFormato(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Você deseja gerar o relatório em qual formato?</p>
            <div className="grid grid-cols-2 gap-2">
              {(['html', 'pdf', 'docx', 'md', 'txt'] as const).map((f) => (
                <button key={f} onClick={() => gerarRelatorio(f)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition ${f === 'html' ? 'col-span-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20' : 'border-white/10 text-foreground hover:bg-white/5'}`}>
                  .{f}{f === 'html' ? ' (visual completo)' : ''}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-3">O .html mantém o layout com thumbnails; os demais levam o conteúdo em texto estruturado.</p>
          </div>
        </div>
      )}
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

  const nomeBase = `transcricao-${titulo}`

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
          {([
            ['.txt', () => baixarTxt(nomeBase, texto)],
            ['.docx', () => baixarDocx(nomeBase, `Transcrição — ${titulo}`, texto)],
            ['.md', () => baixarMd(nomeBase, `Transcrição — ${titulo}`, texto)],
            ['.pdf', () => baixarPdf(nomeBase, `Transcrição — ${titulo}`, texto)],
          ] as [string, () => void][]).map(([ext, fn]) => (
            <button key={ext} onClick={fn}
              className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-white/10 text-foreground hover:bg-white/5 transition">
              <Download className="w-4 h-4" /> {ext}
            </button>
          ))}
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
