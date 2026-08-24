'use client'

import { usePathname } from 'next/navigation'
import { Eye, Palette, Edit2, EyeOff, LogOut, ChevronDown, Building2, Check, Users, CreditCard, ShieldCheck, Monitor, Smartphone, RotateCcw, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { pareceSuperAdmin } from '@/lib/admin-client'
import FiltrosDashboard from '@/components/dashboard/FiltrosDashboard'
import SinoNotificacoes from '@/components/ui/SinoNotificacoes'
import { useDashboard } from '@/context/DashboardContext'
import { useEditorDashboard } from '@/context/EditorDashboardContext'
import { useAuth } from '@/hooks/useAuth'
import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'

const ModalUsuarios = dynamic(() => import('@/components/org/ModalUsuarios'), { ssr: false })
const ModalAssinatura = dynamic(() => import('@/components/org/ModalAssinatura'), { ssr: false })

export default function Topbar() {
  const pathname = usePathname()
  const isOverview = pathname === '/overview' || pathname === '/' || pathname === '/sales'
  const {
    ativo: editando, abrir, device, setDevice, redefinir, salvar, salvando, fechar: fecharEdicao,
  } = useEditorDashboard()
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const deviceRef = useRef<HTMLDivElement>(null)
  const { theme, setTheme, isPrivate, setIsPrivate } = useDashboard()
  const { user, orgs, activeOrg, setActiveOrg, signOut } = useAuth()

  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [modalUsuarios, setModalUsuarios] = useState(false)
  const [modalAssinatura, setModalAssinatura] = useState(false)
  const orgRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const [aparenciaOpen, setAparenciaOpen] = useState(false)
  const aparenciaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgMenuOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false)
      if (aparenciaRef.current && !aparenciaRef.current.contains(e.target as Node)) setAparenciaOpen(false)
      if (deviceRef.current && !deviceRef.current.contains(e.target as Node)) setDeviceMenuOpen(false)
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
      {/* Topbar fina — não sticky, flui com o conteúdo. Escondida no mobile (MobileNav cobre). */}
      <header className="hidden md:block" style={{ border: '1px solid var(--border)', backgroundColor: editando ? 'var(--secondary)' : 'var(--card)', padding: '20px', margin: '30px 30px 15px 30px', borderRadius: '10px' }}>
        {editando ? (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-muted-foreground">Você está editando esse dashboard para:</span>
            <div className="relative" ref={deviceRef}>
              <button
                onClick={() => setDeviceMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary px-2 py-1 rounded-md hover:bg-white/5 transition"
              >
                {device === 'desktop' ? <Monitor className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                {device === 'desktop' ? 'Desktop' : 'Mobile'}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {deviceMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-10 rounded-xl border border-border bg-popover shadow-xl p-1 w-40">
                  {(['desktop', 'mobile'] as const).map((d) => (
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
              <button onClick={fecharEdicao} className="px-4 py-2 rounded-lg text-xs font-semibold border border-border text-foreground/80 hover:bg-white/5 transition">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        ) : (
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
              <div className="relative" ref={aparenciaRef}>
                <button
                  onClick={() => setAparenciaOpen((v) => !v)}
                  title="Aparência"
                  className="p-1.5 rounded-md transition-all text-primary hover:bg-white/5"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
                {aparenciaOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl p-4 w-64"
                    style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Aparência</p>
                    <div className="flex items-center gap-3">
                      {([
                        { id: 'light' as const, label: 'Claro', bg: '#f8fafc', line: '#cbd5e1', barBg: '#ffffff' },
                        { id: 'dark' as const, label: 'Escuro', bg: '#0b0f10', line: '#3a4145', barBg: 'var(--card)' },
                      ]).map((opt) => {
                        const ativo = theme === opt.id
                        return (
                          <button
                            key={opt.id}
                            onClick={() => { setTheme(opt.id); setAparenciaOpen(false) }}
                            className="flex-1 flex flex-col items-center gap-2 group"
                          >
                            <div
                              className="relative w-full aspect-[4/3] rounded-lg overflow-hidden flex flex-col gap-1 p-1.5 transition-all"
                              style={{
                                backgroundColor: opt.barBg,
                                border: ativo ? '2px solid #00aeef' : '1px solid var(--border)',
                              }}
                            >
                              <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: opt.line }} />
                              <div className="w-2/3 h-1.5 rounded-full" style={{ backgroundColor: opt.line }} />
                              <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: opt.line }} />
                              {ativo && (
                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                </span>
                              )}
                            </div>
                            <span
                              className="text-xs font-semibold transition-colors"
                              style={{ color: ativo ? '#00aeef' : 'var(--muted-foreground)' }}
                            >
                              {opt.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              {isOverview && (
                <button
                  onClick={abrir}
                  title="Editar cards do dashboard"
                  className="p-1.5 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-white/5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Direita: org + usuário */}
          <div className="flex items-center gap-2">

            <SinoNotificacoes />

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
                    style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)' }}
                  >
                    <div className="p-1.5">
                      {orgs.map(org => (
                        <button
                          key={org.org_id}
                          onClick={() => { setActiveOrg(org); setOrgMenuOpen(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition hover:bg-white/5 text-left"
                          style={{
                            color: activeOrg.org_id === org.org_id ? '#00aeef' : 'var(--foreground)',
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
                        <div className="border-t mx-1.5" style={{ borderColor: 'var(--border)' }} />
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
                  style={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)' }}
                >
                  <div className="px-3 py-2.5 border-b mb-1" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[11px] font-bold text-foreground truncate">{firstName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  {pareceSuperAdmin(user?.email) && (
                    <Link
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Painel Admin
                    </Link>
                  )}
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
        )}
      </header>

      {/* Card separado: filtros */}
      {isOverview && (
        <div
          className="mx-4 md:mx-[30px] mt-3 mb-5 md:mt-2.5 md:mb-[25px] p-4 md:p-5"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--card)', borderRadius: '10px' }}
        >
          <FiltrosDashboard />
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
