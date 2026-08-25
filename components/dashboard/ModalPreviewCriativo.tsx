'use client'

// Modal "ver criativo" — usado por qualquer tabela que só tem o código do
// anúncio (ad74...) e quer mostrar em tempo real qual é. Busca ao vivo na
// Meta via /api/criativos/preview (não guarda nada local — thumbnail muda
// se o anúncio for editado, então sempre busca de novo ao abrir).

import React, { useEffect, useState } from 'react'
import { X, ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import type { PreviewCriativo } from '@/app/api/criativos/preview/route'

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo', PAUSED: 'Pausado', ARCHIVED: 'Arquivado', DELETED: 'Removido',
  PENDING_REVIEW: 'Em análise', DISAPPROVED: 'Reprovado', PREAPPROVED: 'Pré-aprovado', ADSET_PAUSED: 'Conjunto pausado',
}
const STATUS_COR: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PAUSED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
}

export default function ModalPreviewCriativo({ codigo, onFechar }: { codigo: string | null; onFechar: () => void }) {
  const [dados, setDados] = useState<PreviewCriativo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [imgErr, setImgErr] = useState(false)

  useEffect(() => {
    if (!codigo) return
    setCarregando(true); setErro(null); setDados(null); setImgErr(false)
    fetch(`/api/criativos/preview?codigo=${encodeURIComponent(codigo)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha ao buscar.')
        setDados(j)
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [codigo])

  if (!codigo) return null

  const thumbSrc = dados?.thumbnail_url ? `/api/meta/thumb-proxy?url=${encodeURIComponent(dados.thumbnail_url)}` : null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onFechar}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
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
        </div>
      </div>
    </div>
  )
}
