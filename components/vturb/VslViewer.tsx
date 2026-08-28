'use client'

// Tela de um VSL — layout copiado do painel da VTurb (modo noturno):
// cabeçalho com nome + Comparar + seletor de data (presets + calendário + GMT-3
// + setas de dia), card com abas (Retenção Geral / Países / Dispositivos /
// Sistema Operacional / Navegadores / Origem do Tráfego), toggle "Conversões",
// "Atualizado agora mesmo", gráfico grande de retenção, seção "Métricas" com
// BRL + Visualização de Métricas + Baixar Métricas e os 13 cards em grade de 7.
// Abaixo, as métricas exclusivas do The Track (VTurb × Meta) no mesmo estilo.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { ArrowLeft, ChevronDown, Clock, Download, Eye, GitCompareArrows, Loader2, Plus, MoreVertical, Zap, SlidersHorizontal } from 'lucide-react'
import SimuladorVsl from '@/components/vturb/SimuladorVsl'
import SeletorPeriodoVturb, { rangeDoPreset, type RangePeriodo } from '@/components/ui/SeletorPeriodoVturb'
import { formatInTimeZone } from 'date-fns-tz'
import { format, parseISO } from 'date-fns'
import type { VSL } from '@/app/actions/vsl'
import { useDashboard } from '@/context/DashboardContext'

const TZ = 'America/Sao_Paulo'

const fmtBRL = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)
const fmtNum = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('pt-BR').format(Math.round(n)))
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const hojeSP = () => formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
const d = (s: string) => parseISO(`${s}T12:00:00`)
const iso = (x: Date) => format(x, 'yyyy-MM-dd')

type Range = RangePeriodo

type Aba = 'geral' | 'paises' | 'dispositivos' | 'so' | 'navegadores' | 'origem'
const ABAS: { id: Aba; label: string }[] = [
  { id: 'geral', label: 'Retenção Geral' },
  { id: 'paises', label: 'Países' },
  { id: 'dispositivos', label: 'Dispositivos' },
  { id: 'so', label: 'Sistema Operacional' },
  { id: 'navegadores', label: 'Navegadores' },
  { id: 'origem', label: 'Origem do Tráfego' },
]

