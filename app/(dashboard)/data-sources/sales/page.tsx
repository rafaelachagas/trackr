'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Upload, Target, Plus, ChevronDown, ChevronUp, Eye, EyeOff, CheckCircle2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDashboard } from '@/context/DashboardContext'

const hotmartIcon = (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#FF5C00" />
    <path d="M8 15.5c1.5-2 2.5-3.5 4-5.5 1.5 2 2.5 3.5 4 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="8" r="1.5" fill="white" />
  </svg>
)

export default function VendasPage() {
  const { isPrivate } = useDashboard()
  const [aba, setAba] = useState<'visao-geral' | 'ultimas-vendas'>('visao-geral')
  const [instrucaoAberta, setInstrucaoAberta] = useState(false)

  const [hotmartBasic, setHotmartBasic] = useState('')
  const [showSecrets, setShowSecrets] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [totalEventos, setTotalEventos] = useState(0)
  const [receitaTotal, setReceitaTotal] = useState(0)
  const [totalClientes, setTotalClientes] = useState(0)
  const [totalVendas, setTotalVendas] = useState(0)
  const [ultimasVendas, setUltimasVendas] = useState<any[]>([])

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    // Métricas fidedignas (vendas REAIS da Hotmart, sem manuais, sem o teto de
    // 1000 linhas) vêm do servidor. Config e últimas vendas via client mesmo.
    const [{ data: configs }, resumoRes, { data: vendas }] = await Promise.all([
      supabase.from('configuracoes').select('*'),
      fetch('/api/vendas/resumo?dias=30').then(r => r.json()).catch(() => null),
      supabase.from('vendas').select('*').eq('status', 'approved').not('transaction_id', 'like', 'manual_%').order('data', { ascending: false }).limit(50),
    ])

    configs?.forEach(c => {
      if (c.chave === 'hotmart_basic') setHotmartBasic(c.valor || '')
    })

    if (resumoRes && !resumoRes.error) {
      setTotalVendas(resumoRes.vendas ?? 0)
      setTotalEventos(resumoRes.vendas ?? 0)
      setReceitaTotal(resumoRes.receitaBruta ?? 0)
      setTotalClientes(resumoRes.clientes ?? 0)
    }

    if (vendas) setUltimasVendas(vendas)
  }

  async function salvar() {
    setSaving(true)
    try {
      await supabase.from('configuracoes').upsert(
        { chave: 'hotmart_basic', valor: hotmartBasic, updated_at: new Date().toISOString() },
        { onConflict: 'chave' }
      )
      alert('Credenciais salvas!')
    } catch {
      alert('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function sincronizar() {
    setSyncing(true)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 55000)
      let res: Response
      try {
        res = await fetch('/api/hotmart/sync', { method: 'POST', signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro desconhecido')
      alert(`Sincronização concluída! ${json.total_registros} vendas importadas.`)
      carregarDados()
    } catch (e: any) {
      if (e.name === 'AbortError') {
        alert('Timeout: a sincronização demorou mais de 55 segundos.')
      } else {
        alert(`Erro: ${e.message}`)
      }
    } finally {
      setSyncing(false)
    }
  }

  const conectada = !!hotmartBasic

  return (
    <div className="max-w-5xl mx-auto text-foreground pb-12 mt-10">

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Vendas</h1>
          <p className="text-muted-foreground text-sm mt-1">Acompanhe suas vendas e receita</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={carregarDados} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button disabled className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground/50 cursor-not-allowed">
            <Target className="w-4 h-4" />
            Rastrear Vendas
          </button>
          <button disabled className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/80 text-sm text-white font-semibold cursor-not-allowed opacity-60">
            <Upload className="w-4 h-4" />
            Upload Manual
          </button>
        </div>
      </div>

      <div className="flex gap-6 border-b border-border mb-6">
        {(['visao-geral', 'ultimas-vendas'] as const).map(t => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`pb-3 text-sm font-semibold transition border-b-2 -mb-px ${
              aba === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'visao-geral' ? 'Visão Geral' : 'Últimas vendas'}
          </button>
        ))}
      </div>

      {aba === 'visao-geral' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: 'RECEITA TOTAL', value: `R$ ${receitaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '💰' },
              { label: 'TOTAL DE CLIENTES', value: `${totalClientes.toLocaleString('pt-BR')}`, icon: '👥' },
              { label: 'TOTAL DE VENDAS', value: `${totalVendas.toLocaleString('pt-BR')}`, icon: '🛒' },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">{s.label}</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-base">
                    {s.icon}
                  </div>
                  <span className={`text-xl font-bold text-foreground ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••••' : s.value}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-base font-bold text-foreground mb-1">Integrações</h2>
            <p className="text-xs text-muted-foreground mb-5">Gerencie suas integrações com gateways de pagamento</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/30 border border-border rounded-xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center">
                    {hotmartIcon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Integração Hotmart</p>
                    {conectada ? (
                      <span className="text-xs text-emerald-400">Conectada</span>
                    ) : (
                      <span className="text-xs text-amber-400">Não configurada</span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{totalEventos.toLocaleString('pt-BR')}</span> eventos recebidos (últimos 30 dias)
                </div>

                <button
                  onClick={() => setInstrucaoAberta(!instrucaoAberta)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition pt-2 border-t border-border"
                >
                  Ver instruções de instalação
                  {instrucaoAberta ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {instrucaoAberta && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-2">
                    <p className="font-semibold text-foreground">Como integrar com Hotmart:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Acesse sua conta no Hotmart</li>
                      <li>Vá em <strong className="text-foreground">Ferramentas → Webhooks</strong></li>
                      <li>Adicione a URL abaixo como endpoint</li>
                      <li>Selecione os eventos de compra</li>
                    </ol>
                    <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 mt-2">
                      <code className="text-primary text-[10px] flex-1 truncate">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/hotmart
                      </code>
                    </div>
                  </div>
                )}

                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">API Hotmart</span>
                    <button onClick={() => setShowSecrets(v => !v)} className="text-muted-foreground hover:text-foreground transition">
                      {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Basic Token</label>
                    <input
                      type={showSecrets ? 'text' : 'password'}
                      value={hotmartBasic}
                      onChange={e => setHotmartBasic(e.target.value)}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition font-mono"
                      placeholder="Nzg2YzQw..."
                    />
                    <p className="text-[10px] text-muted-foreground/50 mt-1">Gerado pela Hotmart ao criar a credencial.</p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`w-4 h-4 ${conectada ? 'text-emerald-500' : 'text-muted-foreground/40'}`} />
                      <span className="text-xs text-muted-foreground">{conectada ? 'API configurada' : 'API não configurada'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={salvar}
                        disabled={saving}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 bg-primary/80 hover:bg-primary rounded-lg transition disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        onClick={sincronizar}
                        disabled={syncing || !conectada}
                        className="flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-orange-300 px-3 py-1.5 bg-orange-500/10 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Sincronizando...' : 'Sincronizar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button
                disabled
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-border/60 text-muted-foreground/50 cursor-not-allowed min-h-[160px]"
              >
                <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">Adicionar Integração</span>
              </button>
            </div>
          </div>
        </>
      )}

      {aba === 'ultimas-vendas' && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {ultimasVendas.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-muted-foreground text-sm">Nenhuma venda registrada ainda.</p>
              <p className="text-muted-foreground/50 text-xs mt-1">Configure a integração Hotmart para começar a receber dados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-border">
                <tr>
                  {['Data', 'Produto', 'Tipo', 'Valor', 'Status', 'Criativo'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {ultimasVendas.map((v, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(v.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3 text-foreground max-w-[180px] truncate">{v.produto || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.tipo === 'front' ? 'bg-blue-500/15 text-blue-400' : 'bg-violet-500/15 text-violet-400'}`}>
                        {v.tipo || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-emerald-400 font-semibold">
                      R$ {Number(v.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                        {v.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{v.criativo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
