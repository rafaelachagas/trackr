'use client'

import { usePathname } from 'next/navigation'
import { Eye, Sun, Edit2, Trophy, LogOut, LayoutDashboard, Moon, EyeOff } from 'lucide-react'
import FiltrosDashboard from '@/components/dashboard/FiltrosDashboard'
import { useDashboard } from '@/context/DashboardContext'

export default function Topbar() {
  const pathname = usePathname()
  const isOverview = pathname === '/overview' || pathname === '/' || pathname === '/vendas'
  const { theme, setTheme, isPrivate, setIsPrivate } = useDashboard()

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const togglePrivacy = () => {
    setIsPrivate(!isPrivate)
  }

  return (
    <header className="sticky top-0 z-50" style={{ borderBottom: '1px solid hsla(0,0%,100%,.05)', backgroundColor: '#13181a' }}>
      {/* breadcrumb bar */}
      <div className="h-12 px-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="text-[12px] font-black uppercase tracking-[0.2em] opacity-80">Dashboard - Principal</span>
            <div className="flex items-center gap-2.5 ml-4 border-l border-border pl-6">
              <button 
                onClick={togglePrivacy}
                className={`p-2 hover:bg-muted rounded-xl transition-all ${isPrivate ? 'text-rose-500 bg-rose-500/10' : 'hover:text-primary'}`}
              >
                {isPrivate ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
              <button 
                onClick={toggleTheme}
                className="p-2 hover:bg-muted rounded-xl transition-all text-primary"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5 text-slate-600" />}
              </button>
              <button className="p-2 hover:bg-muted rounded-xl transition-all hover:text-primary">
                <Edit2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4 pl-8 border-l border-border text-right">
            <div className="hidden sm:block">
              <p className="text-[12px] font-black text-foreground uppercase tracking-tighter">Rafaela Chagas</p>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest opacity-80">Administrador</p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center font-black text-[12px] text-white shadow-xl shadow-blue-600/30 border border-blue-400/20">
              RC
            </div>
          </div>
        </div>
      </div>

      {/* Main Page Header - Only show on Overview */}
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
