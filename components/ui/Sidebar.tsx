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

export default function Sidebar() {
  const pathname = usePathname()
  const { sincronizarTudo, isRefreshing: sincronizando } = useDashboard()
  const [collapsed, setCollapsed] = useState(false)
  const [dataSourcesOpen, setDataSourcesOpen] = useState(pathname.startsWith('/data-sources'))
  const dataSourcesActive = pathname.startsWith('/data-sources')

  const labelClass = `overflow-hidden whitespace-nowrap transition-all duration-300 ${
    collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'
  }`

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => {
    const active = pathname === href || (href === '/overview' && pathname === '/')
    return (
      <div className="relative group">
        <Link
          href={href}
          className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
          style={active ? { backgroundColor: '#5dd3ff14' } : {}}
        >
          {active && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
          <Icon className="w-5 h-5 flex-shrink-0 transition-colors duration-200" style={{ color: active ? '#00aeef' : '#71777a' }} />
          <span className={labelClass} style={{ color: active ? '#00aeef' : '' }}>{label}</span>
        </Link>
        {collapsed && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-border" />
          </div>
        )}
      </div>
    )
  }

  const adAnalysisActive = pathname === '/ad-analysis'
  const configActive = pathname === '/configuracoes'

  return (
    <>
      <aside
        className={`${collapsed ? 'w-[60px]' : 'w-64'} bg-card border-r border-border text-foreground flex flex-col h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden hide-scrollbar transition-all duration-300 z-40`}
      >
        {/* Logo */}
        <div className="pt-6 pb-6 flex flex-col items-center border-b border-border px-3">
          <div className="w-10 h-10 rounded-2xl bg-card border border-border flex items-center justify-center shadow-lg shadow-black/5 flex-shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-primary/10" />
            <Zap className="w-5 h-5 text-primary relative z-10" strokeWidth={2.5} />
          </div>
          <div className={`overflow-hidden transition-all duration-300 text-center ${collapsed ? 'max-h-0 opacity-0 mt-0' : 'max-h-20 opacity-100 mt-2'}`}>
            <h1 className="text-xl font-black italic uppercase tracking-tighter text-foreground whitespace-nowrap">TRACKR</h1>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 whitespace-nowrap">
              Painel de Gestão de Performance
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 pt-4 pb-8 space-y-1">

          {navigation.map((item) => <NavItem key={item.href} {...item} />)}

          {/* Analisar Criativos */}
          <div className="relative group">
            <Link
              href="/ad-analysis"
              className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
              style={adAnalysisActive ? { backgroundColor: '#5dd3ff14' } : {}}
            >
              {adAnalysisActive && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
              <Film className="w-5 h-5 flex-shrink-0 transition-colors duration-200" style={{ color: adAnalysisActive ? '#00aeef' : '#71777a' }} />
              <span className={labelClass} style={{ color: adAnalysisActive ? '#00aeef' : '' }}>Analisar Criativos</span>
            </Link>
            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                Analisar Criativos
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-border" />
              </div>
            )}
          </div>

          {/* Fontes de dados */}
          <div className="relative group">
            <button
              onClick={() => !collapsed && setDataSourcesOpen(v => !v)}
              className="w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
              style={dataSourcesActive || dataSourcesOpen ? { backgroundColor: '#5dd3ff14' } : {}}
            >
              {(dataSourcesActive || dataSourcesOpen) && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
              <Database className="w-5 h-5 flex-shrink-0 transition-colors duration-200" style={{ color: dataSourcesActive || dataSourcesOpen ? '#00aeef' : '#71777a' }} />
              <span className={`${labelClass} flex-1 text-left`} style={{ color: dataSourcesActive || dataSourcesOpen ? '#00aeef' : '' }}>Fontes de dados</span>
              <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[20px] opacity-100'} ${dataSourcesOpen ? 'rotate-180' : ''}`} style={{ color: dataSourcesActive || dataSourcesOpen ? '#00aeef' : '#71777a' }} />
            </button>
            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                Fontes de dados
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-border" />
              </div>
            )}
            <div className={`overflow-hidden transition-all duration-300 ${dataSourcesOpen && !collapsed ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="ml-3 border-l border-white/5 pl-3 py-1 space-y-1">
                {dataSources.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href
                  return (
                    <Link key={href} href={href} className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-all duration-200 ${active ? 'font-medium' : 'hover:bg-white/5'}`} style={{ color: active ? '#00aeef' : '#71777a' }}>
                      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? '#00aeef' : '#71777a' }} />
                      {label}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Configurações */}
          <div className="relative group">
            <Link
              href="/configuracoes"
              className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
              style={configActive ? { backgroundColor: '#5dd3ff14' } : {}}
            >
              {configActive && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
              <Settings className="w-5 h-5 flex-shrink-0 transition-colors duration-200" style={{ color: configActive ? '#00aeef' : '#71777a' }} />
              <span className={labelClass} style={{ color: configActive ? '#00aeef' : '' }}>Integrações e Setup</span>
            </Link>
            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                Integrações e Setup
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-border" />
              </div>
            )}
          </div>

        </nav>

        {/* Bottom */}
        <div className="p-2 mb-3 mx-2 bg-background border border-border rounded-xl space-y-3">
          <button
            onClick={sincronizarTudo}
            disabled={sincronizando}
            title={collapsed ? 'Sincronizar Dados' : undefined}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <RefreshCw className={`w-4 h-4 flex-shrink-0 ${sincronizando ? 'animate-spin' : ''}`} />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100'}`}>
              {sincronizando ? 'Sincronizando...' : 'Sincronizar Dados'}
            </span>
          </button>

          <div className="pt-2 border-t border-border flex items-center gap-3 px-1">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground shadow-md flex-shrink-0">
              RC
            </div>
            <div className={`overflow-hidden transition-all duration-300 flex-1 ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100'}`}>
              <p className="text-xs font-semibold text-foreground truncate">Sua Conta</p>
              <p className="text-[10px] text-muted-foreground font-medium tracking-wide">Administrador</p>
            </div>
            <button className={`text-muted-foreground hover:text-rose-400 transition-all duration-300 flex-shrink-0 ${collapsed ? 'max-w-0 opacity-0 overflow-hidden' : 'max-w-[20px] opacity-100'}`}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Toggle button — centralizado na borda direita da sidebar */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className={`fixed top-1/2 -translate-y-1/2 -translate-x-1/2 z-50 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-all duration-300 shadow-md ${collapsed ? 'left-[60px]' : 'left-64'}`}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Spacer */}
      <div className={`${collapsed ? 'w-[60px]' : 'w-64'} flex-shrink-0 transition-all duration-300`} aria-hidden />
    </>
  )
}
