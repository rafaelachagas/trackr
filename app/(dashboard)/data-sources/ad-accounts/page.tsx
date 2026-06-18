'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, LogOut, Link2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Plataforma = 'meta'

export default function ContasAnunciosPage() {
  const [plataforma, setPlataforma] = useState<Plataforma>('meta')
  const [loading, setLoading] = useState(true)
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [metaConectando, setMetaConectando] = useState(false)
  const [metaContas, setMetaContas] = useState<{ id: string; name: string }[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [diasSync, setDiasSync] = useState('7')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    try {
      const { data: configs } = await supabase.from('configuracoes').select('*')
      if (configs) {
        configs.forEach(c => {
          if (c.chave === 'meta_access_token') setMetaAccessToken(c.valor || '')
          if (c.chave === 'meta_ad_account_id') setAdAccountId(c.valor || '')
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const conectarMeta = useCallback(() => {
    setMetaConectando(true)
    const popup = window.open('/api/auth/meta', 'meta_oauth', 'width=600,height=700,scrollbars=yes')

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'meta_auth_success') {
        window.removeEventListener('message', handler)
        setMetaConectando(false)
        const contas: { id: string; name: string }[] = event.data.accounts ?? []
        setMetaContas(contas)
        if (contas.length === 1) {
          setAdAccountId(contas[0].id.replace('act_', ''))
        }
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
  }, [])

  async function desconectarMeta() {
    await supabase.from('configuracoes').upsert(
      { chave: 'meta_access_token', valor: '', updated_at: new Date().toISOString() },
      { onConflict: 'chave' }
    )
    setMetaAccessToken('')
    setAdAccountId('')
    setMetaContas([])
  }

  async function salvarConta() {
    if (!adAccountId) return
    setSalvando(true)
    await supabase.from('configuracoes').upsert(
      { chave: 'meta_ad_account_id', valor: adAccountId, updated_at: new Date().toISOString() },
      { onConflict: 'chave' }
    )
    setSalvando(false)
    alert('Conta salva com sucesso!')
  }

  async function sincronizarGastos() {
    setSincronizando(true)
    try {
      const res = await fetch(`/api/meta/sync?dias=${diasSync}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro desconhecido')
      alert(`Sincronização concluída! ${json.total_registros} registros importados (últimos ${diasSync} dias).`)
    } catch (e: any) {
      alert(`Erro na sincronização: ${e.message}`)
    } finally {
      setSincronizando(false)
    }
  }

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
        <button
          onClick={() => setPlataforma('meta')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
            plataforma === 'meta' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Meta Ads
        </button>
        <button
          disabled
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-600 cursor-not-allowed"
        >
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
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
              </span>
              <button
                onClick={desconectarMeta}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition"
              >
                <LogOut className="w-3.5 h-3.5" />
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

        {/* Conta selecionada / adicionar conta */}
        <div className="px-6 py-5">
          {!metaAccessToken ? (
            <button
              onClick={conectarMeta}
              disabled={metaConectando}
              className="w-full py-3 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 text-sm transition"
            >
              + Adicionar conta de anúncios
            </button>
          ) : metaContas.length > 1 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Selecione a conta de anúncios</p>
              <select
                value={adAccountId}
                onChange={e => setAdAccountId(e.target.value)}
                className="w-full bg-[#0b1121] border border-blue-500 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none transition"
              >
                <option value="">Selecione...</option>
                {metaContas.map(c => (
                  <option key={c.id} value={c.id.replace('act_', '')}>{c.name} — {c.id}</option>
                ))}
              </select>
              {adAccountId && (
                <button
                  onClick={salvarConta}
                  disabled={salvando}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar conta'}
                </button>
              )}
            </div>
          ) : adAccountId ? (
            <div className="flex items-center justify-between p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2.5">
                <Link2 className="w-4 h-4 text-blue-400" />
                {/* translate="no" evita o Chrome traduzir "act_" para "ato_" */}
                <span className="text-sm font-medium text-slate-200" translate="no">
                  act_{adAccountId}
                </span>
              </div>
              <span className="text-xs text-slate-500">Conta ativa</span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ID da Conta de Anúncios</p>
              <input
                type="text"
                value={adAccountId}
                onChange={e => setAdAccountId(e.target.value)}
                className="w-full bg-[#0b1121] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                placeholder="1147900723247431"
              />
              <p className="text-[10px] text-slate-500">Somente os números, sem "act_".</p>
              <button
                onClick={salvarConta}
                disabled={salvando || !adAccountId}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar conta'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card Sincronização */}
      {metaAccessToken && adAccountId && (
        <div className="bg-[#0f1623] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-800">
            <RefreshCw className="w-4 h-4 text-slate-400" />
            <div>
              <span className="text-sm font-semibold text-white">Sincronizar Gastos</span>
              <p className="text-xs text-slate-500 mt-0.5">Importa os dados de custo do Meta Ads para o painel</p>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="flex items-center gap-3">
              <select
                value={diasSync}
                onChange={e => setDiasSync(e.target.value)}
                className="flex-1 bg-[#0b1121] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
              >
                <option value="7">Últimos 7 dias</option>
                <option value="14">Últimos 14 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="60">Últimos 60 dias</option>
                <option value="90">Últimos 90 dias</option>
              </select>
              <button
                onClick={sincronizarGastos}
                disabled={sincronizando}
                className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition px-5 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
                {sincronizando ? 'Sincronizando...' : 'Sincronizar gastos'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
