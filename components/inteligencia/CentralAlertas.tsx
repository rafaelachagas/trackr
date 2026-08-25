'use client'

import React, { useEffect, useState } from 'react'
import { Bell, Loader2, Save, Check, MessageCircle, Plus, X, TriangleAlert } from 'lucide-react'
import { listarAlertas, marcarAlertasVistos, getConfigAlertas, salvarConfigAlertas, testarWhatsapp, type AlertaLog, type ConfigAlertas } from '@/app/actions/alertas'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

const TIPO_LABEL: Record<string, string> = {
  fadiga: 'Fadiga de criativo', anomalia_gasto: 'Anomalia de gasto',
  concorrente_removido: 'Concorrente removeu criativo', concorrente_novo: 'Concorrente novo anúncio',
}
const SEV_COR: Record<string, string> = { info: '#60a5fa', atencao: '#fbbf24', critico: '#f87171' }

export default function CentralAlertas() {
  const [alertas, setAlertas] = useState<AlertaLog[]>([])
  const [cfg, setCfg] = useState<ConfigAlertas | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [novoNum, setNovoNum] = useState('')
  const [testando, setTestando] = useState(false)
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; msg: string } | null>(null)

  async function carregar() {
    const [a, c] = await Promise.all([listarAlertas(), getConfigAlertas()])
    if (a.success) setAlertas(a.data)
    if (c.success) setCfg(c.data)
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function salvar() {
    if (!cfg) return
    setSalvando(true)
    const r = await salvarConfigAlertas(cfg)
    setSalvando(false)
    if (r.success) { setSalvo(true); setTimeout(() => setSalvo(false), 2500) }
  }

  async function marcarTodos() {
    setAlertas((p) => p.map((a) => ({ ...a, visto: true })))
    await marcarAlertasVistos()
  }

  async function testar() {
    setTestando(true)
    setResultadoTeste(null)
    const r = await testarWhatsapp()
    setTestando(false)
    setResultadoTeste(r.success
      ? { ok: true, msg: `Enviado com sucesso pra ${r.enviados}/${r.total} número(s).` }
      : { ok: false, msg: r.error ?? 'Falha ao enviar.' })
  }

  function addNum() {
    if (!cfg) return
    const n = novoNum.replace(/\D/g, '')
    if (n.length < 8) return
    setCfg({ ...cfg, numeros: [...cfg.numeros, n] }); setNovoNum('')
  }

  if (loading || !cfg) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>

  return (
    <div className="space-y-5">
      {/* Config WhatsApp */}
      <div className={`rounded-2xl p-5 ${card} space-y-4`}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><MessageCircle className="w-4 h-4" /> Alertas no WhatsApp</p>
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })} className="accent-primary w-4 h-4" />
            {cfg.ativo ? 'Ligado' : 'Desligado'}
          </label>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Números / grupos que recebem (com DDD e país, ex: 5511999999999)</label>
          <div className="flex gap-2">
            <input value={novoNum} onChange={(e) => setNovoNum(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNum() }} placeholder="5511999999999" className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
            <button onClick={addNum} className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {cfg.numeros.map((n, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-white/10">
                {n}<button onClick={() => setCfg({ ...cfg, numeros: cfg.numeros.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-rose-400"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        </div>

        {/* Limiares */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/5">
          <Campo label="Queda de CTR" val={Math.round(cfg.ctrDrop * 100)} suf="%" onChange={(v) => setCfg({ ...cfg, ctrDrop: v / 100 })} />
          <Campo label="Alta de CPM" val={Math.round(cfg.cpmRise * 100)} suf="%" onChange={(v) => setCfg({ ...cfg, cpmRise: v / 100 })} />
          <Campo label="Mín. impressões" val={cfg.minImpr} onChange={(v) => setCfg({ ...cfg, minImpr: v })} />
          <Campo label="Anomalia gasto" val={Math.round(cfg.anomaliaPct * 100)} suf="%" onChange={(v) => setCfg({ ...cfg, anomaliaPct: v / 100 })} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-primary text-white hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : salvo ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} {salvo ? 'Salvo' : 'Salvar config'}
          </button>
          <button onClick={testar} disabled={testando || !cfg.numeros.length} title={!cfg.numeros.length ? 'Adicione um número primeiro' : 'Envia uma mensagem de teste agora, sem esperar um alerta de verdade'} className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-border text-foreground hover:bg-white/5 transition disabled:opacity-50">
            {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Testar envio
          </button>
        </div>
        {resultadoTeste && (
          <p className={`text-xs font-semibold flex items-center gap-1.5 ${resultadoTeste.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {resultadoTeste.ok ? <Check className="w-3.5 h-3.5" /> : <TriangleAlert className="w-3.5 h-3.5" />} {resultadoTeste.msg}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/70">A fadiga (CTR/CPM) e a anomalia de gasto são checadas 1x/dia. O criativo removido do concorrente e novos anúncios saem na hora do rastreamento. "Ligado" só salva a preferência — use "Testar envio" pra confirmar que a mensagem está chegando de verdade.</p>
      </div>

      {/* Lista de alertas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Bell className="w-4 h-4" /> Últimos alertas</p>
          {alertas.some((a) => !a.visto) && <button onClick={marcarTodos} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">Marcar tudo como visto</button>}
        </div>
        {alertas.length === 0 ? (
          <div className={`rounded-2xl p-8 text-center ${card}`}>
            <p className="text-sm font-semibold">Nenhum alerta ainda</p>
            <p className="text-xs text-muted-foreground mt-1">Quando algo fugir do padrão (fadiga, gasto, concorrente), aparece aqui e — se ligado — no WhatsApp.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alertas.map((a) => (
              <div key={a.id} className={`rounded-xl p-3 ${card} flex items-start gap-3 ${a.visto ? 'opacity-60' : ''}`}>
                <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: SEV_COR[a.severidade] || '#60a5fa' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{a.titulo}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">{TIPO_LABEL[a.tipo] || a.tipo}</span>
                    {a.enviado_whatsapp && <MessageCircle className="w-3 h-3 text-emerald-400" />}
                  </div>
                  {a.mensagem && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{a.mensagem}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground/70 shrink-0">{new Date(a.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Campo({ label, val, suf, onChange }: { label: string; val: number; suf?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</label>
      <div className="relative">
        <input type="number" value={val} onChange={(e) => onChange(Number(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} />
        {suf && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suf}</span>}
      </div>
    </div>
  )
}
