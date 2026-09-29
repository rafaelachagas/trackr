'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useDashboard } from '@/context/DashboardContext'
import { formatarMoeda } from '@/lib/utils'
import { Pencil, RefreshCw, Search, History, ChevronDown, AlertTriangle, X, Check } from 'lucide-react'
import SeletorPeriodoVturb, { rangeDoPreset, type RangePeriodo } from '@/components/ui/SeletorPeriodoVturb'
import FacebookIcon from '@/components/ui/FacebookIcon'
import type { CampanhaLinha, LogCampanha } from '@/lib/meta-campanhas'

type FiltroStatus = 'ativas' | 'com_gasto' | 'pausadas' | 'todas'
type SortKey = 'gasto' | 'receita' | 'vendas' | 'upsells' | 'roas' | 'lucro' | 'cpa' | 'orcamento' | 'nome'

// Mudança pendente de confirmação (toggle ou orçamento).
type Pendente =
  | { tipo: 'status'; c: CampanhaLinha; para: 'ACTIVE' | 'PAUSED' }
  | { tipo: 'orcamento'; c: CampanhaLinha; para: number }

const roas = (c: CampanhaLinha) => (c.gasto > 0 ? c.receita / c.gasto : null)
const cpa = (c: CampanhaLinha) => (c.vendas > 0 ? c.gasto / c.vendas : null)
const fmtMoedaConta = (v: number, moeda: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(v)

export default function CampanhasPage() {
  const { isPrivate } = useDashboard()
  const [range, setRange] = useState<RangePeriodo>(() => rangeDoPreset('Hoje'))
  const [campanhas, setCampanhas] = useState<CampanhaLinha[]>([])
  const [semCampanha, setSemCampanha] = useState({ vendas: 0, receita: 0 })
  const [log, setLog] = useState<LogCampanha[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('ativas')
  const [conta, setConta] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('gasto')
  const [sortDesc, setSortDesc] = useState(true)

  const [editando, setEditando] = useState<string | null>(null)
  const [valorEdit, setValorEdit] = useState('')
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null)
  const [verLog, setVerLog] = useState(false)

  const carregar = useCallback(() => {
    if (!range.ini || !range.fim) return
    setLoading(true)
    setErro(null)
    fetch(`/api/campanhas?${new URLSearchParams({ d_inicio: range.ini, d_fim: range.fim })}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({ error: 'Resposta inválida do servidor' }))
        if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
        setCampanhas(j.campanhas ?? [])
        setSemCampanha(j.semCampanha ?? { vendas: 0, receita: 0 })
        setLog(j.log ?? [])
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [range])

  useEffect(() => { carregar() }, [carregar])

  const contas = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of campanhas) m.set(c.conta_id, c.conta_nome)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [campanhas])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = campanhas.filter((c) => {
      if (conta && c.conta_id !== conta) return false
      if (q && !c.nome.toLowerCase().includes(q)) return false
      if (filtroStatus === 'ativas') return c.status === 'ACTIVE'
      if (filtroStatus === 'pausadas') return c.status !== 'ACTIVE'
      if (filtroStatus === 'com_gasto') return c.gasto >= 0.01 || c.receita > 0
      return true
    })
    const val = (c: CampanhaLinha): number | string => {
      switch (sortKey) {
        case 'nome': return c.nome.toLowerCase()
        case 'roas': return roas(c) ?? -1
        case 'cpa': return cpa(c) ?? Infinity
        case 'lucro': return c.receita - c.gasto
        case 'orcamento': return c.orcamento ?? -1
        default: return c[sortKey]
      }
    }
    return [...lista].sort((a, b) => {
      const va = val(a), vb = val(b)
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDesc ? -cmp : cmp
    })
  }, [campanhas, busca, filtroStatus, conta, sortKey, sortDesc])

  const tot = useMemo(() => {
    const g = visiveis.reduce((a, c) => a + c.gasto, 0)
    const r = visiveis.reduce((a, c) => a + c.receita, 0)
    const v = visiveis.reduce((a, c) => a + c.vendas, 0)
    const u = visiveis.reduce((a, c) => a + c.upsells, 0)
    const ru = visiveis.reduce((a, c) => a + c.receita_upsell, 0)
    const orc = visiveis.filter((c) => c.orcamento_tipo === 'diario' && c.moeda === 'BRL' && c.status === 'ACTIVE').reduce((a, c) => a + (c.orcamento ?? 0), 0)
    return { g, r, v, u, ru, orc, roas: g > 0 ? r / g : null, cpa: v > 0 ? g / v : null, lucro: r - g }
  }, [visiveis])

  function ordenar(k: SortKey) {
    if (k === sortKey) setSortDesc((d) => !d)
    else { setSortKey(k); setSortDesc(k !== 'nome' && k !== 'cpa') }
  }

  function abrirEdicao(c: CampanhaLinha) {
    setEditando(c.id)
    setValorEdit(c.orcamento != null ? String(c.orcamento).replace('.', ',') : '')
  }

  function pedirOrcamento(c: CampanhaLinha) {
    const v = parseFloat(valorEdit.replace(/\./g, '').replace(',', '.'))
    if (!(v > 0)) { setAviso({ ok: false, msg: 'Digite um orçamento válido.' }); return }
    if (c.orcamento != null && Math.abs(v - c.orcamento) < 0.005) { setEditando(null); return }
    setPendente({ tipo: 'orcamento', c, para: Math.round(v * 100) / 100 })
  }

  async function confirmar() {
    if (!pendente) return
    setSalvando(true)
    const { c } = pendente
    const body = pendente.tipo === 'status' ? { acao: 'status', status: pendente.para } : { acao: 'orcamento', valor: pendente.para }
    try {
      const r = await fetch(`/api/campanhas/${c.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setCampanhas((lista) => lista.map((x) => x.id !== c.id ? x
        : pendente.tipo === 'status' ? { ...x, status: pendente.para, status_efetivo: pendente.para }
        : { ...x, orcamento: pendente.para }))
      if (j.log) setLog((l) => [j.log, ...l])
      setAviso({ ok: true, msg: pendente.tipo === 'status'
        ? `${pendente.para === 'ACTIVE' ? 'Ativada' : 'Pausada'}: ${c.nome}`
        : `Orçamento atualizado: ${c.nome} → ${fmtMoedaConta(pendente.para, c.moeda)}` })
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
  const brl = (v: number | null) => (v == null ? '—' : priv(formatarMoeda(v)))
  const roasFmt = (r: number | null) => (r == null ? '—' : `${r.toFixed(2)}x`)
  const corRoas = (r: number | null) => r == null ? 'text-muted-foreground' : r >= 2 ? 'text-emerald-400' : r >= 1 ? 'text-amber-300' : 'text-rose-400'

  return (
    <div className="pt-9 pb-12 space-y-6 max-w-[1400px] mx-auto w-full text-foreground px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FacebookIcon className="w-5 h-5 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Meta</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Gasto ao vivo da Meta · só vendas aprovadas (líquido), pela atribuição do sck · mudanças vão direto pra Meta</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-border text-foreground/90 hover:bg-accent/60 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <SeletorPeriodoVturb range={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Resumo label="Gasto" valor={brl(tot.g)} sub={`${visiveis.length} campanhas`} cor="text-amber-400" />
        <Resumo label="Faturamento" valor={brl(tot.r)} sub={isPrivate ? '••' : `${tot.v} front · ${tot.u} upsell${tot.v > 0 ? ` (${((tot.u / tot.v) * 100).toFixed(0)}%)` : ''} · upsell ${formatarMoeda(tot.ru)}`} cor="text-sky-400" />
        <Resumo label="ROAS" valor={roasFmt(tot.roas)} sub={`CPA ${tot.cpa == null ? '—' : isPrivate ? '••' : formatarMoeda(tot.cpa)}`} cor={corRoas(tot.roas)} />
        <Resumo label="Lucro" valor={brl(tot.lucro)} sub={tot.orc > 0 ? `orçamento diário ativo ${isPrivate ? '••' : formatarMoeda(tot.orc)}` : ' '} cor={tot.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
      </div>

      <div className="rounded-2xl overflow-hidden bg-card border border-border">
        <div className="flex flex-wrap items-end gap-3 px-5 py-4 border-b border-border">
          <label className="flex-1 min-w-[200px]">
            <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Nome da campanha</span>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome"
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-background border border-border text-sm outline-none focus:border-primary" />
            </div>
          </label>
          <Select label="Status" value={filtroStatus} onChange={(v) => setFiltroStatus(v as FiltroStatus)}
            opcoes={[['ativas', 'Ativas'], ['com_gasto', 'Com gasto no período'], ['pausadas', 'Pausadas'], ['todas', 'Todas']]} />
          <Select label="Conta de anúncio" value={conta} onChange={setConta}
            opcoes={[['', 'Todas'], ...contas.map(([id, nome]) => [id, nome] as [string, string])]} />
        </div>

        {erro ? (
          <div className="flex items-center gap-2 text-rose-400 text-sm px-5 py-10 justify-center"><AlertTriangle className="w-4 h-4" /> {erro}</div>
        ) : loading && campanhas.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : visiveis.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">Nenhuma campanha com esses filtros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1150px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="text-left px-4 py-3 w-[70px]">Status</th>
                  <Th k="nome" atual={sortKey} desc={sortDesc} onClick={ordenar} left>Campanha</Th>
                  <Th k="orcamento" atual={sortKey} desc={sortDesc} onClick={ordenar}>Orçamento</Th>
                  <Th k="vendas" atual={sortKey} desc={sortDesc} onClick={ordenar}>Vendas</Th>
                  <Th k="upsells" atual={sortKey} desc={sortDesc} onClick={ordenar}>Upsell</Th>
                  <Th k="cpa" atual={sortKey} desc={sortDesc} onClick={ordenar}>CPA</Th>
                  <Th k="gasto" atual={sortKey} desc={sortDesc} onClick={ordenar}>Gasto</Th>
                  <Th k="receita" atual={sortKey} desc={sortDesc} onClick={ordenar}>Faturamento</Th>
                  <Th k="roas" atual={sortKey} desc={sortDesc} onClick={ordenar}>ROAS</Th>
                  <Th k="lucro" atual={sortKey} desc={sortDesc} onClick={ordenar}>Lucro</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => {
                  const r = roas(c)
                  const lucro = c.receita - c.gasto
                  const ligada = c.status === 'ACTIVE'
                  const efetivoDiferente = ligada && c.status_efetivo !== 'ACTIVE'
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-accent/20 align-middle">
                      <td className="px-4 py-3">
                        <Toggle ligado={ligada} onClick={() => setPendente({ tipo: 'status', c, para: ligada ? 'PAUSED' : 'ACTIVE' })} />
                      </td>
                      <td className="px-4 py-3 max-w-[380px]">
                        <div className="font-semibold break-words leading-snug">{c.nome}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {c.conta_nome}{c.moeda !== 'BRL' ? ` · ${c.moeda}` : ''}
                          {efetivoDiferente && <span className="ml-2 text-amber-300">{c.status_efetivo.replace(/_/g, ' ').toLowerCase()}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.orcamento_tipo === 'conjunto' ? (
                          <span className="text-[11px] text-muted-foreground" title="Orçamento nos conjuntos (ABO) — edite pelo gerenciador">nos conjuntos</span>
                        ) : editando === c.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setValorEdit(String(Math.round((c.orcamento ?? 0) * 0.8 * 100) / 100).replace('.', ','))}
                              className="text-[10px] font-bold px-1.5 py-1 rounded border border-border hover:bg-accent/60">−20%</button>
                            <input autoFocus value={valorEdit} onChange={(e) => setValorEdit(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') pedirOrcamento(c); if (e.key === 'Escape') setEditando(null) }}
                              className="w-24 px-2 py-1 rounded-md bg-background border border-primary text-right text-sm tabular-nums outline-none" />
                            <button onClick={() => setValorEdit(String(Math.round((c.orcamento ?? 0) * 1.2 * 100) / 100).replace('.', ','))}
                              className="text-[10px] font-bold px-1.5 py-1 rounded border border-border hover:bg-accent/60">+20%</button>
                            <button onClick={() => pedirOrcamento(c)} className="p-1 rounded text-emerald-400 hover:bg-accent/60" title="Salvar"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditando(null)} className="p-1 rounded text-muted-foreground hover:bg-accent/60" title="Cancelar"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => abrirEdicao(c)} className="group inline-flex items-center gap-1.5 justify-end">
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-40 group-hover:opacity-100 transition" />
                            <span className="text-left">
                              <span className="block tabular-nums font-semibold">{c.orcamento != null ? priv(fmtMoedaConta(c.orcamento, c.moeda)) : '—'}</span>
                              <span className="block text-[10px] text-muted-foreground text-right">{c.orcamento_tipo === 'diario' ? 'Diário' : 'Vitalício'}</span>
                            </span>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{priv(c.vendas)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {c.upsells > 0 ? (
                          <>
                            <div className="text-cyan-400 font-semibold leading-tight">{priv(c.upsells)}{c.vendas > 0 && <span className="text-[10px] text-muted-foreground font-normal"> · {((c.upsells / c.vendas) * 100).toFixed(0)}%</span>}</div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{brl(c.receita_upsell)}</div>
                          </>
                        ) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{brl(cpa(c))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{brl(c.gasto)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{brl(c.receita)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-bold ${corRoas(r)}`}>{roasFmt(r)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{c.gasto > 0 || c.receita > 0 ? brl(lucro) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-accent/20 font-bold text-[12px]">
                  <td className="px-4 py-3 text-muted-foreground">—</td>
                  <td className="px-4 py-3 uppercase tracking-wider">{visiveis.length} campanhas</td>
                  <td className="px-4 py-3 text-right tabular-nums">{tot.orc > 0 ? brl(tot.orc) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{priv(tot.v)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-cyan-400">{priv(tot.u)}{tot.v > 0 && !isPrivate ? <span className="text-[10px] text-muted-foreground font-normal"> · {((tot.u / tot.v) * 100).toFixed(0)}%</span> : null}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(tot.cpa)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(tot.g)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(tot.r)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${corRoas(tot.roas)}`}>{roasFmt(tot.roas)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${tot.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{brl(tot.lucro)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {semCampanha.vendas > 0 && (
          <div className="px-5 py-2.5 border-t border-border text-[11px] text-muted-foreground">
            {priv(semCampanha.vendas)} venda(s) de anúncio ({brl(semCampanha.receita)}) não casaram com nenhuma campanha — o nome no sck não bate com nenhuma campanha listada.
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
            ) : log.map((l, i) => (
              <div key={i} className="px-5 py-2.5 text-sm flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="text-muted-foreground tabular-nums">{new Date(l.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-semibold break-words">{l.campanha}</span>
                <span className="text-muted-foreground">
                  {l.acao === 'status'
                    ? (l.para === 'ACTIVE' ? 'ativou' : 'pausou')
                    : `orçamento ${typeof l.de === 'number' ? formatarMoeda(l.de) : '—'} → ${formatarMoeda(Number(l.para))}`}
                  {l.por ? ` · ${l.por}` : ''}
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

function Confirmacao({ pendente, salvando, onCancelar, onConfirmar }: { pendente: Pendente; salvando: boolean; onCancelar: () => void; onConfirmar: () => void }) {
  const { c } = pendente
  let titulo: string
  let detalhe: React.ReactNode
  let alerta: string | null = null
  if (pendente.tipo === 'status') {
    titulo = pendente.para === 'PAUSED' ? 'Pausar campanha?' : 'Ativar campanha?'
    detalhe = <>A campanha vai ser <b>{pendente.para === 'PAUSED' ? 'pausada' : 'ativada'}</b> na Meta agora.</>
  } else {
    const de = c.orcamento ?? 0
    const varPct = de > 0 ? ((pendente.para - de) / de) * 100 : null
    titulo = 'Alterar orçamento?'
    detalhe = (
      <>
        {c.orcamento_tipo === 'diario' ? 'Orçamento diário' : 'Orçamento vitalício'}:{' '}
        <b className="tabular-nums">{fmtMoedaConta(de, c.moeda)}</b> → <b className="tabular-nums">{fmtMoedaConta(pendente.para, c.moeda)}</b>
        {varPct != null && <span className={varPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}> ({varPct >= 0 ? '+' : ''}{varPct.toFixed(0)}%)</span>}
      </>
    )
    if (varPct != null && varPct > 20) alerta = 'Aumento acima de 20% de uma vez costuma fazer a Meta reiniciar o aprendizado.'
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onCancelar}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">{titulo}</h3>
        <p className="text-sm font-semibold mt-3 break-words">{c.nome}</p>
        <p className="text-xs text-muted-foreground">{c.conta_nome}</p>
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

function Th({ k, atual, desc, onClick, left, children }: { k: SortKey; atual: SortKey; desc: boolean; onClick: (k: SortKey) => void; left?: boolean; children: React.ReactNode }) {
  const ativo = k === atual
  return (
    <th className={`px-4 py-3 ${left ? 'text-left' : 'text-right'}`}>
      <button onClick={() => onClick(k)} className={`uppercase tracking-widest font-bold ${ativo ? 'text-primary' : 'hover:text-foreground'}`}>
        {children}{ativo ? (desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
}

function Select({ label, value, onChange, opcoes }: { label: string; value: string; onChange: (v: string) => void; opcoes: [string, string][] }) {
  return (
    <label className="min-w-[170px]">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm outline-none focus:border-primary">
        {opcoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function Resumo({ label, valor, sub, cor }: { label: string; valor: React.ReactNode; sub: React.ReactNode; cor: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  )
}
