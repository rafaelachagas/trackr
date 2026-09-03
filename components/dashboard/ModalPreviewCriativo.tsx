'use client'

// Modal "ver criativo" — usado por qualquer tabela que só tem o código do
// anúncio (ad74...) e quer mostrar em tempo real qual é. Busca ao vivo na
// Meta via /api/criativos/preview (não guarda nada local — thumbnail muda
// se o anúncio for editado, então sempre busca de novo ao abrir).

import React, { useEffect, useState } from 'react'
import { X, ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import type { PreviewCriativo } from '@/app/api/criativos/preview/route'
import type { HistoricoDetalhe } from '@/app/api/criativos/historico-detalhe/route'
import { useDashboard } from '@/context/DashboardContext'

const fmtMoeda = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtMes = (m: string) => { const [a, mm] = m.split('-'); return `${['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+mm]}/${a.slice(2)}` }

const roasCor = (r: number | null) => r == null ? 'text-muted-foreground' : r >= 2 ? 'text-emerald-400' : r >= 1 ? 'text-yellow-400' : 'text-rose-400'
function MiniStat({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border px-2 py-1.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums leading-tight ${cor}`}>{valor}</div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo', PAUSED: 'Pausado', ARCHIVED: 'Arquivado', DELETED: 'Removido',
  PENDING_REVIEW: 'Em análise', DISAPPROVED: 'Reprovado', PREAPPROVED: 'Pré-aprovado', ADSET_PAUSED: 'Conjunto pausado',
}
const STATUS_COR: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PAUSED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
}

export default function ModalPreviewCriativo({ codigo, onFechar }: { codigo: string | null; onFechar: () => void }) {
  const { isPrivate } = useDashboard()
  const [dados, setDados] = useState<PreviewCriativo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [imgErr, setImgErr] = useState(false)
  const [hist, setHist] = useState<HistoricoDetalhe | null>(null)

  useEffect(() => {
    if (!codigo) return
    setCarregando(true); setErro(null); setDados(null); setImgErr(false); setHist(null)
    fetch(`/api/criativos/preview?codigo=${encodeURIComponent(codigo)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha ao buscar.')
        setDados(j)
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
    // histórico financeiro (não bloqueia o preview)
    fetch(`/api/criativos/historico-detalhe?codigo=${encodeURIComponent(codigo)}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null).then((j) => setHist(j)).catch(() => {})
  }, [codigo])

  if (!codigo) return null

  const thumbSrc = dados?.thumbnail_url ? `/api/meta/thumb-proxy?url=${encodeURIComponent(dados.thumbnail_url)}` : null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onFechar}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">{codigo}</h3>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5">
          {carregando && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin" /> Buscando na Meta em tempo real...
            </div>
          )}

          {erro && !carregando && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <ImageOff className="w-8 h-8 text-muted-foreground/30" />
              {erro}
            </div>
          )}

          {dados && !carregando && !erro && (
            <>
              <div className="relative rounded-xl overflow-hidden mb-4 bg-black/20" style={{ minHeight: '220px' }}>
                {thumbSrc && !imgErr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbSrc} alt={dados.nome} onError={() => setImgErr(true)} className="w-full h-full object-contain max-h-[360px] mx-auto" />
                ) : (
                  <div className="flex items-center justify-center py-20"><ImageOff className="w-10 h-10 text-muted-foreground/20" /></div>
                )}
              </div>

              <p className="text-sm font-semibold text-foreground break-words mb-2">{dados.nome}</p>

              <div className="flex items-center gap-2 flex-wrap mb-4">
                {dados.fase && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border bg-zinc-500/15 text-zinc-300 border-zinc-500/30">{dados.fase}</span>}
                {dados.status && (
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${STATUS_COR[dados.status] ?? 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'}`}>
                    {STATUS_LABEL[dados.status] ?? dados.status}
                  </span>
                )}
              </div>

              {dados.link_anuncio && (
                <a href={dados.link_anuncio} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition">
                  <ExternalLink className="w-4 h-4" /> Abrir no Instagram
                </a>
              )}
            </>
          )}

          {/* Histórico financeiro — gasto × receita, acumulado e por mês (todo o período) */}
          {hist && hist.total.vendas + hist.meses.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Histórico do criativo · todo o período</p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                <MiniStat label="Gasto" valor={isPrivate ? '••' : fmtMoeda(hist.total.gasto)} cor="text-rose-400" />
                <MiniStat label="Receita" valor={isPrivate ? '••' : fmtMoeda(hist.total.receita)} cor="text-emerald-400" />
                <MiniStat label="ROAS" valor={isPrivate ? '•' : (hist.total.roas == null ? '—' : `${hist.total.roas.toFixed(2)}x`)} cor={roasCor(hist.total.roas)} />
                <MiniStat label="Vendas" valor={isPrivate ? '••' : String(hist.total.vendas)} cor="text-foreground" />
              </div>
              {hist.meses.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-semibold">Mês</th>
                        <th className="text-right px-3 py-1.5 font-semibold">Gasto</th>
                        <th className="text-right px-3 py-1.5 font-semibold">Receita</th>
                        <th className="text-right px-3 py-1.5 font-semibold">ROAS</th>
                        <th className="text-right px-3 py-1.5 font-semibold">Vendas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {hist.meses.slice().reverse().map((m) => (
                        <tr key={m.mes}>
                          <td className="px-3 py-1.5 font-medium">{fmtMes(m.mes)}</td>
                          <td className={`px-3 py-1.5 text-right text-rose-400 ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••' : fmtMoeda(m.gasto)}</td>
                          <td className={`px-3 py-1.5 text-right text-emerald-400 ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••' : fmtMoeda(m.receita)}</td>
                          <td className={`px-3 py-1.5 text-right font-bold ${roasCor(m.roas)} ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '•' : (m.roas == null ? '—' : `${m.roas.toFixed(2)}x`)}</td>
                          <td className={`px-3 py-1.5 text-right text-muted-foreground ${isPrivate ? 'blur-sm select-none' : ''}`}>{isPrivate ? '••' : m.vendas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
