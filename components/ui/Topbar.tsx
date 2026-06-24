'use client'

import { usePathname } from 'next/navigation'
import { Eye, Sun, Edit2, LayoutDashboard, Moon, EyeOff, LogOut, ChevronDown, Building2, Check, Users, CreditCard } from 'lucide-react'
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

  return (
    <header className="sticky top-0 z-50" style={{ borderBottom: '1px solid hsla(0,0%,100%,.05)', backgroundColor: '#13181a' }}>
      <div className="h-12 px-6 flex items-center justify-between">

        {/* Esquerda */}
        <div className="flex items-center gap-4">
          <span className="text-[12px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-80">
            Dashboard - Principal
          </span>
          <div className="flex items-center gap-1 border-l border-border pl-4 ml-2">
            <button
              onClick={() => setIsPrivate(!isPrivate)}
              className={`p-1.5 hover:bg-muted rounded-lg transition-all ${isPrivate ? 'text-rose-500 bg-rose-500/10' : 'text-muted-foreground hover:text-primary'}`}
            >
              {isPrivate ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 hover:bg-muted rounded-lg transition-all text-primary"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
            <button className="p-1.5 hover:bg-muted rounded-lg transition-all text-muted-foreground hover:text-primary">
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Direita */}
        <div className="flex items-center gap-3">

          {/* Seletor de org */}
          {activeOrg && (
            <div className="relative" ref={orgRef}>
              <button
                onClick={() => setOrgMenuOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition hover:bg-white/5"
                style={{ border: '1px solid rgba(255,255,255,0.07)', color: '#e2e8f0' }}
              >
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="max-w-[140px] truncate">{activeOrg.org_name}</span>
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${orgMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {orgMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-2xl p-1 w-52"
                  style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-3 pt-2 pb-1">
                    Seus workspaces
                  </p>
                  {orgs.map(org => (
                    <button
                      key={org.org_id}
                      onClick={() => { setActiveOrg(org); setOrgMenuOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition hover:bg-white/5 text-left"
                      style={{ color: activeOrg.org_id === org.org_id ? '#00aeef' : '#e2e8f0' }}
                    >
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 truncate">{org.org_name}</span>
                      {activeOrg.org_id === org.org_id && <Check className="w-3 h-3" />}
                    </button>
                  ))}

                  {activeOrg.role === 'admin' && (
                    <>
                      <div className="my-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
                      <button
                        onClick={() => { setOrgMenuOpen(false); setModalUsuarios(true) }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition hover:bg-white/5 text-left text-muted-foreground hover:text-foreground"
                      >
                        <Users className="w-3.5 h-3.5" />
                        Gerenciar usuários
                      </button>
                      <button
                        onClick={() => { setOrgMenuOpen(false); setModalAssinatura(true) }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition hover:bg-white/5 text-left text-muted-foreground hover:text-foreground"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Gerenciar assinatura
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Avatar */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="flex items-center gap-2.5 pl-3 border-l border-border"
            >
              <div className="hidden sm:block text-right">
                <p className="text-[11px] font-black text-foreground uppercase tracking-tighter leading-none">
                  {displayName.split(' ')[0]}
                </p>
                <p className="text-[9px] font-bold text-primary uppercase tracking-widest opacity-80 mt-0.5">
                  {activeOrg?.role === 'admin' ? 'Administrador' : 'Membro'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-black text-[11px] text-white shadow-lg shadow-blue-600/30 border border-blue-400/20">
                {initials}
              </div>
            </button>

            {userMenuOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 rounded-xl shadow-2xl p-1 w-44"
                style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="px-3 py-2 border-b mb-1" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-[10px] font-semibold text-foreground truncate">{displayName}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{user?.email}</p>
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

      {modalUsuarios && activeOrg && user && (
        <ModalUsuarios
          activeOrg={activeOrg}
          currentUserId={user.id}
          onClose={() => setModalUsuarios(false)}
        />
      )}
      {modalAssinatura && activeOrg && (
        <ModalAssinatura
          activeOrg={activeOrg}
          onClose={() => setModalAssinatura(false)}
        />
      )}

      {isOverview && (
        <div className="px-10 py-8 bg-background flex items-end justify-between gap-8 animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-card border border-primary/20 flex items-center justify-center shadow-lg shadow-black/40 relative overflow-hidden group shrink-0">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <LayoutDashboard className="w-7 h-7 text-primary relative z-10" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase leading-none">
                Dashboard de Gestão
              </h1>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-2 opacity-80">
                Controle tático e análise de performance em tempo real
              </p>
            </div>
          </div>
          <div className="flex-1 max-w-4xl">
            <FiltrosDashboard />
          </div>
        </div>
      )}
    </header>
  )
}
