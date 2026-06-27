'use client'

import { usePathname } from 'next/navigation'
import { Eye, Sun, Edit2, Moon, EyeOff, LogOut, ChevronDown, Building2, Check, Users, CreditCard } from 'lucide-react'
import FiltrosDashboard from '@/components/dashboard/FiltrosDashboard'
import { useDashboard } from '@/context/DashboardContext'
import { useAuth } from '@/hooks/useAuth'
import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'

const ModalUsuarios = dynamic(() => import('@/components/org/ModalUsuarios'), { ssr: false })
const ModalAssinatura = dynamic(() => import('@/components/org/ModalAssinatura'), { ssr: false })

export default function Topbar() {
  const pathname = usePathname()
  const isOverview = pathname === '/overview' || pathname === '/' || pathname === '/vendas'
  const { theme, setTheme, isPrivate, setIsPrivate } = useDashboard()
  const { user, orgs, activeOrg, setActiveOrg, signOut } = useAuth()

  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [modalUsuarios, setModalUsuarios] = useState(false)
  const [modalAssinatura, setModalAssinatura] = useState(false)
  const orgRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgMenuOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '?'

  const displayName = user?.user_metadata?.full_name ?? user?.email ?? ''
  const firstName = displayName.split(' ')[0]

  return (
    <>
      {/* Topbar fina — não sticky, flui com o conteúdo */}
      <header style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#0e1315', padding: '50px', margin: '30px 30px 0 30px', borderRadius: '10px' }}>
        <div className="flex items-center justify-between">

          {/* Esquerda: título + ações */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Dashboard - Principal
            </span>
            <div className="flex items-center gap-0.5 border-l border-white/5 pl-3 ml-1">
              <button
                onClick={() => setIsPrivate(!isPrivate)}
                title={isPrivate ? 'Mostrar valores' : 'Ocultar valores'}
                className={`p-1.5 rounded-md transition-all ${isPrivate ? 'text-rose-400 bg-rose-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
              >
                {isPrivate ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Alternar tema"
                className="p-1.5 rounded-md transition-all text-primary hover:bg-white/5"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              <button
                title="Editar"
                className="p-1.5 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-white/5"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Direita: org + usuário */}
          <div className="flex items-center gap-2">

            {/* Seletor de org */}
            {activeOrg && (
              <div className="relative" ref={orgRef}>
                <button
                  onClick={() => setOrgMenuOpen(v => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition hover:bg-white/5"
                  style={{ color: '#94a3b8' }}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="max-w-[120px] truncate">{activeOrg.org_name}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${orgMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {orgMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 z-50 rounded-xl shadow-2xl overflow-hidden w-52"
                    style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <div className="p-1.5">
                      {orgs.map(org => (
                        <button
                          key={org.org_id}
                          onClick={() => { setActiveOrg(org); setOrgMenuOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition hover:bg-white/5 text-left"
                          style={{
                            color: activeOrg.org_id === org.org_id ? '#00aeef' : '#e2e8f0',
                            backgroundColor: activeOrg.org_id === org.org_id ? 'rgba(0,174,239,0.06)' : undefined,
                          }}
                        >
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="flex-1 truncate">{org.org_name}</span>
                          {activeOrg.org_id === org.org_id && <Check className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                    {activeOrg.role === 'admin' && (
                      <>
                        <div className="border-t mx-1.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
                        <div className="p-1.5">
                          <button
                            onClick={() => { setOrgMenuOpen(false); setModalUsuarios(true) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition hover:bg-white/5 text-left text-muted-foreground hover:text-foreground"
                          >
                            <Users className="w-3.5 h-3.5" />
                            Gerenciar usuários
                          </button>
                          <button
                            onClick={() => { setOrgMenuOpen(false); setModalAssinatura(true) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition hover:bg-white/5 text-left text-muted-foreground hover:text-foreground"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Gerenciar assinatura
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Divisor */}
            <div className="w-px h-5 bg-white/5" />

            {/* Avatar + nome */}
            <div className="relative" ref={userRef}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="flex items-center gap-2 px-1 py-0.5 rounded-md transition hover:bg-white/5"
              >
                <div className="text-right hidden sm:block">
                  <p className="text-[11px] font-bold text-foreground leading-none">{firstName}</p>
                  <p className="text-[9px] font-semibold mt-0.5" style={{ color: '#00aeef' }}>
                    {activeOrg?.role === 'admin' ? 'Administrador' : 'Usuário'}
                  </p>
                </div>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-[10px] text-white"
                  style={{ backgroundColor: '#00aeef', boxShadow: '0 0 12px rgba(0,174,239,0.3)' }}
                >
                  {initials}
                </div>
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-50 rounded-xl shadow-2xl p-1 w-44"
                  style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="px-3 py-2.5 border-b mb-1" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-[11px] font-bold text-foreground truncate">{firstName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={signOut}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sair
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Card separado: título + filtros */}
      {isOverview && (
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#0e1315', padding: '20px', margin: '10px 30px 0 30px', borderRadius: '10px' }}>
          <div className="flex items-end justify-between gap-8">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-1" style={{ color: '#00aeef' }}>
                Tracka
              </p>
              <h1 className="text-2xl font-black text-foreground tracking-tighter uppercase leading-none">
                Dashboard de Gestão
              </h1>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mt-1.5 opacity-70">
                Controle tático · Análise de performance
              </p>
            </div>
            <div className="flex-1 max-w-4xl">
              <FiltrosDashboard />
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      {modalUsuarios && activeOrg && user && (
        <ModalUsuarios activeOrg={activeOrg} currentUserId={user.id} onClose={() => setModalUsuarios(false)} />
      )}
      {modalAssinatura && activeOrg && (
        <ModalAssinatura activeOrg={activeOrg} onClose={() => setModalAssinatura(false)} />
      )}
    </>
  )
}
