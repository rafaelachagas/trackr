'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2, X, ShoppingCart, TrendingDown, ChevronDown, ChevronRight, Search, Pencil } from 'lucide-react'
import {
  adicionarVenda,
  adicionarGasto,
  listarVendasManuais,
  listarGastosManuais,
  deletarVenda,
  deletarGasto,
  editarVenda,
  editarGasto,
  getProdutos,
} from '@/app/actions/lancamento'
import { listarCriativosAtivos } from '@/app/actions/criativos'
import ImportarLote from '@/components/lancamento/ImportarLote'

const hoje = format(new Date(), 'yyyy-MM-dd')

type Tab = 'vendas' | 'gastos'

// Modal unificado de lançamento
type ModalLancamento = {
  data: string
  criativo: string
  campanha: string
  // vendas: uma entrada por produto
  vendaLinhas: { produto: string; valor: string }[]
  // gasto
  valorGasto: string
}

type EditVendaState = { id: string; data: string; produto: string; valor: string } | null
type EditGastoState = { id: string; data: string; valor_gasto: string } | null

export default function LancamentoPage() {
  const [produtos, setProdutos] = useState<string[]>([])
  const [criativosAtivos, setCriativosAtivos] = useState<{ nome: string; campaign_name: string; fase: string | null }[]>([])
  const [vendasList, setVendasList] = useState<any[]>([])
  const [gastosList, setGastosList] = useState<any[]>([])
  const [vendasPage, setVendasPage] = useState(0)
  const [gastosPage, setGastosPage] = useState(0)
  const [vendasHasMore, setVendasHasMore] = useState(false)
  const [gastosHasMore, setGastosHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tab, setTab] = useState<Tab>('vendas')
  const [busca, setBusca] = useState('')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  // Modal lançamento unificado
  const [modalAberto, setModalAberto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [form, setForm] = useState<ModalLancamento>({
    data: hoje,
    criativo: '',
    campanha: '',
    vendaLinhas: [],
    valorGasto: '',
  })

  // Modal editar venda
  const [editVenda, setEditVenda] = useState<EditVendaState>(null)
  const [savingEditVenda, setSavingEditVenda] = useState(false)

  // Modal editar gasto
  const [editGasto, setEditGasto] = useState<EditGastoState>(null)
  const [savingEditGasto, setSavingEditGasto] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const [prods, vendas, gastos, criativos] = await Promise.all([
      getProdutos(),
      listarVendasManuais(0),
      listarGastosManuais(0),
      listarCriativosAtivos(),
    ])
    setProdutos(prods)
    setCriativosAtivos(criativos)
    setVendasList(vendas.data)
    setGastosList(gastos.data)
    setVendasPage(0)
    setGastosPage(0)
    setVendasHasMore(vendas.hasMore)
    setGastosHasMore(gastos.hasMore)
    const firstV = vendas.data[0]?.data?.substring(0, 10)
    const firstG = gastos.data[0]?.data?.substring(0, 10)
    const initial = new Set<string>()
    if (firstV) initial.add(`v_${firstV}`)
    if (firstG) initial.add(`g_${firstG}`)
    setExpandedDates(initial)
  }

  async function carregarMais() {
    setLoadingMore(true)
    if (tab === 'vendas') {
      const nextPage = vendasPage + 1
      const res = await listarVendasManuais(nextPage)
      setVendasList(prev => [...prev, ...res.data])
      setVendasPage(nextPage)
      setVendasHasMore(res.hasMore)
    } else {
      const nextPage = gastosPage + 1
      const res = await listarGastosManuais(nextPage)
      setGastosList(prev => [...prev, ...res.data])
      setGastosPage(nextPage)
      setGastosHasMore(res.hasMore)
    }
    setLoadingMore(false)
  }

  function toggleDate(key: string) {
    setExpandedDates(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const RASCUNHO_KEY = 'lancamento_rascunho'

  function salvarRascunho(f: ModalLancamento) {
    localStorage.setItem(RASCUNHO_KEY, JSON.stringify(f))
  }

  function limparRascunho() {
    localStorage.removeItem(RASCUNHO_KEY)
  }

  function abrirModal() {
    const salvo = localStorage.getItem(RASCUNHO_KEY)
    if (salvo) {
      try {
        const rascunho = JSON.parse(salvo) as ModalLancamento
        // garante que vendaLinhas tenha todos os produtos atuais
        const linhas = produtos.map(p => {
          const existente = rascunho.vendaLinhas?.find(l => l.produto === p)
          return existente ?? { produto: p, valor: '' }
        })
        setForm({ ...rascunho, vendaLinhas: linhas })
      } catch {
        setForm({ data: hoje, criativo: '', campanha: '', vendaLinhas: produtos.map(p => ({ produto: p, valor: '' })), valorGasto: '' })
      }
    } else {
      const ultimaData = localStorage.getItem('lancamento_ultima_data') ?? hoje
      setForm({ data: ultimaData, criativo: '', campanha: '', vendaLinhas: produtos.map(p => ({ produto: p, valor: '' })), valorGasto: '' })
    }
    setErros([])
    setModalAberto(true)
  }

  function selecionarCriativo(nome: string) {
    const c = criativosAtivos.find(x => x.nome === nome)
    setForm(f => { const novo = { ...f, criativo: nome, campanha: c?.campaign_name ?? '' }; salvarRascunho(novo); return novo })
  }

  async function handleLancar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.criativo) return
    setSaving(true)
    setErros([])

    const novosErros: string[] = []
    const promises: Promise<any>[] = []

    // Lança vendas preenchidas
    for (const linha of form.vendaLinhas) {
      const valor = parseFloat(linha.valor)
      if (!linha.valor || isNaN(valor) || valor <= 0) continue
      promises.push(
        adicionarVenda({ data: form.data, criativo: form.criativo, produto: linha.produto, valor, org_id: '' })
          .then(r => { if (!r.success) novosErros.push(r.error ?? 'Erro ao salvar venda') })
      )
    }

    // Lança gasto se preenchido
    const valorGasto = parseFloat(form.valorGasto)
    if (form.valorGasto && !isNaN(valorGasto) && valorGasto > 0) {
      promises.push(
        adicionarGasto({ data: form.data, criativo: form.criativo, campanha: form.campanha || undefined, valor_gasto: valorGasto, org_id: '' })
          .then(r => { if (!r.success) novosErros.push(r.error ?? 'Erro ao salvar gasto') })
      )
    }

    await Promise.all(promises)
    setSaving(false)

    if (novosErros.length > 0) {
      setErros(novosErros)
    } else {
      limparRascunho()
      setModalAberto(false)
      carregar()
    }
  }

  async function handleSalvarEditVenda(e: React.FormEvent) {
    e.preventDefault()
    if (!editVenda) return
    setSavingEditVenda(true)
    const res = await editarVenda(editVenda.id, { valor: parseFloat(editVenda.valor), produto: editVenda.produto, data: editVenda.data })
    setSavingEditVenda(false)
    if (res.success) { setEditVenda(null); carregar() }
    else alert('Erro: ' + res.error)
  }

  async function handleSalvarEditGasto(e: React.FormEvent) {
    e.preventDefault()
    if (!editGasto) return
    setSavingEditGasto(true)
    const res = await editarGasto(editGasto.id, { valor_gasto: parseFloat(editGasto.valor_gasto), data: editGasto.data })
    setSavingEditGasto(false)
    if (res.success) { setEditGasto(null); carregar() }
    else alert('Erro: ' + res.error)
  }

  const vendasFiltradas = useMemo(() => {
    const q = busca.toLowerCase()
    return vendasList.filter(v => !q || v.criativo?.toLowerCase().includes(q) || v.produto?.toLowerCase().includes(q))
  }, [vendasList, busca])

  const gastosFiltrados = useMemo(() => {
    const q = busca.toLowerCase()
    return gastosList.filter(g => !q || g.criativo?.toLowerCase().includes(q) || g.campaign_name?.toLowerCase().includes(q))
  }, [gastosList, busca])

  function groupByDate<T extends { data: string }>(items: T[], prefix: string) {
    const map = new Map<string, T[]>()
    for (const item of items) {
      const d = item.data.substring(0, 10)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(item)
    }
    return Array.from(map.entries()).map(([date, rows]) => ({
      date, key: `${prefix}_${date}`, rows,
      total: rows.reduce((s: number, r: any) => s + Number(r.valor ?? r.valor_gasto ?? 0), 0),
    }))
  }

  const vendasGrupos = useMemo(() => groupByDate(vendasFiltradas, 'v'), [vendasFiltradas])
  const gastosGrupos = useMemo(() => groupByDate(gastosFiltrados, 'g'), [gastosFiltrados])

  const totalVendas = vendasList.reduce((s, v) => s + Number(v.valor), 0)
  const totalGastos = gastosList.reduce((s, g) => s + Number(g.valor_gasto), 0)

  const inputClass = 'bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 w-full transition-colors'
  const activeList = tab === 'vendas' ? vendasGrupos : gastosGrupos
  const isEmpty = activeList.length === 0

  const temAlgoParaLancar = form.vendaLinhas.some(l => l.valor && parseFloat(l.valor) > 0) ||
    (!!form.valorGasto && parseFloat(form.valorGasto) > 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lançamento Manual</h1>
          <p className="text-sm text-muted-foreground mt-1">Registre vendas e gastos por criativo</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportarLote onImported={carregar} />
          <button
            onClick={abrirModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Novo Lançamento
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div onClick={() => setTab('vendas')} className={`bg-card border rounded-2xl p-5 cursor-pointer transition-all ${tab === 'vendas' ? 'border-primary/50 shadow-lg shadow-primary/10' : 'border-border hover:border-border/80'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendas Manuais</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-black text-foreground">R$ {totalVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground mt-1">{vendasList.length} registro{vendasList.length !== 1 ? 's' : ''}</p>
        </div>
        <div onClick={() => setTab('gastos')} className={`bg-card border rounded-2xl p-5 cursor-pointer transition-all ${tab === 'gastos' ? 'border-primary/50 shadow-lg shadow-primary/10' : 'border-border hover:border-border/80'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gastos Manuais</p>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-2xl font-black text-foreground">R$ {totalGastos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground mt-1">{gastosList.length} registro{gastosList.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Table panel */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border gap-3">
          <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
            <button onClick={() => setTab('vendas')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'vendas' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Vendas</button>
            <button onClick={() => setTab('gastos')} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'gastos' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Gastos</button>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar criativo..." className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 transition-colors" />
          </div>
        </div>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              {tab === 'vendas' ? <ShoppingCart className="w-5 h-5 text-muted-foreground" /> : <TrendingDown className="w-5 h-5 text-muted-foreground" />}
            </div>
            <p className="text-sm font-medium text-muted-foreground">{busca ? 'Nenhum resultado' : `Nenhum ${tab === 'vendas' ? 'venda' : 'gasto'} registrado`}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {activeList.map((grupo: any) => {
              const isOpen = expandedDates.has(grupo.key)
              return (
                <div key={grupo.key}>
                  <button onClick={() => toggleDate(grupo.key)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm font-semibold text-foreground">{format(parseISO(grupo.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{grupo.rows.length} item{grupo.rows.length !== 1 ? 's' : ''}</span>
                    </div>
                    <span className={`text-sm font-bold ${tab === 'vendas' ? 'text-emerald-400' : 'text-foreground'}`}>R$ {grupo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/30">
                      {tab === 'vendas' ? (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/10">
                              <th className="text-left px-6 py-2 font-semibold pl-14">Criativo</th>
                              <th className="text-left px-6 py-2 font-semibold">Produto</th>
                              <th className="text-right px-6 py-2 font-semibold">Valor</th>
                              <th className="w-16 px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.rows.map((v: any) => (
                              <tr key={v.id} className="border-t border-border/30 hover:bg-muted/10 transition-colors">
                                <td className="px-6 py-3 text-primary font-medium pl-14">{v.criativo ?? '—'}</td>
                                <td className="px-6 py-3 text-muted-foreground text-xs">{v.produto ?? '—'}</td>
                                <td className="px-6 py-3 text-right font-bold text-emerald-400">R$ {Number(v.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => setEditVenda({ id: v.id, data: v.data.substring(0, 10), produto: v.produto, valor: String(v.valor) })} className="text-muted-foreground hover:text-primary transition p-1 rounded">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={async () => { await deletarVenda(v.id); setVendasList(x => x.filter(i => i.id !== v.id)) }} className="text-muted-foreground hover:text-red-400 transition p-1 rounded">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/10">
                              <th className="text-left px-6 py-2 font-semibold pl-14">Criativo</th>
                              <th className="text-left px-6 py-2 font-semibold">Campanha</th>
                              <th className="text-right px-6 py-2 font-semibold">Gasto</th>
                              <th className="w-16 px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.rows.map((g: any) => (
                              <tr key={g.id} className="border-t border-border/30 hover:bg-muted/10 transition-colors">
                                <td className="px-6 py-3 text-primary font-medium pl-14">{g.criativo ?? '—'}</td>
                                <td className="px-6 py-3 text-muted-foreground text-xs">{g.campaign_name ?? '—'}</td>
                                <td className="px-6 py-3 text-right font-bold text-foreground">R$ {Number(g.valor_gasto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => setEditGasto({ id: g.id, data: g.data.substring(0, 10), valor_gasto: String(g.valor_gasto) })} className="text-muted-foreground hover:text-primary transition p-1 rounded">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={async () => { await deletarGasto(g.id); setGastosList(x => x.filter(i => i.id !== g.id)) }} className="text-muted-foreground hover:text-red-400 transition p-1 rounded">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Botão Ver mais */}
        {(tab === 'vendas' ? vendasHasMore : gastosHasMore) && (
          <div className="flex justify-center py-4 border-t border-border/50">
            <button
              onClick={carregarMais}
              disabled={loadingMore}
              className="px-6 py-2 text-xs font-semibold text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition disabled:opacity-50"
            >
              {loadingMore ? 'Carregando...' : 'Ver mais'}
            </button>
          </div>
        )}
      </div>

      {/* MODAL UNIFICADO DE LANÇAMENTO */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalAberto(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h3 className="text-base font-bold text-foreground">Novo Lançamento</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Registre vendas e gasto de uma vez</p>
              </div>
              <button onClick={() => setModalAberto(false)} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLancar} className="p-6 space-y-5">
              {/* Data + Criativo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Data</label>
                  <input type="date" value={form.data} onChange={e => { localStorage.setItem('lancamento_ultima_data', e.target.value); setForm(f => { const novo = { ...f, data: e.target.value }; salvarRascunho(novo); return novo }) }} className={inputClass} required />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Criativo</label>
                  <select value={form.criativo} onChange={e => selecionarCriativo(e.target.value)} className={inputClass} required>
                    <option value="">Selecione...</option>
                    {criativosAtivos.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                  </select>
                </div>
              </div>

              {/* Vendas por produto */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Vendas (deixe em branco para não lançar)</p>
                {form.vendaLinhas.map((linha, i) => (
                  <div key={linha.produto} className="flex items-center gap-3">
                    <span className="text-xs text-foreground w-44 shrink-0 truncate" title={linha.produto}>{linha.produto}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={linha.valor}
                      onChange={e => setForm(f => {
                        const novo = { ...f, vendaLinhas: f.vendaLinhas.map((l, j) => j === i ? { ...l, valor: e.target.value } : l) }
                        salvarRascunho(novo)
                        return novo
                      })}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>

              {/* Gasto */}
              <div className="border-t border-border/50 pt-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Gasto Meta (deixe em branco para não lançar)</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-foreground w-44 shrink-0">Gasto (R$)</span>
                  <input type="number" step="0.01" min="0" placeholder="0,00" value={form.valorGasto} onChange={e => setForm(f => { const novo = { ...f, valorGasto: e.target.value }; salvarRascunho(novo); return novo })} className={inputClass} />
                </div>
                {form.campanha && (
                  <p className="text-[11px] text-muted-foreground">Campanha: <span className="font-mono text-primary">{form.campanha}</span></p>
                )}
              </div>

              {/* Erros */}
              {erros.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-1">
                  {erros.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !form.criativo || !temAlgoParaLancar}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Lançar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR VENDA */}
      {editVenda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditVenda(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-bold text-foreground">Editar Venda</h3>
              <button onClick={() => setEditVenda(null)} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSalvarEditVenda} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Data</label>
                <input type="date" value={editVenda.data} onChange={e => setEditVenda(v => v && ({ ...v, data: e.target.value }))} className={inputClass} required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Produto</label>
                <select value={editVenda.produto} onChange={e => setEditVenda(v => v && ({ ...v, produto: e.target.value }))} className={inputClass}>
                  {produtos.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Valor (R$)</label>
                <input type="number" step="0.01" min="0" value={editVenda.valor} onChange={e => setEditVenda(v => v && ({ ...v, valor: e.target.value }))} className={inputClass} required />
              </div>
              <button type="submit" disabled={savingEditVenda} className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
                {savingEditVenda ? 'Salvando...' : 'Salvar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR GASTO */}
      {editGasto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditGasto(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-base font-bold text-foreground">Editar Gasto</h3>
              <button onClick={() => setEditGasto(null)} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSalvarEditGasto} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Data</label>
                <input type="date" value={editGasto.data} onChange={e => setEditGasto(g => g && ({ ...g, data: e.target.value }))} className={inputClass} required />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Gasto (R$)</label>
                <input type="number" step="0.01" min="0" value={editGasto.valor_gasto} onChange={e => setEditGasto(g => g && ({ ...g, valor_gasto: e.target.value }))} className={inputClass} required />
              </div>
              <button type="submit" disabled={savingEditGasto} className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
                {savingEditGasto ? 'Salvando...' : 'Salvar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
