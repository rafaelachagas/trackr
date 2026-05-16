'use client'

import { Save, Copy } from 'lucide-react'

export default function DiarioDeGuerra() {
  return (
    <section className="w-full bg-[#0b1222] border border-slate-800/50 rounded-2xl overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-[#00aeef] rounded-full" />
          <div>
            <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">
              Diário de Guerra
            </h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Input Diário de Métricas e Performance
            </p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-white hover:border-slate-700 transition-colors">
          <Copy className="w-3.5 h-3.5" />
          Duplicar
        </button>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Nome do Criativo */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Nome do Criativo
            </label>
            <input 
              type="text" 
              placeholder="Ex: AD_01_PRODUTO"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#00aeef]/50 transition-all"
            />
          </div>

          {/* Fase do Framework */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Fase do Framework
            </label>
            <select className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#00aeef]/50 transition-all appearance-none">
              <option>FASE 01</option>
              <option>FASE 02</option>
              <option>FASE 03</option>
            </select>
          </div>

          {/* Gasto (Meta Ads) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Gasto (Meta Ads)
            </label>
            <input 
              type="text" 
              placeholder="R$ 0,00"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#00aeef]/50 transition-all"
            />
          </div>

          {/* CPM */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              CPM
            </label>
            <input 
              type="text" 
              placeholder="R$ 0,00"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#00aeef]/50 transition-all"
            />
          </div>

          {/* CTR (%) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              CTR (%)
            </label>
            <input 
              type="text" 
              placeholder="0,00%"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#00aeef]/50 transition-all"
            />
          </div>

          {/* IC (Initiate Checkout) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              IC (Initiate Checkout)
            </label>
            <input 
              type="text" 
              placeholder="0"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#00aeef]/50 transition-all"
            />
          </div>

          {/* Receita Líquida (Hotmart) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Receita Líquida (Hotmart)
            </label>
            <input 
              type="text" 
              placeholder="R$ 0,00"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#00aeef]/50 transition-all"
            />
          </div>

          {/* Quantidade de Vendas */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Quantidade de Vendas
            </label>
            <input 
              type="text" 
              placeholder="0"
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#00aeef]/50 transition-all"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button className="flex items-center gap-2 bg-[#00aeef] hover:bg-[#0094cc] text-white px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-[0_0_20px_rgba(0,174,239,0.2)]">
            <Save className="w-4 h-4" />
            Salvar Dados Diários
          </button>
        </div>
      </div>
    </section>
  )
}
