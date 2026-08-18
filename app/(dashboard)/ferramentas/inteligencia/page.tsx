'use client'

import React, { useState } from 'react'
import { Brain, FolderSearch, Wand2, Radar as RadarIcon, Bell } from 'lucide-react'
import SwipeFile from '@/components/inteligencia/SwipeFile'
import GeradorCopy from '@/components/inteligencia/GeradorCopy'
import Radar from '@/components/inteligencia/Radar'
import CentralAlertas from '@/components/inteligencia/CentralAlertas'

type Aba = 'swipe' | 'copy' | 'radar' | 'alertas'

const ABAS: { id: Aba; label: string; icon: React.ComponentType<any> }[] = [
  { id: 'swipe', label: 'Swipe file', icon: FolderSearch },
  { id: 'copy', label: 'Gerador de Copy', icon: Wand2 },
  { id: 'radar', label: 'Radar de concorrentes', icon: RadarIcon },
  { id: 'alertas', label: 'Alertas', icon: Bell },
]

export default function InteligenciaPage() {
  const [aba, setAba] = useState<Aba>('swipe')

  return (
    <div className="pb-20 max-w-[1100px] mx-auto w-full text-foreground space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 border border-primary/30">
          <Brain className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Inteligência</h1>
            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary">Beta</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Swipe file, gerador de copy por IA, radar de novos concorrentes e alertas de fadiga/gasto.</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border overflow-x-auto">
        {ABAS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={`px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition flex items-center gap-1.5 whitespace-nowrap ${aba === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {aba === 'swipe' && <SwipeFile />}
      {aba === 'copy' && <GeradorCopy />}
      {aba === 'radar' && <Radar />}
      {aba === 'alertas' && <CentralAlertas />}
    </div>
  )
}
