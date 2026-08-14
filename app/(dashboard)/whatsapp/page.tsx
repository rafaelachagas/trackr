'use client'

import React, { useEffect, useState } from 'react'
import { MessageCircle, Plus, Trash2, RefreshCw, Check } from 'lucide-react'
import { BLOCOS, WppConfig, WppCommand, WppGroup } from '@/lib/whatsapp'
import { getWhatsappConfig, saveWhatsappConfig, listWhatsappGroups, GrupoWpp } from '@/app/actions/whatsapp'

const ALL_BLOCKS = BLOCOS.map((b) => b.key)
let idSeed = 0
const novoId = () => `cmd_${Date.now()}_${idSeed++}`

export default function WhatsappPage() {
  const [config, setConfig] = useState<WppConfig>({ commands: [], groups: [] })
  const [grupos, setGrupos] = useState<GrupoWpp[]>([])
  const [grupoErro, setGrupoErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    const [cfg, g] = await Promise.all([getWhatsappConfig(), listWhatsappGroups()])
    setConfig(cfg)
    setGrupos(g.groups)
    setGrupoErro(g.error ?? null)
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  // —— Grupos ——
  function grupoCfg(jid: string): WppGroup | undefined {
    return config.groups.find((x) => x.jid === jid)
  }
  function setGrupo(jid: string, name: string, patch: Partial<WppGroup>) {
    setConfig((prev) => {
      const groups = [...prev.groups]
      const i = groups.findIndex((x) => x.jid === jid)
      if (i === -1) groups.push({ jid, name, enabled: true, allowedBlocks: [...ALL_BLOCKS], ...patch })
      else groups[i] = { ...groups[i], name, ...patch }
      return { ...prev, groups }
    })
  }
  function toggleGrupoBloco(jid: string, name: string, bloco: string) {
    const g = grupoCfg(jid)
    const atual = g?.allowedBlocks ?? []
    const novo = atual.includes(bloco) ? atual.filter((b) => b !== bloco) : [...atual, bloco]
    setGrupo(jid, name, { allowedBlocks: novo })
  }

  // —— Comandos ——
  function updateCmd(id: string, patch: Partial<WppCommand>) {
    setConfig((prev) => ({ ...prev, commands: prev.commands.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  }
  function toggleCmdBloco(id: string, bloco: string) {
    const c = config.commands.find((x) => x.id === id)
    if (!c) return
    const novo = c.blocks.includes(bloco) ? c.blocks.filter((b) => b !== bloco) : [...c.blocks, bloco]
    updateCmd(id, { blocks: novo })
  }
  function addCmd() {
    setConfig((prev) => ({ ...prev, commands: [...prev.commands, { id: novoId(), trigger: '/', enabled: true, blocks: [], header: '', footer: '' }] }))
  }
  function removeCmd(id: string) {
    setConfig((prev) => ({ ...prev, commands: prev.commands.filter((c) => c.id !== id) }))
  }

  async function salvar() {
    setSaving(true); setMsg(null)
    const r = await saveWhatsappConfig(config)
    setSaving(false)
    setMsg(r.success ? 'Salvo! Já vale nas próximas mensagens.' : `Erro: ${r.error}`)
    setTimeout(() => setMsg(null), 4000)
  }

  const cardStyle: React.CSSProperties = { backgroundColor: '#13181a', border: '1px solid rgba(255,255,255,0.05)' }
  const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
  }

  return (
    <div className="pb-16 space-y-6 max-w-[1000px] mx-auto w-full text-foreground">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp — Bot de Relatórios</h1>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          <button onClick={carregar} className="px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/5" style={inputStyle}>
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={salvar} disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
          </button>
        </div>
      </div>

      {/* GRUPOS */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <h2 className="text-sm font-bold mb-1">Grupos & Permissões</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Ligue o bot por grupo e escolha quais blocos cada grupo pode ver. Grupo desligado = bot não responde nele.
          {config.groups.length === 0 && ' (Nenhum grupo configurado ainda: o bot responde em qualquer grupo — configure abaixo para restringir.)'}
        </p>
        {grupoErro && <p className="text-xs text-amber-400 mb-3">Não consegui listar os grupos ({grupoErro}). Confira se o número está conectado.</p>}
        {grupos.length === 0 && !grupoErro && <p className="text-xs text-muted-foreground">Nenhum grupo encontrado. Adicione o número em um grupo e clique em atualizar.</p>}
        <div className="space-y-3">
          {grupos.map((g) => {
            const cfg = grupoCfg(g.jid)
            const on = cfg?.enabled ?? false
            return (
              <div key={g.jid} className="rounded-xl p-3" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-sm truncate">{g.name}</span>
                  <label className="flex items-center gap-2 text-xs cursor-pointer shrink-0">
                    <input type="checkbox" checked={on} onChange={(e) => setGrupo(g.jid, g.name, { enabled: e.target.checked })} />
                    {on ? 'Ativo' : 'Desligado'}
                  </label>
                </div>
                {on && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {BLOCOS.map((b) => {
                      const checked = (cfg?.allowedBlocks ?? []).includes(b.key)
                      return (
                        <button key={b.key} onClick={() => toggleGrupoBloco(g.jid, g.name, b.key)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                          {b.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* COMANDOS */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold">Comandos</h2>
            <p className="text-xs text-muted-foreground">O gatilho é o texto que dispara (ex.: /relatorio). Escolha os blocos que ele responde.</p>
          </div>
          <button onClick={addCmd} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/5" style={inputStyle}>
            <Plus className="w-4 h-4" /> Novo comando
          </button>
        </div>
        <div className="space-y-4">
          {config.commands.map((c) => (
            <div key={c.id} className="rounded-xl p-4" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <input value={c.trigger} onChange={(e) => updateCmd(c.id, { trigger: e.target.value })}
                  placeholder="/comando" className="px-3 py-2 rounded-lg text-sm font-mono w-40" style={inputStyle} />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => updateCmd(c.id, { enabled: e.target.checked })} /> Ativo
                </label>
                <button onClick={() => removeCmd(c.id)} className="ml-auto text-muted-foreground hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {BLOCOS.map((b) => {
                  const checked = c.blocks.includes(b.key)
                  return (
                    <button key={b.key} onClick={() => toggleCmdBloco(c.id, b.key)} title={b.desc}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                      {b.label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <input value={c.header ?? ''} onChange={(e) => updateCmd(c.id, { header: e.target.value })}
                  placeholder="Texto de abertura (opcional)" className="px-3 py-2 rounded-lg text-xs" style={inputStyle} />
                <input value={c.footer ?? ''} onChange={(e) => updateCmd(c.id, { footer: e.target.value })}
                  placeholder="Rodapé (opcional)" className="px-3 py-2 rounded-lg text-xs" style={inputStyle} />
              </div>
            </div>
          ))}
          {config.commands.length === 0 && <p className="text-xs text-muted-foreground">Nenhum comando. Clique em "Novo comando".</p>}
        </div>
      </div>
    </div>
  )
}
