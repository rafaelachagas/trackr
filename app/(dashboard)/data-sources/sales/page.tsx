'use client'

import { useState } from 'react'
import { RefreshCw, Upload, Target, Plus, ChevronDown, ChevronUp, ExternalLink, AlertCircle } from 'lucide-react'

type Integracao = {
  id: string
  nome: string
  icon: React.ReactNode
  status: 'conectada' | 'desconectada'
  ultimoEvento?: string
  totalEventos30d?: number
  avisos?: string[]
}

const hotmartIcon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#FF5C00" />
    <path d="M8 15.5c1.5-2 2.5-3.5 4-5.5 1.5 2 2.5 3.5 4 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="8" r="1.5" fill="white" />
  </svg>
)

export default function VendasPage() {
  const [aba, setAba] = useState<'visao-geral' | 'ultimas-vendas'>('visao-geral')
  const [instrucaoAberta, setInstrucaoAberta] = useState(false)

  const integracoes: Integracao[] = [
    {
      id: 'hotmart',
      nome: 'Integração Hotmart',
      icon: hotmartIcon,
      status: 'desconectada',
      totalEventos30d: 0,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto text-slate-200 pb-12">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Vendas</h1>
          <p className="text-slate-400 text-sm mt-1">Acompanhe suas vendas e receita</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button disabled className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-sm text-slate-500 cursor-not-allowed transition">
            <Target className="w-4 h-4" />
            Rastrear Vendas
          </button>
          <button disabled className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/80 text-sm text-white font-semibold cursor-not-allowed opacity-60 transition">
            <Upload className="w-4 h-4" />
            Upload Manual
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-800 mb-6">
        {(['visao-geral', 'ultimas-vendas'] as const).map(t => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`pb-3 text-sm font-semibold transition border-b-2 -mb-px ${
              aba === t
                ? 'border-primary text-white'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'visao-geral' ? 'Visão Geral' : 'Últimas vendas'}
          </button>
        ))}
      </div>

      {aba === 'visao-geral' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'RECEITA TOTAL', value: 'R$ 0,00', icon: '💰' },
              { label: 'TOTAL DE CLIENTES', value: '0', icon: '👥' },
              { label: 'TOTAL DE VENDAS', value: '0', icon: '🛒' },
            ].map(s => (
              <div key={s.label} className="bg-[#0f1623] border border-slate-800 rounded-2xl p-5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{s.label}</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-base">
                    {s.icon}
                  </div>
                  <span className="text-xl font-bold text-white">{s.value}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Integrações */}
          <div className="bg-[#0f1623] border border-slate-800 rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-1">Integrações</h2>
            <p className="text-xs text-slate-500 mb-5">Gerencie suas integrações com gateways de pagamento</p>

            <div className="grid grid-cols-2 gap-4">
              {integracoes.map(integracao => (
                <IntegracaoCard
                  key={integracao.id}
                  integracao={integracao}
                  instrucaoAberta={instrucaoAberta}
                  setInstrucaoAberta={setInstrucaoAberta}
                />
              ))}

              {/* Card adicionar */}
              <button
                disabled
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-slate-700/60 text-slate-600 cursor-not-allowed min-h-[160px]"
              >
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">Adicionar Integração</span>
              </button>
            </div>
          </div>
        </>
      )}

      {aba === 'ultimas-vendas' && (
        <div className="bg-[#0f1623] border border-slate-800 rounded-2xl p-10 text-center">
          <p className="text-slate-500 text-sm">Nenhuma venda registrada ainda.</p>
          <p className="text-slate-600 text-xs mt-1">Configure uma integração para começar a receber dados de vendas.</p>
        </div>
      )}
    </div>
  )
}

function IntegracaoCard({
  integracao,
  instrucaoAberta,
  setInstrucaoAberta,
}: {
  integracao: Integracao
  instrucaoAberta: boolean
  setInstrucaoAberta: (v: boolean) => void
}) {
  const desconectada = integracao.status === 'desconectada'

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 min-h-[160px]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
          {integracao.icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{integracao.nome}</p>
          {desconectada ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400">Há mais de 7 dias sem receber eventos</span>
            </div>
          ) : (
            <span className="text-xs text-emerald-400">Conectada</span>
          )}
        </div>
      </div>

      {integracao.totalEventos30d !== undefined && (
        <div className="text-xs text-slate-500">
          <span className="text-slate-400 font-medium">{integracao.totalEventos30d}</span> eventos recebidos (últimos 30 dias)
          {integracao.ultimoEvento && (
            <p>Último em {integracao.ultimoEvento}</p>
          )}
        </div>
      )}

      <button
        onClick={() => setInstrucaoAberta(!instrucaoAberta)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mt-auto pt-2 border-t border-slate-800"
      >
        Ver instruções de instalação
        {instrucaoAberta ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {instrucaoAberta && (
        <div className="text-xs text-slate-400 bg-slate-800/60 rounded-lg p-3 space-y-2">
          <p className="font-semibold text-slate-200">Como integrar com Hotmart:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li>Acesse sua conta no Hotmart</li>
            <li>Vá em <strong className="text-slate-300">Ferramentas → Webhooks</strong></li>
            <li>Adicione a URL abaixo como endpoint</li>
            <li>Selecione os eventos de compra</li>
          </ol>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 mt-2">
            <code className="text-primary text-[10px] flex-1 truncate">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/hotmart
            </code>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          </div>
        </div>
      )}
    </div>
  )
}
