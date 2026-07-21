'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Copy, Check } from 'lucide-react'

/**
 * GERADOR DE NOMENCLATURA
 *
 * Monta os nomes pro gerenciador (campanha / conjunto / criativo) + o link com
 * sck, seguindo o padrão da conta. Sem marcador, reproduz EXATAMENTE os exemplos:
 *
 *   FASE01 (CBO):  [IZ][CBO][VENDAS][F][FASE01] AD00 | AD01
 *                  sck=iz-cbo-vendas-f-fase01-ad00-ad01|cj01|ad00-exemplo
 *   FASE02 (ADV+): [IZ][ADV+][VENDAS][F][FASE02] Pré Escala - AD00
 *                  sck=iz-adv-vendas-f-fase02-pre-escala-ad00|cj01|ad00-exemplo-pre-escala
 *   FASE03 (ADV+): [IZ][ADV+][VENDAS][F][FASE03] Escala - AD00
 *                  sck=iz-adv-vendas-f-fase03-escala-ad00|cj01|ad00-exemplo-escala
 *
 * MARCADOR DE CONTA/VERSÃO (pra subir o MESMO ad em outra conta/BM sem misturar):
 *   - bmsub / bmus entram ANTES do sufixo de fase   → ad00-exemplo-bmus-pre-escala
 *   - v2 entra no FIM                               → ad00-exemplo-escala-v2
 * É de propósito no Nome do Criativo: é ali que o dashboard (performance-v2) lê
 * pra separar o ROAS por conta. Só bmsub/bmus/v2 são reconhecidos como separador.
 */

const LP_PADRAO = 'https://lp.rafaelachagas.com.br/fpf-vsl-v1'
const LP_STORAGE_KEY = 'gerador-nomenclatura-lp'

type Fase = 'FASE01' | 'FASE02' | 'FASE03'
const FASE_CFG: Record<Fase, { tipoDisplay: string; tipoSck: string; label: string | null; slug: string | null }> = {
  FASE01: { tipoDisplay: 'CBO',  tipoSck: 'cbo', label: null,          slug: null },
  FASE02: { tipoDisplay: 'ADV+', tipoSck: 'adv', label: 'Pré Escala',  slug: 'pre-escala' },
  FASE03: { tipoDisplay: 'ADV+', tipoSck: 'adv', label: 'Escala',      slug: 'escala' },
}

const MARCADORES = ['bmsub', 'bmus', 'v2'] as const
type Marcador = typeof MARCADORES[number]

const inputClass = 'bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 w-full transition-colors'

function parseBase(base: string): { codigo: string; slug: string } | null {
  const t = base.trim().toLowerCase()
  const m = t.match(/^(ad\d+)[-_ ]*(.*)$/)
  if (!m) return null
  const slug = m[2].replace(/^[-_\s]+/, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/-$/, '')
  return { codigo: m[1], slug }
}

function extrairAdCodes(texto: string): string[] {
  const m = texto.toLowerCase().match(/ad\d+/g)
  return m ? Array.from(new Set(m)) : []
}

