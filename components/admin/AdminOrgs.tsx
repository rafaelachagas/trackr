'use client'

import { useEffect, useState } from 'react'
import { Building2, Plus, Loader2, Copy, Check, X, Pencil, Trash2, Link2 } from 'lucide-react'

interface Subscription {
  plan_name: string | null
  status: string | null
  access_until: string | null
  max_workspaces: number | null
}
interface Org {
  id: string
  name: string
  slug: string
  created_at: string
  membros: number
  subscription: Subscription | null
}

const fmtData = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

export default function AdminOrgs() {
  const [orgs, setOrgs] = useState<Org[] | null>(null)
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<Org | null>(null)
  const [inviteLink, setInviteLink] = useState<{ orgId: string; url: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function carregar() {
    const r = await fetch('/api/admin/orgs', { cache: 'no-store' })
    const j = await r.json()
    setOrgs(j.orgs ?? [])
  }
  useEffect(() => { carregar() }, [])

  async function excluir(org: Org) {
    if (!confirm(`Excluir "${org.name}"? Isso remove membros, assinatura e convites dela. Não dá pra desfazer.`)) return
    await fetch(`/api/admin/orgs/${org.id}`, { method: 'DELETE' })
    carregar()
  }

  async function copiarLink() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink.url)
    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
  }

  if (!orgs) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{orgs.length} organizaç{orgs.length === 1 ? 'ão' : 'ões'}</p>
        <button
          onClick={() => setCriando(true)}
          className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-primary text-white hover:opacity-90 transition"
        >
          <Plus className="w-4 h-4" /> Nova organização
        </button>
      </div>

      <div className="space-y-2">
        {orgs.map((org) => (
          <div key={org.id} className="bg-card border border-border rounded-xl px-4 py-3.5 flex items-center gap-4 flex-wrap">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">{org.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">/{org.slug} · {org.membros} membro{org.membros !== 1 ? 's' : ''} · criada em {fmtData(org.created_at)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold" style={{ color: org.subscription?.status === 'active' ? '#10b981' : '#f59e0b' }}>
                {org.subscription?.plan_name ?? 'Sem plano'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {org.subscription?.access_until ? `até ${fmtData(org.subscription.access_until)}` : 'sem vencimento'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditando(org)} title="Editar plano" className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => excluir(org)} title="Excluir organização" className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {orgs.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Nenhuma organização ainda.</p>}
      </div>

      {criando && (
        <ModalNovaOrg
          onFechar={() => setCriando(false)}
          onCriada={(orgId, token) => {
            setCriando(false)
            carregar()
            if (token) setInviteLink({ orgId, url: `${window.location.origin}/convite/${token}` })
          }}
        />
      )}

      {editando && (
        <ModalEditarPlano org={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />
      )}

      {inviteLink && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setInviteLink(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-popover border border-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Organização criada</h3>
              <button onClick={() => setInviteLink(null)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">Manda esse link pro cliente entrar como admin da organização dele (expira em 7 dias, uso único):</p>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 border border-primary/25 bg-primary/5">
              <Link2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <p className="flex-1 text-[11px] font-mono text-muted-foreground truncate">{inviteLink.url}</p>
              <button onClick={copiarLink} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition text-white" style={{ backgroundColor: copiado ? '#10b981' : '#2E90FA' }}>
                {copiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModalNovaOrg({ onFechar, onCriada }: { onFechar: () => void; onCriada: (orgId: string, token: string | null) => void }) {
  const [nome, setNome] = useState('')
  const [plano, setPlano] = useState('Trial')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar() {
    setSalvando(true); setErro(null)
    const r = await fetch('/api/admin/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, plan_name: plano }),
    })
    const j = await r.json()
    setSalvando(false)
    if (!r.ok) return setErro(j.error || 'Erro ao criar')
    onCriada(j.org.id, j.inviteToken)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-popover border border-border shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Nova organização</h3>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Nome do cliente / empresa</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João Silva LTDA" className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border focus:border-primary outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Plano inicial</label>
          <input value={plano} onChange={(e) => setPlano(e.target.value)} placeholder="Trial" className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border focus:border-primary outline-none" />
        </div>
        {erro && <p className="text-xs text-rose-300">{erro}</p>}
        <div className="flex items-center gap-2 pt-2">
          <button onClick={criar} disabled={salvando || !nome.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar
          </button>
          <button onClick={onFechar} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-white/5">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function ModalEditarPlano({ org, onFechar, onSalvo }: { org: Org; onFechar: () => void; onSalvo: () => void }) {
  const [plano, setPlano] = useState(org.subscription?.plan_name ?? '')
  const [status, setStatus] = useState(org.subscription?.status ?? 'active')
  const [acessoAte, setAcessoAte] = useState(org.subscription?.access_until?.slice(0, 10) ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    await fetch(`/api/admin/orgs/${org.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_name: plano, status, access_until: acessoAte || null }),
    })
    setSalvando(false)
    onSalvo()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onFechar}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-popover border border-border shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Plano — {org.name}</h3>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Nome do plano</label>
          <input value={plano} onChange={(e) => setPlano(e.target.value)} placeholder="Ex.: Ilimitado, Trial, SCALE" className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border focus:border-primary outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border focus:border-primary outline-none">
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
            <option value="overdue">Em atraso</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Acesso até (vazio = sem vencimento)</label>
          <input type="date" value={acessoAte} onChange={(e) => setAcessoAte(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border focus:border-primary outline-none" />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
          </button>
          <button onClick={onFechar} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-white/5">Cancelar</button>
        </div>
      </div>
    </div>
  )
}