export default function VslViewer({ vsl, onVoltar }: { vsl: VSL; onVoltar: () => void }) {
  const { isPrivate } = useDashboard()
  const [range, setRange] = useState<Range>(rangeDoPreset('Hoje'))
  const [dados, setDados] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('geral')
  const [mostrarConv, setMostrarConv] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)
  const [, setTick] = useState(0)
  const [simuladorAberto, setSimuladorAberto] = useState(false)

  useEffect(() => {
    setCarregando(true)
    fetch(`/api/vturb/vsl-stats?vsl_id=${vsl.id}&d_inicio=${range.ini}&d_fim=${range.fim}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { setDados(j); setAtualizadoEm(new Date()) })
      .catch(() => setDados({ error: 'Falha ao carregar' }))
      .finally(() => setCarregando(false))
  }, [vsl.id, range.ini, range.fim])

  // "Atualizado agora mesmo" → "há X min"
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 30_000); return () => clearInterval(i) }, [])
  const atualizadoLabel = useMemo(() => {
    if (!atualizadoEm) return '—'
    const min = Math.floor((Date.now() - atualizadoEm.getTime()) / 60_000)
    return min < 1 ? 'Atualizado agora mesmo' : `Atualizado há ${min} min`
  }, [atualizadoEm, carregando]) // eslint-disable-line react-hooks/exhaustive-deps

  const vt = dados?.vturb, r = dados?.real, mt = dados?.meta
  const duracao: number = dados?.player?.duracao ?? (dados?.retencao?.length ? dados.retencao[dados.retencao.length - 1].t : 0)

  const serie = useMemo(() => {
    const ret: { t: number; pct: number }[] = dados?.retencao ?? []
    if (!mostrarConv) return ret
    const conv: Record<number, number> = {}
    for (const c of dados?.conversoesTimed ?? []) conv[c.t] = (conv[c.t] ?? 0) + c.conversoes
    return ret.map((p) => ({ ...p, conv: conv[p.t] ?? 0 }))
  }, [dados, mostrarConv])

  const cardsVturb = [
    { v: fmtNum(vt?.visualizacoes), l: 'Visualizações' },
    { v: fmtNum(vt?.visualizacoesUnicas), l: 'Visualizações Únicas' },
    { v: fmtNum(vt?.plays), l: 'Plays' },
    { v: fmtNum(vt?.playsUnicos), l: 'Plays Únicos' },
    { v: fmtPct(vt?.playRateVturb), l: 'Play Rate' },
    { v: fmtPct(vt?.retencaoPitch), l: 'Retenção ao Pitch' },
    { v: fmtNum(vt?.audienciaPitch), l: 'Audiência do Pitch' },
    { v: fmtPct(vt?.engajamento), l: 'Engajamento' },
    { v: fmtNum(vt?.cliques), l: 'Cliques no Botão' },
    { v: isPrivate ? '••••' : fmtNum(vt?.conversoes), l: 'Conversões' },
    { v: fmtPct(vt?.taxaConversao), l: 'Taxa de Conversão' },
    { v: isPrivate ? '••••' : fmtBRL(vt?.receitaVturb), l: 'Receita' },
    { v: fmtPct(vt?.retencao1Min), l: 'Retenção 1 Min', menu: true },
  ]

  const cardsTrack = [
    { v: fmtPct(r?.playRateReal), l: 'Play Rate Real', sub: 'plays únicos ÷ LP views da Meta', destaque: true },
    { v: isPrivate ? '••••' : (r?.roas == null ? '—' : `${r.roas.toFixed(2).replace('.', ',')}x`), l: 'ROAS Real', sub: 'receita VTurb ÷ gasto Meta', verde: true },
    { v: fmtNum(mt?.lpViews), l: 'LP Views (Meta)' },
    { v: isPrivate ? '••••' : fmtBRL(mt?.gasto), l: 'Gasto (Meta)' },
    { v: isPrivate ? '••••' : fmtBRL(r?.custoPorPlay), l: 'Custo por Play' },
    { v: isPrivate ? '••••' : fmtBRL(r?.custoPorLp), l: 'Custo por LP View' },
    { v: isPrivate ? '••••' : fmtBRL(r?.cpa), l: 'CPA' },
  ]

  function baixarMetricas() {
    const linhas = [['Métrica', 'Valor'], ...cardsVturb.map((c) => [c.l, c.v]), ...cardsTrack.map((c) => [c.l, c.v])]
    const csv = linhas.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `metricas-${vsl.nome.replace(/\s+/g, '-')}-${range.ini}_${range.fim}.csv`; a.click()
  }

  return (
    <div className="space-y-6">
      {/* ---------- Cabeçalho ---------- */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVoltar} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-[17px] font-bold tracking-tight truncate min-w-0">{vsl.vturb_player_name || vsl.nome}</h2>
        <div className="ml-auto flex items-center gap-3">
          <button title="Comparar períodos/VSLs — em breve" className="h-11 px-4 rounded-xl border border-border bg-card text-[15px] font-medium flex items-center gap-2 text-foreground/90 hover:bg-white/5 transition">
            <GitCompareArrows className="w-4 h-4" /> Comparar <ChevronDown className="w-4 h-4" />
          </button>
          <button onClick={() => setSimuladorAberto(true)} title="Simular 'e se?' com Play Rate, Retenção e Conversão" className="h-11 px-4 rounded-xl border border-border bg-card text-[15px] font-medium flex items-center gap-2 text-foreground/90 hover:bg-white/5 transition">
            <SlidersHorizontal className="w-4 h-4" /> Simulador
          </button>
          <SeletorPeriodoVturb range={range} onChange={setRange} />
        </div>
      </div>

      {/* ---------- Card principal: abas + gráfico + métricas ---------- */}
      <div className="bg-card border border-border rounded-2xl px-5 sm:px-8 py-6">
        <div className="flex items-center gap-4 flex-wrap border-b border-border">
          <div className="flex items-center gap-1 overflow-x-auto">
            {ABAS.map((a) => (
              <button key={a.id} onClick={() => setAba(a.id)}
                className={`px-4 pb-3 pt-1 text-[15px] whitespace-nowrap border-b-2 -mb-px transition ${aba === a.id ? 'text-primary border-primary font-medium' : 'text-foreground/80 border-transparent hover:text-foreground'}`}>
                {a.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-6 pb-3 text-[15px] text-muted-foreground">
            <label className="flex items-center gap-3 cursor-pointer select-none border-l border-border pl-5">
              <span>Conversões</span>
              <span onClick={() => setMostrarConv((v) => !v)} className={`relative inline-flex h-5 w-9 rounded-full transition ${mostrarConv ? 'bg-primary' : 'bg-white/15'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${mostrarConv ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </label>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {atualizadoLabel}</span>
          </div>
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-24 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando métricas...</div>
        ) : dados?.error ? (
          <div className="rounded-xl p-4 my-6 bg-rose-500/8 border border-rose-500/25 text-rose-200 text-sm">{dados.error}</div>
        ) : (
          <>
            {aba === 'geral' ? (
              <div className="mt-6 w-full h-[560px] sm:h-[640px] lg:h-[700px]">
                {serie.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={serie} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="retFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#16a34a" stopOpacity={0.9} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.18)" vertical={false} />
                      <XAxis dataKey="t" type="number" domain={[0, duracao || 'dataMax']} ticks={ticksDe(duracao)} tickFormatter={mmss}
                        tick={{ fontSize: 14, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickMargin={14} />
                      <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]}
                        tick={{ fontSize: 14, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={56} />
                      <Tooltip content={<TooltipRet mostrarConv={mostrarConv} />} />
                      {/* fundo preto igual ao player da VTurb */}
                      <ReferenceLine y={100} stroke="transparent" />
                      <Area type="linear" dataKey="pct" stroke="#4ade80" strokeWidth={1.5} fill="url(#retFill)" isAnimationActive={false} />
                      {mostrarConv && <Area type="step" dataKey="conv" stroke="#facc15" strokeWidth={1.5} fill="#facc15" fillOpacity={0.25} isAnimationActive={false} yAxisId={0} />}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados de retenção no período.</div>
                )}
              </div>
            ) : (
              <TabelaQuebra vslId={vsl.id} range={range} aba={aba} isPrivate={isPrivate} />
            )}

            {/* ---------- Métricas ---------- */}
            <div className="mt-10">
              <h3 className="text-[22px] font-medium mb-5">Métricas</h3>
              <div className="flex items-center gap-3 flex-wrap mb-8">
                <button className="h-11 px-4 rounded-xl border border-border text-[15px] flex items-center gap-2 text-foreground/90">
                  <span className="w-4 h-4 rounded-full bg-gradient-to-b from-green-500 to-yellow-400 inline-block" /> BRL <ChevronDown className="w-4 h-4 ml-1 text-muted-foreground" />
                </button>
                <div className="ml-auto flex items-center gap-3">
                  <button className="h-11 px-4 rounded-xl border border-border text-[15px] flex items-center gap-2 text-foreground/90 hover:bg-white/5 transition"><Eye className="w-4 h-4" /> Visualização de Métricas</button>
                  <button onClick={baixarMetricas} className="h-11 px-4 rounded-xl border border-border text-[15px] flex items-center gap-2 text-foreground/90 hover:bg-white/5 transition"><Download className="w-4 h-4" /> Baixar Métricas</button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                {cardsVturb.map((c) => <CardMetrica key={c.l} valor={c.v} label={c.l} menu={c.menu} isPrivate={isPrivate} />)}
                <button className="rounded-xl border border-border p-5 text-left hover:bg-white/5 transition">
                  <Plus className="w-6 h-6 text-foreground/80 mb-3" strokeWidth={1.5} />
                  <p className="text-[15px] text-foreground/80">Métrica personalizada</p>
                </button>
              </div>
            </div>

            {/* ---------- The Track: VTurb × Meta ---------- */}
            <div className="mt-10">
              <h3 className="text-[22px] font-medium mb-1 flex items-center gap-2"><Zap className="w-5 h-5 text-primary" /> Métricas The Track</h3>
              <p className="text-[13px] text-muted-foreground mb-5">Cruzamento VTurb × Meta — Play Rate real, custo por play e ROAS real desta VSL.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                {cardsTrack.map((c) => <CardMetrica key={c.l} valor={c.v} label={c.l} sub={c.sub} destaque={c.destaque} verde={c.verde} isPrivate={isPrivate} />)}
              </div>
            </div>

            {/* ---------- Upsell (vem do funil vinculado a esta VSL) ---------- */}
            {(() => {
              const up = dados?.upsell
              if (!up) return null
              const fmtConv = (n: number | null) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)
              return (
                <div className="mt-10">
                  <h3 className="text-[22px] font-medium mb-1">Upsell</h3>
                  <p className="text-[13px] text-muted-foreground mb-5">
                    Vendas reais da Hotmart no período, via funil <b className="text-foreground/80">{up.funilNome}</b> — conversão = vendas do upsell ÷ {isPrivate ? '••••' : up.vendasFront} venda(s) do front.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                    <CardMetrica valor={fmtConv(up.conversao)} label="Conversão de Upsell" sub="total de upsells ÷ vendas front" destaque isPrivate={isPrivate} />
                    <CardMetrica valor={isPrivate ? '••••' : fmtNum(up.totalQtd)} label="Vendas de Upsell" isPrivate={isPrivate} />
                    <CardMetrica valor={isPrivate ? '••••' : fmtBRL(up.totalReceita)} label="Receita de Upsell" isPrivate={isPrivate} />
                    {up.itens.map((i: { nome: string; qtd: number; receita: number; conversao: number | null }) => (
                      <CardMetrica key={i.nome} valor={fmtConv(i.conversao)} label={i.nome}
                        sub={isPrivate ? '••••' : `${fmtNum(i.qtd)} venda(s) · ${fmtBRL(i.receita)}`} isPrivate={isPrivate} />
                    ))}
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>

      <SimuladorVsl
        aberto={simuladorAberto}
        onFechar={() => setSimuladorAberto(false)}
        isPrivate={isPrivate}
        vslNome={vsl.vturb_player_name || vsl.nome}
        base={{
          lpViews: mt?.lpViews ?? null,
          gasto: mt?.gasto ?? null,
          playRate: r?.playRateReal ?? null,
          retencaoPitch: vt?.retencaoPitch ?? null,
          taxaConversao: vt?.taxaConversao ?? null,
          conversoes: vt?.conversoes ?? null,
          receita: vt?.receitaVturb ?? null,
        }}
      />
    </div>
  )
}

function ticksDe(dur: number) {
  if (!dur) return undefined
  return [0, Math.round(dur / 4), Math.round(dur / 2), Math.round((3 * dur) / 4), dur]
}

function TooltipRet({ active, payload, label, mostrarConv }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  return (
    <div className="rounded-lg px-3 py-2 text-[13px] bg-popover border border-border shadow-xl">
      <p className="font-semibold mb-0.5">{mmss(Number(label))}</p>
      <p className="text-green-400">Retenção: {Number(p?.pct ?? 0).toFixed(1).replace('.', ',')}%</p>
      {mostrarConv && <p className="text-yellow-300">Conversões: {p?.conv ?? 0}</p>}
    </div>
  )
}

function CardMetrica({ valor, label, sub, destaque, verde, menu, isPrivate }: { valor: string; label: string; sub?: string; destaque?: boolean; verde?: boolean; menu?: boolean; isPrivate?: boolean }) {
  const mascarado = valor === '••••'
  return (
    <div className={`relative rounded-xl border p-5 ${destaque ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      {menu && <MoreVertical className="w-4 h-4 text-muted-foreground absolute right-3 top-4" />}
      <p className={`text-[26px] leading-none font-medium tabular-nums tracking-tight ${verde ? 'text-emerald-400' : destaque ? 'text-primary' : 'text-foreground/90'} ${mascarado && isPrivate ? 'blur-sm select-none' : ''}`}>{valor}</p>
      <p className="text-[15px] text-foreground/70 mt-3">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

// ---------- Abas de quebra ----------
function TabelaQuebra({ vslId, range, aba, isPrivate }: { vslId: string; range: Range; aba: Aba; isPrivate?: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [queryKey, setQueryKey] = useState('utm_source')

  useEffect(() => {
    if (aba === 'so') { setRows([]); setCarregando(false); return }
    setCarregando(true)
    fetch(`/api/vturb/vsl-stats?vsl_id=${vslId}&d_inicio=${range.ini}&d_fim=${range.fim}&aba=${aba}&query_key=${queryKey}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => setRows(j.rows ?? [])).catch(() => setRows([])).finally(() => setCarregando(false))
  }, [vslId, range.ini, range.fim, aba, queryKey])

  if (aba === 'so') return <p className="py-16 text-center text-sm text-muted-foreground">A API da VTurb não expõe a quebra por Sistema Operacional (só país, dispositivo, navegador e UTMs).</p>
  if (carregando) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
  if (!rows?.length) return <p className="py-16 text-center text-sm text-muted-foreground">Sem dados no período.</p>

  const th = 'text-left text-[12px] font-medium uppercase tracking-wide text-muted-foreground px-3 py-3 whitespace-nowrap'
  const td = 'px-3 py-3 text-[14px] tabular-nums whitespace-nowrap'
  return (
    <div className="mt-4">
      {aba === 'origem' && (
        <div className="flex items-center gap-1.5 mb-3">
          {['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck'].map((k) => (
            <button key={k} onClick={() => setQueryKey(k)} className={`px-2.5 py-1 rounded-md text-[12px] border transition ${queryKey === k ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-white/5'}`}>{k}</button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-border">
            <th className={th}>{aba === 'paises' ? 'País' : aba === 'dispositivos' ? 'Dispositivo' : aba === 'navegadores' ? 'Navegador' : queryKey}</th>
            <th className={th}>Visualizações</th><th className={th}>Plays Únicos</th><th className={th}>Play Rate</th>
            <th className={th}>Ret. Pitch</th><th className={th}>Engajamento</th><th className={th}>Cliques</th>
            <th className={th}>Conversões</th><th className={th}>Taxa Conv.</th><th className={th}>Receita</th>
          </tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.grupo} className="border-b border-border/60 hover:bg-white/[0.03]">
                <td className={`${td} font-medium`}>{x.grupo}</td>
                <td className={td}>{fmtNum(x.visualizacoes)}</td><td className={td}>{fmtNum(x.playsUnicos)}</td><td className={td}>{fmtPct(x.playRate)}</td>
                <td className={td}>{fmtPct(x.retencaoPitch)}</td><td className={td}>{fmtPct(x.engajamento)}</td><td className={td}>{fmtNum(x.cliques)}</td>
                <td className={`${td} ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : fmtNum(x.conversoes)}</td><td className={td}>{fmtPct(x.taxaConversao)}</td><td className={`${td} ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : fmtBRL(x.receita)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

