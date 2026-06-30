'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, RefreshCw, Settings2, Eye, EyeOff, Link2, LogOut, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AcaoOtimizacao } from '@/types'

type RegraFramework = {
  p7: boolean
  p3: boolean
  p1: boolean
  acao: AcaoOtimizacao
}

const REGRAS_PADRAO: RegraFramework[] = [
  { p7: true,  p3: true,  p1: true,  acao: '+20% orçamento' },
  { p7: true,  p3: true,  p1: false, acao: 'Manter' },
  { p7: true,  p3: false, p1: true,  acao: '+20% orçamento' },
  { p7: true,  p3: false, p1: false, acao: '-20% ou pausar' },
  { p7: false, p3: true,  p1: true,  acao: '+20% orçamento' },
  { p7: false, p3: true,  p1: false, acao: 'Manter' },
  { p7: false, p3: false, p1: true,  acao: 'Manter' },
  { p7: false, p3: false, p1: false, acao: 'Pausar' },
]

const ACOES: AcaoOtimizacao[] = ['+20% orçamento', 'Manter', '-20% ou pausar', 'Pausar']

const COR_ACAO: Record<AcaoOtimizacao, string> = {
  '+20% orçamento': 'text-emerald-400',
  'Manter': 'text-yellow-400',
  '-20% ou pausar': 'text-orange-400',
  'Pausar': 'text-red-400',
}

type Plataforma = 'hotmart'

