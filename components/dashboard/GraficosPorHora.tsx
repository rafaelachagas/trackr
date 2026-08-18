'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart, Line, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from 'recharts'
import { EyeOff, Info } from 'lucide-react'
import { formatarMoeda } from '@/lib/utils'
import { useDashboard } from '@/context/DashboardContext'
import { formatInTimeZone } from 'date-fns-tz'
import type { HoraPonto } from '@/app/api/dashboard/por-hora/route'

type Fonte = 'geral' | 'frio' | 'organico'
type Valor = 'liquido' | 'bruto'

const COR = { investimento: '#f59e0b', faturamento: 'var(--primary)', lucro: '#10b981', prejuizo: '#f43f5e' }

const FONTE_OPTS: { v: Fonte; label: string }[] = [
  { v: 'geral', label: 'Geral' },
  { v: 'frio', label: 'Frio' },
  { v: 'organico', label: 'Orgânico' },
]
const VALOR_OPTS: { v: Valor; label: string }[] = [
  { v: 'liquido', label: 'Líquido' },
  { v: 'bruto', label: 'Bruto' },
]

function fmtK(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1000) return `R$${(v / 1000).toFixed(0)}k`
  return `R$${v.toFixed(0)}`
}
function fmtCurto(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

type SeriePonto = { hora: number; label: string; investimento: number; faturamento: number; lucro: number }

function derivarSerie(pontos: HoraPonto[], fonte: Fonte, valor: Valor): SeriePonto[] {
  return pontos.map((p) => {
    const fatFrio = valor === 'liquido' ? p.fatFrioLiq : p.fatFrioBru
    const fatOrg = valor === 'liquido' ? p.fatOrgLiq : p.fatOrgBru
    let faturamento = 0
    let investimento = 0
    let imposto = 0
    if (fonte === 'geral') { faturamento = fatFrio + fatOrg; investimento = p.investimento; imposto = p.imposto }
    else if (fonte === 'frio') { faturamento = fatFrio; investimento = p.investimento; imposto = p.imposto }
    else { faturamento = fatOrg; investimento = 0; imposto = 0 } // orgânico não tem investimento/imposto
    return {
      hora: p.hora,
      label: `${String(p.hora).padStart(2, '0')}:00`,
      investimento,
      faturamento,
      // Lucro = Faturamento − Investimento − Imposto do tráfego (bate com o card "Lucro").
      lucro: faturamento - investimento - imposto,
    }
  })
}

function Seletor<T extends string>({ value, onChange, opts }: { value: T; onChange: (v: T) => void; opts: { v: T; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="text-xs font-semibold rounded-lg px-3 py-1.5 cursor-pointer outline-none bg-background border border-border text-foreground focus:border-primary transition-colors"
    >
      {opts.map((o) => <option key={o.v} value={o.v} className="bg-background">{o.label}</option>)}
    </select>
  )
}

function TooltipMoeda({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border border-border rounded-xl shadow-2xl p-4 text-sm text-popover-foreground">
      <p className="font-bold text-foreground mb-3 border-b border-border pb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((e: any) => (
          <p key={e.name} style={{ color: e.color }} className="flex justify-between gap-8">
            <span className="font-medium">{e.name}:</span>
            <span className="font-black">{formatarMoeda(e.value)}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

function CardChart({ title, tooltip, seletores, children, isPrivate }: {
  title: string; tooltip: string; seletores: React.ReactNode; children: React.ReactNode; isPrivate: boolean
}) {
  const [showTip, setShowTip] = useState(false)
  return (
    <div className="bg-card border-border rounded-2xl border p-6 shadow-sm relative overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-6 relative z-10">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <div className="relative" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
            <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
            {showTip && (
              <div className="absolute left-1/2 -translate-x-1/2 top-6 z-30 w-64 text-[11px] font-medium bg-popover border border-border rounded-lg shadow-2xl px-3 py-2 text-popover-foreground">
                {tooltip}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">{seletores}</div>
      </div>
      <div className={`w-full h-[340px] transition-all duration-500 ${isPrivate ? 'blur-xl opacity-20 pointer-events-none select-none' : ''}`}>
        {children}
      </div>
      {isPrivate && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="bg-card border border-border p-5 rounded-3xl shadow-2xl flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary"><EyeOff className="w-6 h-6" /></div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Privacidade Ativa</p>
          </div>
        </div>
      )}
    </div>
  )
}

function GraficoAcumulado({ pontos, isPrivate, corteHora }: { pontos: HoraPonto[]; isPrivate: boolean; corteHora: number | null }) {
  const [fonte, setFonte] = useState<Fonte>('geral')
  const [valor, setValor] = useState<Valor>('liquido')

  const dados = useMemo(() => {
    const s = derivarSerie(pontos, fonte, valor)
    let ai = 0, af = 0, al = 0
    return s.map((p) => {
      ai += p.investimento; af += p.faturamento; al += p.lucro
      // "Hoje": não desenha horas que ainda não chegaram (linha para na hora atual).
      const futuro = corteHora != null && p.hora > corteHora
      return { label: p.label, investimento: futuro ? null : ai, faturamento: futuro ? null : af, lucro: futuro ? null : al }
    })
  }, [pontos, fonte, valor, corteHora])

  return (
    <CardChart
      title="Faturamento × Investimento × Lucro por Hora (acumulado)"
      tooltip="Comparação acumulada de faturamento, investimento e lucro ao longo de cada hora do dia, somando o período selecionado."
      isPrivate={isPrivate}
      seletores={<><Seletor value={fonte} onChange={setFonte} opts={FONTE_OPTS} /><Seletor value={valor} onChange={setValor} opts={VALOR_OPTS} /></>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="0" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' }} axisLine={false} tickLine={false} interval={0} minTickGap={0} padding={{ left: 8, right: 8 }} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={<TooltipMoeda />} cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.2 }} />
          <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em' }} />
          <Line type="monotone" dataKey="faturamento" name="Faturamento" stroke={COR.faturamento} strokeWidth={2.5} dot={{ r: 3, fill: COR.faturamento, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--card)' }} connectNulls={false} />
          <Line type="monotone" dataKey="lucro" name="Lucro" stroke={COR.lucro} strokeWidth={2.5} dot={{ r: 3, fill: COR.lucro, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--card)' }} connectNulls={false} />
          <Line type="monotone" dataKey="investimento" name="Investimento" stroke={COR.investimento} strokeWidth={2.5} dot={{ r: 3, fill: COR.investimento, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: 'var(--card)' }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </CardChart>
  )
}

function GraficoLucroPorHorario({ pontos, isPrivate, corteHora }: { pontos: HoraPonto[]; isPrivate: boolean; corteHora: number | null }) {
  const [fonte, setFonte] = useState<Fonte>('geral')
  const [valor, setValor] = useState<Valor>('liquido')

  const dados = useMemo(() => derivarSerie(pontos, fonte, valor).map((p) => ({
    label: p.label,
    lucro: (corteHora != null && p.hora > corteHora) ? null : p.lucro,
  })), [pontos, fonte, valor, corteHora])

  return (
    <CardChart
      title="Lucro por Horário"
      tooltip="Lucro (ou prejuízo) por hora do dia, somando o período selecionado. Azul = lucro, vermelho = prejuízo."
      isPrivate={isPrivate}
      seletores={<><Seletor value={fonte} onChange={setFonte} opts={FONTE_OPTS} /><Seletor value={valor} onChange={setValor} opts={VALOR_OPTS} /></>}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 24, right: 12, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={0} minTickGap={0} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
          <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'var(--muted)', opacity: 0.08 }} />
          <Legend content={() => (
            <div className="flex justify-center gap-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, background: COR.faturamento, borderRadius: 2, display: 'inline-block' }} />Lucro +</span>
              <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, background: COR.prejuizo, borderRadius: 2, display: 'inline-block' }} />Prejuízo −</span>
            </div>
          )} />
          <Bar dataKey="lucro" name="Lucro" radius={[3, 3, 0, 0]}>
            {dados.map((d, i) => <Cell key={i} fill={(d.lucro ?? 0) >= 0 ? COR.faturamento : COR.prejuizo} />)}
            <LabelList dataKey="lucro" position="top" formatter={(v: any) => (v == null ? '' : fmtCurto(Number(v)))} style={{ fontSize: 8, fill: 'var(--muted-foreground)', fontWeight: 700 }} />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </CardChart>
  )
}

export default function GraficosPorHora() {
  const { dateRange, lastUpdate, isPrivate } = useDashboard()
  const [pontos, setPontos] = useState<HoraPonto[]>([])

  // Corte de horas futuras: só faz sentido quando o período é exatamente HOJE
  // (dia único = hoje em SP). Em período de vários dias, todas as horas somam
  // dias anteriores e continuam válidas.
  const corteHora = useMemo(() => {
    try {
      const TZ = 'America/Sao_Paulo'
      const hoje = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
      const ini = dateRange.start ? formatInTimeZone(dateRange.start, TZ, 'yyyy-MM-dd') : ''
      const fim = dateRange.end ? formatInTimeZone(dateRange.end, TZ, 'yyyy-MM-dd') : ''
      if (ini === hoje && fim === hoje) return Number(formatInTimeZone(new Date(), TZ, 'H'))
    } catch {}
    return null
  }, [dateRange, lastUpdate])

  useEffect(() => {
    const params = new URLSearchParams()
    try {
      if (dateRange.start && !isNaN(dateRange.start.getTime())) params.set('d_inicio', formatInTimeZone(dateRange.start, 'America/Sao_Paulo', 'yyyy-MM-dd'))
      if (dateRange.end && !isNaN(dateRange.end.getTime())) params.set('d_fim', formatInTimeZone(dateRange.end, 'America/Sao_Paulo', 'yyyy-MM-dd'))
    } catch { return }

    fetch(`/api/dashboard/por-hora?${params}`)
      .then((r) => r.json())
      .then((j) => setPontos(j.pontos ?? []))
      .catch(() => {})
  }, [lastUpdate, dateRange])

  return (
    <div className="space-y-6">
      <GraficoAcumulado pontos={pontos} isPrivate={isPrivate} corteHora={corteHora} />
      <GraficoLucroPorHorario pontos={pontos} isPrivate={isPrivate} corteHora={corteHora} />
    </div>
  )
}
