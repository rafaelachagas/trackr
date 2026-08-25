'use client'

// Simulador "e se?" pro VSL aberto — 100% cliente, nunca escreve em lugar
// nenhum. Parte dos números REAIS do período (LP Views da Meta e Gasto ficam
// fixos, tráfego não muda por causa de retenção/conversão). Os 3 sliders
// (Play Rate, Retenção ao Pitch, Taxa de Conversão) recalculam em cadeia:
// plays → audiência do pitch → conversões → receita (ticket médio atual
// mantido fixo) → ROAS/CPA. Mover um slider não altera os outros dois —
// cada um representa "se só essa métrica mudasse, tudo mais igual".

import React, { useMemo, useState } from 'react'
import { X, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react'

interface BaseSimulador {
  lpViews: number | null
  gasto: number | null
  playRate: number | null       // % — plays únicos ÷ LP views (Meta)
  retencaoPitch: number | null  // % — audiência do pitch ÷ plays
  taxaConversao: number | null  // % — conversões ÷ plays
  conversoes: number | null
  receita: number | null
}

const fmtBRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(n)
const fmtNum = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(n))
const fmtPct1 = (n: number) => `${n.toFixed(1).replace('.', ',')}%`

function Slider({ label, valor, onChange, min = 0, max = 100, sufixo = '%' }: {
  label: string; valor: number; onChange: (v: number) => void; min?: number; max?: number; sufixo?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="text-sm font-bold text-foreground tabular-nums">{valor.toFixed(1).replace('.', ',')}{sufixo}</span>
      </div>
      <input
        type="range" min={min} max={max} step={0.1} value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary cursor-pointer"
      />
    </div>
  )
}

function LinhaResultado({ label, real, simulado, formatar, isPrivate }: {
  label: string; real: number; simulado: number; formatar: (n: number) => string; isPrivate: boolean
}) {
  const delta = real !== 0 ? ((simulado - real) / real) * 100 : (simulado > 0 ? 100 : 0)
  const subiu = simulado > real
  const mudou = Math.abs(simulado - real) > 0.005
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold tabular-nums ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : formatar(simulado)}</span>
        {mudou && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${subiu ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
            {subiu ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {fmtPct1(Math.abs(delta))}
          </span>
        )}
      </div>
    </div>
  )
}

export default function SimuladorVsl({ aberto, onFechar, base, isPrivate }: {
  aberto: boolean; onFechar: () => void; base: BaseSimulador; isPrivate: boolean
}) {
  const playRateBase = base.playRate ?? 0
  const retencaoBase = base.retencaoPitch ?? 0
  const conversaoBase = base.taxaConversao ?? 0

  const [playRate, setPlayRate] = useState(playRateBase)
  const [retencao, setRetencao] = useState(retencaoBase)
  const [conversao, setConversao] = useState(conversaoBase)

  // Reabre com os valores reais do período atual sempre que o VSL/período mudar.
  React.useEffect(() => {
    setPlayRate(playRateBase); setRetencao(retencaoBase); setConversao(conversaoBase)
  }, [playRateBase, retencaoBase, conversaoBase])

  const calc = useMemo(() => {
    const lpViews = base.lpViews ?? 0
    const gasto = base.gasto ?? 0
    const conversoesReal = base.conversoes ?? 0
    const receitaReal = base.receita ?? 0
    const ticketMedio = conversoesReal > 0 ? receitaReal / conversoesReal : 0

    function projetar(pr: number, ret: number, conv: number) {
      const plays = lpViews * (pr / 100)
      const audienciaPitch = plays * (ret / 100)
      const conversoes = plays * (conv / 100)
      const receita = conversoes * ticketMedio
      const roas = gasto > 0 ? receita / gasto : null
      const cpa = conversoes > 0 ? gasto / conversoes : null
      return { plays, audienciaPitch, conversoes, receita, roas, cpa }
    }

    return { real: projetar(playRateBase, retencaoBase, conversaoBase), sim: projetar(playRate, retencao, conversao), ticketMedio }
  }, [base, playRate, retencao, conversao, playRateBase, retencaoBase, conversaoBase])

  const mexeu = playRate !== playRateBase || retencao !== retencaoBase || conversao !== conversaoBase

  const insight = useMemo(() => {
    if (!mexeu) return null
    const dConv = calc.sim.conversoes - calc.real.conversoes
    const dReceita = calc.sim.receita - calc.real.receita
    if (Math.abs(dConv) < 0.5) return null
    const direcao = dConv > 0 ? 'aumentaria' : 'reduziria'
    return `Com esses ajustes, sua conversão ${direcao} em ${fmtNum(Math.abs(dConv))} venda${Math.abs(dConv) >= 2 ? 's' : ''} no período — ${dReceita >= 0 ? '+' : '-'}${fmtBRL(Math.abs(dReceita))} de faturamento, mantendo o ticket médio e o gasto de hoje.`
  }, [calc, mexeu])

  function resetar() { setPlayRate(playRateBase); setRetencao(retencaoBase); setConversao(conversaoBase) }

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onFechar}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-foreground">Simulador "e se?"</h3>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Mexe nos sliders pra ver o impacto projetado — não altera nenhum dado real, é só uma projeção em cima dos números de hoje.</p>

        <div className="space-y-5 mb-5">
          <Slider label="Play Rate" valor={playRate} onChange={setPlayRate} max={100} />
          <Slider label="Retenção ao Pitch" valor={retencao} onChange={setRetencao} max={100} />
          <Slider label="Taxa de Conversão" valor={conversao} onChange={setConversao} max={Math.max(30, Math.ceil(conversaoBase * 3))} />
        </div>

        <button onClick={resetar} disabled={!mexeu} className="w-full mb-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 transition py-1.5">
          <RotateCcw className="w-3 h-3" /> Voltar pros valores reais
        </button>

        <div className="rounded-xl bg-background/60 border border-white/5 p-4">
          <LinhaResultado label="Plays projetados" real={calc.real.plays} simulado={calc.sim.plays} formatar={fmtNum} isPrivate={false} />
          <LinhaResultado label="Audiência do Pitch" real={calc.real.audienciaPitch} simulado={calc.sim.audienciaPitch} formatar={fmtNum} isPrivate={false} />
          <LinhaResultado label="Conversões" real={calc.real.conversoes} simulado={calc.sim.conversoes} formatar={fmtNum} isPrivate={isPrivate} />
          <LinhaResultado label="Receita projetada" real={calc.real.receita} simulado={calc.sim.receita} formatar={fmtBRL} isPrivate={isPrivate} />
          {calc.sim.roas != null && (
            <LinhaResultado label="ROAS projetado" real={calc.real.roas ?? 0} simulado={calc.sim.roas} formatar={(n) => `${n.toFixed(2).replace('.', ',')}x`} isPrivate={isPrivate} />
          )}
        </div>

        {insight && (
          <div className="mt-4 rounded-xl p-3.5 text-xs leading-relaxed" style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <span className={isPrivate ? 'blur-sm select-none' : ''}>{isPrivate ? 'Ative "esconder resultados" desligado pra ver o resumo.' : insight}</span>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60 mt-4">Modelo: mantém fixo o ticket médio e o gasto com anúncios de hoje; cada slider assume "se só essa métrica mudasse, o resto igual" — não são independentes na prática (ex.: mais retenção costuma puxar mais conversão junto), então trate como estimativa, não previsão exata.</p>
      </div>
    </div>
  )
}
