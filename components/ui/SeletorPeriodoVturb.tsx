'use client'

// Seletor de período "igual ao da VTurb" (presets + calendário + GMT-3 + setas
// de dia) — extraído de components/vturb/VslViewer.tsx pra reuso em outras
// telas (ex.: Vendas × Criativos). Qualquer ajuste visual/comportamental deve
// valer pros dois lugares, então mexe só aqui.

import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { addDays, subDays, format, startOfMonth, endOfMonth, getDay, getDaysInMonth, addMonths, parseISO, isAfter, isBefore, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const TZ = 'America/Sao_Paulo'
const hojeSP = () => formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
const d = (s: string) => parseISO(`${s}T12:00:00`)
const iso = (x: Date) => format(x, 'yyyy-MM-dd')

export type RangePeriodo = { ini: string; fim: string }
export type PresetPeriodo = 'Hoje' | 'Ontem' | 'Últimos 7 dias' | 'Últimos 30 dias' | 'Todo o Período'
export const PRESETS_PERIODO: PresetPeriodo[] = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Últimos 30 dias', 'Todo o Período']

export function rangeDoPreset(p: PresetPeriodo): RangePeriodo {
  const hoje = hojeSP(); const h = d(hoje)
  switch (p) {
    case 'Hoje': return { ini: hoje, fim: hoje }
    case 'Ontem': { const o = iso(subDays(h, 1)); return { ini: o, fim: o } }
    case 'Últimos 7 dias': return { ini: iso(subDays(h, 6)), fim: hoje }
    case 'Últimos 30 dias': return { ini: iso(subDays(h, 29)), fim: hoje }
    case 'Todo o Período': return { ini: '2024-01-01', fim: hoje }
  }
}

export default function SeletorPeriodoVturb({ range, onChange }: { range: RangePeriodo; onChange: (r: RangePeriodo) => void }) {
  const [aberto, setAberto] = useState(false)
  const [mes, setMes] = useState(() => startOfMonth(d(range.fim)))
  const [pendIni, setPendIni] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const label = range.ini === range.fim ? format(d(range.ini), 'dd/MM/yyyy') : `${format(d(range.ini), 'dd/MM/yyyy')} – ${format(d(range.fim), 'dd/MM/yyyy')}`
  const presetAtivo = PRESETS_PERIODO.find((p) => { const r = rangeDoPreset(p); return r.ini === range.ini && r.fim === range.fim })
  const hoje = hojeSP()

  function mover(dir: 1 | -1) {
    const dias = Math.round((d(range.fim).getTime() - d(range.ini).getTime()) / 86_400_000) + 1
    const ini = addDays(d(range.ini), dir * dias), fim = addDays(d(range.fim), dir * dias)
    if (isAfter(ini, d(hoje))) return
    onChange({ ini: iso(ini), fim: iso(isAfter(fim, d(hoje)) ? d(hoje) : fim) })
  }

  function clicarDia(dia: Date) {
    const s = iso(dia)
    if (isAfter(dia, d(hoje))) return
    if (!pendIni) { setPendIni(s); return }
    const a = pendIni <= s ? pendIni : s, b = pendIni <= s ? s : pendIni
    onChange({ ini: a, fim: b }); setPendIni(null); setAberto(false)
  }

  const primeiroDia = startOfMonth(mes), offset = getDay(primeiroDia), nDias = getDaysInMonth(mes)
  const celulas: (Date | null)[] = [...Array(offset).fill(null), ...Array.from({ length: nDias }, (_, i) => addDays(primeiroDia, i))]
  const selIni = pendIni ? d(pendIni) : d(range.ini), selFim = pendIni ? d(pendIni) : d(range.fim)
  const podeAvancar = isBefore(endOfMonth(mes), d(hoje))

  return (
    <div className="relative flex items-center" ref={ref}>
      <button onClick={() => setAberto((v) => !v)} className="h-11 pl-4 pr-3 rounded-l-xl border border-border bg-card text-[15px] flex items-center gap-10 text-foreground/90 hover:bg-white/5 transition">
        {label} <ChevronDown className="w-4 h-4" />
      </button>
      <button onClick={() => mover(-1)} className="h-11 w-9 border-y border-border bg-card flex items-center justify-center text-foreground/80 hover:bg-white/5"><ChevronLeft className="w-4 h-4" /></button>
      <button onClick={() => mover(1)} disabled={range.fim >= hoje} className="h-11 w-9 rounded-r-xl border border-border bg-card flex items-center justify-center text-foreground/80 hover:bg-white/5 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>

      {aberto && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 flex rounded-xl border border-border bg-popover shadow-2xl overflow-hidden">
          <div className="w-[300px] p-3 flex flex-col border-r border-border">
            {PRESETS_PERIODO.map((p) => (
              <button key={p} onClick={() => { onChange(rangeDoPreset(p)); setPendIni(null); setAberto(false) }}
                className={`text-left px-4 py-3 rounded-lg text-[15px] transition ${presetAtivo === p ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-white/5'}`}>{p}</button>
            ))}
            <div className="mt-auto pt-6">
              <div className="h-11 px-4 rounded-lg border border-border flex items-center justify-between text-[15px] text-foreground/80">GMT-3 (São Paulo) <span className="text-muted-foreground">⇅</span></div>
            </div>
          </div>
          <div className="w-[340px] p-5">
            <p className="text-[14px] text-muted-foreground mb-4">Período:</p>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setMes(addMonths(mes, -1))} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-white/5"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[15px] font-semibold">{format(mes, 'MMMM yyyy', { locale: ptBR })}</span>
              <button onClick={() => setMes(addMonths(mes, 1))} disabled={!podeAvancar} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-white/5 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[13px] text-muted-foreground mb-1">
              {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((x) => <span key={x} className="py-1">{x}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {celulas.map((c, i) => {
                if (!c) return <span key={i} />
                const futuro = isAfter(c, d(hoje))
                const dentro = !isBefore(c, selIni) && !isAfter(c, selFim)
                const borda = isSameDay(c, selIni) || isSameDay(c, selFim)
                return (
                  <button key={i} onClick={() => clicarDia(c)} disabled={futuro}
                    className={`mx-auto w-10 h-10 rounded-lg text-[15px] transition ${borda ? 'bg-primary text-white font-semibold' : dentro ? 'bg-primary/15 text-primary' : futuro ? 'text-muted-foreground/40' : 'text-foreground/90 hover:bg-white/5'}`}>
                    {format(c, 'd')}
                  </button>
                )
              })}
            </div>
            {pendIni && <p className="text-[12px] text-muted-foreground mt-3">Início: {format(d(pendIni), 'dd/MM')} — clique no dia final.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
