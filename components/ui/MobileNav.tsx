'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, TrendingUp, Settings, Zap, RefreshCw, LogOut,
  ShoppingBag, ShoppingCart, PlusCircle, Film, Database, DollarSign,
  CreditCard, Menu as MenuIcon, X, Eye, EyeOff, Sun, Moon, Trophy, MessageCircle,
  Wrench, Binoculars, Video, MonitorPlay,
} from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import { useAuth } from '@/hooks/useAuth'

const navigation = [
  { href: '/overview', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/sales', label: 'Vendas', icon: ShoppingCart },
  { href: '/criativos', label: 'Criativos', icon: Film },
  { href: '/vendas-criativos', label: 'Vendas × Criativos', icon: Trophy },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/lancamento', label: 'Lançamento', icon: PlusCircle },
  { href: '/ad-analysis', label: 'Analisar Criativos', icon: Film },
  { href: '/vsls', label: 'Análise de VSL', icon: MonitorPlay },
]

const dataSources = [
  { href: '/data-sources/sales', label: 'Vendas', icon: DollarSign },
  { href: '/data-sources/ad-accounts', label: 'Contas de anúncios', icon: CreditCard },
  { href: '/data-sources/vturb', label: 'VTurb', icon: Video },
]

const ferramentas = [
  { href: '/ferramentas/rastreador', label: 'Rastreador de Anúncios', icon: Binoculars },
  { href: '/ferramentas/simulador', label: 'Simulador de Funil', icon: TrendingUp },
]

export default function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { sincronizarTudo, isRefreshing, theme, setTheme, isPrivate, setIsPrivate } = useDashboard()
  const { user, activeOrg, signOut } = useAuth()

  // Trava o scroll do body enquanto o menu está aberto
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '?'

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 px-4 py-3.5 rounded-xl text-[15px] font-semibold transition-all ${active ? '' : 'hover:bg-white/5'}`

  return (
    <div className="md:hidden">
      {/* Barra do topo */}
      <div
        className="flex items-center justify-between px-4 h-14 sticky top-0 z-40"
        style={{ backgroundColor: '#13181a', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-card border border-white/5 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-primary/10" />
            <Zap className="w-3.5 h-3.5 text-primary relative z-10" strokeWidth={2.5} />
          </div>
          <h1 className="text-sm font-black italic uppercase tracking-tighter text-foreground">The Track</h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            className={`p-2 rounded-lg transition ${isPrivate ? 'text-rose-400 bg-rose-500/10' : 'text-muted-foreground'}`}
          >
            {isPrivate ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-lg text-primary transition"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 pl-2 pr-1 py-1 text-sm font-bold text-foreground"
          >
            Menu
            <MenuIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Overlay tela cheia */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#0e1315' }}>
          {/* Header do menu */}
          <div
            className="flex items-center justify-between px-4 h-14 flex-shrink-0"
            style={{ backgroundColor: '#13181a', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-card border border-white/5 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-primary/10" />
                <Zap className="w-3.5 h-3.5 text-primary relative z-10" strokeWidth={2.5} />
              </div>
              <h1 className="text-sm font-black italic uppercase tracking-tighter text-foreground">The Track</h1>
            </div>
            <button onClick={() => setOpen(false)} className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              Fechar
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Itens */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href === '/overview' && pathname === '/')
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={itemClass(active)}
                  style={active ? { backgroundColor: '#5dd3ff14', color: '#00aeef' } : { color: '#c7ccce' }}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" style={{ color: active ? '#00aeef' : '#71777a' }} />
                  {label}
                </Link>
              )
            })}

            {/* Fontes de dados */}
            <div className="pt-2 mt-2 border-t border-white/5">
              <div className="flex items-center gap-2 px-4 pt-2 pb-1">
                <Database className="w-4 h-4" style={{ color: '#71777a' }} />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Fontes de dados</span>
              </div>
              {dataSources.map(({ href, label, icon: Icon }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`${itemClass(active)} ml-2`}
                    style={active ? { backgroundColor: '#5dd3ff14', color: '#00aeef' } : { color: '#c7ccce' }}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" style={{ color: active ? '#00aeef' : '#71777a' }} />
                    {label}
                  </Link>
                )
              })}
            </div>

            {/* Ferramentas */}
            <div className="pt-2 mt-2 border-t border-white/5">
              <div className="flex items-center gap-2 px-4 pt-2 pb-1">
                <Wrench className="w-4 h-4" style={{ color: '#71777a' }} />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ferramentas</span>
              </div>
              {ferramentas.map(({ href, label, icon: Icon }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`${itemClass(active)} ml-2`}
                    style={active ? { backgroundColor: '#5dd3ff14', color: '#00aeef' } : { color: '#c7ccce' }}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" style={{ color: active ? '#00aeef' : '#71777a' }} />
                    <span className="flex-1">{label}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-primary/15 text-primary">Beta</span>
                  </Link>
                )
              })}
            </div>

            {/* Integrações */}
            <div className="pt-2 mt-2 border-t border-white/5">
              <Link
                href="/configuracoes"
                onClick={() => setOpen(false)}
                className={itemClass(pathname === '/configuracoes')}
                style={pathname === '/configuracoes' ? { backgroundColor: '#5dd3ff14', color: '#00aeef' } : { color: '#c7ccce' }}
              >
                <Settings className="w-5 h-5 flex-shrink-0" style={{ color: pathname === '/configuracoes' ? '#00aeef' : '#71777a' }} />
                Configurações
              </Link>
            </div>
          </nav>

          {/* Rodapé: sincronizar + usuário */}
          <div className="flex-shrink-0 p-3 border-t border-white/5 space-y-3" style={{ backgroundColor: '#13181a' }}>
            <button
              onClick={() => { sincronizarTudo() }}
              disabled={isRefreshing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-primary/10 text-primary border border-primary/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Sincronizando...' : 'Sincronizar Dados'}
            </button>
            <div className="flex items-center gap-3 px-1">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs text-white flex-shrink-0" style={{ backgroundColor: '#00aeef' }}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user?.user_metadata?.full_name ?? user?.email ?? 'Sua Conta'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{activeOrg?.org_name ?? (activeOrg?.role === 'admin' ? 'Administrador' : 'Usuário')}</p>
              </div>
              <button onClick={signOut} className="text-muted-foreground hover:text-rose-400 transition p-2">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
