'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, X, Loader2, Film, Check } from 'lucide-react'
import VslViewer from '@/components/vturb/VslViewer'
import { listarVSLs, salvarVSL, removerVSL, listarCampanhasMeta, type VSL, type CampanhaMeta } from '@/app/actions/vsl'

type PlayerOpt = { id: string; name: string; duration: number | null }
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

  if (aberto) return <VslViewer vsl={aberto} onVoltar={() => setAberto(null)} />

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
