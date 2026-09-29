'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'
import { formatarMoeda } from '@/lib/utils'
import { Pencil, RefreshCw, History, ChevronDown, AlertTriangle, X, Check, Archive, FolderOpen, LayoutGrid, RectangleVertical, CircleCheck, Info } from 'lucide-react'
import FacebookIcon from '@/components/ui/FacebookIcon'
import SeletorPeriodoVturb, { rangeDoPreset, type RangePeriodo } from '@/components/ui/SeletorPeriodoVturb'
import type { LinhaMeta, LogCampanha, Nivel } from '@/lib/meta-campanhas'

type FiltroStatus = 'qualquer' | 'ativas' | 'pausadas' | 'com_gasto'
type SortKey = 'nome' | 'orcamento' | 'atualizado' | 'vendas' | 'upsells' | 'cpa' | 'gasto' | 'receita' | 'lucro' | 'roas' | 'margem' | 'roi' | 'ic' | 'cpi' | 'cpc' | 'ctr'
type Dados = { linhas: LinhaMeta[]; semCampanha: { vendas: number; receita: number }; produtos: string[]; atualizado_em: string; log: LogCampanha[] }
type NivelSel = 'conta' | 'campanha' | 'conjunto'

const ABAS: { nivel: Nivel; label: string; singular: string; plural: string; de: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { nivel: 'conta', label: 'Contas', singular: 'Conta', plural: 'contas', de: 'da Conta', icon: Archive },
  { nivel: 'campanha', label: 'Campanhas', singular: 'Campanha', plural: 'campanhas', de: 'da Campanha', icon: FolderOpen },
  { nivel: 'conjunto', label: 'Conjuntos', singular: 'Conjunto', plural: 'conjuntos', de: 'do Conjunto', icon: LayoutGrid },
  { nivel: 'anuncio', label: 'Anúncios', singular: 'Anúncio', plural: 'anúncios', de: 'do Anúncio', icon: RectangleVertical },
]

// Mudança pendente de confirmação (toggle ou orçamento).
type Pendente =
  | { tipo: 'status'; l: LinhaMeta; para: 'ACTIVE' | 'PAUSED' }
  | { tipo: 'orcamento'; l: LinhaMeta; para: number }

// —— Métricas derivadas ——
const lucro = (l: LinhaMeta) => l.receita - l.gasto
const roas = (l: LinhaMeta) => (l.gasto > 0 ? l.receita / l.gasto : null)
const cpa = (l: LinhaMeta) => (l.vendas > 0 ? l.gasto / l.vendas : null)
const margem = (l: LinhaMeta) => (l.receita > 0 ? (lucro(l) / l.receita) * 100 : null)
const roi = (l: LinhaMeta) => (l.gasto > 0 ? (lucro(l) / l.gasto) * 100 : null)
const cpi = (l: LinhaMeta) => (l.ic > 0 ? l.gasto / l.ic : null)
const cpc = (l: LinhaMeta) => (l.cliques > 0 ? l.gasto / l.cliques : null)
const ctr = (l: LinhaMeta) => (l.impressoes > 0 ? (l.cliques / l.impressoes) * 100 : null)

