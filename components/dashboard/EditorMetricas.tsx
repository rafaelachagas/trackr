'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, GripVertical, Loader2, Monitor, Smartphone, X, RotateCcw } from 'lucide-react'
import MetricaCardById from '@/components/dashboard/MetricaCardById'
import { CATALOGO_METRICAS, LAYOUT_PADRAO, type MetricaId, type CategoriaMetrica } from '@/lib/metricas-overview'

type Device = 'desktop' | 'mobile'

// Editor de layout dos cards do topo do Overview — estilo Utmify: sidebar com
// o catálogo de métricas (clara = ainda não adicionada, apagada = já está no
// dashboard), canvas com prévia AO VIVO (dados reais) que dá pra reordenar
// arrastando, seletor de dispositivo (desktop/mobile guardam layouts
// separados) e Cancelar/Salvar/Redefinir configurações.
export default function EditorMetricas({ metrics, onClose }: { metrics: any; onClose: () => void }) {
  const [device, setDevice] = useState<Device>('desktop')
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const [items, setItems] = useState<MetricaId[] | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const deviceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (deviceRef.current && !deviceRef.current.contains(e.target as Node)) setDeviceMenuOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    setCarregando(true)
    fetch(`/api/config/overview-layout?device=${device}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? LAYOUT_PADRAO))
      .catch(() => setItems(LAYOUT_PADRAO))
      .finally(() => setCarregando(false))
  }, [device])

  const disponiveis: MetricaId[] = CATALOGO_METRICAS.map((m) => m.id).filter((id) => !items?.includes(id))
  const porCategoria = new Map<CategoriaMetrica, MetricaId[]>()
  for (const m of CATALOGO_METRICAS) porCategoria.set(m.categoria, [...(porCategoria.get(m.categoria) ?? []), m.id])

  function adicionar(id: MetricaId) { setItems((prev) => (prev ?? []).includes(id) ? prev : [...(prev ?? []), id]) }
  function remover(id: MetricaId) { setItems((prev) => (prev ?? []).filter((x) => x !== id)) }
  function redefinir() { setItems([...LAYOUT_PADRAO]) }

  function onDrop(destino: number) {
    const origem = dragIndex.current
    dragIndex.current = null
    if (origem == null || origem === destino || !items) return
    const novo = [...items]
    const [mov] = novo.splice(origem, 1)
    novo.splice(destino, 0, mov)
    setItems(novo)
  }

  async function salvar() {
    setSalvando(true)
    await fetch('/api/config/overview-layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, items }),
    })
    setSalvando(false)
    onClose()
    // Recarrega a página pra o Overview ler o layout novo — mais simples e
    // confiável do que replicar o estado do editor de volta pro contexto.
    window.location.reload()
  }

  const DeviceIcon = device === 'desktop' ? Monitor : Smartphone

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
      {/* Barra "você está editando para: Desktop ▾" + Redefinir/Cancelar/Salvar */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-border flex-wrap" style={{ backgroundColor: 'var(--secondary)' }}>
        <div className="relative" ref={deviceRef}>
          <button onClick={() => setDeviceMenuOpen((v) => !v)} className="flex items-center gap-2 text-sm text-foreground/90">
            <span className="text-muted-foreground">Você está editando esse dashboard para:</span>
            <span className="flex items-center gap-1.5 font-semibold text-primary px-2 py-1 rounded-md hover:bg-white/5 transition">
              <DeviceIcon className="w-3.5 h-3.5" /> {device === 'desktop' ? 'Desktop' : 'Mobile'} <ChevronDown className="w-3.5 h-3.5" />
            </span>
          </button>
          {deviceMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 rounded-xl border border-border bg-popover shadow-xl p-1 w-40">
              {(['desktop', 'mobile'] as Device[]).map((d) => (
                <button key={d} onClick={() => { setDevice(d); setDeviceMenuOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition text-left ${device === d ? 'text-primary bg-primary/10' : 'text-foreground/80 hover:bg-white/5'}`}>
                  {d === 'desktop' ? <Monitor className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                  {d === 'desktop' ? 'Desktop' : 'Mobile'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={redefinir} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
            <RotateCcw className="w-3.5 h-3.5" /> Redefinir configurações
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold border border-border text-foreground/80 hover:bg-white/5 transition">Cancelar</button>
          <button onClick={salvar} disabled={salvando || carregando} className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: catálogo de métricas */}
        <aside className="w-72 flex-shrink-0 border-r border-border overflow-y-auto p-4 hidden md:block">
          <h2 className="text-sm font-bold text-foreground mb-4">Métricas Disponíveis</h2>
          {[...porCategoria.entries()].map(([categoria, ids]) => (
            <div key={categoria} className="mb-5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{categoria}</p>
              <div className="space-y-2">
                {ids.map((id) => {
                  const jaAdicionada = !disponiveis.includes(id)
                  const label = CATALOGO_METRICAS.find((m) => m.id === id)!.label
                  return (
                    <button
                      key={id}
                      onClick={() => (jaAdicionada ? remover(id) : adicionar(id))}
                      title={jaAdicionada ? 'Já está no dashboard — clique pra remover' : 'Clique pra adicionar ao dashboard'}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold border border-dashed transition ${
                        jaAdicionada
                          ? 'border-border text-muted-foreground/50 cursor-pointer hover:border-rose-400/40 hover:text-rose-300/70'
                          : 'border-primary/30 text-foreground hover:bg-primary/5 hover:border-primary/50'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Canvas: prévia ao vivo, reordenável */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs text-muted-foreground mb-4">Arraste os cards abaixo pra reordenar. Esta é uma prévia com os dados reais do período atual.</p>
          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando layout...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(items ?? []).map((id, i) => (
                <div
                  key={id}
                  draggable
                  onDragStart={() => { dragIndex.current = i }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  className="relative group cursor-grab active:cursor-grabbing"
                >
                  <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => remover(id)} className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="absolute top-2 left-2 z-10 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition"><GripVertical className="w-3.5 h-3.5" /></div>
                  <MetricaCardById id={id} metrics={metrics} />
                </div>
              ))}
              {(items ?? []).length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground text-center py-16">Nenhuma métrica selecionada — adicione pela lista ao lado.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
