'use client'

import { Bell } from 'lucide-react'
import CentralAlertas from '@/components/inteligencia/CentralAlertas'

export default function AlertasPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#1a2022' }}>
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Central de Alertas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Avisos sobre concorrentes e sobre seus próprios anúncios — entregues no WhatsApp.</p>
        </div>
      </div>
      <CentralAlertas />
    </div>
  )
}
