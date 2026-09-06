'use client'

import { Tags } from 'lucide-react'
import GeradorNomenclatura from '@/components/criativos/GeradorNomenclatura'

export default function AdNamingPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-5 py-2 px-4 sm:px-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          <Tags className="w-6 h-6 text-primary" /> Gerador de Nomenclatura
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">BETA</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Monta o nome da campanha, conjunto e criativo + o link com <b>sck</b> no padrão da conta — pra rastrear a venda de volta pro anúncio certo.</p>
      </div>
      <GeradorNomenclatura inline />
    </div>
  )
}
