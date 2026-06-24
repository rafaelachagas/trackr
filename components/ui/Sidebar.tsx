'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  Settings,
  Zap,
  RefreshCw,
  LogOut,
  ShoppingBag,
  ShoppingCart,
  PlusCircle,
  Film,
  Database,
  CreditCard,
  ChevronDown,
  DollarSign,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'

const navigation = [
  { href: '/overview', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/vendas', label: 'Sales', icon: ShoppingCart },
  { href: '/produtos', label: 'Produtos', icon: ShoppingBag },
  { href: '/framework', label: 'Framework', icon: TrendingUp },
  { href: '/criativos', label: 'Criativos', icon: Film },
  { href: '/lancamento', label: 'Lançamento', icon: PlusCircle },
]

const dataSources = [
  { href: '/data-sources/sales', label: 'Vendas', icon: DollarSign },
  { href: '/data-sources/ad-accounts', label: 'Contas de anúncios', icon: CreditCard },
]

const configuracoes = [
  { href: '/configuracoes', label: 'Integrações e Setup', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { sincronizarTudo, isRefreshing: sincronizando } = useDashboard()
  const [collapsed, setCollapsed] = useState(false)
  const [dataSourcesOpen, setDataSourcesOpen] = useState(
    pathname.startsWith('/data-sources')
  )
  const dataSourcesActive = pathname.startsWith('/data-sources')

  const w = collapsed ? 'w-[60px]' : 'w-64'
  const pl = collapsed ? '60px' : '256px'

  const NavItem = ({ href, label, icon: Icon, sub = false }: any) => {
    const active = pathname === href || (href === '/overview' && pathname === '/')
    if (sub && !collapsed) {
      return (
        <Link
          href={href}
          className={`relative flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-all duration-200 ${
            active
              ? 'bg-primary/10 font-medium text-primary rounded-l-none'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
          }`}
        >
          {active && (
            <span className="absolute inset-y-2 left-0 w-0.5 bg-primary rounded-r-full" />
          )}
          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary scale-110' : 'text-zinc-500'}`} />
          {label}
        </Link>
      )
    }
    return (
      <Link
        href={href}
        title={collapsed ? label : undefined}
        className={`flex items-center transition-all ${
          collapsed
            ? `justify-center px-0 py-3 rounded-xl ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`
            : `justify-between px-4 py-3 text-sm font-medium rounded-xl ${
                active
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`
        }`}
      >
        <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
          <Icon className={`w-5 h-5 flex-shrink-0 ${active ? (collapsed ? 'text-primary' : 'text-white') : 'text-primary'}`} />
          {!collapsed && <span>{label}</span>}
        </div>
      </Link>
    )
  }

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`${w} bg-card border-r border-border text-foreground flex flex-col h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden hide-scrollbar transition-all duration-300 z-40`}
      >
        {/* Logo */}
        <div className={`pt-8 pb-8 flex flex-col items-center text-center border-b border-border ${collapsed ? 'px-2' : 'px-6'}`}>
          <div className="w-10 h-10 rounded-2xl bg-card border border-border flex items-center justify-center shadow-lg shadow-black/5 flex-shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-primary/10" />
            <Zap className="w-5 h-5 text-primary relative z-10" strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-foreground mt-2">
                TRACKR
              </h1>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                Painel de Gestão de Performance
              </p>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex-1 space-y-1 pb-8 ${collapsed ? 'px-2 pt-4' : 'px-3 pt-4'}`}>

          {navigation.map((item) => <NavItem key={item.href} {...item} />)}

          {/* Analisar Criativos */}
          <Link
            href="/ad-analysis"
            title={collapsed ? 'Analisar Criativos' : undefined}
            className={`flex items-center transition-all ${
              collapsed
                ? `justify-center px-0 py-3 rounded-xl ${pathname === '/ad-analysis' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`
                : `justify-between px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-widest ${
                    pathname === '/ad-analysis'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`
            }`}
          >
            <div className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
              <Film className={`w-${collapsed ? '5' : '4'} h-${collapsed ? '5' : '4'} flex-shrink-0 ${pathname === '/ad-analysis' ? 'text-primary' : ''}`} />
              {!collapsed && 'Analisar Criativos'}
            </div>
          </Link>

          {/* Data Sources */}
          {collapsed ? (
            <Link
              href="/data-sources/sales"
              title="Fontes de dados"
              className={`flex justify-center px-0 py-3 rounded-xl ${dataSourcesActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Database className="w-5 h-5 flex-shrink-0" />
            </Link>
          ) : (
            <div className="mb-2">
              <button
                onClick={() => setDataSourcesOpen(v => !v)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-widest transition-all ${
                  dataSourcesActive || dataSourcesOpen
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Database className={`w-4 h-4 ${dataSourcesActive || dataSourcesOpen ? 'text-primary' : ''}`} />
                  Fontes de dados
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${dataSourcesOpen ? 'rotate-180' : ''}`} />
              </button>
              {dataSourcesOpen && (
                <div className="mt-1 space-y-1 ml-3 border-l border-white/5 pl-3 pb-0.5">
                  {dataSources.map((item) => <NavItem key={item.href} {...item} sub />)}
                </div>
              )}
            </div>
          )}

          {/* Configurações */}
          <NavItem href="/configuracoes" label="Integrações e Setup" icon={Settings} />

        </nav>

        {/* Bottom — Sincronizar + Perfil */}
        {!collapsed && (
          <div className="p-4 m-3 mt-auto bg-background border border-border rounded-xl space-y-4">
            <button
              onClick={sincronizarTudo}
              disabled={sincronizando}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
              {sincronizando ? 'Sincronizando...' : 'Sincronizar Dados'}
            </button>
            <div className="pt-3 border-t border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground shadow-md">
                  RC
                </div>
                <div className="overflow-hidden flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">Sua Conta</p>
                  <p className="text-[10px] text-muted-foreground font-medium tracking-wide">Administrador</p>
                </div>
                <button className="text-muted-foreground hover:text-rose-400 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="px-2 pb-6 mt-auto flex flex-col items-center gap-3">
            <button
              onClick={sincronizarTudo}
              disabled={sincronizando}
              title="Sincronizar Dados"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-primary bg-primary/10 hover:bg-primary hover:text-white transition-all border border-primary/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
            </button>
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground shadow-md">
              RC
            </div>
          </div>
        )}
      </aside>

      {/* Toggle button — flutuante na borda da sidebar */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{ left: collapsed ? '44px' : '248px' }}
        className="fixed top-1/2 -translate-y-1/2 z-50 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-all duration-300 shadow-md"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Spacer to push main content */}
      <div className={`${w} flex-shrink-0 transition-all duration-300`} aria-hidden />
    </>
  )
}
