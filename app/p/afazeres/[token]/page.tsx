'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'

type Afazer = { id: string; titulo: string; descricao?: string; secao: string; prioridade: string; prazo?: string; feito: boolean }

const SECOES = [
  { key: 'urgente', num: 'I', titulo: 'Urgente — esta semana' },
  { key: 'andamento', num: 'II', titulo: 'Em andamento' },
  { key: 'planejado', num: 'III', titulo: 'Planejado — próximas semanas' },
  { key: 'rotina', num: 'IV', titulo: 'Rotina e manutenção' },
]
const TONE: Record<string, string> = { alta: '#f87171', media: '#fbbf24', baixa: '#3b82f6', rotina: 'transparent' }
const TAG: Record<string, React.CSSProperties> = {
  alta: { color: '#fca5a5', borderColor: 'rgba(248,113,113,.32)', background: 'rgba(248,113,113,.08)' },
  media: { color: '#fcd34d', borderColor: 'rgba(251,191,36,.28)', background: 'rgba(251,191,36,.07)' },
  baixa: { color: '#93c5fd', borderColor: 'rgba(59,130,246,.3)', background: 'rgba(59,130,246,.1)' },
  rotina: { color: '#8ba0b6', borderColor: 'rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)' },
}
const PLABEL: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa', rotina: 'Rotina' }

export default function AfazeresPublico() {
  const params = useParams<{ token: string }>()
  const token = params?.token
  const [itens, setItens] = useState<Afazer[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/afazeres?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Falha'); setItens(j.itens || []) })
      .catch((e) => setErro(e.message))
  }, [token])

  const total = itens?.length || 0
  const feitos = itens?.filter((i) => i.feito).length || 0
  const pct = total ? Math.round((feitos / total) * 100) : 0

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f16', color: '#e6edf5', fontFamily: '"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 100px' }}>
        <header style={{ textAlign: 'center', padding: '72px 0 40px' }}>
          <div style={{ fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: '#60a5fa', fontWeight: 500 }}>The Track</div>
          <div style={{ width: 52, height: 1, background: 'linear-gradient(90deg,transparent,#3b82f6,transparent)', margin: '20px auto 24px' }} />
          <h1 style={{ font: '400 clamp(28px,5vw,44px)/1.15 "Cormorant Garamond",Georgia,serif', margin: 0 }}>Afazeres<br /><em style={{ fontStyle: 'normal', color: '#60a5fa', fontSize: '.8em' }}>andamento em tempo real</em></h1>
          <p style={{ color: '#93a2b4', maxWidth: '44ch', margin: '18px auto 0', fontSize: 15 }}>Visualização somente leitura. Marque o progresso pelo painel do The Track.</p>
        </header>

        {erro && <div style={{ textAlign: 'center', color: '#93a2b4', padding: '40px 0' }}>{erro === 'link inválido ou revogado' ? 'Este link não é mais válido.' : erro}</div>}
        {!itens && !erro && <div style={{ textAlign: 'center', color: '#63748a', padding: '40px 0', display: 'flex', gap: 8, justifyContent: 'center' }}><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>}

        {itens && (
          <>
            <div style={{ border: '1px solid rgba(255,255,255,.075)', background: 'rgba(255,255,255,.028)', borderRadius: 14, padding: '20px 24px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontSize: 10, letterSpacing: '.22em', textTransform: 'uppercase', color: '#63748a', fontWeight: 500 }}>Progresso geral</span>
                <span style={{ font: '400 24px/1 "Cormorant Garamond",serif', color: '#60a5fa', fontVariantNumeric: 'tabular-nums' }}>{feitos} / {total}</span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: 'linear-gradient(90deg,#3b82f6,#22d3ee)', transition: 'width .5s' }} />
              </div>
              <p style={{ marginTop: 12, fontSize: 13, color: '#63748a' }}>{feitos === 0 ? 'Nada concluído ainda.' : feitos === total ? 'Tudo concluído.' : `${pct}% concluído · restam ${total - feitos}.`}</p>
            </div>

            {total === 0 && <p style={{ textAlign: 'center', color: '#63748a', padding: '40px 0' }}>Nenhum afazer publicado ainda.</p>}

            {SECOES.map((sec) => {
              const lista = itens.filter((i) => i.secao === sec.key)
              if (!lista.length) return null
              return (
                <section key={sec.key} style={{ marginTop: 48 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                    <span style={{ fontSize: 12.5, letterSpacing: '.26em', color: '#60a5fa', fontWeight: 500 }}>{sec.num}</span>
                    <h2 style={{ font: '500 11px/1 inherit', letterSpacing: '.24em', textTransform: 'uppercase', color: '#93a2b4', margin: 0 }}>{sec.titulo}</h2>
                    <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.075)' }} />
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {lista.map((it) => (
                      <li key={it.id} style={{ display: 'flex', gap: 15, alignItems: 'flex-start', border: '1px solid rgba(255,255,255,.075)', borderRadius: 13, background: 'rgba(255,255,255,.028)', padding: '16px 20px', position: 'relative', overflow: 'hidden', opacity: it.feito ? .45 : 1 }}>
                        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: TONE[it.prioridade] || 'transparent' }} />
                        <span style={{ flex: 'none', width: 18, height: 18, marginTop: 3, borderRadius: 5, border: it.feito ? '1.5px solid #3b82f6' : '1.5px solid rgba(255,255,255,.22)', background: it.feito ? '#3b82f6' : 'rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {it.feito && <Check className="w-3 h-3" strokeWidth={3} color="#041220" />}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 15.5, lineHeight: 1.5, textDecoration: it.feito ? 'line-through' : 'none', textDecorationColor: '#63748a' }}>{it.titulo}</div>
                          {it.descricao && <div style={{ fontSize: 13.5, color: '#63748a', marginTop: 5, lineHeight: 1.6 }}>{it.descricao}</div>}
                          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                            <span style={{ font: '500 9.5px/1 inherit', letterSpacing: '.14em', textTransform: 'uppercase', border: '1px solid', borderRadius: 999, padding: '5px 11px', ...(TAG[it.prioridade] || TAG.rotina) }}>{PLABEL[it.prioridade] || it.prioridade}</span>
                            {it.prazo && <span style={{ font: '500 9.5px/1 inherit', letterSpacing: '.14em', textTransform: 'uppercase', border: '1px solid rgba(59,130,246,.3)', borderRadius: 999, padding: '5px 11px', color: '#93c5fd', background: 'rgba(59,130,246,.1)' }}>{it.prazo}</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
            <div style={{ textAlign: 'center', marginTop: 64, paddingTop: 40, borderTop: '1px solid rgba(255,255,255,.075)', color: '#63748a', fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase' }}>The Track · Afazeres</div>
          </>
        )}
      </div>
    </div>
  )
}
