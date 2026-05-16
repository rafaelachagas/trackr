'use client'

import { useEffect, useState } from 'react'
import { formatarMoeda } from '@/lib/utils'
import { AcaoOtimizacao } from '@/types'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowUpCircle,
} from 'lucide-react'

// ============================================================
// Tipos
// ============================================================

type FaseCampanha = 'FASE01' | 'FASE02' | 'FASE03' | null

interface FrameworkData {
  criativo: string
  campaign_name: string | null
  fase: FaseCampanha
  roas_7d: number | null
  roas_3d: number | null
  roas_1d: number | null
  positivo_7d: boolean
  positivo_3d: boolean
  positivo_1d: boolean
  acao: AcaoOtimizacao
  receita_7d: number
  gasto_7d: number
  gasto_3d: number
  gasto_1d: number
  vendas_7d: number
}

// ============================================================
// Helpers visuais
// ============================================================

function corAcao(acao: AcaoOtimizacao) {
  switch (acao) {
    case '+20% orçamento':
      return {
        bg: 'bg-emerald-500/10 border-emerald-500/30',
        text: 'text-emerald-400',
        badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        glow: 'shadow-emerald-500/10',
      }
    case 'Manter':
      return {
        bg: 'bg-amber-500/10 border-amber-500/30',
        text: 'text-amber-400',
        badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        glow: 'shadow-amber-500/10',
      }
    case '-20% ou pausar':
      return {
        bg: 'bg-orange-500/10 border-orange-500/30',
        text: 'text-orange-400',
        badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
        glow: 'shadow-orange-500/10',
      }
    case 'Pausar':
      return {
        bg: 'bg-red-500/10 border-red-500/30',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-300 border border-red-500/30',
        glow: 'shadow-red-500/10',
      }
  }
}

function iconeAcao(acao: AcaoOtimizacao) {
  switch (acao) {
    case '+20% orçamento':
      return <ArrowUpCircle className="w-6 h-6 text-emerald-400" />
    case 'Manter':
      return <CheckCircle2 className="w-6 h-6 text-amber-400" />
    case '-20% ou pausar':
      return <AlertTriangle className="w-6 h-6 text-orange-400" />
    case 'Pausar':
      return <XCircle className="w-6 h-6 text-red-400" />
  }
}