const fmtMoedaConta = (v: number, moeda: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(v)
const pctFmt = (v: number | null) => (v == null ? 'N/A' : `${v.toFixed(2).replace('.', ',')}%`)

function tempoRelativo(iso: string | null, agora: number): string {
  if (!iso) return 'N/A'
  const s = Math.max(0, (agora - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora mesmo'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'há 1 dia' : `há ${d} dias`
}

export default function MetaPage() {
  const { isPrivate } = useDashboard()
  const [aba, setAba] = useState<Nivel>('campanha')
  const [range, setRange] = useState<RangePeriodo>(() => rangeDoPreset('Hoje'))
  const [produto, setProduto] = useState('')
  const [cache, setCache] = useState<Record<string, Dados>>({})
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('ativas')
  const [conta, setConta] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('gasto')
  const [sortDesc, setSortDesc] = useState(true)
  // Marcar linhas numa aba filtra as abas de baixo (como na Utmify).
  const [sel, setSel] = useState<Record<NivelSel, Set<string>>>({ conta: new Set(), campanha: new Set(), conjunto: new Set() })

  const [editando, setEditando] = useState<string | null>(null)
  const [valorEdit, setValorEdit] = useState('')
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null)
  const [verLog, setVerLog] = useState(false)

  const chaveCache = `${aba}|${range.ini}|${range.fim}|${produto}`
  const dados = cache[chaveCache]

  const buscar = useCallback((chave: string, nivel: Nivel, r: RangePeriodo, prod: string) => {
    setLoading(true)
    setErro(null)
    const params = new URLSearchParams({ nivel, d_inicio: r.ini, d_fim: r.fim })
    if (prod) params.set('produto', prod)
    fetch(`/api/campanhas?${params}`, { cache: 'no-store' })
      .then(async (res) => {
        const j = await res.json().catch(() => ({ error: 'Resposta inválida do servidor' }))
        if (!res.ok) throw new Error(j.error || `Erro ${res.status}`)
        setCache((c) => ({ ...c, [chave]: j }))
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Cada aba/período/produto é buscado uma vez e fica em cache até "Atualizar".
  useEffect(() => {
    if (!range.ini || !range.fim || cache[chaveCache]) return
    buscar(chaveCache, aba, range, produto)
  }, [chaveCache, aba, range, produto, cache, buscar])

  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(t) }, [])

  function atualizar() {
    // As outras abas ficam velhas também: limpa o cache e recarrega a atual.
    setCache({})
    buscar(chaveCache, aba, range, produto)
  }

  const linhas = useMemo(() => dados?.linhas ?? [], [dados])
  const contas = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of linhas) m.set(l.conta_id, l.conta_nome)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [linhas])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = linhas.filter((l) => {
      if (conta && l.conta_id !== conta) return false
      if (sel.conta.size && aba !== 'conta' && !sel.conta.has(l.conta_id)) return false
      if (sel.campanha.size && (aba === 'conjunto' || aba === 'anuncio') && !sel.campanha.has(l.campanha_id ?? '')) return false
      if (sel.conjunto.size && aba === 'anuncio' && !sel.conjunto.has(l.conjunto_id ?? '')) return false
      if (q && !l.nome.toLowerCase().includes(q)) return false
      if (filtroStatus === 'ativas') return l.status === 'ACTIVE'
      if (filtroStatus === 'pausadas') return l.status !== 'ACTIVE'
      if (filtroStatus === 'com_gasto') return l.gasto >= 0.01 || l.receita > 0
      return true
    })
    const val = (l: LinhaMeta): number | string => {
      switch (sortKey) {
        case 'nome': return l.nome.toLowerCase()
        case 'orcamento': return l.orcamento ?? -1
        case 'atualizado': return l.atualizado_em ? new Date(l.atualizado_em).getTime() : 0
        case 'cpa': return cpa(l) ?? Infinity
        case 'cpi': return cpi(l) ?? Infinity
        case 'cpc': return cpc(l) ?? Infinity
        case 'lucro': return lucro(l)
        case 'roas': return roas(l) ?? -1
        case 'margem': return margem(l) ?? -Infinity
        case 'roi': return roi(l) ?? -Infinity
        case 'ctr': return ctr(l) ?? -1
        default: return l[sortKey]
      }
    }
    return [...lista].sort((a, b) => {
      const va = val(a), vb = val(b)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDesc ? -cmp : cmp
    })
  }, [linhas, busca, filtroStatus, conta, sortKey, sortDesc, sel, aba])

  // Total como uma "linha" pra reusar as mesmas fórmulas.
  const total: LinhaMeta = useMemo(() => {
    const t = { gasto: 0, impressoes: 0, cliques: 0, ic: 0, vendas: 0, upsells: 0, receita: 0, receita_upsell: 0, orcamento: 0 }
    for (const l of visiveis) {
      t.gasto += l.gasto; t.impressoes += l.impressoes; t.cliques += l.cliques; t.ic += l.ic
      t.vendas += l.vendas; t.upsells += l.upsells; t.receita += l.receita; t.receita_upsell += l.receita_upsell
      if (l.orcamento_tipo === 'diario' && l.moeda === 'BRL' && l.status === 'ACTIVE') t.orcamento += l.orcamento ?? 0
    }
    return {
      id: 'total', nivel: aba, nome: '', conta_id: '', conta_nome: '', moeda: 'BRL', campanha_id: null, campanha_nome: null,
      conjunto_id: null, conjunto_nome: null, fase: null, status: '', status_efetivo: '', orcamento_tipo: 'diario', atualizado_em: null, ...t,
    }
  }, [visiveis, aba])

  function ordenar(k: SortKey) {
    if (k === sortKey) setSortDesc((d) => !d)
    else { setSortKey(k); setSortDesc(!['nome', 'cpa', 'cpi', 'cpc'].includes(k)) }
  }

  const selecionaveis = aba !== 'anuncio'
  function alternarSel(l: LinhaMeta) {
    if (!selecionaveis) return
    const n = aba as NivelSel
    setSel((s) => {
      const novo = new Set(s[n])
      if (novo.has(l.id)) novo.delete(l.id); else novo.add(l.id)
      return { ...s, [n]: novo }
    })
  }
  const todosMarcados = selecionaveis && visiveis.length > 0 && visiveis.every((l) => sel[aba as NivelSel].has(l.id))
  function alternarTodos() {
    if (!selecionaveis) return
    const n = aba as NivelSel
    setSel((s) => ({ ...s, [n]: todosMarcados ? new Set<string>() : new Set(visiveis.map((l) => l.id)) }))
  }

  function abrirEdicao(l: LinhaMeta) {
    setEditando(l.id)
    setValorEdit(l.orcamento != null ? String(l.orcamento).replace('.', ',') : '')
  }

  function pedirOrcamento(l: LinhaMeta) {
    const v = parseFloat(valorEdit.replace(/\./g, '').replace(',', '.'))
    if (!(v > 0)) { setAviso({ ok: false, msg: 'Digite um orçamento válido.' }); return }
    if (l.orcamento != null && Math.abs(v - l.orcamento) < 0.005) { setEditando(null); return }
    setPendente({ tipo: 'orcamento', l, para: Math.round(v * 100) / 100 })
  }

  async function confirmar() {
    if (!pendente) return
    setSalvando(true)
    const { l } = pendente
    const body = pendente.tipo === 'status'
      ? { acao: 'status', nivel: l.nivel, status: pendente.para }
      : { acao: 'orcamento', nivel: l.nivel, valor: pendente.para }
    try {
      const r = await fetch(`/api/campanhas/${l.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      const agoraIso = new Date().toISOString()
      setCache((c) => {
        const d = c[chaveCache]
        if (!d) return c
        const linhasNovas = d.linhas.map((x) => x.id !== l.id ? x
          : pendente.tipo === 'status' ? { ...x, status: pendente.para, status_efetivo: pendente.para, atualizado_em: agoraIso }
          : { ...x, orcamento: pendente.para, atualizado_em: agoraIso })
        // Só a aba atual fica: pausar um pai muda o status efetivo dos filhos nas outras.
        return { [chaveCache]: { ...d, linhas: linhasNovas, log: j.log ? [j.log, ...d.log] : d.log } }
      })
      setAviso({ ok: true, msg: pendente.tipo === 'status'
        ? `${pendente.para === 'ACTIVE' ? 'Ativado' : 'Pausado'}: ${l.nome}`
        : `Orçamento atualizado: ${l.nome} → ${fmtMoedaConta(pendente.para, l.moeda)}` })
      setEditando(null)
    } catch (e) {
      setAviso({ ok: false, msg: `A Meta recusou: ${e instanceof Error ? e.message : e}` })
    } finally {
      setSalvando(false)
      setPendente(null)
    }
  }

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  const priv = (n: React.ReactNode) => (isPrivate ? '••' : n)
  const brl = (v: number | null) => (v == null ? 'N/A' : priv(formatarMoeda(v)))
  const roasFmt = (r: number | null) => (r == null ? 'N/A' : `${r.toFixed(2)}x`)
  const corRoas = (r: number | null) => r == null ? 'text-muted-foreground' : r >= 2 ? 'text-emerald-400' : r >= 1 ? 'text-amber-300' : 'text-rose-400'
  const corSinal = (v: number | null) => v == null ? 'text-muted-foreground' : v >= 0 ? 'text-emerald-400' : 'text-rose-400'

  const abaInfo = ABAS.find((a) => a.nivel === aba)!
  const semCampanha = dados?.semCampanha ?? { vendas: 0, receita: 0 }
  const log = dados?.log ?? []
  const totalSel = sel.conta.size + sel.campanha.size + sel.conjunto.size

  return (
    <div className="pt-9 pb-12 space-y-5 max-w-[1600px] mx-auto w-full text-foreground px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <FacebookIcon className="w-5 h-5 text-primary" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Meta</h1>
      </div>

      <div className="rounded-2xl overflow-hidden bg-card border border-border">
        {/* Abas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-background/40 border-b border-border">
          {ABAS.map(({ nivel, label, icon: Icon }) => {
            const ativa = aba === nivel
            const marcados = nivel !== 'anuncio' ? sel[nivel].size : 0
            return (
              <button key={nivel} onClick={() => { setAba(nivel); setEditando(null) }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition border-b-2 ${ativa ? 'bg-card text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-accent/40'}`}>
                <Icon className="w-4 h-4" /> {label}
                {marcados > 0 && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">{marcados} selec.</span>}
              </button>
            )
          })}
        </div>

        {/* Barra de ações */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-border">
          {semCampanha.vendas === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CircleCheck className="w-3.5 h-3.5" /> Todas as vendas trackeadas
            </span>
          ) : (
            <span title="Vendas de anúncio cujo sck não bate com nenhuma campanha"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5" /> {priv(semCampanha.vendas)} venda(s) sem campanha · {brl(semCampanha.receita)}
            </span>
          )}
          {totalSel > 0 && (
            <button onClick={() => setSel({ conta: new Set(), campanha: new Set(), conjunto: new Set() })}
              className="text-[11px] text-muted-foreground hover:text-foreground underline">limpar seleção</button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Atualizado {dados ? tempoRelativo(dados.atualizado_em, agora) : '…'}</span>
            <button onClick={atualizar} disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-60">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 px-5 py-4 border-b border-border">
          <label>
            <span className="block text-[11px] text-muted-foreground mb-1">Nome {abaInfo.de}</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm outline-none focus:border-primary" />
          </label>
          <Select label={`Status ${abaInfo.de}`} value={filtroStatus} onChange={(v) => setFiltroStatus(v as FiltroStatus)}
            opcoes={[['qualquer', 'Qualquer'], ['ativas', 'Ativos'], ['pausadas', 'Pausados'], ['com_gasto', 'Com gasto no período']]} />
          <div>
            <span className="block text-[11px] text-muted-foreground mb-1">Período de Visualização</span>
            <SeletorPeriodoVturb range={range} onChange={setRange} />
          </div>
          <Select label="Conta de Anúncio" value={conta} onChange={setConta}
            opcoes={[['', 'Qualquer'], ...contas.map(([id, nome]) => [id, nome] as [string, string])]} />
          <Select label="Produto" value={produto} onChange={setProduto}
            opcoes={[['', 'Qualquer'], ...(dados?.produtos ?? []).map((p) => [p, p] as [string, string])]} />
        </div>

        {erro ? (
          <div className="flex items-center gap-2 text-rose-400 text-sm px-5 py-10 justify-center"><AlertTriangle className="w-4 h-4" /> {erro}</div>
        ) : !dados ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[1900px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-background/40">
                  <th className="px-3 py-3 w-[36px]">
                    {selecionaveis && <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} className="accent-[#2E90FA]" />}
                  </th>
                  <th className="text-left px-3 py-3 w-[70px]">Status</th>
                  <Th k="nome" s={[sortKey, sortDesc]} on={ordenar} left>{abaInfo.singular}</Th>
                  <Th k="orcamento" s={[sortKey, sortDesc]} on={ordenar}>Orçamento</Th>
                  <Th k="atualizado" s={[sortKey, sortDesc]} on={ordenar} dica="Última alteração feita na Meta (status, orçamento, edição)">Últ. atualização</Th>
                  <Th k="vendas" s={[sortKey, sortDesc]} on={ordenar} dica="Vendas front aprovadas">Vendas</Th>
                  <Th k="upsells" s={[sortKey, sortDesc]} on={ordenar} dica="Upsells aprovados (herdam o anúncio do front pelo e-mail)">Upsell</Th>
                  <Th k="cpa" s={[sortKey, sortDesc]} on={ordenar} dica="Gastos ÷ vendas front">CPA</Th>
                  <Th k="gasto" s={[sortKey, sortDesc]} on={ordenar}>Gastos</Th>
                  <Th k="receita" s={[sortKey, sortDesc]} on={ordenar} dica="Líquido, front + upsell, só vendas aprovadas">Faturamento</Th>
                  <Th k="lucro" s={[sortKey, sortDesc]} on={ordenar} dica="Faturamento − gastos">Lucro</Th>
                  <Th k="roas" s={[sortKey, sortDesc]} on={ordenar} dica="Faturamento ÷ gastos">ROAS</Th>
                  <Th k="margem" s={[sortKey, sortDesc]} on={ordenar} dica="Lucro ÷ faturamento">Margem</Th>
                  <Th k="roi" s={[sortKey, sortDesc]} on={ordenar} dica="Lucro ÷ gastos">ROI</Th>
                  <Th k="ic" s={[sortKey, sortDesc]} on={ordenar} dica="Initiate checkout (pixel)">IC</Th>
                  <Th k="cpi" s={[sortKey, sortDesc]} on={ordenar} dica="Custo por initiate checkout">CPI</Th>
                  <Th k="cpc" s={[sortKey, sortDesc]} on={ordenar} dica="Custo por clique no link">CPC</Th>
                  <Th k="ctr" s={[sortKey, sortDesc]} on={ordenar} dica="Cliques no link ÷ impressões">CTR</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && (
                  <tr><td colSpan={18} className="text-center py-16 text-muted-foreground text-sm">Nada com esses filtros.</td></tr>
                )}
                {visiveis.map((l) => {
                  const r = roas(l)
                  const ligado = l.status === 'ACTIVE'
                  const efetivoDiferente = ligado && l.status_efetivo !== 'ACTIVE'
                  const marcado = selecionaveis && sel[aba as NivelSel].has(l.id)
                  const temNumero = l.gasto > 0 || l.receita > 0
                  return (
                    <tr key={l.id} className={`border-t border-border hover:bg-accent/20 align-middle ${marcado ? 'bg-primary/5' : ''}`}>
                      <td className="px-3 py-3 text-center">
                        {selecionaveis && <input type="checkbox" checked={marcado} onChange={() => alternarSel(l)} className="accent-[#2E90FA]" />}
                      </td>
                      <td className="px-3 py-3">
                        {aba === 'conta' ? (
                          <span className={`text-[11px] font-semibold ${ligado ? 'text-emerald-400' : 'text-rose-400'}`}>{ligado ? 'Ativa' : 'Desativada'}</span>
                        ) : (
                          <Toggle ligado={ligado} onClick={() => setPendente({ tipo: 'status', l, para: ligado ? 'PAUSED' : 'ACTIVE' })} />
                        )}
                      </td>
                      <td className="px-3 py-3 max-w-[340px]">
                        <div className="font-semibold break-words leading-snug">{l.nome}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 break-words">
                          {aba === 'anuncio' && l.conjunto_nome ? `${l.conjunto_nome} · ` : ''}
                          {aba === 'conjunto' && l.campanha_nome ? `${l.campanha_nome} · ` : ''}
                          {aba !== 'conta' && l.conta_nome}{l.moeda !== 'BRL' ? ` · ${l.moeda}` : ''}
                          {efetivoDiferente && <span className="ml-2 text-amber-300">{l.status_efetivo.replace(/_/g, ' ').toLowerCase()}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Orcamento l={l} editando={editando === l.id} valor={valorEdit} setValor={setValorEdit}
                          onAbrir={() => abrirEdicao(l)} onSalvar={() => pedirOrcamento(l)} onCancelar={() => setEditando(null)} priv={priv} />
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground whitespace-nowrap" title={l.atualizado_em ? new Date(l.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''}>
                        {tempoRelativo(l.atualizado_em, agora)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{priv(l.vendas)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {l.upsells > 0 ? (
                          <>
                            <div className="text-cyan-400 font-semibold leading-tight">{priv(l.upsells)}{l.vendas > 0 && <span className="text-[10px] text-muted-foreground font-normal"> · {((l.upsells / l.vendas) * 100).toFixed(0)}%</span>}</div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{brl(l.receita_upsell)}</div>
                          </>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl(cpa(l))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl(l.gasto)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl(l.receita)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums font-semibold ${temNumero ? corSinal(lucro(l)) : 'text-muted-foreground'}`}>{temNumero ? brl(lucro(l)) : 'N/A'}</td>
                      <td className={`px-3 py-3 text-right tabular-nums font-bold ${corRoas(r)}`}>{roasFmt(r)}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${corSinal(margem(l))}`}>{priv(pctFmt(margem(l)))}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${corSinal(roi(l))}`}>{priv(pctFmt(roi(l)))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{priv(l.ic)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl(cpi(l))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl(cpc(l))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{pctFmt(ctr(l))}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-background/40 font-bold text-[12px]">
                  <td className="px-3 py-3 text-muted-foreground text-center">N/A</td>
                  <td className="px-3 py-3 text-muted-foreground">N/A</td>
                  <td className="px-3 py-3 uppercase tracking-wider">{visiveis.length} {abaInfo.plural}</td>
                  <td className="px-3 py-3 text-right tabular-nums" title="Soma dos orçamentos diários ativos em BRL">{total.orcamento ? brl(total.orcamento) : 'N/A'}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground">N/A</td>
                  <td className="px-3 py-3 text-right tabular-nums">{priv(total.vendas)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-cyan-400">{priv(total.upsells)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{brl(cpa(total))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{brl(total.gasto)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{brl(total.receita)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${corSinal(lucro(total))}`}>{brl(lucro(total))}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${corRoas(roas(total))}`}>{roasFmt(roas(total))}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${corSinal(margem(total))}`}>{priv(pctFmt(margem(total)))}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${corSinal(roi(total))}`}>{priv(pctFmt(roi(total)))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{priv(total.ic)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{brl(cpi(total))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{brl(cpc(total))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{pctFmt(ctr(total))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {(aba === 'conjunto' || aba === 'anuncio') && dados && (
          <div className="px-5 py-2.5 border-t border-border text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-px shrink-0" />
            Aqui aparecem os {abaInfo.plural} rodando e os pausados que gastaram no período. Venda de campanha que não gastou no período (ex.: upsell de um front de outro dia) conta só nas abas Campanhas e Contas.
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card border border-border">
        <button onClick={() => setVerLog((v) => !v)} className="w-full flex items-center justify-between px-5 py-3">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <History className="w-4 h-4" /> Histórico de alterações ({log.length})
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition ${verLog ? 'rotate-180' : ''}`} />
        </button>
        {verLog && (
          <div className="border-t border-border divide-y divide-border">
            {log.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground">Nenhuma alteração feita pelo painel ainda.</div>
            ) : log.map((x, i) => (
              <div key={i} className="px-5 py-2.5 text-sm flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-muted-foreground tabular-nums">{new Date(x.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                {x.nivel && x.nivel !== 'campanha' && <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center">{x.nivel}</span>}
                <span className="font-semibold break-words">{x.campanha}</span>
                <span className="text-muted-foreground">
                  {x.acao === 'status'
                    ? (x.para === 'ACTIVE' ? 'ativou' : 'pausou')
                    : `orçamento ${typeof x.de === 'number' ? formatarMoeda(x.de) : '—'} → ${formatarMoeda(Number(x.para))}`}
                  {x.por ? ` · ${x.por}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendente && (
        <Confirmacao pendente={pendente} salvando={salvando} onCancelar={() => setPendente(null)} onConfirmar={confirmar} />
      )}

      {aviso && (
        <div className={`fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl border shadow-xl text-sm ${aviso.ok ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' : 'bg-rose-950/90 border-rose-500/40 text-rose-200'}`}>
          {aviso.msg}
        </div>
      )}
    </div>
  )
}

function Orcamento({ l, editando, valor, setValor, onAbrir, onSalvar, onCancelar, priv }: {
  l: LinhaMeta; editando: boolean; valor: string; setValor: (v: string) => void
  onAbrir: () => void; onSalvar: () => void; onCancelar: () => void; priv: (n: React.ReactNode) => React.ReactNode
}) {
  if (l.nivel === 'conta' || l.nivel === 'anuncio' || l.orcamento_tipo == null) return <span className="text-muted-foreground">N/A</span>
  if (l.orcamento_tipo === 'conjuntos') return <span className="text-[11px] text-muted-foreground" title="Orçamento nos conjuntos (ABO) — edite na aba Conjuntos">nos conjuntos</span>
  if (l.orcamento_tipo === 'campanha') return <span className="text-[11px] text-muted-foreground" title="Orçamento na campanha (CBO) — edite na aba Campanhas">na campanha</span>
  if (editando) {
    const base = l.orcamento ?? 0
    const ajustar = (f: number) => setValor(String(Math.round(base * f * 100) / 100).replace('.', ','))
    return (
      <div className="flex items-center justify-end gap-1">
        <button onClick={() => ajustar(0.8)} className="text-[10px] font-bold px-1.5 py-1 rounded border border-border hover:bg-accent/60">−20%</button>
        <input autoFocus value={valor} onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSalvar(); if (e.key === 'Escape') onCancelar() }}
          className="w-24 px-2 py-1 rounded-md bg-background border border-primary text-right text-sm tabular-nums outline-none" />
        <button onClick={() => ajustar(1.2)} className="text-[10px] font-bold px-1.5 py-1 rounded border border-border hover:bg-accent/60">+20%</button>
        <button onClick={onSalvar} className="p-1 rounded text-emerald-400 hover:bg-accent/60" title="Salvar"><Check className="w-4 h-4" /></button>
        <button onClick={onCancelar} className="p-1 rounded text-muted-foreground hover:bg-accent/60" title="Cancelar"><X className="w-4 h-4" /></button>
      </div>
    )
  }
  return (
    <button onClick={onAbrir} className="group inline-flex items-center gap-1.5 justify-end">
      <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-40 group-hover:opacity-100 transition" />
      <span className="text-left">
        <span className="block tabular-nums font-semibold">{l.orcamento != null ? priv(fmtMoedaConta(l.orcamento, l.moeda)) : 'N/A'}</span>
        <span className="block text-[10px] text-muted-foreground text-right">{l.orcamento_tipo === 'diario' ? 'Diário' : 'Vitalício'}</span>
      </span>
    </button>
  )
}

function Confirmacao({ pendente, salvando, onCancelar, onConfirmar }: { pendente: Pendente; salvando: boolean; onCancelar: () => void; onConfirmar: () => void }) {
  const { l } = pendente
  const oQue = l.nivel === 'anuncio' ? 'anúncio' : l.nivel === 'conjunto' ? 'conjunto' : 'campanha'
  const fem = l.nivel === 'campanha'
  let titulo: string
  let detalhe: React.ReactNode
  let alerta: string | null = null
  if (pendente.tipo === 'status') {
    const pausar = pendente.para === 'PAUSED'
    titulo = `${pausar ? 'Pausar' : 'Ativar'} ${oQue}?`
    detalhe = <>{fem ? 'A' : 'O'} {oQue} vai ser <b>{pausar ? (fem ? 'pausada' : 'pausado') : (fem ? 'ativada' : 'ativado')}</b> na Meta agora.</>
  } else {
    const de = l.orcamento ?? 0
    const varPct = de > 0 ? ((pendente.para - de) / de) * 100 : null
    titulo = 'Alterar orçamento?'
    detalhe = (
      <>
        {l.orcamento_tipo === 'diario' ? 'Orçamento diário' : 'Orçamento vitalício'}:{' '}
        <b className="tabular-nums">{fmtMoedaConta(de, l.moeda)}</b> → <b className="tabular-nums">{fmtMoedaConta(pendente.para, l.moeda)}</b>
        {varPct != null && <span className={varPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}> ({varPct >= 0 ? '+' : ''}{varPct.toFixed(0)}%)</span>}
      </>
    )
    if (varPct != null && varPct > 20) alerta = 'Aumento acima de 20% de uma vez costuma fazer a Meta reiniciar o aprendizado.'
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onCancelar}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">{titulo}</h3>
        <p className="text-sm font-semibold mt-3 break-words">{l.nome}</p>
        <p className="text-xs text-muted-foreground">{l.conta_nome}</p>
        <p className="text-sm mt-3">{detalhe}</p>
        {alerta && <p className="text-xs text-amber-300 mt-3 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{alerta}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancelar} disabled={salvando} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-accent/60">Cancelar</button>
          <button onClick={onConfirmar} disabled={salvando}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2">
            {salvando && <RefreshCw className="w-3.5 h-3.5 animate-spin" />} Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ ligado, onClick }: { ligado: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={ligado} title={ligado ? 'Pausar' : 'Ativar'}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${ligado ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${ligado ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function Th({ k, s, on, left, dica, children }: { k: SortKey; s: [SortKey, boolean]; on: (k: SortKey) => void; left?: boolean; dica?: string; children: React.ReactNode }) {
  const ativo = k === s[0]
  return (
    <th className={`px-3 py-3 whitespace-nowrap ${left ? 'text-left' : 'text-right'}`}>
      <button onClick={() => on(k)} title={dica} className={`inline-flex items-center gap-1 uppercase tracking-widest font-bold ${ativo ? 'text-primary' : 'hover:text-foreground'}`}>
        {children}{dica && <Info className="w-3 h-3 opacity-60" />}{ativo ? (s[1] ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
}

function Select({ label, value, onChange, opcoes }: { label: string; value: string; onChange: (v: string) => void; opcoes: [string, string][] }) {
  return (
    <label>
      <span className="block text-[11px] text-muted-foreground mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm outline-none focus:border-primary">
        {opcoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}
