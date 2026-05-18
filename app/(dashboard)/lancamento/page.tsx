'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import {
  adicionarVenda,
  adicionarGasto,
  listarVendasManuais,
  listarGastosManuais,
  deletarVenda,
  deletarGasto,
  limparTodasVendas,
  limparTodosGastos,
  getProdutos,
} from '@/app/actions/lancamento'

const hoje = format(new Date(), 'yyyy-MM-dd')

export default function LancamentoPage() {
  const [produtos, setProdutos] = useState<string[]>([])
  const [vendasList, setVendasList] = useState<any[]>([])
  const [gastosList, setGastosList] = useState<any[]>([])

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

  const [confirmLimparVendas, setConfirmLimparVendas] = useState(false)
  const [confirmLimparGastos, setConfirmLimparGastos] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    const [prods, vendas, gastos] = await Promise.all([
      getProdutos(),
      listarVendasManuais(),
      listarGastosManuais(),
    ])
    setProdutos(prods)
    if (prods.length > 0 && !vProduto) setVProduto(prods[0])
    setVendasList(vendas.data)
    setGastosList(gastos.data)
  }

  async function handleAdicionarVenda(e: React.FormEvent) {
    e.preventDefault()
    if (!vCriativo || !vProduto || !vValor) return
    setSavingVenda(true)
    const res = await adicionarVenda({ data: vData, criativo: vCriativo, produto: vProduto, valor: parseFloat(vValor) })
    setSavingVenda(false)
    if (res.success) {
      setVCriativo('')
      setVValor('')
      carregar()
    } else {
      alert('Erro: ' + res.error)
    }
  }

  async function handleAdicionarGasto(e: React.FormEvent) {
    e.preventDefault()
    if (!gCriativo || !gValor) return
    setSavingGasto(true)
    const res = await adicionarGasto({ data: gData, criativo: gCriativo, campanha: gCampanha || undefined, valor_gasto: parseFloat(gValor) })
    setSavingGasto(false)
    if (res.success) {
      setGCriativo('')
      setGCampanha('')
      setGValor('')
      carregar()
    } else {
      alert('Erro: ' + res.error)
    }
  }

  async function handleDeletarVenda(id: string) {
    await deletarVenda(id)
    setVendasList(v => v.filter(x => x.id !== id))
  }

  async function handleDeletarGasto(id: string) {
    await deletarGasto(id)
    setGastosList(g => g.filter(x => x.id !== id))
  }

  async function handleLimparVendas() {
    await limparTodasVendas()
    setVendasList([])
    setConfirmLimparVendas(false)
  }

  async function handleLimparGastos() {
    await limparTodosGastos()
    setGastosList([])
    setConfirmLimparGastos(false)
  }

  const inputClass = 'bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 w-full'

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Lançamento Manual</h1>
        <p className="text-sm text-muted-foreground mt-1">Adicione vendas e gastos por criativo manualmente</p>
      </div>

      {/* VENDAS */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Vendas por Criativo</h2>
          {!confirmLimparVendas ? (
            <button
              onClick={() => setConfirmLimparVendas(true)}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition px-3 py-1.5 bg-red-500/10 rounded-lg border border-red-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar todos os registros
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 font-medium">Apagar TUDO?</span>
              <button onClick={handleLimparVendas} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-400 transition">Sim, apagar</button>
              <button onClick={() => setConfirmLimparVendas(false)} className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded-lg hover:text-foreground transition">Cancelar</button>
            </div>
          )}
        </div>

        <form onSubmit={handleAdicionarVenda} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Data</label>
            <input type="date" value={vData} onChange={e => setVData(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Criativo</label>
            <input type="text" value={vCriativo} onChange={e => setVCriativo(e.target.value)} placeholder="ad03-entrevista..." className={inputClass} required />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Produto</label>
            <select value={vProduto} onChange={e => setVProduto(e.target.value)} className={inputClass} required>
              {produtos.length === 0 && <option value="">Nenhum produto cadastrado</option>}
              {produtos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={vValor} onChange={e => setVValor(e.target.value)} placeholder="0,00" className={inputClass} required />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <button
              type="submit"
              disabled={savingVenda}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {savingVenda ? 'Salvando...' : 'Adicionar Venda'}
            </button>
          </div>
        </form>

        {vendasList.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-semibold">Data</th>
                  <th className="text-left px-4 py-2 font-semibold">Criativo</th>
                  <th className="text-left px-4 py-2 font-semibold">Produto</th>
                  <th className="text-right px-4 py-2 font-semibold">Valor</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {vendasList.map(v => (
                  <tr key={v.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2 text-muted-foreground">{format(new Date(v.data), 'dd/MM/yy', { locale: ptBR })}</td>
                    <td className="px-4 py-2 text-primary font-medium">{v.criativo ?? '—'}</td>
                    <td className="px-4 py-2 text-foreground">{v.produto ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-emerald-400 font-semibold">R$ {Number(v.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleDeletarVenda(v.id)} className="text-muted-foreground hover:text-red-400 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GASTOS */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Gastos do Meta por Criativo</h2>
          {!confirmLimparGastos ? (
            <button
              onClick={() => setConfirmLimparGastos(true)}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition px-3 py-1.5 bg-red-500/10 rounded-lg border border-red-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar todos os registros
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 font-medium">Apagar TUDO?</span>
              <button onClick={handleLimparGastos} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-400 transition">Sim, apagar</button>
              <button onClick={() => setConfirmLimparGastos(false)} className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded-lg hover:text-foreground transition">Cancelar</button>
            </div>
          )}
        </div>

        <form onSubmit={handleAdicionarGasto} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Data</label>
            <input type="date" value={gData} onChange={e => setGData(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Criativo</label>
            <input type="text" value={gCriativo} onChange={e => setGCriativo(e.target.value)} placeholder="ad03-entrevista..." className={inputClass} required />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Campanha (opcional)</label>
            <input type="text" value={gCampanha} onChange={e => setGCampanha(e.target.value)} placeholder="FASE01 - ..." className={inputClass} />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Gasto (R$)</label>
            <input type="number" step="0.01" min="0" value={gValor} onChange={e => setGValor(e.target.value)} placeholder="0,00" className={inputClass} required />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <button
              type="submit"
              disabled={savingGasto}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {savingGasto ? 'Salvando...' : 'Adicionar Gasto'}
            </button>
          </div>
        </form>

        {gastosList.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-semibold">Data</th>
                  <th className="text-left px-4 py-2 font-semibold">Criativo</th>
                  <th className="text-left px-4 py-2 font-semibold">Campanha</th>
                  <th className="text-right px-4 py-2 font-semibold">Gasto</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {gastosList.map(g => (
                  <tr key={g.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2 text-muted-foreground">{format(new Date(g.data + 'T12:00:00'), 'dd/MM/yy', { locale: ptBR })}</td>
                    <td className="px-4 py-2 text-primary font-medium">{g.criativo ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{g.campaign_name ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-foreground font-semibold">R$ {Number(g.valor_gasto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleDeletarGasto(g.id)} className="text-muted-foreground hover:text-red-400 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
