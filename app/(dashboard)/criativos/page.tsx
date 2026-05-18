'use client'

import { useEffect, useState, useMemo } from 'react'
import { Plus, X, Trash2, Pause, Play, Search, Film } from 'lucide-react'
import {
  listarCriativos,
  criarCriativo,
  toggleStatusCriativo,
  deletarCriativo,
  type Criativo,
} from '@/app/actions/criativos'

const PREFIXO_PADRAO = 'IZ'
const TIPOS_CAMPANHA = ['CBO', 'ADV']
const OBJETIVOS = ['VENDAS', 'TRAFEGO', 'ENGAJAMENTO', 'LEADS']
const FASES = ['FASE01', 'FASE02', 'FASE03']

function buildPreview(prefixo: string, tipo: string, objetivo: string, fase: string) {
  const parts = [`[${prefixo || '??'}]`, `[${tipo || '??'}]`, `[${objetivo || '??'}]`, '[F]']
  if (fase) parts.push(`[${fase}]`)
  return parts.join('')
}

const inputClass = 'bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 w-full transition-colors'
const selectClass = inputClass

export default function CriativosPage() {
  const [lista, setLista] = useState<Criativo[]>([])
  const [modal, setModal] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'pausado'>('todos')

  // Form
  const [nome, setNome] = useState('')
  const [prefixo, setPrefixo] = useState(PREFIXO_PADRAO)
  const [tipoCampanha, setTipoCampanha] = useState('CBO')
  const [objetivo, setObjetivo] = useState('VENDAS')
  const [fase, setFase] = useState('FASE01')
  const [saving, setSaving] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const res = await listarCriativos()
    setLista(res.data)
  }

  function resetForm() {
    setNome(''); setPrefixo(PREFIXO_PADRAO); setTipoCampanha('CBO'); setObjetivo('VENDAS'); setFase('FASE01')
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    const res = await criarCriativo({ nome: nome.trim(), prefixo, tipo_campanha: tipoCampanha, objetivo, fase: fase || null })
    setSaving(false)
    if (res.success) { resetForm(); setModal(false); carregar() }
    else alert('Erro: ' + res.error)
  }

  async function handleToggle(c: Criativo) {
    const novo = c.status === 'ativo' ? 'pausado' : 'ativo'
    await toggleStatusCriativo(c.id, novo)
    setLista(prev => prev.map(x => x.id === c.id ? { ...x, status: novo } : x))
  }

  async function handleDeletar(id: string) {
    await deletarCriativo(id)
    setLista(prev => prev.filter(x => x.id !== id))
  }

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase()
    return lista.filter(c => {
      if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false
      if (q && !c.nome.toLowerCase().includes(q) && !c.campaign_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [lista, busca, filtroStatus])

  const ativos = lista.filter(c => c.status === 'ativo').length
  const pausados = lista.filter(c => c.status === 'pausado').length
  const preview = buildPreview(prefixo, tipoCampanha, objetivo, fase)

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Criativos</h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro central de criativos e campanhas</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          Novo Criativo
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: lista.length, onClick: () => setFiltroStatus('todos'), active: filtroStatus === 'todos', color: 'text-foreground', bg: 'bg-muted/10' },
          { label: 'Ativos', value: ativos, onClick: () => setFiltroStatus('ativo'), active: filtroStatus === 'ativo', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Pausados', value: pausados, onClick: () => setFiltroStatus('pausado'), active: filtroStatus === 'pausado', color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map(card => (
          <div
            key={card.label}
            onClick={card.onClick}
            className={`bg-card border rounded-2xl p-5 cursor-pointer transition-all ${card.active ? 'border-primary/50 shadow-lg shadow-primary/10' : 'border-border hover:border-border/80'}`}
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{card.label}</p>
            <p className={`text-3xl font-black ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
          <div className="relative flex-1 max-w-xs">
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

        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              <Film className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {lista.length === 0 ? 'Nenhum criativo cadastrado' : 'Nenhum resultado'}
            </p>
            {lista.length === 0 && (
              <p className="text-xs text-muted-foreground/60 mt-1">Clique em "Novo Criativo" para começar</p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/10">
                <th className="text-left px-6 py-3 font-semibold">Criativo</th>
                <th className="text-left px-6 py-3 font-semibold">Campanha</th>
                <th className="text-left px-6 py-3 font-semibold">Fase</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtrados.map(c => (
                <tr key={c.id} className={`hover:bg-muted/10 transition-colors ${c.status === 'pausado' ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-3.5 font-medium text-foreground max-w-[280px]">
                    <span className="truncate block">{c.nome}</span>
                  </td>
                  <td className="px-6 py-3.5 text-muted-foreground text-xs font-mono">{c.campaign_name}</td>
                  <td className="px-6 py-3.5">
                    {c.fase ? (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.fase === 'FASE01' ? 'bg-blue-500/15 text-blue-400' :
                        c.fase === 'FASE02' ? 'bg-purple-500/15 text-purple-400' :
                        'bg-orange-500/15 text-orange-400'
                      }`}>{c.fase}</span>
                    ) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => handleToggle(c)}
                      className={`text-[10px] font-bold px-3 py-1 rounded-full transition-all ${
                        c.status === 'ativo'
                          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                          : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                      }`}
                    >
                      {c.status === 'ativo' ? '● Ativo' : '⏸ Pausado'}
                    </button>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleToggle(c)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition" title={c.status === 'ativo' ? 'Pausar' : 'Ativar'}>
                        {c.status === 'ativo' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => handleDeletar(c.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition" title="Deletar">
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

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setModal(false); resetForm() }} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Novo Criativo</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Cadastre um criativo e configure sua campanha</p>
              </div>
              <button onClick={() => { setModal(false); resetForm() }} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCriar} className="p-6 space-y-4">
              {/* Preview */}
              <div className="bg-muted/20 border border-border/50 rounded-xl px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Preview da Campanha</p>
                <p className="text-sm font-mono font-bold text-primary">{preview}</p>
              </div>

              {/* Nome */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do Criativo</label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="ad15-vaza-video-de-quanto..."
                  className={inputClass}
                  required
                />
              </div>

              {/* Campanha config */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Prefixo</label>
                  <input type="text" value={prefixo} onChange={e => setPrefixo(e.target.value.toUpperCase())} className={inputClass} placeholder="IZ" required />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Tipo de Campanha</label>
                  <select value={tipoCampanha} onChange={e => setTipoCampanha(e.target.value)} className={selectClass}>
                    {TIPOS_CAMPANHA.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Objetivo</label>
                  <select value={objetivo} onChange={e => setObjetivo(e.target.value)} className={selectClass}>
                    {OBJETIVOS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Fase</label>
                  <select value={fase} onChange={e => setFase(e.target.value)} className={selectClass}>
                    <option value="">Sem fase</option>
                    {FASES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || !nome.trim()}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Cadastrar Criativo'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
