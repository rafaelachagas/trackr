'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, X, Check, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { salvarContasAnuncio, desconectarContaMeta, salvarImpostoMeta, conectarMetaComToken } from '@/app/actions/meta'

type Conta = { id: string; name: string; account_status?: number; currency?: string }
type GastoMensal = { mes: string; total: number }

export default function ContasAnunciosPage() {
  const [loading, setLoading] = useState(true)
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [metaUserName, setMetaUserName] = useState('')
  const [adAccountIds, setAdAccountIds] = useState<string[]>([]) // IDs sem "act_"
  const [metaContas, setMetaContas] = useState<Conta[]>([])
  const [metaConectando, setMetaConectando] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [selecionadas, setSelecionadas] = useState<string[]>([]) // IDs sem "act_" temporário no modal
  const [salvando, setSalvando] = useState(false)
  const [sincronizandoHistorico, setSincronizandoHistorico] = useState(false)
  const [carregandoContas, setCarregandoContas] = useState(false)
  const [gastosMensais, setGastosMensais] = useState<GastoMensal[]>([])
  const [impostoPct, setImpostoPct] = useState('')
  const [salvandoImposto, setSalvandoImposto] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [tokenManual, setTokenManual] = useState('')
  const [conectandoManual, setConectandoManual] = useState(false)

  useEffect(() => { carregar(); carregarGastos() }, [])

  useEffect(() => {
    if (metaAccessToken && metaContas.length === 0) {
      fetch('/api/meta/accounts')
        .then(r => r.json())
        .then(j => { if (j.accounts) setMetaContas(j.accounts) })
        .catch(() => {})
    }
  }, [metaAccessToken])

  async function carregar() {
    setLoading(true)
    try {
      const { data: configs } = await supabase.from('configuracoes').select('*')
      if (configs) {
        configs.forEach(c => {
          if (c.chave === 'meta_access_token') setMetaAccessToken(c.valor || '')
          if (c.chave === 'meta_user_name') setMetaUserName(c.valor || '')
          if (c.chave === 'meta_ad_account_ids') {
            try { setAdAccountIds(JSON.parse(c.valor || '[]')) } catch { setAdAccountIds([]) }
          }
          if (c.chave === 'meta_imposto_pct' && c.valor) setImpostoPct(c.valor.replace('.', ','))
          // compatibilidade com campo antigo (single account)
          if (c.chave === 'meta_ad_account_id' && c.valor) {
            // será sobrescrito por meta_ad_account_ids se existir
          }
        })
        // fallback para campo legado
        const hasNew = configs.some(c => c.chave === 'meta_ad_account_ids')
        if (!hasNew) {
          const legado = configs.find(c => c.chave === 'meta_ad_account_id')
          if (legado?.valor) setAdAccountIds([legado.valor])
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function carregarGastos() {
    const res = await fetch('/api/meta/gastos-mensais', { cache: 'no-store' })
    const json = await res.json()
    if (json.gastos) setGastosMensais(json.gastos)
  }

  const conectarMeta = useCallback(() => {
    setMetaConectando(true)
    const popup = window.open('/api/auth/meta', 'meta_oauth', 'width=600,height=700,scrollbars=yes')

    const handler = (event: MessageEvent) => {
      // O callback do OAuth pode vir de outro domínio (ex.: *.vercel.app) quando o
      // site roda em domínio próprio (www.thetrack.com.br). Aceita o mesmo origin
      // OU o domínio do deploy — senão a mensagem de sucesso é ignorada e "não conecta".
      const ok = event.origin === window.location.origin || /\.vercel\.app$/.test(event.origin)
      if (!ok) return
      if (event.data?.type === 'meta_auth_success') {
        window.removeEventListener('message', handler)
        setMetaConectando(false)
        const contas: Conta[] = event.data.accounts ?? []
        const nome: string = event.data.userName ?? ''
        setMetaContas(contas)
        if (nome) setMetaUserName(nome)
        // Abre o modal de seleção automaticamente
        setSelecionadas(adAccountIds)
        setModalAberto(true)
        carregar()
      } else if (event.data?.type === 'meta_auth_error') {
        window.removeEventListener('message', handler)
        setMetaConectando(false)
        alert(`Erro ao conectar: ${event.data.error}`)
      }
    }

    window.addEventListener('message', handler)
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener('message', handler)
        setMetaConectando(false)
      }
    }, 1000)
  }, [adAccountIds])

  async function conectarComToken() {
    if (!tokenManual.trim()) { alert('Cole o token antes de conectar.'); return }
    setConectandoManual(true)
    try {
      const res = await conectarMetaComToken(tokenManual.trim())
      if (!res.success) { alert(`Não deu pra conectar: ${res.error}`); return }
      setMetaAccessToken(tokenManual.trim())
      if (res.userName) setMetaUserName(res.userName)
      setMetaContas((res.accounts ?? []) as Conta[])
      setTokenManual('')
      setManualOpen(false)
      setSelecionadas(adAccountIds)
      setModalAberto(true)   // abre a seleção de contas, igual ao fluxo do OAuth
      carregar()
    } finally {
      setConectandoManual(false)
    }
  }

  async function desconectarMeta() {
    if (!confirm('Deseja desconectar sua conta do Meta Ads?')) return
    const res = await desconectarContaMeta()
    if (!res.success) { alert(`Erro ao desconectar: ${res.error}`); return }
    setMetaAccessToken('')
    setMetaUserName('')
    setAdAccountIds([])
    setMetaContas([])
  }

  async function abrirModal() {
    setSelecionadas([...adAccountIds])
    setBusca('')
    setModalAberto(true)
    // Busca contas do Meta se ainda não tiver carregado
    if (metaContas.length === 0 && metaAccessToken) {
      setCarregandoContas(true)
      try {
        const res = await fetch('/api/meta/accounts')
        const json = await res.json()
        if (json.accounts) setMetaContas(json.accounts)
        else alert(`Erro ao buscar contas: ${json.error}\nCódigo: ${json.code ?? ''}\nTipo: ${json.type ?? ''}`)
      } catch (e: any) {
        alert(`Erro de rede: ${e.message}`)
      } finally {
        setCarregandoContas(false)
      }
    }
  }

  function toggleConta(id: string) {
    // id sem "act_"
    setSelecionadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function confirmarSelecao() {
    setSalvando(true)
    const res = await salvarContasAnuncio(selecionadas)
    setSalvando(false)
    if (!res.success) { alert(`Erro ao salvar contas: ${res.error}`); return }
    setAdAccountIds(res.contas ?? selecionadas)
    setModalAberto(false)
  }

  async function salvarImposto() {
    setSalvandoImposto(true)
    const res = await salvarImpostoMeta(impostoPct || '0')
    if (!res.success) {
      setSalvandoImposto(false)
      alert(`Erro ao salvar imposto: ${res.error}`)
      return
    }
    // O imposto entra no valor_gasto no momento do sync — re-sincroniza os
    // últimos 90 dias pra nova alíquota valer também no histórico.
    try {
      const r = await fetch('/api/meta/sync?dias=90', { method: 'POST' })
      const j = await r.json()
      if (j.success) {
        await carregarGastos()
        alert(`Imposto de ${res.pct}% salvo e aplicado aos últimos 90 dias (${j.total_registros} registros).`)
      } else {
        alert(`Imposto salvo, mas o re-sync falhou: ${j.error}. Use "Sincronizar 90 dias" pra aplicar.`)
      }
    } catch (e: any) {
      alert(`Imposto salvo, mas o re-sync falhou: ${e.message}. Use "Sincronizar 90 dias" pra aplicar.`)
    } finally {
      setSalvandoImposto(false)
    }
  }

  async function sincronizarHistorico() {
    if (!confirm('Isso vai limpar e re-sincronizar os últimos 90 dias de dados de gasto. Continuar?')) return
    setSincronizandoHistorico(true)
    try {
      const res = await fetch('/api/meta/sync?dias=90', { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        await carregarGastos()
        alert(`Histórico sincronizado! ${json.total_registros} registros atualizados.`)
      } else {
        alert(`Erro: ${json.error}`)
      }
    } catch (e: any) {
      alert(`Erro de rede: ${e.message}`)
    } finally {
      setSincronizandoHistorico(false)
    }
  }

  const contasFiltradas = metaContas.filter(c => {
    const q = busca.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.id.includes(q)
  })

  // Separa em "novas" (não selecionadas) e "já adicionadas"
  const contasNovas = contasFiltradas.filter(c => !selecionadas.includes(c.id.replace('act_', '')))
  const contasAdicionadas = contasFiltradas.filter(c => selecionadas.includes(c.id.replace('act_', '')))

  return (
    <div className="max-w-4xl mx-auto text-slate-200 pb-12">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Contas de Anúncios</h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie suas contas de publicidade</p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Tabs de plataforma */}
      <div className="flex gap-2 mb-6 bg-slate-800/40 border border-slate-700/50 rounded-xl p-1">
        <button className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-slate-700 text-white shadow transition">
          Meta Ads
        </button>
        <button disabled className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-600 cursor-not-allowed">
          Google Ads
        </button>
      </div>

      {/* Card Meta Ads */}
      <div className="bg-[#0f1623] border border-slate-800 rounded-2xl overflow-hidden mb-4">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Meta Ads</p>
              <p className="text-xs text-slate-500">Conecte e gerencie contas</p>
            </div>
          </div>

          {metaAccessToken ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-200">{metaUserName || 'Conectado'}</span>
              </div>
              <button
                onClick={conectarMeta}
                disabled={metaConectando}
                className="text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-full transition"
              >
                {metaConectando ? '...' : 'TROCAR'}
              </button>
              <button
                onClick={desconectarMeta}
                className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition ml-1"
              >
                Desconectar
              </button>
            </div>
          ) : (
            <button
              onClick={conectarMeta}
              disabled={metaConectando}
              className="flex items-center gap-2 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2 rounded-lg transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              {metaConectando ? 'Abrindo Facebook...' : 'Entrar com Facebook'}
            </button>
          )}
        </div>

        {/* Token manual (alternativa ao OAuth / usar token vitalício System User) */}
        <div className="px-6 py-3 border-b border-slate-800">
          <button onClick={() => setManualOpen(v => !v)} className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition">
            {manualOpen ? '▾' : '▸'} Usar token manual {metaAccessToken ? '(trocar)' : '(alternativa ao Facebook)'}
          </button>
          {manualOpen && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-slate-500">Cole aqui o token da Meta (System User vitalício, ou o token estendido do Graph Explorer). Ele valida, salva e lista suas contas.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={tokenManual}
                  onChange={(e) => setTokenManual(e.target.value)}
                  placeholder="Cole o token aqui"
                  className="flex-1 px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-slate-500"
                />
                <button
                  onClick={conectarComToken}
                  disabled={conectandoManual}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                >
                  {conectandoManual ? 'Validando...' : 'Conectar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Corpo do card */}
        <div className="px-6 py-5">
          {!metaAccessToken ? (
            <button
              onClick={conectarMeta}
              disabled={metaConectando}
              className="w-full py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 text-sm transition"
            >
              + Adicionar conta de anúncios
            </button>
          ) : (
            <div className="space-y-3">
              {/* Lista de contas já adicionadas */}
              {adAccountIds.length > 0 && (
                <div className="space-y-2">
                  {adAccountIds.map(id => {
                    const conta = metaContas.find(c => c.id.replace('act_', '') === id)
                    return (
                      <div key={id} className="relative flex items-center justify-between p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
                        {/* corner accents */}
                        <span className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary/60 rounded-tl-xl" />
                        <span className="pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary/60 rounded-br-xl" />
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                          <div>
                            {conta?.name && <p className="text-sm font-medium text-slate-200">{conta.name}</p>}
                            <p className="text-xs text-slate-500" translate="no">{id}{conta?.currency ? ` · ${conta.currency}` : ''}</p>
                          </div>
                        </div>
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-semibold">Ativa</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Botão selecionar contas */}
              <button
                onClick={abrirModal}
                className="w-full py-3 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <ChevronDown className="w-4 h-4" />
                {adAccountIds.length > 0 ? 'Selecionar ou atualizar contas' : 'Selecionar conta de anúncios'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Imposto sobre gastos em anúncios */}
      {metaAccessToken && (
        <div className="bg-[#0f1623] border border-slate-800 rounded-2xl overflow-hidden mb-4">
          <div className="px-6 py-4 border-b border-slate-800">
            <p className="text-sm font-semibold text-white">Imposto</p>
            <p className="text-xs text-slate-500 mt-0.5">Configure o imposto dos seus gastos com anúncios</p>
          </div>
          <div className="px-6 py-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Imposto sobre gastos em anúncios (Meta)</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alíquota (%)</label>
                <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 w-36 focus-within:border-primary transition">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={impostoPct}
                    onChange={e => setImpostoPct(e.target.value)}
                    placeholder="13,83"
                    className="bg-transparent text-sm text-white flex-1 min-w-0 outline-none"
                  />
                  <span className="text-xs text-slate-500">%</span>
                </div>
              </div>
              <button
                onClick={salvarImposto}
                disabled={salvandoImposto || sincronizandoHistorico}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition disabled:opacity-50"
              >
                {salvandoImposto && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {salvandoImposto ? 'Aplicando...' : 'Salvar e aplicar'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-3">
              Aplicado <span className="text-slate-300 font-medium">apenas às contas em BRL</span> — a conta em dólar (BMUS) fica de fora.
              O imposto <span className="text-slate-300 font-medium">não é somado ao gasto</span>: ele é calculado e salvo por dia, e aparece no card
              &quot;Imposto total&quot; da Visão Geral respeitando o filtro de período. Ao salvar, os últimos 90 dias são recalculados.
            </p>
          </div>
        </div>
      )}

      {/* Modal de seleção de contas */}
      {modalAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setModalAberto(false)}
        >
          <div
            className="bg-[#0f1623] border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white">Selecionar contas de anúncio</h2>
              <button onClick={() => setModalAberto(false)} className="text-slate-500 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Busca */}
            <div className="px-5 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <input
                  type="text"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou ID"
                  className="bg-transparent text-sm text-slate-200 placeholder-slate-500 flex-1 outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {carregandoContas && (
                <div className="flex items-center justify-center py-8 gap-2 text-sm text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Buscando contas...
                </div>
              )}
              {!carregandoContas && metaContas.length === 0 && (
                <p className="text-center text-sm text-slate-500 py-6">Nenhuma conta encontrada.<br />Reconecte sua conta do Facebook.</p>
              )}

              {contasAdicionadas.length > 0 && (
                <>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1">Já adicionadas</p>
                  {contasAdicionadas.map(c => {
                    const id = c.id.replace('act_', '')
                    return (
                      <ContaItem
                        key={c.id}
                        conta={c}
                        selecionada={true}
                        onToggle={() => toggleConta(id)}
                        label="REMOVER"
                      />
                    )
                  })}
                  {contasNovas.length > 0 && <div className="pt-2" />}
                </>
              )}

              {contasNovas.length > 0 && (
                <>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1">Novas contas</p>
                  {contasNovas.map(c => {
                    const id = c.id.replace('act_', '')
                    return (
                      <ContaItem
                        key={c.id}
                        conta={c}
                        selecionada={false}
                        onToggle={() => toggleConta(id)}
                        label="ADICIONAR"
                      />
                    )
                  })}
                </>
              )}
            </div>

            {/* Footer modal */}
            <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">{selecionadas.length} selecionada(s)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalAberto(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarSelecao}
                  disabled={salvando}
                  className="px-5 py-2 text-sm font-semibold bg-primary hover:bg-primary/90 text-white rounded-lg transition disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Confirmar seleção'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gasto Mensal */}
      {gastosMensais.length > 0 && (
        <div className="bg-[#0f1623] border border-slate-800 rounded-2xl overflow-hidden mt-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-sm font-semibold text-white">Gasto Mensal</span>
            </div>
            <button
              onClick={sincronizarHistorico}
              disabled={sincronizandoHistorico}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sincronizandoHistorico ? 'animate-spin' : ''}`} />
              {sincronizandoHistorico ? 'Sincronizando...' : 'Sincronizar 90 dias'}
            </button>
          </div>
          <div className="px-6 py-5">
            {/* Totais */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <p className="text-2xl font-black text-white">
                  {formatBRL(gastosMensais.reduce((s, g) => s + g.total, 0))}
                </p>
                <p className="text-xs text-slate-500 mt-1">Total {gastosMensais.length} {gastosMensais.length === 1 ? 'mês' : 'meses'}</p>
              </div>
              <div className="text-center border-x border-slate-800">
                <p className="text-2xl font-black text-primary">
                  {formatBRL(gastosMensais.reduce((s, g) => s + g.total, 0) / gastosMensais.length)}
                </p>
                <p className="text-xs text-slate-500 mt-1">Média mensal</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-400">Sem limites</p>
                <p className="text-xs text-slate-600 mt-1">no seu plano</p>
              </div>
            </div>
            {/* Barras por mês */}
            <p className="text-xs text-slate-500 font-medium mb-3">Gasto por mês</p>
            <div className="space-y-3">
              {(() => {
                const maxVal = Math.max(...gastosMensais.map(g => g.total))
                return gastosMensais.map(g => (
                  <div key={g.mes}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-400">{formatMes(g.mes)}</span>
                      <span className="text-slate-300 font-semibold">{formatBRL(g.total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${maxVal > 0 ? (g.total / maxVal) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function formatMes(mes: string) {
  const [ano, m] = mes.split('-')
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${nomes[parseInt(m) - 1]} de ${ano}`
}

function ContaItem({ conta, selecionada, onToggle, label }: {
  conta: Conta
  selecionada: boolean
  onToggle: () => void
  label: string
}) {
  const id = conta.id.replace('act_', '')
  return (
    <div className="flex items-center justify-between px-3 py-3 rounded-xl border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60 transition">
      <div>
        <p className="text-sm font-semibold text-slate-200">{conta.name}</p>
        <p className="text-xs text-slate-500" translate="no">{id}</p>
      </div>
      <button
        onClick={onToggle}
        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${
          selecionada
            ? 'text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20'
            : 'text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20'
        }`}
      >
        {selecionada ? (
          <span className="flex items-center gap-1"><Check className="w-3 h-3" /> {label}</span>
        ) : label}
      </button>
    </div>
  )
}
