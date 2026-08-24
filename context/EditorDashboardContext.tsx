'use client'

// Estado do editor de layout do Overview (lápis na Topbar) — compartilhado
// entre Sidebar (vira o catálogo "Métricas Disponíveis"), Topbar (vira a barra
// "Você está editando para: Desktop ▾ ... Salvar") e o Overview (o canvas com
// os blocos de verdade, arrastáveis). Os três só conseguem reagir ao mesmo
// modo de edição porque esse estado mora aqui em cima deles, não dentro da
// página — Sidebar e Topbar são irmãos do Overview, não pais/filhos dele.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LAYOUT_PADRAO, type BlocoId } from '@/lib/metricas-overview'

type Device = 'desktop' | 'mobile'

interface EditorDashboardContextType {
  ativo: boolean
  abrir: () => void
  fechar: () => void
  device: Device
  setDevice: (d: Device) => void
  itemsSalvos: BlocoId[]      // layout real (dispositivo detectado) — o que o Overview normal exibe
  rascunho: BlocoId[]         // cópia de trabalho enquanto edita (só vira "salvo" no Salvar)
  carregandoRascunho: boolean
  salvando: boolean
  adicionar: (id: BlocoId) => void
  remover: (id: BlocoId) => void
  mover: (deIdx: number, paraIdx: number) => void
  redefinir: () => void
  salvar: () => Promise<void>
}

const EditorDashboardContext = createContext<EditorDashboardContextType | undefined>(undefined)

export function EditorDashboardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [ativo, setAtivo] = useState(false)
  const [deviceReal, setDeviceReal] = useState<Device>('desktop')
  const [deviceEditando, setDeviceEditando] = useState<Device>('desktop')
  const [itemsSalvos, setItemsSalvos] = useState<BlocoId[]>(LAYOUT_PADRAO)
  const [rascunho, setRascunho] = useState<BlocoId[]>(LAYOUT_PADRAO)
  const [carregandoRascunho, setCarregandoRascunho] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Detecta o dispositivo real da tela (o que o Overview normal usa).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const atualizar = () => setDeviceReal(mq.matches ? 'mobile' : 'desktop')
    atualizar()
    mq.addEventListener('change', atualizar)
    return () => mq.removeEventListener('change', atualizar)
  }, [])

  const buscarLayout = useCallback((device: Device) =>
    fetch(`/api/config/overview-layout?device=${device}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.items ?? LAYOUT_PADRAO) as BlocoId[])
      .catch(() => LAYOUT_PADRAO), [])

  // Layout real (view normal), atualiza quando o dispositivo detectado muda.
  useEffect(() => { buscarLayout(deviceReal).then(setItemsSalvos) }, [deviceReal, buscarLayout])

  // Sai do modo de edição automaticamente se navegar pra outra página.
  useEffect(() => { if (pathname !== '/overview') setAtivo(false) }, [pathname])

  const abrir = useCallback(() => {
    setDeviceEditando(deviceReal)
    setCarregandoRascunho(true)
    buscarLayout(deviceReal).then((items) => { setRascunho(items); setCarregandoRascunho(false) })
    setAtivo(true)
  }, [deviceReal, buscarLayout])

  const fechar = useCallback(() => setAtivo(false), [])

  const setDevice = useCallback((d: Device) => {
    setDeviceEditando(d)
    setCarregandoRascunho(true)
    buscarLayout(d).then((items) => { setRascunho(items); setCarregandoRascunho(false) })
  }, [buscarLayout])

  const adicionar = useCallback((id: BlocoId) => {
    setRascunho((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])
  const remover = useCallback((id: BlocoId) => {
    setRascunho((prev) => prev.filter((x) => x !== id))
  }, [])
  const mover = useCallback((deIdx: number, paraIdx: number) => {
    setRascunho((prev) => {
      if (deIdx === paraIdx) return prev
      const novo = [...prev]
      const [mov] = novo.splice(deIdx, 1)
      novo.splice(paraIdx, 0, mov)
      return novo
    })
  }, [])
  const redefinir = useCallback(() => setRascunho([...LAYOUT_PADRAO]), [])

  const salvar = useCallback(async () => {
    setSalvando(true)
    await fetch('/api/config/overview-layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: deviceEditando, items: rascunho }),
    })
    setSalvando(false)
    if (deviceEditando === deviceReal) setItemsSalvos(rascunho)
    setAtivo(false)
  }, [deviceEditando, deviceReal, rascunho])

  return (
    <EditorDashboardContext.Provider value={{
      ativo, abrir, fechar,
      device: deviceEditando, setDevice,
      itemsSalvos, rascunho, carregandoRascunho, salvando,
      adicionar, remover, mover, redefinir, salvar,
    }}>
      {children}
    </EditorDashboardContext.Provider>
  )
}

export function useEditorDashboard() {
  const ctx = useContext(EditorDashboardContext)
  if (!ctx) throw new Error('useEditorDashboard precisa do EditorDashboardProvider')
  return ctx
}
