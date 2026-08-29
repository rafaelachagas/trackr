'use client'

import { Wand2 } from 'lucide-react'
import GeradorCopy from '@/components/inteligencia/GeradorCopy'

export default function GeradorCopyPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#1a2022' }}>
          <Wand2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Gerador de Copy</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Gera variações de copy a partir da transcrição do concorrente, adaptadas ao seu nicho.</p>
        </div>
      </div>
      <GeradorCopy />
    </div>
  )
}
