'use client'

import React from 'react'
import Link from 'next/link'
import { MonitorPlay, Settings } from 'lucide-react'
import VslManager from '@/components/vturb/VslManager'

export default function VslsPage() {
  return (
    <div className="pb-20 max-w-[1100px] mx-auto w-full text-foreground space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 border border-primary/30">
            <MonitorPlay className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Análise de VSL</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Play Rate real (VTurb × Meta), retenção, ROAS e custo por play de cada VSL.</p>
          </div>
        </div>
        <Link href="/data-sources/vturb" className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
          <Settings className="w-4 h-4" /> Conexão VTurb
        </Link>
      </div>

      <VslManager />
    </div>
  )
}