function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1400) } catch {} }}
      className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
      title="Copiar"
    >
      {ok ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function LinhaResultado({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/20 border border-border/50 rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <CopyBtn value={value} />
      </div>
      <p className="text-xs font-mono text-foreground break-all leading-relaxed" translate="no">{value}</p>
    </div>
  )
}

export default function GeradorNomenclatura({ onClose }: { onClose: () => void }) {
  const [base, setBase] = useState('')
  const [fase, setFase] = useState<Fase>('FASE01')
  const [conjunto, setConjunto] = useState(1)
  const [marcadores, setMarcadores] = useState<Marcador[]>([])
  const [adsCampanha, setAdsCampanha] = useState('')
  // Lembra a última LP usada (não é padrão — varia por produto/criativo).
  const [lp, setLp] = useState<string>(() => {
    if (typeof window === 'undefined') return LP_PADRAO
    return localStorage.getItem(LP_STORAGE_KEY) || LP_PADRAO
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && lp.trim()) localStorage.setItem(LP_STORAGE_KEY, lp.trim())
  }, [lp])

  const parsed = parseBase(base)
  const baseInvalida = base.trim().length > 0 && !parsed

  const res = useMemo(() => {
    if (!parsed) return null
    const cfg = FASE_CFG[fase]
    const bm = MARCADORES.filter(m => m !== 'v2' && marcadores.includes(m)) // bmsub, bmus (antes da fase)
    const temV2 = marcadores.includes('v2')                                 // v2 (no fim)

    const codes = extrairAdCodes(adsCampanha)
    const adCodes = codes.length ? codes : [parsed.codigo]

    const adName = [`${parsed.codigo}-${parsed.slug}`, ...bm, cfg.slug, temV2 ? 'v2' : null]
      .filter(Boolean).join('-')

    const cj = String(conjunto).padStart(2, '0')
    const cjDisplay = `CJ${cj}`
    const cjSck = `cj${cj}`

    const campSck = ['iz', cfg.tipoSck, 'vendas', 'f', fase.toLowerCase(), ...bm, cfg.slug, ...adCodes, temV2 ? 'v2' : null]
      .filter(Boolean).join('-')

    const brackets = `[IZ][${cfg.tipoDisplay}][VENDAS][F][${fase}]`
      + bm.map(m => `[${m.toUpperCase()}]`).join('')
      + (temV2 ? '[V2]' : '')
    const adsUpper = adCodes.map(c => c.toUpperCase()).join(' | ')
    const campDisplay = brackets + (cfg.label ? ` ${cfg.label} - ${adsUpper}` : ` ${adsUpper}`)

    const sck = `${campSck}|${cjSck}|${adName}`
    const link = `${(lp.trim() || LP_PADRAO).replace(/\?.*$/, '')}?sck=${sck}`

    const tudo = `Campanha:\n${campDisplay}\n\nConjunto:\n${cjDisplay}\n\nCriativo:\n${adName}\n\nLink:\n${link}`
    return { campDisplay, cjDisplay, adName, sck, link, tudo }
  }, [parsed, fase, conjunto, marcadores, adsCampanha, lp])

  function toggleMarcador(m: Marcador) {
    setMarcadores(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h3 className="text-base font-bold text-foreground">Gerador de Nomenclatura</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Nomes pro gerenciador + link com sck, no padrão da conta</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Nome do criativo */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do criativo</label>
            <input
              type="text"
              value={base}
              onChange={e => setBase(e.target.value)}
              placeholder="ad00-exemplo"
              className={`${inputClass} ${baseInvalida ? 'border-rose-500/60' : ''}`}
              autoFocus
            />
            {baseInvalida
              ? <p className="text-[10px] text-rose-400 mt-1">Comece pelo código do AD. Ex: <span className="font-mono">ad00-exemplo</span></p>
              : <p className="text-[10px] text-muted-foreground mt-1">O sufixo de fase (pré-escala / escala) é adicionado sozinho — digite só o nome base.</p>}
          </div>

          {/* Fase */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Fase</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(FASE_CFG) as Fase[]).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFase(f)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${fase === f ? 'bg-primary/15 border-primary/50 text-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80'}`}
                >
                  {f}
                  <span className="block text-[9px] font-medium opacity-70">{FASE_CFG[f].tipoDisplay}{FASE_CFG[f].label ? ` · ${FASE_CFG[f].label}` : ''}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Conjunto + Marcadores */}
          <div className="grid grid-cols-[auto_1fr] gap-4 items-start">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Conjunto</label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setConjunto(c => Math.max(1, c - 1))} className="w-8 h-9 rounded-lg bg-background border border-border text-muted-foreground hover:text-foreground transition">−</button>
                <div className="w-14 h-9 rounded-lg bg-muted/20 border border-border/50 flex items-center justify-center text-sm font-mono font-bold text-foreground">CJ{String(conjunto).padStart(2, '0')}</div>
                <button type="button" onClick={() => setConjunto(c => Math.min(99, c + 1))} className="w-8 h-9 rounded-lg bg-background border border-border text-muted-foreground hover:text-foreground transition">+</button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Conta / versão <span className="font-normal normal-case opacity-70">(pra não misturar o mesmo AD)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {MARCADORES.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMarcador(m)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${marcadores.includes(m) ? 'bg-primary/15 border-primary/50 text-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Vazio = mesma conta de sempre. Marque só quando subir o mesmo AD em outra conta/BM.</p>
            </div>
          </div>

          {/* ADs na campanha (fase 01) */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">ADs na campanha <span className="font-normal normal-case opacity-70">(fase 01 agrupa vários)</span></label>
            <input
              type="text"
              value={adsCampanha}
              onChange={e => setAdsCampanha(e.target.value)}
              placeholder={parsed ? `${parsed.codigo} ad01` : 'ad00 ad01'}
              className={inputClass}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Liste todos os ADs da campanha (ex: <span className="font-mono">ad00 ad01</span>). Vazio = só o AD atual.</p>
          </div>

          {/* LP */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Link da página (LP)</label>
              {lp.trim() !== LP_PADRAO && (
                <button type="button" onClick={() => setLp(LP_PADRAO)} className="text-[10px] font-semibold text-primary hover:underline">usar padrão</button>
              )}
            </div>
            <input type="url" value={lp} onChange={e => setLp(e.target.value)} placeholder={LP_PADRAO} className={inputClass} />
            <p className="text-[10px] text-muted-foreground mt-1">Cole a LP deste criativo — fica lembrada pra próxima. O <span className="font-mono">?sck=</span> é adicionado sozinho.</p>
          </div>

          {/* Resultado */}
          {res && (
            <div className="pt-2 border-t border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Nomenclatura gerada</span>
                <button
                  type="button"
                  onClick={async () => { try { await navigator.clipboard.writeText(res.tudo) } catch {} }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition"
                >
                  <Copy className="w-3 h-3" /> Copiar tudo
                </button>
              </div>
              <LinhaResultado label="Nome da Campanha" value={res.campDisplay} />
              <LinhaResultado label="Nome do Conjunto" value={res.cjDisplay} />
              <LinhaResultado label="Nome do Criativo" value={res.adName} />
              <LinhaResultado label="Link (sck)" value={res.link} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