const PLATAFORMAS = [
  { id: 'hotmart' as Plataforma, label: 'Hotmart', cor: 'orange', letra: 'H' },
  // { id: 'kiwify', label: 'Kiwify', cor: 'violet', letra: 'K' },
  // { id: 'kirvano', label: 'Kirvano', cor: 'blue', letra: 'Ki' },
]

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plataformaSelecionada, setPlataformaSelecionada] = useState<Plataforma>('hotmart')

  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [roasMinimo, setRoasMinimo] = useState('1.0')
  const [syncing, setSyncing] = useState(false)
  const [diasSync, setDiasSync] = useState('7')
  const [showToken, setShowToken] = useState(false)
  const [metaConectando, setMetaConectando] = useState(false)
  const [metaContas, setMetaContas] = useState<{ id: string; name: string }[]>([])
  const [produtosFront, setProdutosFront] = useState('')
  const [produtosUpsell, setProdutosUpsell] = useState('')
  const [regras, setRegras] = useState<RegraFramework[]>(REGRAS_PADRAO)

  useEffect(() => {
    carregarConfiguracoes()
  }, [])

  async function carregarConfiguracoes() {
    setLoading(true)
    try {
      const { data: configs } = await supabase.from('configuracoes').select('*')
      if (configs) {
        configs.forEach(c => {
          if (c.chave === 'meta_access_token') setMetaAccessToken(c.valor || '')
          if (c.chave === 'meta_ad_account_id') setAdAccountId(c.valor || '')
          if (c.chave === 'roas_minimo') setRoasMinimo(c.valor || '1.0')
          if (c.chave === 'framework_regras') {
            try { setRegras(JSON.parse(c.valor)) } catch {}
          }
        })
      }

      const { data: prods } = await supabase.from('produtos_mapeamento').select('*')
      if (prods) {
        const fronts = prods.filter(p => p.tipo === 'front').map(p => p.nome_produto).join(', ')
        const upsells = prods.filter(p => p.tipo === 'upsell').map(p => p.nome_produto).join(', ')
        setProdutosFront(fronts)
        setProdutosUpsell(upsells)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function salvarConfiguracoes() {
    setSaving(true)
    try {
      const updates = [
        { chave: 'meta_access_token', valor: metaAccessToken },
        { chave: 'meta_ad_account_id', valor: adAccountId },
        { chave: 'roas_minimo', valor: roasMinimo },
        { chave: 'framework_regras', valor: JSON.stringify(regras) },
      ]

      for (const item of updates) {
        if (item.valor === '' || item.valor === null || item.valor === undefined) continue
        await supabase.from('configuracoes').upsert(
          { chave: item.chave, valor: item.valor, updated_at: new Date().toISOString() },
          { onConflict: 'chave' }
        )
      }

      alert('Configurações salvas com sucesso!')
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar =/')
    } finally {
      setSaving(false)
    }
  }

  async function sincronizarMeta() {
    setSyncing(true)
    try {
      const res = await fetch(`/api/meta/sync?dias=${diasSync}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro desconhecido')
      alert(`Sincronização concluída! ${json.total_registros} registros importados (${diasSync} dias).`)
    } catch (e: any) {
      alert(`Erro na sincronização: ${e.message}`)
    } finally {
      setSyncing(false)
    }
  }

  function atualizarAcaoRegra(index: number, acao: AcaoOtimizacao) {
    setRegras(prev => prev.map((r, i) => i === index ? { ...r, acao } : r))
  }

  function resetarRegras() {
    setRegras(REGRAS_PADRAO)
  }

  const conectarMetaOAuth = useCallback(() => {
    setMetaConectando(true)
    const popup = window.open('/api/auth/meta', 'meta_oauth', 'width=600,height=700,scrollbars=yes')

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'meta_auth_success') {
        window.removeEventListener('message', handler)
        setMetaConectando(false)
        const accounts: { id: string; name: string }[] = event.data.accounts ?? []
        setMetaContas(accounts)
        if (accounts.length === 1) {
          const id = accounts[0].id.replace('act_', '')
          setAdAccountId(id)
          alert(`Meta Ads conectado! Conta "${accounts[0].name}" selecionada automaticamente.`)
        } else if (accounts.length > 1) {
          // multiple accounts - user will pick from dropdown rendered below
        } else {
          alert('Meta Ads conectado! Token salvo. Insira o Ad Account ID manualmente.')
        }
        carregarConfiguracoes()
      } else if (event.data?.type === 'meta_auth_error') {
        window.removeEventListener('message', handler)
        setMetaConectando(false)
        alert(`Erro ao conectar: ${event.data.error}`)
      }
    }

    window.addEventListener('message', handler)

    // Remove listener se o popup for fechado sem retorno
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
    setMetaContas([])
  }

  return (
    <div className="max-w-5xl mx-auto text-slate-200 pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Integrações e Setup
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Conecte suas fontes de dados e configure o framework de decisão.
          </p>
        </div>
        <button
          onClick={salvarConfiguracoes}
          disabled={loading || saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition shadow-lg shadow-blue-500/20 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar Setup'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* META ADS */}
        <div className="bg-[#131b2f] border border-slate-800 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
              <span className="font-bold text-blue-500 text-lg">M</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Meta Ads</h2>
              <p className="text-xs text-slate-400">Custos e performance de campanha</p>
            </div>
          </div>

          <div className="space-y-4">

            {/* Botão de conexão OAuth */}
            {!metaAccessToken ? (
              <button
                onClick={conectarMetaOAuth}
                disabled={metaConectando}
                className="w-full flex items-center justify-center gap-2.5 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-xl transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                {metaConectando ? 'Abrindo Facebook...' : 'Conectar com Facebook'}
              </button>
            ) : (
              <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/25 rounded-xl">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-slate-200">Meta Ads conectado</span>
                </div>
                <button
                  onClick={desconectarMeta}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition px-2.5 py-1.5 bg-red-500/10 rounded-lg"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Desconectar
                </button>
              </div>
            )}

            {/* Seleção de conta quando há múltiplas */}
            {metaContas.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Selecione a conta de anúncios</label>
                <select
                  value={adAccountId}
                  onChange={e => setAdAccountId(e.target.value)}
                  className="w-full bg-[#0b1121] border border-blue-500 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none transition"
                >
                  <option value="">Selecione...</option>
                  {metaContas.map(c => (
                    <option key={c.id} value={c.id.replace('act_', '')}>{c.name} ({c.id})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Ad Account ID manual (fallback) */}
            {metaAccessToken && metaContas.length === 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Ad Account ID</label>
                <input
                  type="text"
                  value={adAccountId}
                  onChange={e => setAdAccountId(e.target.value)}
                  className="w-full bg-[#0b1121] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                  placeholder="1147900723247431"
                />
                <p className="text-[10px] text-slate-500 mt-1">Somente os números, sem "act_".</p>
              </div>
            )}

            {/* Token manual (avançado) */}
            {metaAccessToken && (
              <details className="group">
                <summary className="text-[10px] text-slate-600 cursor-pointer hover:text-slate-400 transition select-none">Avançado: ver/editar token manualmente</summary>
                <div className="mt-2">
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={metaAccessToken}
                      onChange={e => setMetaAccessToken(e.target.value)}
                      className="w-full bg-[#0b1121] border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                      placeholder="EAAl..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </details>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Período:</label>
              <select
                value={diasSync}
                onChange={e => setDiasSync(e.target.value)}
                className="flex-1 bg-[#0b1121] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
              >
                <option value="7">Últimos 7 dias</option>
                <option value="14">Últimos 14 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="60">Últimos 60 dias</option>
                <option value="90">Últimos 90 dias</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-800/30 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2">
                <Link2 className={`w-4 h-4 ${adAccountId ? 'text-blue-400' : 'text-slate-600'}`} />
                <span className="text-sm font-medium text-slate-300">{adAccountId ? `Conta: act_${adAccountId}` : 'Nenhuma conta selecionada'}</span>
              </div>
              <button
                onClick={sincronizarMeta}
                disabled={syncing || !metaAccessToken || !adAccountId}
                className="flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition px-3 py-1.5 bg-blue-500/10 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizando...' : 'Sincronizar Gastos'}
              </button>
            </div>
          </div>
        </div>

        {/* CONFIGURAÇÕES GERAIS */}
        <div className="bg-[#131b2f] border border-slate-800 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <span className="font-bold text-emerald-500 text-lg">🛠</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Configurações Gerais</h2>
              <p className="text-xs text-slate-400">Critérios e roteamento de análise</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Meta de ROAS Mínimo (breakeven)</label>
              <input
                type="number" step="0.1"
                value={roasMinimo}
                onChange={e => setRoasMinimo(e.target.value)}
                className="w-full bg-[#0b1121] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
              />
              <p className="text-[10px] text-slate-500 mt-1">ROAS abaixo deste valor é considerado negativo nas análises do framework.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Produtos Front (Separados por vírgula)</label>
              <input
                type="text"
                value={produtosFront}
                onChange={e => setProdutosFront(e.target.value)}
                className="w-full bg-[#0b1121] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[13px] text-white focus:outline-none focus:border-blue-500 transition"
                placeholder="Mentoria Alfa, Curso Beta"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Produtos Upsell (Separados por vírgula)</label>
              <input
                type="text"
                value={produtosUpsell}
                onChange={e => setProdutosUpsell(e.target.value)}
                className="w-full bg-[#0b1121] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-[13px] text-white focus:outline-none focus:border-blue-500 transition"
                placeholder="Mentoria VIP, Comunidade Gamma"
              />
            </div>
          </div>
        </div>

        {/* FRAMEWORK DE DECISÃO */}
        <div className="lg:col-span-2 bg-[#131b2f] border border-slate-800 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center border border-violet-500/30">
                <Settings2 className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Framework de Decisão</h2>
                <p className="text-xs text-slate-400">Defina qual ação tomar para cada combinação de ROAS nos períodos 7d / 3d / 1d</p>
              </div>
            </div>
            <button
              onClick={resetarRegras}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
            >
              Resetar padrão
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 pr-4">
                    ROAS 7 dias
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 pr-4">
                    ROAS 3 dias
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3 pr-4">
                    ROAS 1 dia
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider pb-3">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {regras.map((regra, i) => (
                  <tr key={i} className="group hover:bg-slate-800/20 transition-colors">
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${regra.p7 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'}`}>
                        {regra.p7 ? '✓ Positivo' : '✗ Negativo'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${regra.p3 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'}`}>
                        {regra.p3 ? '✓ Positivo' : '✗ Negativo'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${regra.p1 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'}`}>
                        {regra.p1 ? '✓ Positivo' : '✗ Negativo'}
                      </span>
                    </td>
                    <td className="py-3">
                      <select
                        value={regra.acao}
                        onChange={e => atualizarAcaoRegra(i, e.target.value as AcaoOtimizacao)}
                        className={`bg-[#0b1121] border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:border-violet-500 transition cursor-pointer ${COR_ACAO[regra.acao]}`}
                      >
                        {ACOES.map(a => (
                          <option key={a} value={a} className="text-white bg-[#131b2f]">{a}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-600 mt-4">
            Cada linha representa uma combinação possível de ROAS positivo/negativo nos últimos 7, 3 e 1 dia. A ação definida aqui será exibida no painel Framework.
          </p>
        </div>

      </div>
    </div>
  )
}
