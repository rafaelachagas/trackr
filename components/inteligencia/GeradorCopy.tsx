'use client'

import React, { useState } from 'react'
import { Wand2, Loader2, Copy, Check, AlertCircle } from 'lucide-react'
import { gerarVariacoesCopy, type VariacaoCopy } from '@/app/actions/rastreador-ia'
import { anguloMeta } from '@/lib/rastreador-intel'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

export default function GeradorCopy({ fonteInicial, nichoInicial, ofertaInicial }: { fonteInicial?: string; nichoInicial?: string; ofertaInicial?: string }) {
  const [fonte, setFonte] = useState(fonteInicial ?? '')
  const [nicho, setNicho] = useState(nichoInicial ?? '')
  const [oferta, setOferta] = useState(ofertaInicial ?? '')
  const [instrucoes, setInstrucoes] = useState('')
  const [qtd, setQtd] = useState(3)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [variacoes, setVariacoes] = useState<VariacaoCopy[] | null>(null)

  async function gerar() {
    setLoading(true); setErro(null); setVariacoes(null)
    const r = await gerarVariacoesCopy({ fonteTexto: fonte, nicho, oferta, instrucoes, quantidade: qtd })
    setLoading(false)
    if (!r.success || !r.data) { setErro(r.error || 'Falha ao gerar.'); return }
    setVariacoes(r.data.variacoes)
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl p-5 ${card} space-y-4`}>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Transcrição / copy do concorrente (referência de estrutura)</label>
          <textarea value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="Cole aqui a transcrição do anúncio do concorrente..."
            className="w-full h-40 px-3 py-2.5 rounded-lg text-sm leading-relaxed resize-y" style={inputStyle} />
          <p className="text-[11px] text-muted-foreground mt-1">A IA usa só como referência de <b>estrutura e ângulo</b> — não copia frases. Gera ângulos novos adaptados ao seu nicho.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Seu nicho</label>
            <input value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="ex: renda extra pra mães" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Sua oferta</label>
            <input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="ex: curso de edição de cortes" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Instruções extras (opcional)</label>
          <input value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} placeholder="ex: tom mais agressivo, foco em prova social, evitar promessa de dinheiro" className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Variações:</span>
            {[2, 3, 4, 6].map((n) => (
              <button key={n} onClick={() => setQtd(n)} className={`w-8 h-8 rounded-lg text-xs font-bold border transition ${qtd === n ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:bg-white/5'}`}>{n}</button>
            ))}
          </div>
          <button onClick={gerar} disabled={loading || fonte.trim().length < 20}
            className="ml-auto px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} {loading ? 'Gerando...' : 'Gerar variações'}
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm" style={{ backgroundColor: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)' }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" /><span className="text-rose-200/90">{erro}</span>
        </div>
      )}

      {variacoes && variacoes.map((v, i) => <CardVariacao key={i} v={v} n={i + 1} />)}
    </div>
  )
}

function CardVariacao({ v, n }: { v: VariacaoCopy; n: number }) {
  const [copiado, setCopiado] = useState(false)
  const a = anguloMeta(v.angulo)
  const textoCompleto = `HEADLINE: ${v.headline}\n\nABERTURA: ${v.abertura}\n\nCORPO: ${v.corpo}\n\nCTA: ${v.cta}`
  async function copiar() {
    try { await navigator.clipboard.writeText(textoCompleto); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch {}
  }
  return (
    <div className={`rounded-2xl p-5 ${card}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-black text-muted-foreground">#{n}</span>
        <span className="text-[11px] font-semibold px-2 py-1 rounded-lg border" style={{ color: a.cor, borderColor: `${a.cor}44`, backgroundColor: `${a.cor}12` }}>{a.label}</span>
        <button onClick={copiar} className="ml-auto px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
          {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="space-y-2.5 text-sm">
        <div><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Headline</span><p className="font-bold text-foreground">{v.headline}</p></div>
        <div><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Abertura (hook)</span><p className="text-foreground/90">{v.abertura}</p></div>
        <div><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Corpo</span><p className="text-foreground/80 whitespace-pre-wrap">{v.corpo}</p></div>
        <div><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">CTA</span><p className="font-semibold text-primary">{v.cta}</p></div>
      </div>
    </div>
  )
}
