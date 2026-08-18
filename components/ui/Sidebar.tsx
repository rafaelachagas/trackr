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
  Trophy,
  MessageCircle,
  ChevronDown,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Binoculars,
} from 'lucide-react'
import { useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'

const navigation = [
  { href: '/overview', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/sales', label: 'Vendas', icon: ShoppingCart },
  { href: '/criativos', label: 'Criativos', icon: Film },
  { href: '/vendas-criativos', label: 'Vendas × Criativos', icon: Trophy },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/lancamento', label: 'Lançamento', icon: PlusCircle },
]

const dataSources = [
  { href: '/data-sources/sales', label: 'Vendas', icon: DollarSign },
  { href: '/data-sources/ad-accounts', label: 'Contas de anúncios', icon: CreditCard },
]

const ferramentas = [
  { href: '/ferramentas/rastreador', label: 'Rastreador de Anúncios', icon: Binoculars, beta: true },
  { href: '/ferramentas/simulador', label: 'Simulador de Funil', icon: TrendingUp, beta: true },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { sincronizarTudo, isRefreshing: sincronizando } = useDashboard()
  const [collapsed, setCollapsed] = useState(false)
  const [dataSourcesOpen, setDataSourcesOpen] = useState(pathname.startsWith('/data-sources'))
  const dataSourcesActive = pathname.startsWith('/data-sources')
  const [ferramentasOpen, setFerramentasOpen] = useState(pathname.startsWith('/ferramentas'))
  const ferramentasActive = pathname.startsWith('/ferramentas')

  const labelClass = `overflow-hidden whitespace-nowrap transition-all duration-300 ${
    collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'
  }`

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => {
    const active = pathname === href || (href === '/overview' && pathname === '/')
    return (
      <div className="relative group/item">
        <Link
          href={href}
          className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
          style={active ? { backgroundColor: '#5dd3ff14' } : {}}
        >
          {active && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
          <Icon
            className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${!active ? 'group-hover/item:scale-110 group-hover/item:!text-white' : ''}`}
            style={{ color: active ? '#00aeef' : '#71777a' }}
          />
          <span className={labelClass} style={{ color: active ? '#00aeef' : '' }}>{label}</span>
        </Link>
        {collapsed && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-white/5 rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover/item:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
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
        className={`${collapsed ? 'w-[60px]' : 'w-64'} text-foreground hidden md:flex flex-col h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden hide-scrollbar transition-all duration-300 z-40`}
        style={{ backgroundColor: '#13181a', borderRight: '1px solid hsla(0,0%,100%,.05)', boxShadow: '4px 0 24px rgba(0,0,0,.4)' }}
      >
        {/* Logo */}
        <div className="h-12 flex items-center px-3 flex-shrink-0 border-b border-white/5">
          <div className="w-7 h-7 rounded-xl bg-card border border-white/5 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-primary/10" />
            <Zap className="w-3.5 h-3.5 text-primary relative z-10" strokeWidth={2.5} />
          </div>
          <div className={`overflow-hidden transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-2'}`}>
            <h1 className="text-sm font-black italic uppercase tracking-tighter text-foreground whitespace-nowrap">The Track</h1>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 pt-4 pb-8 space-y-1">

          {navigation.map((item) => <NavItem key={item.href} {...item} />)}

          {/* Analisar Criativos */}
          <div className="relative group/item">
            <Link
              href="/ad-analysis"
              className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
              style={adAnalysisActive ? { backgroundColor: '#5dd3ff14' } : {}}
            >
              {adAnalysisActive && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
              <Film className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${!adAnalysisActive ? 'group-hover/item:scale-110 group-hover/item:!text-white' : ''}`} style={{ color: adAnalysisActive ? '#00aeef' : '#71777a' }} />
              <span className={labelClass} style={{ color: adAnalysisActive ? '#00aeef' : '' }}>Analisar Criativos</span>
            </Link>
            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-white/5 rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover/item:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                Analisar Criativos
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-border" />
              </div>
            )}
          </div>

          {/* Fontes de dados */}
          <div className="relative group/item">
            <button
              onClick={() => { if (collapsed) { setCollapsed(false); setDataSourcesOpen(true) } else { setDataSourcesOpen(v => !v) } }}
              className="w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
              style={dataSourcesActive || dataSourcesOpen ? { backgroundColor: '#5dd3ff14' } : {}}
            >
              {(dataSourcesActive || dataSourcesOpen) && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
              <Database className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${!(dataSourcesActive || dataSourcesOpen) ? 'group-hover/item:scale-110 group-hover/item:!text-white' : ''}`} style={{ color: dataSourcesActive || dataSourcesOpen ? '#00aeef' : '#71777a' }} />
              <span className={`${labelClass} flex-1 text-left`} style={{ color: dataSourcesActive || dataSourcesOpen ? '#00aeef' : '' }}>Fontes de dados</span>
              <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[20px] opacity-100'} ${dataSourcesOpen ? 'rotate-180' : ''}`} style={{ color: dataSourcesActive || dataSourcesOpen ? '#00aeef' : '#71777a' }} />
            </button>
            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-white/5 rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover/item:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                Fontes de dados
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-border" />
              </div>
            )}
            <div className={`overflow-hidden transition-all duration-300 ${dataSourcesOpen && !collapsed ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="ml-3 border-l border-white/5 pl-3 py-1 space-y-1">
                {dataSources.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href
                  return (
                    <Link key={href} href={href} className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-all duration-200 group/sub ${active ? 'font-medium' : 'hover:bg-white/5'}`} style={{ color: active ? '#00aeef' : '#71777a' }}>
                      <Icon className={`w-4 h-4 flex-shrink-0 transition-all duration-200 ${!active ? 'group-hover/sub:scale-110 group-hover/sub:!text-white' : ''}`} style={{ color: active ? '#00aeef' : '#71777a' }} />
                      {label}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Ferramentas */}
          <div className="relative group/item">
            <button
              onClick={() => { if (collapsed) { setCollapsed(false); setFerramentasOpen(true) } else { setFerramentasOpen(v => !v) } }}
              className="w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
              style={ferramentasActive || ferramentasOpen ? { backgroundColor: '#5dd3ff14' } : {}}
            >
              {(ferramentasActive || ferramentasOpen) && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
              <Wrench className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${!(ferramentasActive || ferramentasOpen) ? 'group-hover/item:scale-110 group-hover/item:!text-white' : ''}`} style={{ color: ferramentasActive || ferramentasOpen ? '#00aeef' : '#71777a' }} />
              <span className={`${labelClass} flex-1 text-left`} style={{ color: ferramentasActive || ferramentasOpen ? '#00aeef' : '' }}>Ferramentas</span>
              <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[20px] opacity-100'} ${ferramentasOpen ? 'rotate-180' : ''}`} style={{ color: ferramentasActive || ferramentasOpen ? '#00aeef' : '#71777a' }} />
            </button>
            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-white/5 rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover/item:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                Ferramentas
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-border" />
              </div>
            )}
            <div className={`overflow-hidden transition-all duration-300 ${ferramentasOpen && !collapsed ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="ml-3 border-l border-white/5 pl-3 py-1 space-y-1">
                {ferramentas.map(({ href, label, icon: Icon, beta }) => {
                  const active = pathname === href
                  return (
                    <Link key={href} href={href} className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-all duration-200 group/sub ${active ? 'font-medium' : 'hover:bg-white/5'}`} style={{ color: active ? '#00aeef' : '#71777a' }}>
                      <Icon className={`w-4 h-4 flex-shrink-0 transition-all duration-200 ${!active ? 'group-hover/sub:scale-110 group-hover/sub:!text-white' : ''}`} style={{ color: active ? '#00aeef' : '#71777a' }} />
                      <span className="flex-1">{label}</span>
                      {beta && <span className="text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-primary/15 text-primary">Beta</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Configurações */}
          <div className="relative group/item">
            <Link
              href="/configuracoes"
              className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden hover:bg-white/5"
              style={configActive ? { backgroundColor: '#5dd3ff14' } : {}}
            >
              {configActive && <div className="absolute inset-y-2.5 left-0 w-0.5 rounded-r-[0.5rem]" style={{ backgroundColor: '#00aeef' }} />}
              <Settings className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${!configActive ? 'group-hover/item:scale-110 group-hover/item:!text-white' : ''}`} style={{ color: configActive ? '#00aeef' : '#71777a' }} />
              <span className={labelClass} style={{ color: configActive ? '#00aeef' : '' }}>Configurações</span>
            </Link>
            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 bg-card border border-white/5 rounded-lg text-xs font-medium text-foreground whitespace-nowrap shadow-lg opacity-0 group-hover/item:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                Configurações
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-border" />
              </div>
            )}
          </div>

        </nav>

        {/* Bottom */}
        {collapsed ? (
          <div className="p-2 mb-3 mx-2 border border-white/5 rounded-xl flex flex-col items-center gap-2" style={{ backgroundColor: '#181e21' }}>
            <button
              onClick={sincronizarTudo}
              disabled={sincronizando}
              title="Sincronizar Dados"
              className="w-full flex items-center justify-center py-2.5 rounded-lg text-sm font-semibold transition-all bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
            </button>
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground shadow-md">
              RC
            </div>
          </div>
        ) : (
          <div className="p-2 mb-3 mx-2 border border-white/5 rounded-xl space-y-3" style={{ backgroundColor: '#181e21' }}>
            <button
              onClick={sincronizarTudo}
              disabled={sincronizando}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 flex-shrink-0 ${sincronizando ? 'animate-spin' : ''}`} />
              <span>{sincronizando ? 'Sincronizando...' : 'Sincronizar Dados'}</span>
            </button>
            <div className="pt-2 border-t border-white/5 flex items-center gap-3 px-1">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground shadow-md flex-shrink-0">
                RC
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">Sua Conta</p>
                <p className="text-[10px] text-muted-foreground font-medium tracking-wide">Administrador</p>
              </div>
              <button className="text-muted-foreground hover:text-rose-400 transition-colors flex-shrink-0">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Toggle button — centralizado na borda direita da sidebar */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className={`fixed top-1/2 -translate-y-1/2 -translate-x-1/2 z-50 w-7 h-7 rounded-full hidden md:flex items-center justify-center transition-all duration-300 shadow-md ${collapsed ? 'left-[60px]' : 'left-64'}`}
        style={{ backgroundColor: '#181e21', border: '1px solid hsla(0,0%,100%,.08)', color: '#71777a' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#00aeef'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,174,239,0.4)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#71777a'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsla(0,0%,100%,.08)' }}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Spacer */}
      <div className={`${collapsed ? 'w-[60px]' : 'w-64'} hidden md:block flex-shrink-0 transition-all duration-300`} aria-hidden />
    </>
  )
}
