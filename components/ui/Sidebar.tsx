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
  { href: '/data-sources/ad-accounts', label: 'Contas de anúncios', icon: CreditCard },
]

const configuracoes = [
  { href: '/configuracoes', label: 'Integrações e Setup', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { sincronizarTudo, isRefreshing: sincronizando } = useDashboard()
  const [dataSourcesOpen, setDataSourcesOpen] = useState(
    pathname.startsWith('/data-sources')
  )
  const dataSourcesActive = pathname.startsWith('/data-sources')

  const NavItem = ({ href, label, icon: Icon, sub = false }: any) => {
    const active = pathname === href || (href === '/overview' && pathname === '/')
    if (sub) {
      return (
        <Link
          href={href}
          className={`flex items-center gap-2.5 pl-4 pr-3 py-2.5 text-sm font-semibold transition-all rounded-xl border-l-2 ${
            active
              ? 'border-primary bg-primary/15 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
          }`}
        >
          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
          {label}
        </Link>
      )
    }
    return (
      <Link
        href={href}
        className={`flex items-center justify-between px-4 py-3 text-sm font-medium transition-all ${
          active
            ? 'bg-primary text-white rounded-xl shadow-lg shadow-primary/20'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-primary'}`} />
          {label}
        </div>
      </Link>
    )
  }

  const NavGroup = ({ title, items }: any) => {
    return (
      <div className="mb-2">
        <div className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div className="flex items-center gap-2">{title}</div>
        </div>
        <div className="mt-1 space-y-1">
          {items.map((item: any) => <NavItem key={item.href} {...item} />)}
        </div>
      </div>
    )
  }

  return (
    <aside className="w-64 bg-card border-r border-border text-foreground flex flex-col h-screen fixed left-0 top-0 overflow-y-auto overflow-x-hidden hide-scrollbar">
      {/* Logo */}
      <div className="px-6 pt-8 pb-8 flex flex-col items-center text-center border-b border-border">
        <div className="w-16 h-16 rounded-3xl bg-card border border-border flex items-center justify-center shadow-lg shadow-black/5 flex-shrink-0 relative overflow-hidden">
           <div className="absolute inset-0 bg-primary/10" />
           <Zap className="w-8 h-8 text-primary relative z-10" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-black italic uppercase tracking-tighter text-foreground">
          TRACKR
        </h1>
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-2">
          Painel de Gestão de Performance
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-4 pb-8">

        <div className="space-y-1">
          {navigation.map((item) => <NavItem key={item.href} {...item} />)}
        </div>

        {/* Data Sources collapsible group */}
        <div className="mb-2">
          <button
            onClick={() => setDataSourcesOpen(v => !v)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
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
            <div className="mt-1 space-y-0.5 ml-2">
              {dataSources.map((item) => <NavItem key={item.href} {...item} sub />)}
            </div>
          )}
        </div>

        <NavGroup title="Sistema" items={configuracoes} />

      </nav>

      {/* Sincronização e Perfil */}
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
    </aside>
  )
}
