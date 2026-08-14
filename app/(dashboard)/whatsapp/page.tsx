'use client'

import React, { useEffect, useState } from 'react'
import { MessageCircle, Plus, Trash2, RefreshCw, Check } from 'lucide-react'
import { BLOCOS, CAMPOS_BLOCO, camposDe, WppConfig, WppCommand, WppGroup, WppNumber } from '@/lib/whatsapp'

const LABEL_BLOCO: Record<string, string> = Object.fromEntries(BLOCOS.map((b) => [b.key, b.label]))
import { getWhatsappConfig, saveWhatsappConfig, listWhatsappGroups, GrupoWpp } from '@/app/actions/whatsapp'

let idSeed = 0
const novoId = () => `cmd_${Date.now()}_${idSeed++}`

export default function WhatsappPage() {
  const [config, setConfig] = useState<WppConfig>({ commands: [], groups: [], numbers: [] })
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

  // Ids de todos os comandos — default de permissão (tudo liberado) ao ligar um alvo.
  const allCommandIds = () => config.commands.map((c) => c.id)

  // —— Grupos ——
  function grupoCfg(jid: string): WppGroup | undefined {
    return config.groups.find((x) => x.jid === jid)
  }
  function setGrupo(jid: string, name: string, patch: Partial<WppGroup>) {
    setConfig((prev) => {
      const groups = [...prev.groups]
      const i = groups.findIndex((x) => x.jid === jid)
      if (i === -1) groups.push({ jid, name, enabled: true, allowedCommands: prev.commands.map((c) => c.id), ...patch })
      else groups[i] = { ...groups[i], name, ...patch }
      return { ...prev, groups }
    })
  }
  function toggleGrupoComando(jid: string, name: string, cmdId: string) {
    const g = grupoCfg(jid)
    const atual = g?.allowedCommands ?? allCommandIds()
    const novo = atual.includes(cmdId) ? atual.filter((x) => x !== cmdId) : [...atual, cmdId]
    setGrupo(jid, name, { allowedCommands: novo })
  }

  // —— Números (privado) ——
  function updateNumero(i: number, patch: Partial<WppNumber>) {
    setConfig((prev) => ({ ...prev, numbers: prev.numbers.map((n, idx) => (idx === i ? { ...n, ...patch } : n)) }))
  }
  function toggleNumeroComando(i: number, cmdId: string) {
    const n = config.numbers[i]
    if (!n) return
    const atual = n.allowedCommands ?? allCommandIds()
    const novo = atual.includes(cmdId) ? atual.filter((x) => x !== cmdId) : [...atual, cmdId]
    updateNumero(i, { allowedCommands: novo })
  }
  function addNumero() {
    setConfig((prev) => ({ ...prev, numbers: [...prev.numbers, { number: '', name: '', enabled: true, allowedCommands: prev.commands.map((c) => c.id) }] }))
  }
  function removeNumero(i: number) {
    setConfig((prev) => ({ ...prev, numbers: prev.numbers.filter((_, idx) => idx !== i) }))
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
  function toggleCmdCampo(id: string, blockKey: string, campo: string) {
    setConfig((prev) => ({
      ...prev,
      commands: prev.commands.map((c) => {
        if (c.id !== id) return c
        const fields = { ...(c.fields ?? {}) }
        const atual = fields[blockKey] ?? camposDe(c, blockKey)
        fields[blockKey] = atual.includes(campo) ? atual.filter((x) => x !== campo) : [...atual, campo]
        return { ...c, fields }
      }),
    }))
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
          Ligue o bot por grupo e escolha quais <b>comandos</b> cada grupo pode usar. O conteúdo de cada comando é definido lá embaixo em &quot;Comandos&quot;. Grupo desligado = bot não responde nele.
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
                  <div className="mt-3">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Comandos permitidos neste grupo</span>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {config.commands.length === 0 && <span className="text-[11px] text-muted-foreground">Crie um comando lá embaixo primeiro.</span>}
                      {config.commands.map((cmd) => {
                        const checked = (cfg?.allowedCommands ?? config.commands.map((c) => c.id)).includes(cmd.id)
                        return (
                          <button key={cmd.id} onClick={() => toggleGrupoComando(g.jid, g.name, cmd.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold font-mono border transition ${checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                            {cmd.trigger || '(sem gatilho)'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* PRIVADO (1:1) */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold">Privado (1:1)</h2>
          <button onClick={addNumero} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/5" style={inputStyle}>
            <Plus className="w-4 h-4" /> Adicionar número
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          No privado, só os números cadastrados aqui recebem resposta. Cada número escolhe quais <b>comandos</b> pode usar. Se a lista estiver vazia, o bot não responde no privado.
        </p>
        <div className="space-y-3">
          {config.numbers.map((n, i) => (
            <div key={i} className="rounded-xl p-3" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <input value={n.number} onChange={(e) => updateNumero(i, { number: e.target.value })}
                  placeholder="Número (ex.: 5541988030595)" className="px-3 py-2 rounded-lg text-sm font-mono w-52" style={inputStyle} />
                <input value={n.name ?? ''} onChange={(e) => updateNumero(i, { name: e.target.value })}
                  placeholder="Nome (opcional)" className="px-3 py-2 rounded-lg text-sm w-44" style={inputStyle} />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={n.enabled} onChange={(e) => updateNumero(i, { enabled: e.target.checked })} /> Ativo
                </label>
                <button onClick={() => removeNumero(i)} className="ml-auto text-muted-foreground hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
              </div>
              {n.enabled && (
                <div className="mt-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Comandos permitidos p/ este número</span>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {config.commands.length === 0 && <span className="text-[11px] text-muted-foreground">Crie um comando lá embaixo primeiro.</span>}
                    {config.commands.map((cmd) => {
                      const checked = (n.allowedCommands ?? config.commands.map((c) => c.id)).includes(cmd.id)
                      return (
                        <button key={cmd.id} onClick={() => toggleNumeroComando(i, cmd.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold font-mono border transition ${checked ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                          {cmd.trigger || '(sem gatilho)'}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          {config.numbers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum número. O bot não responde no privado.</p>}
        </div>
      </div>

      {/* COMANDOS */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold">Comandos</h2>
            <p className="text-xs text-muted-foreground">O gatilho é o texto que dispara (ex.: /relatorio). Escolha os blocos que ele responde.</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Na abertura/rodapé dá pra usar variáveis: <span className="font-mono text-primary">{'{data}'}</span>, <span className="font-mono text-primary">{'{hora}'}</span>, <span className="font-mono text-primary">{'{datahora}'}</span>.</p>
          </div>
          <button onClick={addCmd} className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/5" style={inputStyle}>
            <Plus className="w-4 h-4" /> Novo comando
          </button>
        </div>
        <div className="space-y-4">
          {config.commands.map((c) => (
            <div key={c.id} className="rounded-xl p-4 space-y-4" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              {/* 1 · Gatilho */}
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Gatilho (o que a pessoa digita)</label>
                  <input value={c.trigger} onChange={(e) => updateCmd(c.id, { trigger: e.target.value })}
                    placeholder="/comando" className="px-3 py-2 rounded-lg text-sm font-mono w-44" style={inputStyle} />
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer mt-5">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => updateCmd(c.id, { enabled: e.target.checked })} /> Ativo
                </label>
                <button onClick={() => removeCmd(c.id)} className="ml-auto mt-5 text-muted-foreground hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
              </div>

              {/* 2 · Blocos */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Blocos da mensagem (clique p/ incluir)</label>
                <div className="flex flex-wrap gap-2">
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
              </div>

              {/* 3 · Campos de cada bloco ativo que é configurável */}
              {c.blocks.some((bk) => CAMPOS_BLOCO[bk]) && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Campos de cada bloco</label>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    <span className="text-emerald-300 font-semibold">Verde = aparece</span> · <span className="text-muted-foreground">cinza = escondido</span>. Clique pra ligar/desligar.
                  </p>
                  <div className="space-y-2">
                    {c.blocks.filter((bk) => CAMPOS_BLOCO[bk]).map((bk) => (
                      <div key={bk} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground w-full sm:w-auto sm:min-w-[130px]">{LABEL_BLOCO[bk]}:</span>
                        {CAMPOS_BLOCO[bk].map((f) => {
                          const on = camposDe(c, bk).includes(f.key)
                          return (
                            <button key={f.key} onClick={() => toggleCmdCampo(c.id, bk, f.key)}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition ${on ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>
                              {f.label}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4 · Cabeçalho e rodapé */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Cabeçalho (título/abertura)</label>
                  <textarea value={c.header ?? ''} onChange={(e) => updateCmd(c.id, { header: e.target.value })} rows={3}
                    placeholder={'*RELATÓRIO TOP CRIATIVOS*\n\n_Abaixo segue o relatório dos últimos 7 dias._'}
                    className="w-full px-3 py-2 rounded-lg text-xs resize-y leading-relaxed" style={inputStyle} />
                  <p className="text-[10px] text-muted-foreground mt-1">Se preencher, substitui a linha padrão &quot;The Track (data/hora)&quot;.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Rodapé</label>
                  <textarea value={c.footer ?? ''} onChange={(e) => updateCmd(c.id, { footer: e.target.value })} rows={3}
                    placeholder={'Enviado por The Track'}
                    className="w-full px-3 py-2 rounded-lg text-xs resize-y leading-relaxed" style={inputStyle} />
                  <p className="text-[10px] text-muted-foreground mt-1">Formatação WhatsApp: <span className="font-mono">*negrito*</span> · <span className="font-mono">_itálico_</span>.</p>
                </div>
              </div>
            </div>
          ))}
          {config.commands.length === 0 && <p className="text-xs text-muted-foreground">Nenhum comando. Clique em "Novo comando".</p>}
        </div>
      </div>
    </div>
  )
}
