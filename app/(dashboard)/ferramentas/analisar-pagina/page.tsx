'use client'

// Analisador de Páginas — raio-x de QUALQUER página de vendas colada na hora
// (sem cadastrar concorrente): headline, preços, stack, vídeos (transcrever/
// baixar) e detector de teste A/B. Mesmo motor do Rastreador → Inteligência.

import React, { useState } from 'react'
import { Search, Loader2, Download, FileText, Layers, X, Globe, Copy, Check, AlertCircle } from 'lucide-react'
import { analisarPaginaAvulsa, detectarAbAvulso, type AnalisePaginaAvulsa, type AbDetectado, type VslCandidata } from '@/app/actions/rastreador-pagina'
import { baixarTxt, baixarDocx, baixarMd, baixarPdf } from '@/lib/exportDoc'

const card = 'bg-card border border-border'
const inputStyle: React.CSSProperties = { backgroundColor: '#1a2022', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }

export default function AnalisarPaginaPage() {
  const [url, setUrl] = useState('')
  const [analisando, setAnalisando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<AnalisePaginaAvulsa | null>(null)

  const [ab, setAb] = useState<AbDetectado | null>(null)
  const [abRodando, setAbRodando] = useState(false)

  const [tStatus, setTStatus] = useState<string | null>(null)
  const [transcricao, setTranscricao] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function analisar() {
    if (analisando || !url.trim()) return
    setAnalisando(true); setErro(null); setDados(null); setAb(null); setTranscricao(null)
    const r = await analisarPaginaAvulsa(url.trim())
    setAnalisando(false)
    if (!r.success || !r.data) { setErro(r.error ?? 'Falha ao analisar.'); return }
    setDados(r.data)
  }

  async function detectarAb() {
    if (abRodando || !url.trim()) return
    setAbRodando(true); setErro(null); setAb(null)
    const r = await detectarAbAvulso(url.trim())
    setAbRodando(false)
    if (!r.success || !r.data) { setErro(r.error ?? 'Falha ao detectar.'); return }
    setAb(r.data)
  }

  // Transcrição assíncrona (VSL longa não estoura timeout).
  async function transcrever(item: VslCandidata) {
    if (tStatus) return
    setTranscricao(null); setErro(null)
    setTStatus('Enviando pra transcrição...')
    try {
      const ini = await fetch('/api/rastreador/transcrever-async', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: item.url }),
      }).then((r) => r.json())
      if (!ini?.job_id) { setTStatus(null); setErro(ini?.error || 'Falha ao iniciar a transcrição.'); return }
      const comecou = Date.now()
      for (;;) {
        await new Promise((res) => setTimeout(res, 10000))
        const min = Math.floor((Date.now() - comecou) / 60000)
        const j = await fetch(`/api/rastreador/transcrever-async?id=${ini.job_id}`).then((r) => r.json()).catch(() => null)
        if (j?.status === 'ok') { setTStatus(null); setTranscricao(j.texto || '(sem fala detectada)'); return }
        if (j?.status === 'erro' || j?.error) { setTStatus(null); setErro(j.erro || j.error || 'Falha ao transcrever.'); return }
        setTStatus(j?.status === 'fila' ? 'Na fila da VPS...' : `Transcrevendo... (${min} min)`)
        if (Date.now() - comecou > 150 * 60000) { setTStatus(null); setErro('Passou de 2h30 — algo travou na VPS.'); return }
      }
    } catch { setTStatus(null); setErro('Falha ao transcrever.') }
  }

  async function copiar() {
    if (!transcricao) return
    try { await navigator.clipboard.writeText(transcricao); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch {}
  }

  const nomeBase = `pagina-${(url.replace(/^https?:\/\//, '').split('/')[0] || 'avulsa')}`

  const tag = (v: VslCandidata) => (v.origem === 'vturb' ? 'VTurb' : v.url.toLowerCase().includes('.m3u8') ? 'stream' : 'mp4')

  return (
    <div className="p-4 sm:p-6 lg:p-8 pt-10 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> Analisador de Páginas</h1>
        <p className="text-sm text-muted-foreground mt-1">Cole qualquer página de vendas e faça o raio-x na hora: headline, preços, ferramentas, vídeos (transcrever/baixar) e teste A/B — sem precisar rastrear o concorrente.</p>
      </div>

      <div className={`rounded-2xl p-5 ${card}`}>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && analisar()}
            placeholder="https://pagina-de-vendas.com/oferta" className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono" style={inputStyle} />
          <button onClick={analisar} disabled={analisando || !url.trim()}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 disabled:opacity-50 whitespace-nowrap">
            {analisando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />} Analisar
          </button>
          <button onClick={detectarAb} disabled={abRodando || !url.trim()} title="Visita a página 6 vezes como visitante novo e revela variantes de vídeo e headline"
            className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 whitespace-nowrap">
            {abRodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            {abRodando ? 'Visitando 6x...' : 'Detectar teste A/B'}
          </button>
        </div>
        {erro && (
          <div className="mt-3 rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs bg-rose-500/8 border border-rose-500/25 text-rose-200">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {erro}
          </div>
        )}
      </div>

      {dados && (
        <div className={`rounded-2xl p-5 ${card} space-y-4`}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Headline</p>
            <p className="text-base font-semibold mt-1">{dados.headline || dados.titulo || '(não achei headline)'}</p>
            {dados.titulo && dados.headline && dados.titulo !== dados.headline && <p className="text-xs text-muted-foreground mt-0.5">Título da aba: {dados.titulo}</p>}
          </div>
          {dados.precos.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Preços na página</p>
              <div className="flex flex-wrap gap-1.5">{dados.precos.map((p) => <span key={p} className="text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-300">{p}</span>)}</div>
            </div>
          )}
          {dados.stack.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Ferramentas detectadas</p>
              <div className="flex flex-wrap gap-1.5">{dados.stack.map((s) => <span key={s.id} className="text-xs font-semibold px-2 py-1 rounded-lg bg-primary/10 text-primary">{s.label}</span>)}</div>
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Vídeos no código da página ({dados.videos.length})</p>
            {dados.videos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum vídeo reproduzível achado (player pode carregar só depois de interação).</p>
            ) : (
              <div className="space-y-2">
                {dados.videos.map((v) => (
                  <div key={v.url} className="rounded-xl border border-white/10 p-3 flex items-center gap-3">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase shrink-0">{tag(v)}</span>
                    <span className="text-[11px] font-mono text-muted-foreground truncate flex-1" title={v.url}>{v.url.replace(/^https?:\/\//, '')}</span>
                    <button onClick={() => transcrever(v)} disabled={!!tStatus}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition inline-flex items-center gap-1">
                      {tStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} {tStatus ?? 'Transcrever'}
                    </button>
                    <a href={v.download} target="_blank" rel="noreferrer"
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-foreground/90 hover:bg-white/5 transition inline-flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" /> Baixar
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {ab && (
        <div className={`rounded-2xl p-5 ${card}`}>
          <p className="text-sm font-bold flex items-center gap-2 mb-1"><Layers className="w-4 h-4 text-amber-300" /> Teste A/B</p>
          <p className="text-xs text-muted-foreground mb-4">
            {ab.rodadas} visitas como visitante novo{ab.erros > 0 ? ` (${ab.erros} falharam)` : ''} —{' '}
            {ab.videos.length > 1 || ab.headlines.length > 1
              ? <b className="text-amber-300">tem variação: {ab.videos.length} vídeo(s) e {ab.headlines.length} headline(s) diferentes.</b>
              : 'nenhuma variação detectada nessas visitas.'}
          </p>
          {ab.videos.map((v) => (
            <div key={v.url} className="rounded-xl border border-white/10 p-3 flex items-center gap-3 mb-2">
              <span className="text-xs font-bold tabular-nums px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 shrink-0">{Math.round(v.pct)}%</span>
              <span className="text-[11px] font-mono text-muted-foreground truncate flex-1" title={v.url}>{v.url.replace(/^https?:\/\//, '')}</span>
              <button onClick={() => transcrever(v)} disabled={!!tStatus}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition">
                Transcrever
              </button>
              <a href={v.download} target="_blank" rel="noreferrer"
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-foreground/90 hover:bg-white/5 transition inline-flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> Baixar
              </a>
            </div>
          ))}
          {ab.headlines.map((h) => (
            <div key={h.texto} className="rounded-xl border border-white/10 p-3 flex items-start gap-3 mb-2">
              <span className="text-xs font-bold tabular-nums px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 shrink-0">{Math.round(h.pct)}%</span>
              <span className="text-sm text-foreground/90">{h.texto}</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/70 mt-2">Rode mais de uma vez pra refinar a proporção. Split 100% via JavaScript no navegador pode não aparecer.</p>
        </div>
      )}

      {transcricao && (
        <div className={`rounded-2xl p-5 ${card}`}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Transcrição · {transcricao.trim().split(/\s+/).filter(Boolean).length} palavras</p>
            <button onClick={() => setTranscricao(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 max-h-80 overflow-y-auto">{transcricao}</p>
          <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-border">
            <button onClick={copiar} className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-white/10 hover:bg-white/5 transition">
              {copiado ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado!' : 'Copiar tudo'}
            </button>
            {([
              ['.txt', () => baixarTxt(nomeBase, transcricao)],
              ['.docx', () => baixarDocx(nomeBase, `Transcrição — ${nomeBase}`, transcricao)],
              ['.md', () => baixarMd(nomeBase, `Transcrição — ${nomeBase}`, transcricao)],
              ['.pdf', () => baixarPdf(nomeBase, `Transcrição — ${nomeBase}`, transcricao)],
            ] as [string, () => void][]).map(([ext, fn]) => (
              <button key={ext} onClick={fn} className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-white/10 hover:bg-white/5 transition">
                <Download className="w-4 h-4" /> {ext}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
