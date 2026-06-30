'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Upload, Target, Plus, ChevronDown, ChevronUp, Eye, EyeOff, CheckCircle2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
    const [{ data: configs }, { data: vendas30d }, { data: vendas }] = await Promise.all([
      supabase.from('configuracoes').select('*'),
      supabase.from('vendas').select('valor, buyer_email').eq('status', 'approved').gte('data', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('vendas').select('*').eq('status', 'approved').order('data', { ascending: false }).limit(50),
    ])

    configs?.forEach(c => {
      if (c.chave === 'hotmart_basic') setHotmartBasic(c.valor || '')
    })

    if (vendas30d) {
      setTotalEventos(vendas30d.length)
      setReceitaTotal(vendas30d.reduce((acc, v) => acc + Number(v.valor), 0))
      const emails = new Set(vendas30d.map((v: any) => v.buyer_email).filter(Boolean))
      setTotalClientes(emails.size)
      setTotalVendas(vendas30d.length)
    }

    if (vendas) setUltimasVendas(vendas)
  }

  async function salvar() {
    setSaving(true)
    try {
      const updates = [
        { chave: 'hotmart_basic', valor: hotmartBasic },
      ]
      for (const item of updates) {
        if (!item.valor) continue
        await supabase.from('configuracoes').upsert(
          { chave: item.chave, valor: item.valor, updated_at: new Date().toISOString() },
          { onConflict: 'chave' }
        )
      }
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
      alert(`Sincronizacao concluida! ${json.total_registros} vendas importadas.`)
      carregarDados()
    } catch (e: any) {
      if (e.name === 'AbortError') {
        alert('Timeout: a sincronizacao demorou mais de 55 segundos.')
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

      {/* Cabecalho */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Vendas</h1>
          <p className="text-muted-foreground text-sm mt-1">Acompanhe suas vendas e receita</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregarDados} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-white hover:bg-muted transition">
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

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border mb-6">
        {(['visao-geral', 'ultimas-vendas'] as const).map(t => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`pb-3 text-sm font-semibold transition border-b-2 -mb-px ${
              aba === t ? 'border-primary text-white' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'visao-geral' ? 'Visao Geral' : 'Ultimas vendas'}
          </button>
        ))}
      </div>

      {aba === 'visao-geral' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'RECEITA TOTAL', value: `R$ ${receitaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '💰' },
              { label: 'TOTAL DE CLIENTES', value: `${totalClientes}`, icon: '👥' },
              { label: 'TOTAL DE VENDAS', value: `${totalVendas}`, icon: '🛒' },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">{s.label}</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-base">
                    {s.icon}
                  </div>
                  <span className="text-xl font-bold text-white">{s.value}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Integracoes */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-1">Integracoes</h2>
            <p className="text-xs text-muted-foreground mb-5">Gerencie suas integracoes com gateways de pagamento</p>

            <div className="grid grid-cols-2 gap-4">
              {/* Card Hotmart */}
              <div className="bg-muted/30 border border-border rounded-xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center">
                    {hotmartIcon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Integracao Hotmart</p>
                    {conectada ? (
                      <span className="text-xs text-emerald-400">Conectada</span>
                    ) : (
                      <span className="text-xs text-amber-400">Nao configurada</span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{totalEventos}</span> eventos recebidos (ultimos 30 dias)
                </div>

                {/* Toggle instrucoes de instalacao */}
                <button
                  onClick={() => setInstrucaoAberta(!instrucaoAberta)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition pt-2 border-t border-border"
                >
                  Ver instrucoes de instalacao
                  {instrucaoAberta ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {instrucaoAberta && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-2">
                    <p className="font-semibold text-foreground">Como integrar com Hotmart:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Acesse sua conta no Hotmart</li>
                      <li>Va em <strong className="text-foreground">Ferramentas Webhooks</strong></li>
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

                {/* Formulario de credenciais */}
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
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary transition font-mono"
                      placeholder="Nzg2YzQw..."
                    />
                    <p className="text-[10px] text-muted-foreground/50 mt-1">Gerado pela Hotmart ao criar a credencial.</p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`w-4 h-4 ${conectada ? 'text-emerald-500' : 'text-muted-foreground/40'}`} />
                      <span className="text-xs text-muted-foreground">{conectada ? 'API configurada' : 'API nao configurada'}</span>
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

              {/* Card adicionar */}
              <button
                disabled
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed border-border/60 text-muted-foreground/50 cursor-not-allowed min-h-[160px]"
              >
                <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium">Adicionar Integracao</span>
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
              <p className="text-muted-foreground/50 text-xs mt-1">Configure a integracao Hotmart para comecar a receber dados.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
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
                    <td className="px-5 py-3 text-white max-w-[180px] truncate">{v.produto || '—'}</td>
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
          )}
        </div>
      )}
    </div>
  )
}
