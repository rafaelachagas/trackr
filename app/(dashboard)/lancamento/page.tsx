'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2, X, ShoppingCart, TrendingDown, ChevronDown, ChevronRight, Search } from 'lucide-react'
import {
  adicionarVenda,
  adicionarGasto,
  listarVendasManuais,
  listarGastosManuais,
  deletarVenda,
  deletarGasto,
  getProdutos,
} from '@/app/actions/lancamento'
import { listarCriativosAtivos } from '@/app/actions/criativos'

const hoje = format(new Date(), 'yyyy-MM-dd')

type ModalType = 'venda' | 'gasto' | null
type Tab = 'vendas' | 'gastos'

export default function LancamentoPage() {
  const [produtos, setProdutos] = useState<string[]>([])
  const [criativosAtivos, setCriativosAtivos] = useState<{ nome: string; campaign_name: string; fase: string | null }[]>([])
  const [vendasList, setVendasList] = useState<any[]>([])
  const [gastosList, setGastosList] = useState<any[]>([])
  const [modal, setModal] = useState<ModalType>(null)
  const [tab, setTab] = useState<Tab>('vendas')
  const [busca, setBusca] = useState('')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())


  // Venda form
  const [vData, setVData] = useState(hoje)
  const [vCriativo, setVCriativo] = useState('')
  const [vProduto, setVProduto] = useState('')
  const [vValor, setVValor] = useState('')
  const [savingVenda, setSavingVenda] = useState(false)

  // Gasto form
  const [gData, setGData] = useState(hoje)
  const [gCriativo, setGCriativo] = useState('')
  const [gCampanha, setGCampanha] = useState('')
  const [gValor, setGValor] = useState('')
  const [savingGasto, setSavingGasto] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const [prods, vendas, gastos, criativos] = await Promise.all([
      getProdutos(),
      listarVendasManuais(),
      listarGastosManuais(),
      listarCriativosAtivos(),
    ])
    setProdutos(prods)
    setCriativosAtivos(criativos)
    if (prods.length > 0 && !vProduto) setVProduto(prods[0])
    setVendasList(vendas.data)
    setGastosList(gastos.data)
    // expand first date by default
    const firstV = vendas.data[0]?.data?.substring(0, 10)
    const firstG = gastos.data[0]?.data?.substring(0, 10)
    const initial = new Set<string>()
    if (firstV) initial.add(`v_${firstV}`)
    if (firstG) initial.add(`g_${firstG}`)
    setExpandedDates(initial)
  }

  function toggleDate(key: string) {
    setExpandedDates(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleAdicionarVenda(e: React.FormEvent) {
    e.preventDefault()
    if (!vCriativo || !vProduto || !vValor) return
    setSavingVenda(true)
    const res = await adicionarVenda({ data: vData, criativo: vCriativo, produto: vProduto, valor: parseFloat(vValor) })
    setSavingVenda(false)
    if (res.success) {
      setVCriativo(''); setVValor('')
      setModal(null); carregar()
    } else alert('Erro: ' + res.error)
  }

  async function handleAdicionarGasto(e: React.FormEvent) {
    e.preventDefault()
    if (!gCriativo || !gValor) return
    setSavingGasto(true)
    const res = await adicionarGasto({ data: gData, criativo: gCriativo, campanha: gCampanha || undefined, valor_gasto: parseFloat(gValor) })
    setSavingGasto(false)
    if (res.success) {
      setGCriativo(''); setGCampanha(''); setGValor('')
      setModal(null); carregar()
    } else alert('Erro: ' + res.error)
  }

  // Group by date
  const vendasFiltradas = useMemo(() => {
    const q = busca.toLowerCase()
    return vendasList.filter(v =>
      !q || v.criativo?.toLowerCase().includes(q) || v.produto?.toLowerCase().includes(q)
    )
  }, [vendasList, busca])

  const gastosFiltrados = useMemo(() => {
    const q = busca.toLowerCase()
    return gastosList.filter(g =>
      !q || g.criativo?.toLowerCase().includes(q) || g.campaign_name?.toLowerCase().includes(q)
    )
  }, [gastosList, busca])

  function groupByDate<T extends { data: string }>(items: T[], prefix: string) {
    const map = new Map<string, T[]>()
    for (const item of items) {
      const d = item.data.substring(0, 10)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(item)
    }
    return Array.from(map.entries()).map(([date, rows]) => ({
      date,
      key: `${prefix}_${date}`,
      rows,
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lançamento Manual</h1>
          <p className="text-sm text-muted-foreground mt-1">Registre vendas e gastos por criativo</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setModal('gasto') }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-card border border-border text-foreground hover:border-primary/40 hover:text-primary transition-all"
          >
            <TrendingDown className="w-4 h-4" />
            Registrar Gasto
          </button>
          <button
            onClick={() => { setModal('venda') }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Registrar Venda
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div
          onClick={() => setTab('vendas')}
          className={`bg-card border rounded-2xl p-5 cursor-pointer transition-all ${tab === 'vendas' ? 'border-primary/50 shadow-lg shadow-primary/10' : 'border-border hover:border-border/80'}`}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendas Manuais</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-black text-foreground">R$ {totalVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground mt-1">{vendasList.length} registro{vendasList.length !== 1 ? 's' : ''}</p>
        </div>
        <div
          onClick={() => setTab('gastos')}
          className={`bg-card border rounded-2xl p-5 cursor-pointer transition-all ${tab === 'gastos' ? 'border-primary/50 shadow-lg shadow-primary/10' : 'border-border hover:border-border/80'}`}
        >
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
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border gap-3">
          <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
            <button
              onClick={() => setTab('vendas')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'vendas' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Vendas
            </button>
            <button
              onClick={() => setTab('gastos')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'gastos' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Gastos
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar criativo..."
                className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>

        </div>

        {/* Content */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              {tab === 'vendas' ? <ShoppingCart className="w-5 h-5 text-muted-foreground" /> : <TrendingDown className="w-5 h-5 text-muted-foreground" />}
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {busca ? 'Nenhum resultado para a busca' : `Nenhum ${tab === 'vendas' ? 'venda' : 'gasto'} registrado`}
            </p>
            {!busca && (
              <p className="text-xs text-muted-foreground/60 mt-1">
                Clique em "Registrar {tab === 'vendas' ? 'Venda' : 'Gasto'}" para começar
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {activeList.map(grupo => {
              const isOpen = expandedDates.has(grupo.key)
              return (
                <div key={grupo.key}>
                  {/* Date group header */}
                  <button
                    onClick={() => toggleDate(grupo.key)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm font-semibold text-foreground">
                        {format(parseISO(grupo.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                        {grupo.rows.length} item{grupo.rows.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className={`text-sm font-bold ${tab === 'vendas' ? 'text-emerald-400' : 'text-foreground'}`}>
                      R$ {grupo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </button>

                  {/* Rows */}
                  {isOpen && (
                    <div className="border-t border-border/30">
                      {tab === 'vendas' ? (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/10">
                              <th className="text-left px-6 py-2 font-semibold pl-14">Criativo</th>
                              <th className="text-left px-6 py-2 font-semibold">Produto</th>
                              <th className="text-right px-6 py-2 font-semibold">Valor</th>
                              <th className="w-10 px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.rows.map((v: any) => (
                              <tr key={v.id} className="border-t border-border/30 hover:bg-muted/10 transition-colors">
                                <td className="px-6 py-3 text-primary font-medium pl-14">{v.criativo ?? '—'}</td>
                                <td className="px-6 py-3 text-muted-foreground text-xs">{v.produto ?? '—'}</td>
                                <td className="px-6 py-3 text-right font-bold text-emerald-400">R$ {Number(v.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">
                                  <button onClick={async () => { await deletarVenda(v.id); setVendasList(x => x.filter(i => i.id !== v.id)) }} className="text-muted-foreground hover:text-red-400 transition p-1 rounded">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
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
                              <th className="w-10 px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.rows.map((g: any) => (
                              <tr key={g.id} className="border-t border-border/30 hover:bg-muted/10 transition-colors">
                                <td className="px-6 py-3 text-primary font-medium pl-14">{g.criativo ?? '—'}</td>
                                <td className="px-6 py-3 text-muted-foreground text-xs">{g.campaign_name ?? '—'}</td>
                                <td className="px-6 py-3 text-right font-bold text-foreground">R$ {Number(g.valor_gasto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">
                                  <button onClick={async () => { await deletarGasto(g.id); setGastosList(x => x.filter(i => i.id !== g.id)) }} className="text-muted-foreground hover:text-red-400 transition p-1 rounded">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
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
      </div>

      {/* MODAL */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {modal === 'venda' ? 'Registrar Venda' : 'Registrar Gasto'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {modal === 'venda' ? 'Adicione uma venda por criativo' : 'Adicione um gasto do Meta por criativo'}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {modal === 'venda' ? (
                <form onSubmit={handleAdicionarVenda} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Data</label>
                      <input type="date" value={vData} onChange={e => setVData(e.target.value)} className={inputClass} required />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Valor (R$)</label>
                      <input type="number" step="0.01" min="0" value={vValor} onChange={e => setVValor(e.target.value)} placeholder="0,00" className={inputClass} required />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Criativo</label>
                    <select value={vCriativo} onChange={e => setVCriativo(e.target.value)} className={inputClass} required>
                      <option value="">Selecione um criativo...</option>
                      {criativosAtivos.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Produto</label>
                    <select value={vProduto} onChange={e => setVProduto(e.target.value)} className={inputClass} required>
                      {produtos.length === 0 && <option value="">Nenhum produto cadastrado</option>}
                      {produtos.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={savingVenda} className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
                    <Plus className="w-4 h-4" />
                    {savingVenda ? 'Salvando...' : 'Adicionar Venda'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAdicionarGasto} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Data</label>
                      <input type="date" value={gData} onChange={e => setGData(e.target.value)} className={inputClass} required />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Gasto (R$)</label>
                      <input type="number" step="0.01" min="0" value={gValor} onChange={e => setGValor(e.target.value)} placeholder="0,00" className={inputClass} required />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Criativo</label>
                    <select
                      value={gCriativo}
                      onChange={e => {
                        const nome = e.target.value
                        setGCriativo(nome)
                        const c = criativosAtivos.find(x => x.nome === nome)
                        if (c) setGCampanha(c.campaign_name)
                      }}
                      className={inputClass}
                      required
                    >
                      <option value="">Selecione um criativo...</option>
                      {criativosAtivos.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Campanha</label>
                    <input type="text" value={gCampanha} onChange={e => setGCampanha(e.target.value)} placeholder="Preenchida automaticamente..." className={inputClass} />
                  </div>
                  <button type="submit" disabled={savingGasto} className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
                    <Plus className="w-4 h-4" />
                    {savingGasto ? 'Salvando...' : 'Adicionar Gasto'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
