'use client'

import React, { useEffect, useState } from 'react'
import { Sparkles, Loader2, Check, Save, Trash2, Info, KeyRound } from 'lucide-react'
import { getStatusLLM, salvarModeloLLM, salvarChaveLLM, removerChaveLLM, type StatusLLM } from '@/app/actions/llm-config'
import { MODELOS_ANTHROPIC, MODELOS_GEMINI, parseModelo } from '@/lib/llm-models'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

export default function ConfigIA() {
  const [status, setStatus] = useState<StatusLLM | null>(null)
  const [modelo, setModelo] = useState('')
  const [salvandoM, setSalvandoM] = useState(false)
  const [salvoM, setSalvoM] = useState(false)
  const [aKey, setAKey] = useState('')
  const [gKey, setGKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function carregar() {
    const r = await getStatusLLM()
    if (r.success) { setStatus(r.data); setModelo(r.data.modelo) }
  }
  useEffect(() => { carregar() }, [])

  async function salvarModelo(sel: string) {
    setModelo(sel); setSalvandoM(true); setSalvoM(false)
    const r = await salvarModeloLLM(sel)
    setSalvandoM(false)
    if (r.success) { setSalvoM(true); setTimeout(() => setSalvoM(false), 2000); carregar() }
  }

  async function salvarChave(provider: 'anthropic' | 'gemini') {
    const chave = provider === 'gemini' ? gKey : aKey
    setMsg(null)
    const r = await salvarChaveLLM(provider, chave)
    if (!r.success) { setMsg(r.error || 'Erro ao salvar'); return }
    if (provider === 'gemini') setGKey(''); else setAKey('')
    setMsg(provider === 'gemini' ? 'Chave do Gemini salva.' : 'Chave da Anthropic salva.')
    carregar()
  }
  async function remover(provider: 'anthropic' | 'gemini') {
    if (!confirm('Remover a chave?')) return
    await removerChaveLLM(provider); carregar()
  }

  if (!status) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>

  const provSelecionado = parseModelo(modelo).provider
  const chaveOk = provSelecionado === 'gemini' ? status.temGemini : status.temAnthropic

  return (
    <div className="space-y-5">
      {/* Seletor de modelo */}
      <div className={`rounded-2xl p-5 ${card} space-y-3`}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Modelo de IA</p>
        <p className="text-xs text-muted-foreground">Usado na clusterização de ângulos, gerador de copy e relatório de espionagem.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={modelo} onChange={(e) => salvarModelo(e.target.value)} className="flex-1 min-w-[240px] px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle}>
            <optgroup label="Anthropic (Claude)">
              {MODELOS_ANTHROPIC.map((m) => <option key={m.id} value={`anthropic:${m.id}`}>{m.label}{m.nota ? ` — ${m.nota}` : ''}</option>)}
            </optgroup>
            <optgroup label="Google (Gemini)">
              {MODELOS_GEMINI.map((m) => <option key={m.id} value={`gemini:${m.id}`}>{m.label}{m.nota ? ` — ${m.nota}` : ''}</option>)}
            </optgroup>
          </select>
          <span className="text-xs font-semibold flex items-center gap-1.5">
            {salvandoM ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : salvoM ? <><Check className="w-4 h-4 text-emerald-400" /> Salvo</> : null}
          </span>
        </div>
        {!chaveOk && (
          <div className="rounded-lg px-3 py-2 flex items-start gap-2 text-xs" style={{ backgroundColor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
            <span className="text-amber-200/90">Falta a chave do provedor <b>{provSelecionado === 'gemini' ? 'Gemini' : 'Anthropic'}</b> — cole abaixo pra ativar a IA.</span>
          </div>
        )}
      </div>

      {msg && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs" style={{ backgroundColor: 'rgba(46, 144, 250,0.06)', border: '1px solid rgba(46, 144, 250,0.2)' }}>
          <Check className="w-3.5 h-3.5 text-primary" /><span className="text-foreground/90">{msg}</span>
        </div>
      )}

      {/* Chaves */}
      <ChaveCard nome="Anthropic (Claude)" onde="console.anthropic.com → API Keys" placeholder="sk-ant-..."
        conectado={status.temAnthropic} mascara={status.mascaraAnthropic}
        valor={aKey} setValor={setAKey} onSalvar={() => salvarChave('anthropic')} onRemover={() => remover('anthropic')} />

      <ChaveCard nome="Google Gemini" onde="aistudio.google.com → Get API key" placeholder="AIza..."
        conectado={status.temGemini} mascara={status.mascaraGemini}
        valor={gKey} setValor={setGKey} onSalvar={() => salvarChave('gemini')} onRemover={() => remover('gemini')} />

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Info className="w-3 h-3 shrink-0" /> As chaves ficam salvas de forma segura no servidor — nunca aparecem no navegador. A IA só roda quando você clica (custo de centavos por uso).
      </p>
    </div>
  )
}

function ChaveCard({ nome, onde, placeholder, conectado, mascara, valor, setValor, onSalvar, onRemover }: {
  nome: string; onde: string; placeholder: string; conectado: boolean; mascara: string | null
  valor: string; setValor: (v: string) => void; onSalvar: () => void; onRemover: () => void
}) {
  return (
    <div className={`rounded-2xl p-4 ${card}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-muted-foreground" /> {nome}</p>
        {conectado ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2.5 py-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {mascara}</span>
        ) : (
          <span className="text-[11px] font-semibold text-muted-foreground">Sem chave</span>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="password" value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSalvar() }}
          placeholder={placeholder} className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
        <button onClick={onSalvar} disabled={valor.trim().length < 10} className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
          <Save className="w-4 h-4" /> {conectado ? 'Trocar' : 'Salvar'}
        </button>
        {conectado && <button onClick={onRemover} className="p-2.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition" title="Remover"><Trash2 className="w-4 h-4" /></button>}
      </div>
      <p className="text-[10px] text-muted-foreground/70 mt-1.5">Pegue em: {onde}</p>
    </div>
  )
}
