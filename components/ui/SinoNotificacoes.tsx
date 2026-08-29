'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { listarNovidades, marcarNovidadesVistas } from '@/app/actions/rastreador'

type Novidade = {
  id: string
  biblioteca_id: string
  page_name: string
  qtd_novos: number
  novos_ids: string[]
  criado_em: string
  visto: boolean
}

// Mesmo dado do banner "Novos anúncios detectados" do Rastreador de Anúncios
// (app/(dashboard)/tools/ad-tracker/page.tsx), só que visível no painel
// inteiro via Topbar — não precisa estar na página do Rastreador pra saber.
const POLL_MS = 60_000

export default function SinoNotificacoes() {
  const router = useRouter()
  const [novidades, setNovidades] = useState<Novidade[]>([])
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function carregar() {
    const r = await listarNovidades()
    if (r.success) setNovidades(r.data)
  }

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, POLL_MS)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const naoVistas = novidades.filter((n) => !n.visto)

  async function marcarVista(id: string) {
    setNovidades((prev) => prev.map((n) => (n.id === id ? { ...n, visto: true } : n)))
    await marcarNovidadesVistas([id])
  }

  async function marcarTodasVistas() {
    setNovidades((prev) => prev.map((n) => ({ ...n, visto: true })))
    await marcarNovidadesVistas()
  }

  function abrir(n: Novidade) {
    marcarVista(n.id)
    setAberto(false)
    router.push('/tools/ad-tracker')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="relative p-1.5 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-white/5"
        title="Notificações"
      >
        <Bell className="w-3.5 h-3.5" />
        {naoVistas.length > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-black text-white flex items-center justify-center"
            style={{ backgroundColor: '#10b981' }}
          >
            {naoVistas.length > 9 ? '9+' : naoVistas.length}
          </span>
        )}
      </button>

      {aberto && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 rounded-xl shadow-2xl overflow-hidden w-80 max-h-96 flex flex-col"
          style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">Notificações</span>
            {naoVistas.length > 0 && (
              <button onClick={marcarTodasVistas} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition">
                Marcar tudo como visto
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {novidades.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">Nenhuma notificação ainda.</p>
            ) : (
              novidades.slice(0, 15).map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2 px-3.5 py-2.5 border-b last:border-0 transition ${n.visto ? 'opacity-50' : 'hover:bg-white/5'}`}
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${n.visto ? 'bg-transparent' : 'bg-emerald-400'}`} />
                  <button onClick={() => abrir(n)} className="text-left flex-1 min-w-0">
                    <p className="text-xs text-foreground">
                      <b>{n.page_name}</b>{' '}
                      <span className="text-muted-foreground">
                        subiu {n.qtd_novos} {n.qtd_novos === 1 ? 'novo anúncio' : 'novos anúncios'}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {new Date(n.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </button>
                  {!n.visto && (
                    <button onClick={() => marcarVista(n.id)} className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition shrink-0" title="Marcar como visto">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
