'use client'

import { useEffect, useState } from 'react'
import { X, Copy, Check, Trash2, User, ChevronDown, Link2, Loader2, Crown } from 'lucide-react'
import type { OrgMembership } from '@/hooks/useAuth'

interface Member {
  user_id: string
  email: string
  full_name: string
  role: 'admin' | 'member'
  joined_at: string
}

interface Props {
  activeOrg: OrgMembership
  currentUserId: string
  onClose: () => void
}

export default function ModalUsuarios({ activeOrg, currentUserId, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null)
  const isAdmin = activeOrg.role === 'admin'

  useEffect(() => { fetchMembers() }, [])

  async function fetchMembers() {
    setLoading(true)
    const res = await fetch(`/api/org/members?org_id=${activeOrg.org_id}`)
    const json = await res.json()
    setMembers(json.members ?? [])
    setLoading(false)
  }

  async function generateInvite() {
    setGenerating(true)
    const res = await fetch(`/api/org/invite?org_id=${activeOrg.org_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: inviteRole }),
    })
    const json = await res.json()
    setGenerating(false)
    if (json.token) setInviteLink(`${window.location.origin}/convite/${json.token}`)
  }

  async function copyLink() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function removeMember(userId: string) {
    if (!confirm('Remover este membro da organização?')) return
    await fetch(`/api/org/members?org_id=${activeOrg.org_id}&user_id=${userId}`, { method: 'DELETE' })
    setMembers(prev => prev.filter(m => m.user_id !== userId))
  }

  async function changeRole(userId: string, role: 'admin' | 'member') {
    setRoleMenuOpen(null)
    await fetch(`/api/org/members?org_id=${activeOrg.org_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role }),
    })
    setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role } : m))
  }

  const initials = (m: Member) =>
    m.full_name ? m.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : m.email.slice(0, 2).toUpperCase()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="text-base font-black text-foreground tracking-tight">Gerenciar usuários</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Ajuste as permissões dos usuários nesta organização</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Convidar por link */}
          {isAdmin && (
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ backgroundColor: '#13181a', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Convidar por link</p>
              <p className="text-[11px] text-muted-foreground -mt-1">
                {inviteRole === 'admin' ? 'Admins têm acesso a tudo e podem integrar fontes de dados.' : 'Membros podem visualizar e usar o dashboard.'}
              </p>

              <div className="flex gap-2">
                {/* Seletor de papel */}
                <div className="relative">
                  <button
                    onClick={() => setRoleMenuOpen(roleMenuOpen === 'new' ? null : 'new')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition hover:bg-white/5"
                    style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
                  >
                    {inviteRole === 'admin' ? <Crown className="w-3 h-3 text-yellow-400" /> : <User className="w-3 h-3 text-muted-foreground" />}
                    {inviteRole === 'admin' ? 'Admin' : 'Membro'}
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                  {roleMenuOpen === 'new' && (
                    <div className="absolute top-full mt-1 left-0 z-20 rounded-xl p-1 w-32 shadow-xl" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {(['member', 'admin'] as const).map(r => (
                        <button
                          key={r}
                          onClick={() => { setInviteRole(r); setRoleMenuOpen(null); setInviteLink('') }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition hover:bg-white/5 text-left"
                          style={{ color: inviteRole === r ? '#00aeef' : '#e2e8f0' }}
                        >
                          {r === 'admin' ? <Crown className="w-3 h-3 text-yellow-400" /> : <User className="w-3 h-3" />}
                          {r === 'admin' ? 'Admin' : 'Membro'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={generateInvite}
                  disabled={generating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition"
                  style={{ backgroundColor: '#00aeef', color: '#000' }}
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Gerar link
                </button>
              </div>

              {inviteLink ? (
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: '#1a2022', border: '1px solid rgba(0,174,239,0.25)' }}
                >
                  <Link2 className="w-3 h-3 text-primary flex-shrink-0" />
                  <p className="flex-1 text-[10px] font-mono text-muted-foreground truncate">{inviteLink}</p>
                  <button
                    onClick={copyLink}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition"
                    style={{ backgroundColor: copied ? '#10b981' : '#00aeef', color: '#000' }}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copiado' : 'Copiar link'}
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">O link expira em 7 dias e só pode ser usado uma vez.</p>
              )}
            </div>
          )}

          {/* Lista de membros */}
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Membros ({members.length})
            </p>

            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : members.map(member => (
              <div
                key={member.user_id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ backgroundColor: '#13181a', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center font-black text-[11px] text-primary flex-shrink-0">
                  {initials(member)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">
                    {member.full_name || member.email}
                    {member.user_id === currentUserId && (
                      <span className="ml-2 text-[9px] font-black text-muted-foreground uppercase tracking-widest">você</span>
                    )}
                  </p>
                  {member.full_name && (
                    <p className="text-[10px] text-muted-foreground truncate">{member.email}</p>
                  )}
                </div>

                {/* Papel */}
                {isAdmin && member.user_id !== currentUserId ? (
                  <div className="relative">
                    <button
                      onClick={() => setRoleMenuOpen(roleMenuOpen === member.user_id ? null : member.user_id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition hover:bg-white/5"
                      style={{ color: member.role === 'admin' ? '#f59e0b' : '#6b7980' }}
                    >
                      {member.role === 'admin' ? <Crown className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {member.role === 'admin' ? 'Admin' : 'Membro'}
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                    {roleMenuOpen === member.user_id && (
                      <div className="absolute right-0 top-full mt-1 z-20 rounded-xl p-1 w-32 shadow-xl" style={{ backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {(['member', 'admin'] as const).map(r => (
                          <button
                            key={r}
                            onClick={() => changeRole(member.user_id, r)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition hover:bg-white/5 text-left"
                            style={{ color: member.role === r ? '#00aeef' : '#e2e8f0' }}
                          >
                            {r === 'admin' ? <Crown className="w-3 h-3 text-yellow-400" /> : <User className="w-3 h-3" />}
                            {r === 'admin' ? 'Admin' : 'Membro'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span
                    className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg"
                    style={{ color: member.role === 'admin' ? '#f59e0b' : '#00aeef', backgroundColor: member.role === 'admin' ? 'rgba(245,158,11,0.1)' : 'rgba(0,174,239,0.1)' }}
                  >
                    {member.role === 'admin' ? 'Admin' : 'Membro'}
                  </span>
                )}

                {isAdmin && member.user_id !== currentUserId && (
                  <button
                    onClick={() => removeMember(member.user_id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
