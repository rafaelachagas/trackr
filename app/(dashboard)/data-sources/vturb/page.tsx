'use client'

import React, { useEffect, useState } from 'react'
import { Video, Check, Loader2, Trash2, PlugZap, ExternalLink, Info, AlertCircle } from 'lucide-react'
import { getVturbStatus, salvarVturbKey, removerVturbKey } from '@/app/actions/vturb'
import VslManager from '@/components/vturb/VslManager'

export default function VturbPage() {
  const [conectado, setConectado] = useState(false)
  const [mascara, setMascara] = useState<string | null>(null)
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string; players?: number | null } | null>(null)
  const [carregando, setCarregando] = useState(true)

  async function carregar() {
    const r = await getVturbStatus()
    if (r.success) { setConectado(r.conectado); setMascara(r.mascara); setAtualizadoEm(r.atualizadoEm) }
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [])

  async function salvar() {
    setSalvando(true); setResultado(null)
    const r = await salvarVturbKey(key)
    setSalvando(false)
    if (!r.success) { setResultado({ ok: false, msg: r.error || 'Erro ao salvar' }); return }
    setKey('')
    await carregar()
    await testar()
  }

  async function testar() {
    setTestando(true); setResultado(null)
    try {
      const r = await fetch('/api/vturb/test', { cache: 'no-store' })
      const j = await r.json()
      if (j.ok) setResultado({ ok: true, msg: 'Conexão OK!', players: j.totalPlayers })
      else setResultado({ ok: false, msg: j.error || 'Falha na conexão' })
    } catch {
      setResultado({ ok: false, msg: 'Não consegui testar agora.' })
    } finally {
      setTestando(false)
    }
  }

  async function remover() {
    if (!confirm('Remover a chave da VTurb?')) return
    await removerVturbKey()
    setResultado(null)
    await carregar()
  }

  return (
    <div className="pb-20 max-w-[760px] mx-auto w-full text-foreground space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fontes de dados</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Conecte a VTurb Analytics para trazer métricas dos seus VSLs.</p>
      </div>

      {/* Card VTurb */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">VTurb Analytics</p>
              <p className="text-xs text-muted-foreground">Views, play rate, engajamento, conversões e retenção dos players</p>
            </div>
          </div>
          {carregando ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : conectado ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3 py-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-background border border-border rounded-full px-3 py-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/50" /> Desconectado
            </span>
          )}
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-4">
          {conectado && (
            <div className="flex items-center gap-3 flex-wrap bg-background border border-border rounded-xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Chave salva</p>
                <p className="text-sm font-mono text-foreground truncate">{mascara}</p>
                {atualizadoEm && <p className="text-[11px] text-muted-foreground/70 mt-0.5">desde {new Date(atualizadoEm).toLocaleDateString('pt-BR')}</p>}
              </div>
              <button onClick={testar} disabled={testando}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
                {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />} Testar conexão
              </button>
              <button onClick={remover} className="p-2 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition" title="Remover chave"><Trash2 className="w-4 h-4" /></button>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
              {conectado ? 'Trocar API Key' : 'API Key da VTurb'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
                placeholder="Cole aqui sua API Key"
                className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono bg-background border border-border focus:border-primary outline-none transition"
              />
              <button onClick={salvar} disabled={salvando || key.trim().length < 20}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar e conectar
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
              <Info className="w-3 h-3 shrink-0" />
              A chave fica salva de forma segura no servidor (nunca aparece no navegador). Pegue em VTurb → Configurações → API.
            </p>
          </div>

          {/* Resultado do teste */}
          {resultado && (
            <div className={`rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm ${resultado.ok ? 'bg-emerald-500/8 border border-emerald-500/25 text-emerald-200' : 'bg-rose-500/8 border border-rose-500/25 text-rose-200'}`}>
              {resultado.ok ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />}
              <div>
                <p className="font-semibold">{resultado.msg}</p>
                {resultado.ok && resultado.players != null && <p className="text-[12px] opacity-80">{resultado.players} player(s) encontrados na sua conta.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gerenciador de VSLs + visualizador com Play Rate Real */}
      {conectado && <VslManager />}

      {/* Nota sobre limites */}
      <div className="bg-card border border-border rounded-2xl px-4 sm:px-6 py-5 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Sobre a API</span>
        </div>
        <ul className="text-[13px] text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>A VTurb limita as chamadas por minuto conforme o plano (Basic 60/min, Pro 120/min, Scale 300/min, Enterprise 800/min).</li>
          <li>Cada requisição pode contar como mais de uma "query" internamente — por isso a sincronização é feita aos poucos, respeitando o limite.</li>
          <li>Métricas por player: views, plays, play rate, engajamento, retenção, cliques, conversões (USD/BRL/EUR) e RPV.</li>
        </ul>
        <a href="https://vturb.gitbook.io/analytics-api/pt" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline mt-1">
          <ExternalLink className="w-3.5 h-3.5" /> Documentação da API
        </a>
      </div>
    </div>
  )
}
