'use client'

import { FolderSearch } from 'lucide-react'
import SwipeFile from '@/components/inteligencia/SwipeFile'

export default function SwipeFilePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#1a2022' }}>
          <FolderSearch className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Swipe File</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Biblioteca de criativos e transcrições dos concorrentes, organizada por pessoa.</p>
        </div>
      </div>
      <SwipeFile />
    </div>
  )
}
