'use client'

import React, { useEffect, useState } from 'react'
import { MessageCircle, Plus, Trash2, RefreshCw, Check, X, Pencil, Users, User } from 'lucide-react'
import { BLOCOS, CAMPOS_BLOCO, camposDe, WppConfig, WppCommand, WppGroup, WppNumber } from '@/lib/whatsapp'
import { getWhatsappConfig, saveWhatsappConfig, listWhatsappGroups, GrupoWpp } from '@/app/actions/whatsapp'

const LABEL_BLOCO: Record<string, string> = Object.fromEntries(BLOCOS.map((b) => [b.key, b.label]))
let idSeed = 0
const novoId = () => `cmd_${Date.now()}_${idSeed++}`

const cardStyle: React.CSSProperties = { backgroundColor: '#13181a', border: '1px solid rgba(255,255,255,0.05)' }
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }
const rowStyle: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.06)' }

export default function WhatsappPage() {
  const [config, setConfig] = useState<WppConfig>({ commands: [], groups: [], numbers: [] })
  const [grupos, setGrupos] = useState<GrupoWpp[]>([])
  const [grupoErro, setGrupoErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Modais (item em edição; null = fechado)
  const [cmdModal, setCmdModal] = useState<WppCommand | null>(null)
  const [grupoModal, setGrupoModal] = useState<WppGroup | null>(null)
  const [numModal, setNumModal] = useState<{ idx: number; data: WppNumber } | null>(null)

  async function carregar() {
    setLoading(true)
    const [cfg, g] = await Promise.all([getWhatsappConfig(), listWhatsappGroups()])
    setConfig(cfg)
    setGrupos(g.groups)
    setGrupoErro(g.error ?? null)
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  // Persiste no banco e atualiza o estado local.
  async function persistir(next: WppConfig) {
    setConfig(next)
    setSaving(true); setMsg(null)
    const r = await saveWhatsappConfig(next)
    setSaving(false)
    setMsg(r.success ? 'Salvo!' : `Erro: ${r.error}`)
    setTimeout(() => setMsg(null), 3000)
  }

  const allCmdIds = () => config.commands.map((c) => c.id)
  const trigOf = (id: string) => config.commands.find((c) => c.id === id)?.trigger || id
  const resumoComandos = (ids?: string[]) =>
    !ids ? 'Todos os comandos' : ids.length ? ids.map(trigOf).join(', ') : 'Nenhum comando'

  // —— Comandos ——
  function salvarComando(cmd: WppCommand) {
    const trigger = (cmd.trigger || '').trim().toLowerCase()
    if (!trigger) { setMsg('Defina um gatilho (ex.: /relatorio).'); setTimeout(() => setMsg(null), 3000); return }
    const existe = config.commands.some((c) => c.id === cmd.id)
    const commands = existe
      ? config.commands.map((c) => (c.id === cmd.id ? { ...cmd, trigger } : c))
      : [...config.commands, { ...cmd, trigger }]
    persistir({ ...config, commands })
    setCmdModal(null)
  }
  function removerComando(id: string) {
    persistir({
      ...config,
      commands: config.commands.filter((c) => c.id !== id),
      groups: config.groups.map((g) => ({ ...g, allowedCommands: g.allowedCommands?.filter((x) => x !== id) })),
      numbers: config.numbers.map((n) => ({ ...n, allowedCommands: n.allowedCommands?.filter((x) => x !== id) })),
    })
  }

  // —— Grupos ——
  function salvarGrupo(g: WppGroup) {
    const i = config.groups.findIndex((x) => x.jid === g.jid)
    const groups = i === -1 ? [...config.groups, g] : config.groups.map((x) => (x.jid === g.jid ? g : x))
    persistir({ ...config, groups })
    setGrupoModal(null)
  }
  function grupoCfg(jid: string): WppGroup | undefined { return config.groups.find((x) => x.jid === jid) }

  // —— Números ——
  function salvarNumero(idx: number, data: WppNumber) {
    const number = (data.number || '').replace(/\D/g, '')
    if (!number) { setMsg('Informe o número (só dígitos).'); setTimeout(() => setMsg(null), 3000); return }
    const limpo = { ...data, number }
    const numbers = idx === -1 ? [...config.numbers, limpo] : config.numbers.map((n, i) => (i === idx ? limpo : n))
    persistir({ ...config, numbers })
    setNumModal(null)
  }
  function removerNumero(idx: number) {
    persistir({ ...config, numbers: config.numbers.filter((_, i) => i !== idx) })
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
  }

  return (
    <div className="pb-16 space-y-6 max-w-[1000px] mx-auto w-full px-4 sm:px-6 text-foreground">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp — Bot de Relatórios</h1>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          {saving && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
          <button onClick={carregar} className="px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/5" style={inputStyle}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* COMANDOS */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold">Comandos</h2>
          <button onClick={() => setCmdModal({ id: novoId(), trigger: '/', enabled: true, blocks: [], header: '', footer: '' })}
            className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/5" style={inputStyle}>
            <Plus className="w-4 h-4" /> Novo comando
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">O gatilho é o texto que dispara (ex.: /relatorio). Cada comando define o que mostra.</p>
        <div className="space-y-2">
          {config.commands.length === 0 && <p className="text-xs text-muted-foreground">Nenhum comando ainda. Clique em &quot;Novo comando&quot;.</p>}
          {config.commands.map((c) => (
            <div key={c.id} className="rounded-xl p-3 flex items-center gap-3" style={rowStyle}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${c.enabled ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sm">{c.trigger || '(sem gatilho)'}</span>
                  {!c.enabled && <span className="text-[10px] text-muted-foreground">desativado</span>}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {c.blocks.length ? c.blocks.map((b) => LABEL_BLOCO[b] ?? b).join(' · ') : 'Sem blocos'}
                </p>
              </div>
              <button onClick={() => setCmdModal(JSON.parse(JSON.stringify(c)))} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => removerComando(c.id)} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* GRUPOS */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <h2 className="text-sm font-bold mb-1">Grupos & Permissões</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Escolha quais <b>comandos</b> cada grupo pode usar. Grupo desligado = bot não responde nele.
          {config.groups.length === 0 && ' (Nenhum grupo configurado: o bot responde em qualquer grupo — configure para restringir.)'}
        </p>
        {grupoErro && <p className="text-xs text-amber-400 mb-3">Não consegui listar os grupos ({grupoErro}). Confira se o número está conectado.</p>}
        {grupos.length === 0 && !grupoErro && <p className="text-xs text-muted-foreground">Nenhum grupo encontrado. Adicione o número em um grupo e clique em atualizar.</p>}
        <div className="space-y-2">
          {grupos.map((g) => {
            const cfg = grupoCfg(g.jid)
            const on = cfg?.enabled ?? false
            return (
              <div key={g.jid} className="rounded-xl p-3 flex items-center gap-3" style={rowStyle}>
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{g.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-muted-foreground'}`}>{on ? 'Ativo' : 'Desligado'}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{on ? resumoComandos(cfg?.allowedCommands) : 'Bot não responde aqui'}</p>
                </div>
                <button
                  onClick={() => setGrupoModal(cfg ? JSON.parse(JSON.stringify(cfg)) : { jid: g.jid, name: g.name, enabled: true, allowedCommands: allCmdIds() })}
                  className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
              </div>
            )
          })}
        </div>
      </div>

      {/* PRIVADO */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold">Privado (1:1)</h2>
          <button onClick={() => setNumModal({ idx: -1, data: { number: '', name: '', enabled: true, allowedCommands: allCmdIds() } })}
            className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-white/5" style={inputStyle}>
            <Plus className="w-4 h-4" /> Adicionar número
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Só os números aqui recebem resposta no privado. Cada número escolhe quais comandos pode usar.</p>
        <div className="space-y-2">
          {config.numbers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum número. O bot não responde no privado.</p>}
          {config.numbers.map((n, i) => (
            <div key={i} className="rounded-xl p-3 flex items-center gap-3" style={rowStyle}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${n.enabled ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{n.name || 'Sem nome'}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{n.number}</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{n.enabled ? resumoComandos(n.allowedCommands) : 'Desativado'}</p>
              </div>
              <button onClick={() => setNumModal({ idx: i, data: JSON.parse(JSON.stringify(n)) })} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => removerNumero(i)} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* ————— MODAIS ————— */}
      {cmdModal && <ComandoModal cmd={cmdModal} onChange={setCmdModal} onSave={salvarComando} onClose={() => setCmdModal(null)} />}
      {grupoModal && <GrupoModal grupo={grupoModal} commands={config.commands} onChange={setGrupoModal} onSave={salvarGrupo} onClose={() => setGrupoModal(null)} />}
      {numModal && <NumeroModal state={numModal} commands={config.commands} onChange={setNumModal} onSave={salvarNumero} onClose={() => setNumModal(null)} />}
    </div>
  )
}

/* ————————————— Componentes de Modal ————————————— */

function Modal({ title, subtitle, onClose, onSave, children }: {
  title: string; subtitle?: string; onClose: () => void; onSave: () => void; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-[640px] max-h-[88vh] overflow-y-auto rounded-2xl p-6" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        {children}
        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-white/5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white/5" style={inputStyle}>Cancelar</button>
          <button onClick={onSave} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 flex items-center gap-2"><Check className="w-4 h-4" /> Salvar</button>
        </div>
      </div>
    </div>
  )
}

const LabelCampo = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">{children}</label>
)
function Chip({ on, onClick, children, verde }: { on: boolean; onClick: () => void; children: React.ReactNode; verde?: boolean }) {
  const cls = on
    ? (verde ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-primary/40 bg-primary/10 text-primary')
    : 'border-white/10 text-muted-foreground hover:bg-white/5'
  return <button onClick={onClick} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${cls}`}>{children}</button>
}

function ComandoModal({ cmd, onChange, onSave, onClose }: {
  cmd: WppCommand; onChange: (c: WppCommand) => void; onSave: (c: WppCommand) => void; onClose: () => void
}) {
  const toggleBloco = (key: string) =>
    onChange({ ...cmd, blocks: cmd.blocks.includes(key) ? cmd.blocks.filter((b) => b !== key) : [...cmd.blocks, key] })
  const toggleCampo = (bk: string, campo: string) => {
    const fields = { ...(cmd.fields ?? {}) }
    const atual = fields[bk] ?? camposDe(cmd, bk)
    fields[bk] = atual.includes(campo) ? atual.filter((x) => x !== campo) : [...atual, campo]
    onChange({ ...cmd, fields })
  }
  return (
    <Modal title="Comando" subtitle="Gatilho + o que a mensagem mostra." onClose={onClose} onSave={() => onSave(cmd)}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <LabelCampo>Gatilho (o que a pessoa digita)</LabelCampo>
            <input value={cmd.trigger} onChange={(e) => onChange({ ...cmd, trigger: e.target.value })}
              placeholder="/comando" className="px-3 py-2 rounded-lg text-sm font-mono w-48" style={inputStyle} />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer mt-5">
            <input type="checkbox" checked={cmd.enabled} onChange={(e) => onChange({ ...cmd, enabled: e.target.checked })} /> Ativo
          </label>
        </div>

        <div>
          <LabelCampo>Blocos da mensagem (clique p/ incluir)</LabelCampo>
          <div className="flex flex-wrap gap-2">
            {BLOCOS.map((b) => <Chip key={b.key} on={cmd.blocks.includes(b.key)} onClick={() => toggleBloco(b.key)}>{b.label}</Chip>)}
          </div>
        </div>

        {cmd.blocks.some((bk) => CAMPOS_BLOCO[bk]) && (
          <div>
            <LabelCampo>Campos de cada bloco</LabelCampo>
            <p className="text-[11px] text-muted-foreground mb-2 -mt-1"><span className="text-emerald-300 font-semibold">Verde = aparece</span> · cinza = escondido.</p>
            <div className="space-y-2">
              {cmd.blocks.filter((bk) => CAMPOS_BLOCO[bk]).map((bk) => (
                <div key={bk} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground w-full sm:w-auto sm:min-w-[130px]">{LABEL_BLOCO[bk]}:</span>
                  {CAMPOS_BLOCO[bk].map((f) => <Chip key={f.key} verde on={camposDe(cmd, bk).includes(f.key)} onClick={() => toggleCampo(bk, f.key)}>{f.label}</Chip>)}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <LabelCampo>Cabeçalho (título/abertura)</LabelCampo>
            <textarea value={cmd.header ?? ''} onChange={(e) => onChange({ ...cmd, header: e.target.value })} rows={3}
              placeholder={'*RELATÓRIO*\n\n_Abertura..._'} className="w-full px-3 py-2 rounded-lg text-xs resize-y leading-relaxed" style={inputStyle} />
            <p className="text-[10px] text-muted-foreground mt-1">Se preencher, substitui a linha padrão &quot;The Track&quot;.</p>
          </div>
          <div>
            <LabelCampo>Rodapé</LabelCampo>
            <textarea value={cmd.footer ?? ''} onChange={(e) => onChange({ ...cmd, footer: e.target.value })} rows={3}
              placeholder={'Enviado por The Track {datahora}'} className="w-full px-3 py-2 rounded-lg text-xs resize-y leading-relaxed" style={inputStyle} />
            <p className="text-[10px] text-muted-foreground mt-1">Variáveis: <span className="font-mono text-primary">{'{data}'}</span> <span className="font-mono text-primary">{'{hora}'}</span> <span className="font-mono text-primary">{'{datahora}'}</span></p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function GrupoModal({ grupo, commands, onChange, onSave, onClose }: {
  grupo: WppGroup; commands: WppCommand[]; onChange: (g: WppGroup) => void; onSave: (g: WppGroup) => void; onClose: () => void
}) {
  const allowed = grupo.allowedCommands ?? commands.map((c) => c.id)
  const toggle = (id: string) =>
    onChange({ ...grupo, allowedCommands: allowed.includes(id) ? allowed.filter((x) => x !== id) : [...allowed, id] })
  return (
    <Modal title={grupo.name || 'Grupo'} subtitle="Comandos permitidos neste grupo." onClose={onClose} onSave={() => onSave(grupo)}>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={grupo.enabled} onChange={(e) => onChange({ ...grupo, enabled: e.target.checked })} />
          Bot responde neste grupo
        </label>
        {grupo.enabled && (
          <div>
            <LabelCampo>Comandos permitidos</LabelCampo>
            <div className="flex flex-wrap gap-2">
              {commands.length === 0 && <span className="text-[11px] text-muted-foreground">Crie um comando primeiro.</span>}
              {commands.map((c) => <Chip key={c.id} on={allowed.includes(c.id)} onClick={() => toggle(c.id)}><span className="font-mono">{c.trigger || '(sem gatilho)'}</span></Chip>)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function NumeroModal({ state, commands, onChange, onSave, onClose }: {
  state: { idx: number; data: WppNumber }; commands: WppCommand[]
  onChange: (s: { idx: number; data: WppNumber }) => void; onSave: (idx: number, d: WppNumber) => void; onClose: () => void
}) {
  const { idx, data } = state
  const set = (patch: Partial<WppNumber>) => onChange({ idx, data: { ...data, ...patch } })
  const allowed = data.allowedCommands ?? commands.map((c) => c.id)
  const toggle = (id: string) => set({ allowedCommands: allowed.includes(id) ? allowed.filter((x) => x !== id) : [...allowed, id] })
  return (
    <Modal title={idx === -1 ? 'Novo número' : 'Editar número'} subtitle="No privado, só números cadastrados recebem resposta." onClose={onClose} onSave={() => onSave(idx, data)}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <LabelCampo>Número (com DDI/DDD)</LabelCampo>
            <input value={data.number} onChange={(e) => set({ number: e.target.value })}
              placeholder="5541988030595" className="px-3 py-2 rounded-lg text-sm font-mono w-52" style={inputStyle} />
          </div>
          <div>
            <LabelCampo>Nome (opcional)</LabelCampo>
            <input value={data.name ?? ''} onChange={(e) => set({ name: e.target.value })}
              placeholder="Nome" className="px-3 py-2 rounded-lg text-sm w-44" style={inputStyle} />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer mt-5">
            <input type="checkbox" checked={data.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Ativo
          </label>
        </div>
        {data.enabled && (
          <div>
            <LabelCampo>Comandos permitidos</LabelCampo>
            <div className="flex flex-wrap gap-2">
              {commands.length === 0 && <span className="text-[11px] text-muted-foreground">Crie um comando primeiro.</span>}
              {commands.map((c) => <Chip key={c.id} on={allowed.includes(c.id)} onClick={() => toggle(c.id)}><span className="font-mono">{c.trigger || '(sem gatilho)'}</span></Chip>)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
