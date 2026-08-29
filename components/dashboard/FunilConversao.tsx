'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Info, Loader2 } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { useDashboard } from '@/context/DashboardContext'
import type { FunilMeta } from '@/app/api/dashboard/funil-meta/route'

const TZ = 'America/Sao_Paulo'

// Etapas do funil, na ordem. `key` casa com o retorno da API.
const ETAPAS: { key: keyof FunilMeta; label: string }[] = [
  { key: 'cliques', label: 'Cliques' },
  { key: 'lpViews', label: 'Vis. Página' },
  { key: 'checkouts', label: 'ICs' },
  { key: 'vendasIniciadas', label: 'Vendas Inic.' },
  { key: 'vendasAprovadas', label: 'Vendas Apr.' },
]

const nf = new Intl.NumberFormat('pt-BR')

// Caminho suave (Catmull-Rom → Bézier) por uma lista de pontos.
function suave(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}

export default function FunilConversao() {
  const { dateRange, lastUpdate } = useDashboard()
  const [dados, setDados] = useState<FunilMeta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (dateRange.start && !isNaN(dateRange.start.getTime())) params.set('d_inicio', formatInTimeZone(dateRange.start, TZ, 'yyyy-MM-dd'))
    if (dateRange.end && !isNaN(dateRange.end.getTime())) params.set('d_fim', formatInTimeZone(dateRange.end, TZ, 'yyyy-MM-dd'))
    setCarregando(true); setErro(null)
    fetch(`/api/dashboard/funil-meta?${params}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j?.error) setErro(j.error); else setDados(j) })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [dateRange, lastUpdate])

  const etapas = useMemo(() => {
    const base = dados ? Number(dados[ETAPAS[0].key]) || 0 : 0
    return ETAPAS.map((e) => {
      const valor = dados ? Number(dados[e.key]) || 0 : 0
      const pct = base > 0 ? (valor / base) * 100 : 0
      return { ...e, valor, pct }
    })
  }, [dados])

  // Geometria do funil (viewBox). Centerline no meio; meia-altura ∝ pct.
  const W = 1000, H = 300, cy = H / 2, maxHalf = 128, minHalf = 1.5
  const xs = useMemo(() => etapas.map((_, i) => ((i + 0.5) / etapas.length) * W), [etapas])
  const half = (pct: number) => Math.max(minHalf, (pct / 100) * maxHalf)

  const { pathBand } = useMemo(() => {
    if (!etapas.length) return { pathBand: '' }
    // Âncoras: borda esquerda (x=0, 100%) + centros das etapas + borda direita.
    const topPts: [number, number][] = [[0, cy - half(etapas[0].pct)]]
    const botPts: [number, number][] = [[0, cy + half(etapas[0].pct)]]
    etapas.forEach((e, i) => { topPts.push([xs[i], cy - half(e.pct)]); botPts.push([xs[i], cy + half(e.pct)]) })
    const last = etapas[etapas.length - 1]
    topPts.push([W, cy - half(last.pct)])
    botPts.push([W, cy + half(last.pct)])
    const topPath = suave(topPts)
    const botRev = suave([...botPts].reverse())
    // topPath até a direita, desce pra borda inferior direita, volta pela base.
    const band = `${topPath} L ${W},${cy + half(last.pct)} ${botRev.replace(/^M[^C]*/, '')} Z`
    return { pathBand: band }
  }, [etapas, xs])

  return (
    <div className="bg-card border-border rounded-2xl border p-4 sm:p-6 shadow-sm relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-foreground">Funil de Conversão (Meta Ads)</h3>
        <span className="group relative">
          <Info className="w-4 h-4 text-muted-foreground cursor-help" />
          <span className="pointer-events-none absolute right-0 top-6 z-10 w-64 rounded-lg bg-black/90 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition">
            O funil de conversão analisa as métricas de cada etapa do seu funil. Cliques, visitas e checkouts (ICs) vêm da Meta; as vendas vêm da Hotmart.
          </span>
        </span>
      </div>

      {carregando && !dados ? (
        <div className="h-[360px] flex items-center justify-center text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando funil...</div>
      ) : erro ? (
        <div className="h-[360px] flex items-center justify-center text-rose-300/90 text-sm px-6 text-center">{erro}</div>
      ) : (
        <div className="relative">
          {/* Rótulos das etapas */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${etapas.length}, 1fr)` }}>
            {etapas.map((e) => (
              <div key={e.key} className="text-center text-sm font-semibold text-muted-foreground pb-2">{e.label}</div>
            ))}
          </div>

          {/* Banda do funil + % sobre a centerline */}
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 300 }}>
              <defs>
                <linearGradient id="funilGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#2E90FA" />
                  <stop offset="0.5" stopColor="#6f5cf0" />
                  <stop offset="1" stopColor="#ec4899" />
                </linearGradient>
              </defs>
              {/* Divisores verticais entre as etapas */}
              {etapas.slice(1).map((_, i) => {
                const x = ((i + 1) / etapas.length) * W
                return <line key={i} x1={x} y1={0} x2={x} y2={H} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
              })}
              <path d={pathBand} fill="url(#funilGrad)" />
            </svg>

            {/* % centralizado em cada etapa, sobre a linha central */}
            <div className="absolute inset-0 grid items-center" style={{ gridTemplateColumns: `repeat(${etapas.length}, 1fr)` }}>
              {etapas.map((e) => (
                <div key={e.key} className="text-center">
                  <span className="text-xl sm:text-2xl font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] tabular-nums">
                    {e.pct >= 10 ? e.pct.toFixed(0) : e.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Números absolutos */}
          <div className="grid pt-2" style={{ gridTemplateColumns: `repeat(${etapas.length}, 1fr)` }}>
            {etapas.map((e) => (
              <div key={e.key} className="text-center text-sm font-semibold text-foreground/90 tabular-nums">{nf.format(e.valor)}</div>
            ))}
          </div>

          {dados && !dados.checkoutsDisponivel && (
            <p className="mt-3 text-[11px] text-muted-foreground text-center">A coluna de checkouts (ICs) ainda não está na base — rode um sync da Meta pra preencher.</p>
          )}
        </div>
      )}
    </div>
  )
}
