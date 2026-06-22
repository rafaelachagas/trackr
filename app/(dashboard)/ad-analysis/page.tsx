'use client'

import { useEffect, useState } from 'react'
import { FrameworkData } from '@/app/api/framework/route'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type FaseCampanha = 'FASE01' | 'FASE02' | 'FASE03' | null

const FASES_INFO = [
  {
    fase: 'FASE01' as FaseCampanha,
    label: 'Fase 01 — Teste de Criativos',
    descricao: '3 criativos por campanha com orçamento controlado. A meta é atingir no mínimo 10 vendas com ROAS ≥ 2. Quem bate, avança para a Fase 02.',
    cor: 'border-blue-500/30 bg-blue-500/5',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  {
    fase: 'FASE02' as FaseCampanha,
    label: 'Fase 02 — Pré-Escala',
    descricao: 'Orçamento dobrado em relação à Fase 01. Teste de resistência — o criativo precisa aguentar a pressão do aumento. Alguns estabilizam, alguns morrem aqui.',
    cor: 'border-violet-500/30 bg-violet-500/5',
    badge: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  },
  {
    fase: 'FASE03' as FaseCampanha,
    label: 'Fase 03 — Escala Máxima',
    descricao: 'Os criativos que provaram resultado nas duas fases anteriores. Orçamento máximo. Aqui está a maior parte do investimento.',
    cor: 'border-fuchsia-500/30 bg-fuchsia-500/5',
    badge: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  },
]

function RoasIndicator({ valor, label }: { valor: number | null; label: string }) {
  const positivo = valor !== null && valor >= 1
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${valor === null ? 'border-border bg-muted' : positivo ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-red-500/50 bg-red-500/20'}`}>
        {valor === null ? <Minus className="w-3.5 h-3.5 text-muted-foreground" /> : positivo ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
      </div>
      <span className={`text-xs font-bold ${valor === null ? 'text-muted-foreground' : positivo ? 'text-emerald-400' : 'text-red-400'}`}>
        {valor === null ? '—' : `${valor.toFixed(1)}x`}
      </span>
    </div>
  )
}

function acaoCor(acao: string) {
  if (acao === '+20% orçamento') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
  if (acao === 'Manter') return 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
  if (acao === '-20% ou pausar') return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  return 'bg-red-500/20 text-red-300 border border-red-500/30'
}

export default function AdAnalysisPage() {
  const [criativos, setCriativos] = useState<FrameworkData[]>([])
  const [loading, setLoading] = useState(true)
  const [atualizado, setAtualizado] = useState<Date | null>(null)

  useEffect(() => {
    fetch('/api/framework')
      .then(r => r.json())
      .then(({ criativos: data, ultimoLancamento }) => {
        setCriativos(data ?? [])
        setAtualizado(ultimoLancamento ? new Date(ultimoLancamento) : new Date())
      })
      .finally(() => setLoading(false))
  }, [])

  const comDados = criativos.filter(c => c.roas_7d !== null || c.roas_3d !== null || c.roas_1d !== null)
  const escalando = comDados.filter(c => c.acao === '+20% orçamento')
  const mantendo = comDados.filter(c => c.acao === 'Manter')
  const reduzindo = comDados.filter(c => c.acao === '-20% ou pausar' || c.acao === 'Pausar')

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-10">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Analisar Criativos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Performance por fase — ROAS 7d / 3d / 1d e ação recomendada
          </p>
        </div>
        {atualizado && (
          <span className="text-xs text-muted-foreground pt-1">
            Atualizado às {atualizado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center">
              <p className="text-3xl font-black text-emerald-400">{escalando.length}</p>
              <p className="text-xs font-semibold text-emerald-400/70 uppercase tracking-widest mt-1">Escalando</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-center">
              <p className="text-3xl font-black text-amber-400">{mantendo.length}</p>
              <p className="text-xs font-semibold text-amber-400/70 uppercase tracking-widest mt-1">Mantendo</p>
            </div>
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-center">
              <p className="text-3xl font-black text-red-400">{reduzindo.length}</p>
              <p className="text-xs font-semibold text-red-400/70 uppercase tracking-widest mt-1">Reduzindo / Pausar</p>
            </div>
          </div>

          {/* Legenda das fases */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sobre as Fases</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {FASES_INFO.map(f => (
                <div key={f.fase} className={`rounded-2xl border p-4 space-y-2 ${f.cor}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${f.badge}`}>{f.fase}</span>
                  <p className="text-xs font-semibold text-foreground mt-2">{f.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.descricao}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Criativos por fase */}
          {(['FASE01', 'FASE02', 'FASE03'] as FaseCampanha[]).map(fase => {
            const grupo = comDados.filter(c => c.fase === fase)
            if (grupo.length === 0) return null
            const info = FASES_INFO.find(f => f.fase === fase)!
            return (
              <div key={fase} className="space-y-4">
                <div className="flex items-center gap-3 border-b border-border pb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${info.badge}`}>{fase}</span>
                  <span className="text-xs text-muted-foreground">{grupo.length} criativo{grupo.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-2">
                  {grupo.map(c => (
                    <div key={c.criativo} className="flex items-center gap-4 bg-card border border-border rounded-xl px-4 py-3 hover:bg-muted/30 transition">
                      <span className="text-sm font-medium text-foreground flex-1 truncate" title={c.criativo}>{c.criativo}</span>
                      <div className="flex items-center gap-5">
                        <RoasIndicator valor={c.roas_7d} label="7d" />
                        <RoasIndicator valor={c.roas_3d} label="3d" />
                        <RoasIndicator valor={c.roas_1d} label="1d" />
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${acaoCor(c.acao)}`}>{c.acao}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {comDados.length === 0 && (
            <div className="text-center py-20 text-muted-foreground text-sm">
              Nenhum criativo com dados suficientes. Lance gastos e vendas no Lançamento Manual para ver a análise.
            </div>
          )}
        </>
      )}
    </div>
  )
}