function Semaforo({ positivo, label, roas }: { positivo: boolean; label: string; roas: number | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all ${
          roas === null
            ? 'bg-muted/40 border border-border'
            : positivo
            ? 'bg-emerald-500/20 border border-emerald-500/50 shadow-emerald-500/20'
            : 'bg-red-500/20 border border-red-500/50 shadow-red-500/20'
        }`}
      >
        {roas === null ? (
          <Minus className="w-4 h-4 text-muted-foreground" />
        ) : positivo ? (
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-400" />
        )}
      </div>
      <span className={`text-xs font-bold ${
        roas === null ? 'text-muted-foreground' : positivo ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {roas === null ? '—' : `${roas.toFixed(1)}x`}
      </span>
    </div>
  )
}

function BadgeFase({ fase }: { fase: FaseCampanha }) {
  if (!fase) return null
  const map = {
    FASE01: { label: 'Fase 01 · Teste', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    FASE02: { label: 'Fase 02 · Pré-Escala', cls: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
    FASE03: { label: 'Fase 03 · Escala Agressiva', cls: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' },
  }
  const { label, cls } = map[fase]
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  )
}

// ============================================================
// IA insight — gerado client-side com base nas regras
// ============================================================

function gerarInsight(d: FrameworkData): string {
  const nome = d.criativo.toUpperCase()

  if (d.acao === '+20% orçamento') {
    if (d.positivo_7d && d.positivo_3d && d.positivo_1d)
      return `${nome} está lucrativo nos três horizontes — consistência total. Sinal de criativo maduro e estável. Aumente o orçamento com confiança.`
    return `${nome} perdeu força no histórico longo mas recuperou nos últimos 3 e 1 dia. Tendência de crescimento recente confirma que o algoritmo está reagindo positivamente. Escale com cautela.`
  }

  if (d.acao === 'Manter') {
    if (d.positivo_7d && d.positivo_3d && !d.positivo_1d)
      return `${nome} foi lucrativo nos últimos 7 e 3 dias, mas ontem ficou abaixo do ponto de equilíbrio. Pode ser variação pontual — mantenha o orçamento e observe as próximas 24h antes de tomar qualquer ação.`
    if (!d.positivo_7d && !d.positivo_3d && d.positivo_1d)
      return `${nome} acumulou resultados negativos na semana, mas ontem apresentou recuperação. Sinal fraco ainda — mantenha e acompanhe de perto. Se o 1 dia continuar positivo por mais 48h, considere escalar.`
    return `${nome} apresenta sinais mistos. Mantenha o orçamento atual e reavalie amanhã.`
  }

  if (d.acao === '-20% ou pausar') {
    return `${nome} foi positivo na semana mas caiu nos últimos 3 e 1 dia — tendência de queda. Reduza o orçamento em 20% para preservar verba. Se continuar caindo amanhã, pause.`
  }

  // Pausar
  return `${nome} está negativo em todos os horizontes. Não há dado que justifique manter verba ativa. Pause imediatamente e direcione o orçamento para criativos vencedores.`
}

// ============================================================
// Resumo do header
// ============================================================

function contarAcoes(criativos: FrameworkData[]) {
  return criativos.reduce(
    (acc, c) => {
      if (c.acao === '+20% orçamento') acc.escalar++
      else if (c.acao === 'Manter') acc.manter++
      else if (c.acao === '-20% ou pausar') acc.reduzir++
      else acc.pausar++
      return acc
    },
    { escalar: 0, manter: 0, reduzir: 0, pausar: 0 }
  )
}

// ============================================================
// Card principal de criativo
// ============================================================

function CardCriativo({ d }: { d: FrameworkData }) {
  const cor = corAcao(d.acao)
  const insight = gerarInsight(d)

  return (
    <div className={`rounded-2xl border p-5 space-y-4 shadow-lg ${cor.bg} ${cor.glow}`}>
      {/* Header do card */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-black uppercase tracking-tight text-foreground">
              {d.criativo}
            </span>
            <BadgeFase fase={d.fase} />
          </div>
          {d.campaign_name && (
            <p className="text-[11px] text-muted-foreground font-medium truncate max-w-xs" title={d.campaign_name}>
              {d.campaign_name}
            </p>
          )}
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold shrink-0 ${cor.badge}`}>
          {iconeAcao(d.acao)}
          <span>{d.acao}</span>
        </div>
      </div>

      {/* Semáforo 7d / 3d / 1d */}
      <div className="flex items-center gap-6 py-2">
        <Semaforo positivo={d.positivo_7d} label="7 dias" roas={d.roas_7d} />
        <div className="text-muted-foreground/30 text-xl font-thin">›</div>
        <Semaforo positivo={d.positivo_3d} label="3 dias" roas={d.roas_3d} />
        <div className="text-muted-foreground/30 text-xl font-thin">›</div>
        <Semaforo positivo={d.positivo_1d} label="1 dia" roas={d.roas_1d} />
        <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-0.5 text-right">
          <span className="text-[11px] text-muted-foreground">Receita 7d</span>
          <span className="text-[11px] font-semibold text-foreground">{formatarMoeda(d.receita_7d)}</span>
          <span className="text-[11px] text-muted-foreground">Gasto 7d</span>
          <span className="text-[11px] font-semibold text-foreground">{formatarMoeda(d.gasto_7d)}</span>
          <span className="text-[11px] text-muted-foreground">Vendas 7d</span>
          <span className="text-[11px] font-semibold text-foreground">{d.vendas_7d}</span>
        </div>
      </div>

      {/* Insight IA */}
      <div className="flex items-start gap-2 pt-1 border-t border-white/5">
        <Brain className="w-4 h-4 mt-0.5 shrink-0 text-primary/70" />
        <p className="text-[12px] text-muted-foreground leading-relaxed">{insight}</p>
      </div>
    </div>
  )
}

// ============================================================
// Página principal
// ============================================================

export default function FrameworkPage() {
  const [criativos, setCriativos] = useState<FrameworkData[]>([])
  const [loading, setLoading] = useState(true)
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null)

  async function carregar() {
    setLoading(true)
    try {
      const res = await fetch('/api/framework')
      const json = await res.json()
      setCriativos(json.criativos ?? [])
      setUltimaAtualizacao(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const contagem = contarAcoes(criativos)

  const fases: FaseCampanha[] = ['FASE01', 'FASE02', 'FASE03', null]
  const labelFase: Record<string, string> = {
    FASE01: 'Fase 01 — Teste de Criativos',
    FASE02: 'Fase 02 — Teste de Escala',
    FASE03: 'Fase 03 — Escala Agressiva',
    sem: 'Sem fase identificada',
  }

  return (
    <div className="space-y-8 px-10 pb-12 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" strokeWidth={2.5} />
            <h1 className="text-2xl font-black uppercase tracking-tighter">Central de Decisões</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Framework de otimização — o que fazer com cada criativo agora
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Barra de resumo */}
      {!loading && criativos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground font-medium">
            {criativos.length} criativo{criativos.length !== 1 ? 's' : ''} analisado{criativos.length !== 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground/30">·</span>
          {contagem.escalar > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              ▲ {contagem.escalar} escalar
            </span>
          )}
          {contagem.manter > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              → {contagem.manter} manter
            </span>
          )}
          {contagem.reduzir > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
              ▼ {contagem.reduzir} reduzir
            </span>
          )}
          {contagem.pausar > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
              ✕ {contagem.pausar} pausar
            </span>
          )}
          {ultimaAtualizacao && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[11px] text-muted-foreground">
                Atualizado às {ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Analisando criativos...</p>
        </div>
      )}

      {/* Vazio */}
      {!loading && criativos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Brain className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-base font-semibold text-muted-foreground">Nenhum dado encontrado</p>
          <p className="text-sm text-muted-foreground/60 max-w-sm">
            Sincronize os dados do Meta Ads para ver as decisões do framework aqui.
          </p>
        </div>
      )}

      {/* Cards agrupados por fase */}
      {!loading &&
        criativos.length > 0 &&
        fases.map((fase) => {
          const grupo = criativos.filter((c) => c.fase === fase)
          if (grupo.length === 0) return null
          const labelKey = fase ?? 'sem'
          return (
            <div key={labelKey} className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
                {labelFase[labelKey]}
              </h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {grupo.map((d) => (
                  <CardCriativo key={d.criativo} d={d} />
                ))}
              </div>
            </div>
          )
        })}

      {/* Legenda do framework */}
      {!loading && criativos.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary/70" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Lógica do Framework
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-[11px] text-muted-foreground">
            <div className="space-y-0.5">
              <span className="font-semibold text-emerald-400">▲ +20% orçamento</span>
              <p>7d(+) 3d(+) 1d(+) — ou — 7d(-) 3d(+) 1d(+)</p>
            </div>
            <div className="space-y-0.5">
              <span className="font-semibold text-amber-400">→ Manter</span>
              <p>7d(+) 3d(+) 1d(-) — ou — 7d(-) 3d(-) 1d(+)</p>
            </div>
            <div className="space-y-0.5">
              <span className="font-semibold text-orange-400">▼ -20% ou pausar</span>
              <p>7d(+) 3d(-) 1d(-)</p>
            </div>
            <div className="space-y-0.5">
              <span className="font-semibold text-red-400">✕ Pausar</span>
              <p>7d(-) 3d(-) 1d(-)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
