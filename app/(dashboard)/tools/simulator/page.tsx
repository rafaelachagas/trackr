'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp, Plus, Trash2, Copy, RotateCcw, Save, FolderOpen, X, FileText, Box, MessageSquare,
} from 'lucide-react'
import { listarSimulacoes, salvarSimulacao, deletarSimulacao, SimulacaoResumo } from '@/app/actions/simulador'

/* ————————————— Tipos ————————————— */
type Tipo = 'info' | 'crm'
interface Item { id: string; preco: number; adesao: number }        // order bump / upsell / downsell
interface InfoCenario {
  id: string; nome: string; vendasFront: number; precoFront: number
  bumps: Item[]; upsells: Item[]; downsells: Item[]; investimento: number | null
}
interface Etapa { id: string; nome: string; conversao: number }
interface CrmCenario {
  id: string; nome: string; leads: number; etapas: Etapa[]; precoVenda: number; investimento: number | null
}

const CORES = ['#00aeef', '#f5b301', '#8b5cf6', '#10b981', '#f43f5e', '#ec4899']
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.floor(Math.random() * 1e6)}`)
const letra = (i: number) => String.fromCharCode(65 + i)

function defInfo(i: number): InfoCenario {
  return { id: uid(), nome: `Cenário ${letra(i)}`, vendasFront: 100, precoFront: 27, bumps: [{ id: uid(), preco: 19, adesao: 30 }], upsells: [{ id: uid(), preco: 97, adesao: 12 }], downsells: [], investimento: null }
}
function defCrm(i: number): CrmCenario {
  return { id: uid(), nome: `Cenário ${letra(i)}`, leads: 1000, etapas: [{ id: uid(), nome: 'Atendimento', conversao: 70 }, { id: uid(), nome: 'Qualificado', conversao: 50 }, { id: uid(), nome: 'Venda', conversao: 20 }], precoVenda: 0, investimento: null }
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(isFinite(v) ? v : 0)
const cardClass = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

/* ————————————— Cálculos ————————————— */
function calcInfo(c: InfoCenario) {
  const front = c.vendasFront * c.precoFront
  const somaItens = (arr: Item[]) => arr.reduce((a, it) => a + c.vendasFront * (it.adesao / 100) * it.preco, 0)
  const bumps = somaItens(c.bumps), upsells = somaItens(c.upsells), downsells = somaItens(c.downsells)
  const total = front + bumps + upsells + downsells
  const ticket = c.vendasFront > 0 ? total / c.vendasFront : 0
  const roas = c.investimento && c.investimento > 0 ? total / c.investimento : null
  return { front, bumps, upsells, downsells, total, ticket, roas }
}
function calcCrm(c: CrmCenario) {
  let running = c.leads
  const resultados = c.etapas.map((e) => { running = running * (e.conversao / 100); return Math.round(running) })
  const vendas = resultados.length ? resultados[resultados.length - 1] : c.leads
  const total = vendas * c.precoVenda
  const roas = c.investimento && c.investimento > 0 ? total / c.investimento : null
  return { resultados, vendas, total, roas }
}

/* ————————————— Inputs auxiliares ————————————— */
function NumInput({ value, onChange, prefix, suffix, className }: { value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; className?: string }) {
  return (
    <div className={`flex items-center rounded-lg px-3 ${className ?? ''}`} style={inputStyle}>
      {prefix && <span className="text-xs text-muted-foreground mr-1">{prefix}</span>}
      <input type="number" value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className="bg-transparent outline-none py-2 text-sm w-full text-right font-semibold" />
      {suffix && <span className="text-xs text-muted-foreground ml-1">{suffix}</span>}
    </div>
  )
}
const Rotulo = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{children}</span>
)

/* ————————————— Página ————————————— */
export default function SimuladorPage() {
  const [tipo, setTipo] = useState<Tipo>('info')
  const [infoC, setInfoC] = useState<InfoCenario[]>([defInfo(0)])
  const [crmC, setCrmC] = useState<CrmCenario[]>([defCrm(0)])
  const [simId, setSimId] = useState<string | null>(null)
  const [simNome, setSimNome] = useState<string>('')
  const [salvas, setSalvas] = useState<SimulacaoResumo[]>([])
  const [modalSalvar, setModalSalvar] = useState(false)
  const [nomeInput, setNomeInput] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function recarregar() { setSalvas(await listarSimulacoes()) }
  useEffect(() => { recarregar() }, [])
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3000) }

  // —— Ações topo ——
  function nova() {
    setInfoC([defInfo(0)]); setCrmC([defCrm(0)]); setSimId(null); setSimNome(''); flash('Nova simulação criada.')
  }
  function reiniciar() {
    if (tipo === 'info') setInfoC([defInfo(0)]); else setCrmC([defCrm(0)])
    flash('Cenários reiniciados.')
  }
  async function salvar() {
    setBusy(true)
    const dados = { tipo, infoC, crmC }
    const r = await salvarSimulacao(nomeInput || simNome, dados, simId ?? undefined)
    setBusy(false)
    if (r.success) {
      setSimId(r.id ?? simId); setSimNome(nomeInput || simNome); setModalSalvar(false); setNomeInput('')
      recarregar(); flash('Simulação salva!')
    } else flash(`Erro: ${r.error}`)
  }
  function carregar(s: SimulacaoResumo) {
    const d = s.dados || {}
    setTipo(d.tipo === 'crm' ? 'crm' : 'info')
    setInfoC(Array.isArray(d.infoC) && d.infoC.length ? d.infoC : [defInfo(0)])
    setCrmC(Array.isArray(d.crmC) && d.crmC.length ? d.crmC : [defCrm(0)])
    setSimId(s.id); setSimNome(s.nome); flash(`"${s.nome}" carregada.`)
  }
  async function excluir(id: string) {
    await deletarSimulacao(id); if (id === simId) { setSimId(null); setSimNome('') }
    recarregar()
  }

  // —— Cenários ——
  const cenarios = tipo === 'info' ? infoC : crmC
  function addCenario() {
    if (tipo === 'info') setInfoC((p) => [...p, defInfo(p.length)])
    else setCrmC((p) => [...p, defCrm(p.length)])
  }
  function dupCenario(i: number) {
    if (tipo === 'info') setInfoC((p) => { const c = { ...JSON.parse(JSON.stringify(p[i])), id: uid(), nome: `Cenário ${letra(p.length)}` }; return [...p, c] })
    else setCrmC((p) => { const c = { ...JSON.parse(JSON.stringify(p[i])), id: uid(), nome: `Cenário ${letra(p.length)}` }; return [...p, c] })
  }
  function delCenario(i: number) {
    if (tipo === 'info') setInfoC((p) => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)
    else setCrmC((p) => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)
  }
  const patchInfo = (i: number, patch: Partial<InfoCenario>) => setInfoC((p) => p.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  const patchCrm = (i: number, patch: Partial<CrmCenario>) => setCrmC((p) => p.map((c, idx) => idx === i ? { ...c, ...patch } : c))

  // Melhor cenário (maior faturamento) pra destacar
  const totais = useMemo(() => tipo === 'info' ? infoC.map((c) => calcInfo(c).total) : crmC.map((c) => calcCrm(c).total), [tipo, infoC, crmC])
  const melhor = totais.length ? totais.indexOf(Math.max(...totais)) : -1

  return (
    <div className="pb-20 max-w-[1200px] mx-auto w-full text-foreground space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.06)' }}>
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Simulador de Funil</h1>
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary">Beta</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Simule funis de infoproduto ou de captação (CRM). Monte cada cenário e compare onde está o maior faturamento.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          <button onClick={nova} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/5" style={inputStyle}><FileText className="w-4 h-4" /> Nova</button>
          <button onClick={reiniciar} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/5" style={inputStyle}><RotateCcw className="w-4 h-4" /> Reiniciar</button>
          <button onClick={() => { setNomeInput(simNome); setModalSalvar(true) }} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 flex items-center gap-2"><Save className="w-4 h-4" /> Salvar simulação</button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Simulação atual: <b className="text-foreground">{simNome || 'nova (não salva)'}</b></p>

      {/* Simulações salvas */}
      <div className={`rounded-2xl p-5 ${cardClass}`}>
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-bold">Simulações salvas</h2>
          <span className="text-[11px] text-muted-foreground ml-auto">{salvas.length} salvas</span>
        </div>
        {salvas.length === 0
          ? <p className="text-xs text-muted-foreground">Nenhuma simulação salva ainda. Monte seus cenários e clique em <b>Salvar simulação</b>.</p>
          : <div className="flex flex-wrap gap-2">
            {salvas.map((s) => (
              <div key={s.id} className={`flex items-center gap-2 rounded-lg pl-3 pr-1.5 py-1.5 ${s.id === simId ? 'border-primary/40' : 'border-white/10'} border`} style={{ backgroundColor: '#1a2022' }}>
                <button onClick={() => carregar(s)} className="text-xs font-semibold hover:text-primary">{s.nome}</button>
                <button onClick={() => excluir(s.id)} className="text-muted-foreground hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>}
      </div>

      {/* Seletor de tipo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={() => setTipo('info')} className={`text-left rounded-2xl p-4 border transition ${tipo === 'info' ? 'border-primary/50' : 'border-white/5 hover:bg-white/5'}`} style={{ backgroundColor: '#13181a' }}>
          <div className="flex items-center gap-2 mb-1">
            <Box className="w-4 h-4 text-primary" /><span className="font-bold text-sm">Funil de infoproduto</span>
            {tipo === 'info' && <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary ml-auto">Ativo</span>}
          </div>
          <p className="text-xs text-muted-foreground">Front-end, order bumps, upsells e downsell. Foco em ticket médio e backend.</p>
        </button>
        <button onClick={() => setTipo('crm')} className={`text-left rounded-2xl p-4 border transition ${tipo === 'crm' ? 'border-primary/50' : 'border-white/5 hover:bg-white/5'}`} style={{ backgroundColor: '#13181a' }}>
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-4 h-4 text-primary" /><span className="font-bold text-sm">Funil de CRM / Captação</span>
            {tipo === 'crm' && <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary ml-auto">Ativo</span>}
          </div>
          <p className="text-xs text-muted-foreground">Leads → etapas com conversão → venda. Para WhatsApp e geração de leads.</p>
        </button>
      </div>

      {/* Cenários */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {tipo === 'info'
          ? infoC.map((c, i) => <CardInfo key={c.id} c={c} i={i} cor={CORES[i % CORES.length]} melhor={i === melhor && infoC.length > 1} podeExcluir={infoC.length > 1} patch={(p) => patchInfo(i, p)} dup={() => dupCenario(i)} del={() => delCenario(i)} />)
          : crmC.map((c, i) => <CardCrm key={c.id} c={c} i={i} cor={CORES[i % CORES.length]} melhor={i === melhor && crmC.length > 1} podeExcluir={crmC.length > 1} patch={(p) => patchCrm(i, p)} dup={() => dupCenario(i)} del={() => delCenario(i)} />)}
        {cenarios.length < 6 && (
          <button onClick={addCenario} className="rounded-2xl border border-dashed border-white/10 flex items-center justify-center min-h-[200px] text-muted-foreground hover:text-primary hover:border-primary/40 transition">
            <span className="flex items-center gap-2 text-sm font-semibold"><Plus className="w-4 h-4" /> Adicionar cenário</span>
          </button>
        )}
      </div>

      {/* Modal salvar */}
      {modalSalvar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setModalSalvar(false)}>
          <div className={`w-full max-w-[440px] rounded-2xl p-6 ${cardClass}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2"><Save className="w-4 h-4 text-primary" /><h3 className="text-base font-bold">Salvar simulação</h3></div>
              <button onClick={() => setModalSalvar(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <Rotulo>Nome</Rotulo>
            <input autoFocus value={nomeInput} onChange={(e) => setNomeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
              placeholder="Ex: Lançamento ebook — cenário base" className="w-full mt-1.5 px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
            {simId && <p className="text-[11px] text-muted-foreground mt-2">Salvando por cima de &quot;{simNome}&quot;. Pra criar outra, mude o nome depois de <b>Nova</b>.</p>}
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setModalSalvar(false)} className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white/5" style={inputStyle}>Cancelar</button>
              <button onClick={salvar} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" /> Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ————————————— Card Infoproduto ————————————— */
function CardInfo({ c, i, cor, melhor, podeExcluir, patch, dup, del }: {
  c: InfoCenario; i: number; cor: string; melhor: boolean; podeExcluir: boolean
  patch: (p: Partial<InfoCenario>) => void; dup: () => void; del: () => void
}) {
  const r = calcInfo(c)
  const setItem = (campo: 'bumps' | 'upsells' | 'downsells', id: string, p: Partial<Item>) =>
    patch({ [campo]: c[campo].map((it) => it.id === id ? { ...it, ...p } : it) } as any)
  const addItem = (campo: 'bumps' | 'upsells' | 'downsells', preco: number) =>
    patch({ [campo]: [...c[campo], { id: uid(), preco, adesao: 15 }] } as any)
  const delItem = (campo: 'bumps' | 'upsells' | 'downsells', id: string) =>
    patch({ [campo]: c[campo].filter((it) => it.id !== id) } as any)

  const Secao = ({ campo, titulo, addLabel, addPreco }: { campo: 'bumps' | 'upsells' | 'downsells'; titulo: string; addLabel: string; addPreco: number }) => (
    <div>
      <Rotulo>{titulo}</Rotulo>
      <div className="space-y-2 mt-1.5">
        {c[campo].map((it) => (
          <div key={it.id} className="flex items-end gap-2">
            <div className="flex-1"><span className="text-[10px] text-muted-foreground">Preço</span><NumInput prefix="R$" value={it.preco} onChange={(v) => setItem(campo, it.id, { preco: v })} /></div>
            <div className="flex-1"><span className="text-[10px] text-muted-foreground">Adesão</span><NumInput suffix="%" value={it.adesao} onChange={(v) => setItem(campo, it.id, { adesao: v })} /></div>
            <button onClick={() => delItem(campo, it.id)} className="text-muted-foreground hover:text-rose-400 pb-2"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <button onClick={() => addItem(campo, addPreco)} className="w-full py-1.5 rounded-lg border border-dashed border-white/10 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/40">+ {addLabel}</button>
      </div>
    </div>
  )

  return (
    <div className="rounded-2xl p-4 border relative" style={{ backgroundColor: '#13181a', borderColor: melhor ? cor : 'rgba(255,255,255,0.06)', borderTopWidth: 2, borderTopColor: cor }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cor }} />
          <input value={c.nome} onChange={(e) => patch({ nome: e.target.value })} className="bg-transparent outline-none font-bold text-sm w-32" />
          {melhor && <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ backgroundColor: `${cor}22`, color: cor }}>Melhor</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={dup} className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
          {podeExcluir && <button onClick={del} className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between"><Rotulo>Front-end</Rotulo><span className="text-[10px] text-muted-foreground">+ tráfego + conversão</span></div>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <div><span className="text-[10px] text-muted-foreground">Vendas do front</span><NumInput value={c.vendasFront} onChange={(v) => patch({ vendasFront: v })} /></div>
            <div><span className="text-[10px] text-muted-foreground">Preço do front</span><NumInput prefix="R$" value={c.precoFront} onChange={(v) => patch({ precoFront: v })} /></div>
          </div>
        </div>
        <Secao campo="bumps" titulo="Order bumps" addLabel="adicionar order bump" addPreco={19} />
        <Secao campo="upsells" titulo="Upsells" addLabel="adicionar upsell" addPreco={97} />
        <Secao campo="downsells" titulo="Downsell" addLabel="adicionar downsell" addPreco={47} />
        <div>
          <Rotulo>Investimento (ROAS)</Rotulo>
          <NumInput prefix="R$" value={c.investimento ?? 0} onChange={(v) => patch({ investimento: v || null })} className="mt-1.5" />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 space-y-1">
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>Ticket médio</span><span className="font-semibold text-foreground">{brl(r.ticket)}</span></div>
        {r.roas != null && <div className="flex justify-between text-[11px] text-muted-foreground"><span>ROAS</span><span className="font-semibold" style={{ color: cor }}>{r.roas.toFixed(2)}x</span></div>}
        <Rotulo>Faturamento total</Rotulo>
        <p className="text-2xl font-black" style={{ color: cor }}>{brl(r.total)}</p>
      </div>
    </div>
  )
}

/* ————————————— Card CRM ————————————— */
function CardCrm({ c, i, cor, melhor, podeExcluir, patch, dup, del }: {
  c: CrmCenario; i: number; cor: string; melhor: boolean; podeExcluir: boolean
  patch: (p: Partial<CrmCenario>) => void; dup: () => void; del: () => void
}) {
  const r = calcCrm(c)
  const setEtapa = (id: string, p: Partial<Etapa>) => patch({ etapas: c.etapas.map((e) => e.id === id ? { ...e, ...p } : e) })
  const addEtapa = () => patch({ etapas: [...c.etapas, { id: uid(), nome: 'Nova etapa', conversao: 50 }] })
  const delEtapa = (id: string) => patch({ etapas: c.etapas.length > 1 ? c.etapas.filter((e) => e.id !== id) : c.etapas })

  return (
    <div className="rounded-2xl p-4 border relative" style={{ backgroundColor: '#13181a', borderColor: melhor ? cor : 'rgba(255,255,255,0.06)', borderTopWidth: 2, borderTopColor: cor }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cor }} />
          <input value={c.nome} onChange={(e) => patch({ nome: e.target.value })} className="bg-transparent outline-none font-bold text-sm w-32" />
          {melhor && <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ backgroundColor: `${cor}22`, color: cor }}>Melhor</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={dup} className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
          {podeExcluir && <button onClick={del} className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between"><Rotulo>Entrada de leads</Rotulo><span className="text-[10px] text-muted-foreground">+ tráfego + captação</span></div>
          <div className="mt-1.5"><span className="text-[10px] text-muted-foreground">Nº de leads</span><NumInput value={c.leads} onChange={(v) => patch({ leads: v })} /></div>
        </div>
        <div>
          <div className="grid grid-cols-[1fr_70px_70px_24px] gap-2 items-center">
            <Rotulo>Etapa</Rotulo><Rotulo>Conv. %</Rotulo><Rotulo>Result.</Rotulo><span />
          </div>
          <div className="space-y-2 mt-1.5">
            {c.etapas.map((e, idx) => (
              <div key={e.id} className="grid grid-cols-[1fr_70px_70px_24px] gap-2 items-center">
                <input value={e.nome} onChange={(ev) => setEtapa(e.id, { nome: ev.target.value })} className="rounded-lg px-2.5 py-2 text-sm outline-none" style={inputStyle} />
                <NumInput suffix="%" value={e.conversao} onChange={(v) => setEtapa(e.id, { conversao: v })} />
                <span className="text-sm font-semibold text-center text-foreground">{r.resultados[idx]}</span>
                <button onClick={() => delEtapa(e.id)} className="text-muted-foreground hover:text-rose-400"><X className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={addEtapa} className="w-full py-1.5 rounded-lg border border-dashed border-white/10 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/40">+ adicionar etapa</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-[10px] text-muted-foreground">Preço da venda</span><NumInput prefix="R$" value={c.precoVenda} onChange={(v) => patch({ precoVenda: v })} /></div>
          <div><span className="text-[10px] text-muted-foreground">Investimento</span><NumInput prefix="R$" value={c.investimento ?? 0} onChange={(v) => patch({ investimento: v || null })} /></div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 space-y-1">
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>Vendas</span><span className="font-semibold text-foreground">{r.vendas}</span></div>
        {r.roas != null && <div className="flex justify-between text-[11px] text-muted-foreground"><span>ROAS</span><span className="font-semibold" style={{ color: cor }}>{r.roas.toFixed(2)}x</span></div>}
        <Rotulo>Faturamento total</Rotulo>
        <p className="text-2xl font-black" style={{ color: cor }}>{brl(r.total)}</p>
      </div>
    </div>
  )
}
