'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Trash2, Pencil, X, Loader2, ArrowLeft, Film, Check, Zap } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { subDays, startOfMonth, format } from 'date-fns'
import { listarVSLs, salvarVSL, removerVSL, listarCampanhasMeta, type VSL, type CampanhaMeta } from '@/app/actions/vsl'

const TZ = 'America/Sao_Paulo'
type PlayerOpt = { id: string; name: string; duration: number | null }
type Periodo = 'Hoje' | '7 dias' | '30 dias' | 'Mês'

function rangeDe(p: Periodo) {
  const hoje = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
  const nowSP = new Date(`${hoje}T12:00:00`)
  if (p === 'Hoje') return { d_inicio: hoje, d_fim: hoje }
  if (p === '7 dias') return { d_inicio: format(subDays(nowSP, 6), 'yyyy-MM-dd'), d_fim: hoje }
  if (p === '30 dias') return { d_inicio: format(subDays(nowSP, 29), 'yyyy-MM-dd'), d_fim: hoje }
  return { d_inicio: format(startOfMonth(nowSP), 'yyyy-MM-dd'), d_fim: hoje }
}

const fmtBRL = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)
const fmtNum = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('pt-BR').format(Math.round(n)))
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function VslManager() {
  const [vsls, setVsls] = useState<VSL[]>([])
  const [players, setPlayers] = useState<PlayerOpt[]>([])
  const [campanhas, setCampanhas] = useState<CampanhaMeta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<Partial<VSL> | null>(null)
  const [aberto, setAberto] = useState<VSL | null>(null)

  const carregar = useCallback(async () => {
    const [v, c] = await Promise.all([listarVSLs(), listarCampanhasMeta()])
    if (v.success) setVsls(v.data)
    if (c.success) setCampanhas(c.data)
    try {
      const r = await fetch('/api/vturb/players', { cache: 'no-store' })
      const j = await r.json()
      if (j.ok) setPlayers(j.players)
    } catch {}
    setCarregando(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function remover(id: string) {
    if (!confirm('Remover este VSL?')) return
    await removerVSL(id)
    carregar()
    if (aberto?.id === id) setAberto(null)
  }

  if (aberto) return <Viewer vsl={aberto} onVoltar={() => setAberto(null)} />

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Meus VSLs</span>
        </div>
        <button onClick={() => setForm({ campanhas: [] })}
          className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-primary text-white hover:opacity-90 transition">
          <Plus className="w-4 h-4" /> Adicionar VSL
        </button>
      </div>

      <div className="px-4 sm:px-6 py-5">
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
        ) : vsls.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum VSL cadastrado. Clique em <b>Adicionar VSL</b> pra começar a medir o Play Rate real.</p>
        ) : (
          <div className="space-y-2">
            {vsls.map((v) => (
              <div key={v.id} className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
                <button onClick={() => setAberto(v)} className="min-w-0 flex-1 text-left group">
                  <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition">{v.nome}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {v.vturb_player_name || v.vturb_player_id} · {v.campanhas.length === 0 ? 'todas as campanhas' : `${v.campanhas.length} campanha(s)`}
                  </p>
                </button>
                <button onClick={() => setAberto(v)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition">Ver métricas</button>
                <button onClick={() => setForm(v)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => remover(v.id)} className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {form && (
        <FormVSL form={form} players={players} campanhas={campanhas} onFechar={() => setForm(null)} onSalvo={() => { setForm(null); carregar() }} />
      )}
    </div>
  )
}

function FormVSL({ form, players, campanhas, onFechar, onSalvo }: {
  form: Partial<VSL>; players: PlayerOpt[]; campanhas: CampanhaMeta[]
  onFechar: () => void; onSalvo: () => void
}) {
  const [nome, setNome] = useState(form.nome ?? '')
  const [playerId, setPlayerId] = useState(form.vturb_player_id ?? '')
  const [url, setUrl] = useState(form.landing_url ?? '')
  const [todas, setTodas] = useState((form.campanhas ?? []).length === 0)
  const [sel, setSel] = useState<string[]>(form.campanhas ?? [])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const inputStyle = 'w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border focus:border-primary outline-none transition'

  async function salvar() {
    setSalvando(true); setErro(null)
    const player = players.find((p) => p.id === playerId)
    const r = await salvarVSL({
      id: form.id, nome, vturb_player_id: playerId,
      vturb_player_name: player?.name ?? form.vturb_player_name ?? null,
      video_duration: player?.duration ?? form.video_duration ?? null,
      landing_url: url, campanhas: todas ? [] : sel,
    })
    setSalvando(false)
    if (r.success) onSalvo()
    else setErro(r.error || 'Erro ao salvar')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <h3 className="text-base font-bold flex-1">{form.id ? 'Editar VSL' : 'Novo VSL'}</h3>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Nome do VSL</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Fria — Mãe da Rafa" className={inputStyle} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Player da VTurb</label>
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={inputStyle}>
              <option value="">Selecione o player...</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {players.length === 0 && <p className="text-[11px] text-amber-400/80 mt-1">Nenhum player carregado — confira a conexão VTurb acima.</p>}
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Landing page (opcional)</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className={`${inputStyle} font-mono`} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Campanhas da Meta que mandam tráfego</label>
            <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
              <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} className="accent-[color:var(--primary)]" />
              Todas as campanhas
            </label>
            {!todas && (
              <div className="max-h-44 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {campanhas.length === 0 && <p className="text-[12px] text-muted-foreground p-3">Nenhuma campanha encontrada (sincronize a Meta primeiro).</p>}
                {campanhas.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer hover:bg-white/5">
                    <input type="checkbox" checked={sel.includes(c.id)}
                      onChange={(e) => setSel((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))}
                      className="accent-[color:var(--primary)]" />
                    <span className="truncate">{c.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {erro && <p className="text-[12px] text-rose-300">{erro}</p>}
        </div>

        <div className="flex items-center gap-2 p-5 border-t border-border">
          <button onClick={salvar} disabled={salvando || !nome.trim() || !playerId}
            className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
          </button>
          <button onClick={onFechar} className="px-4 py-2 rounded-lg text-sm font-semibold border border-white/10 text-muted-foreground hover:bg-white/5 transition">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function Viewer({ vsl, onVoltar }: { vsl: VSL; onVoltar: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>('7 dias')
  const [dados, setDados] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    setCarregando(true)
    const { d_inicio, d_fim } = rangeDe(periodo)
    fetch(`/api/vturb/vsl-stats?vsl_id=${vsl.id}&d_inicio=${d_inicio}&d_fim=${d_fim}`, { cache: 'no-store' })
      .then((r) => r.json()).then(setDados).catch(() => setDados({ error: 'Falha ao carregar' }))
      .finally(() => setCarregando(false))
  }, [vsl.id, periodo])

  const r = dados?.real, vt = dados?.vturb, mt = dados?.meta

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVoltar} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><ArrowLeft className="w-4 h-4" /></button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{vsl.nome}</h2>
          <p className="text-[11px] text-muted-foreground truncate">{vsl.vturb_player_name || vsl.vturb_player_id}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {(['Hoje', '7 dias', '30 dias', 'Mês'] as Periodo[]).map((p) => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition ${periodo === p ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>{p}</button>
          ))}
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando métricas...</div>
      ) : dados?.error ? (
        <div className="rounded-xl p-4 bg-rose-500/8 border border-rose-500/25 text-rose-200 text-sm">{dados.error}</div>
      ) : (
        <>
          {/* Destaque: Play Rate Real */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card border border-primary/30 rounded-2xl p-5 relative overflow-hidden">
              <div className="flex items-center gap-1.5 mb-1"><Zap className="w-3.5 h-3.5 text-primary" /><span className="text-[10px] font-black uppercase tracking-widest text-primary">Play Rate Real</span></div>
              <p className="text-3xl font-black text-foreground">{fmtPct(r?.playRateReal)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">plays únicos ÷ LP views da Meta</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Play Rate VTurb</span>
              <p className="text-3xl font-black text-muted-foreground/80 line-through decoration-rose-400/40">{fmtPct(vt?.playRateVturb)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">inflado pelas views do preview</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ROAS Real</span>
              <p className="text-3xl font-black text-emerald-400">{r?.roas == null ? '—' : `${r.roas.toFixed(2).replace('.', ',')}x`}</p>
              <p className="text-[11px] text-muted-foreground mt-1">receita VTurb ÷ gasto Meta</p>
            </div>
          </div>

          {/* Curva de retenção */}
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
            <h3 className="text-sm font-bold mb-4">Retenção</h3>
            <div className="w-full h-[260px]">
              {(dados?.retencao?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dados.retencao} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="ret" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="t" tickFormatter={mmss} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={38} />
                    <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'Retenção']} labelFormatter={(l) => mmss(Number(l))}
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                    <Area type="monotone" dataKey="pct" stroke="#22c55e" strokeWidth={2} fill="url(#ret)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados de retenção no período.</div>
              )}
            </div>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Card label="Plays únicos (VTurb)" valor={fmtNum(vt?.playsUnicos)} />
            <Card label="LP Views (Meta)" valor={fmtNum(mt?.lpViews)} />
            <Card label="Views únicas (VTurb)" valor={fmtNum(vt?.viewsUnicas)} />
            <Card label="Custo por Play" valor={fmtBRL(r?.custoPorPlay)} />
            <Card label="Custo por LP View" valor={fmtBRL(r?.custoPorLp)} />
            <Card label="Conversões" valor={fmtNum(vt?.conversoes)} />
            <Card label="Receita (VTurb)" valor={fmtBRL(vt?.receitaVturb)} />
            <Card label="CPA" valor={fmtBRL(r?.cpa)} />
            <Card label="Gasto (Meta)" valor={fmtBRL(mt?.gasto)} />
            <Card label="Engajamento" valor={fmtPct(vt?.engajamento)} />
          </div>
        </>
      )}
    </div>
  )
}

function Card({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5">
      <p className="text-lg font-black text-foreground leading-tight tabular-nums">{valor}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
