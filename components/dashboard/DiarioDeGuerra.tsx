'use client'

import { Save, Copy } from 'lucide-react'

export default function DiarioDeGuerra() {
  return (
    <section className="w-full bg-card border border-border rounded-2xl overflow-hidden mb-8 text-foreground">
      <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-1.5 h-6 bg-primary rounded-full shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black italic uppercase tracking-tighter text-foreground truncate">
              Diário de Guerra
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
              Input Diário de Métricas e Performance
            </p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background border border-border text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground hover:border-primary/40 transition-colors shrink-0">
          <Copy className="w-3.5 h-3.5" />
          Duplicar
        </button>
      </div>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Nome do Criativo */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              Nome do Criativo
            </label>
            <input 
              type="text" 
              placeholder="Ex: AD_01_PRODUTO"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* Fase do Framework */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              Fase do Framework
            </label>
            <select className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all appearance-none">
              <option>FASE 01</option>
              <option>FASE 02</option>
              <option>FASE 03</option>
            </select>
          </div>

          {/* Gasto (Meta Ads) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              Gasto (Meta Ads)
            </label>
            <input 
              type="text" 
              placeholder="R$ 0,00"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* CPM */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              CPM
            </label>
            <input 
              type="text" 
              placeholder="R$ 0,00"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* CTR (%) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              CTR (%)
            </label>
            <input 
              type="text" 
              placeholder="0,00%"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* IC (Initiate Checkout) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              IC (Initiate Checkout)
            </label>
            <input 
              type="text" 
              placeholder="0"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* Receita Líquida (Hotmart) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              Receita Líquida (Hotmart)
            </label>
            <input 
              type="text" 
              placeholder="R$ 0,00"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          {/* Quantidade de Vendas */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
              Quantidade de Vendas
            </label>
            <input 
              type="text" 
              placeholder="0"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20">
            <Save className="w-4 h-4" />
            Salvar Dados Diários
          </button>
        </div>
      </div>
    </section>
  )
}
