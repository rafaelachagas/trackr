'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Copy, Check, ChevronDown, Loader2 } from 'lucide-react'

/**
 * GERADOR DE NOMENCLATURA
 *
 * Monta os nomes pro gerenciador (campanha / conjunto / criativo) + o link com
 * sck, seguindo o padrão da conta. Sem conta/versão, reproduz os exemplos exatos:
 *
 *   FASE01 (CBO):  [IZ][CBO][VENDAS][F][FASE01] AD00 | AD01
 *                  sck=iz-cbo-vendas-f-fase01-ad00-ad01|cj01|ad00-exemplo
 *   FASE02 (ADV+): [IZ][ADV+][VENDAS][F][FASE02] Pré Escala - AD00
 *                  sck=iz-adv-vendas-f-fase02-pre-escala-ad00|cj01|ad00-exemplo-pre-escala
 *   FASE03 (ADV+): [IZ][ADV+][VENDAS][F][FASE03] Escala - AD00
 *                  sck=iz-adv-vendas-f-fase03-escala-ad00|cj01|ad00-exemplo-escala
 *
 * CONTA / VERSÃO (pra subir o MESMO ad sem misturar):
 *   - conta é um marcador livre (digitado ou puxado da Meta). Entra ANTES do
 *     sufixo de fase:  ad00-exemplo-bmus-pre-escala
 *   - v2 é separado e entra no FIM:  ad00-exemplo-escala-v2
 *   Ambos vão no Nome do Criativo, que é onde o performance-v2 lê pra separar o
 *   ROAS. ATENÇÃO: hoje o dashboard só separa por bmsub/bmus/v2 — marcadores de
 *   outras contas geram o nome certo mas ainda somam o ROAS junto até o
 *   flagsToken (performance-v2) ser estendido.
 */

const LP_PADRAO = 'https://lp.rafaelachagas.com.br/fpf-vsl-v1'
const LP_STORAGE_KEY = 'gerador-nomenclatura-lp'

type Fase = 'FASE01' | 'FASE02' | 'FASE03'
const FASE_CFG: Record<Fase, { tipoDisplay: string; tipoSck: string; label: string | null; slug: string | null }> = {
  FASE01: { tipoDisplay: 'CBO',  tipoSck: 'cbo', label: null,          slug: null },
  FASE02: { tipoDisplay: 'ADV+', tipoSck: 'adv', label: 'Pré Escala',  slug: 'pre-escala' },
  FASE03: { tipoDisplay: 'ADV+', tipoSck: 'adv', label: 'Escala',      slug: 'escala' },
}

type Versao = 'v1' | 'v2'
type ContaMeta = { id: string; name: string; currency?: string }

// Superfície neutra (o --background do tema é azul-marinho e sai da identidade).
const inputClass = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 w-full transition-all'

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function parseBase(base: string): { codigo: string; slug: string } | null {
  const t = base.trim().toLowerCase()
  const m = t.match(/^(ad\d+)[-_ ]*(.*)$/)
  if (!m) return null
  const sl = m[2].replace(/^[-_\s]+/, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/-$/, '')
  return { codigo: m[1], slug: sl }
}

// Aceita vírgula, espaço ou pipe. Preserva a ordem digitada e remove repetidos.
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
    <div className="bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <CopyBtn value={value} />
      </div>
      <p className="text-xs font-mono text-foreground break-all leading-relaxed" translate="no">{value}</p>
    </div>
  )
}

// Segmento (escolha única) reutilizável.
function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string; sub?: string }[] }) {
  return (
    <div className="inline-flex w-full rounded-lg border border-white/10 bg-white/5 p-1 gap-1">
      {options.map(o => {
        const active = o.v === value
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${active ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {o.label}
            {o.sub && <span className={`block text-[9px] font-medium ${active ? 'text-white/80' : 'opacity-60'}`}>{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function GeradorNomenclatura({ onClose }: { onClose: () => void }) {
  const [base, setBase] = useState('')
  const [fase, setFase] = useState<Fase>('FASE01')
  const [conjunto, setConjunto] = useState(1)
  const [versao, setVersao] = useState<Versao>('v1')
  const [contaMarker, setContaMarker] = useState('')   // vazio = conta principal
  const [adsCampanha, setAdsCampanha] = useState('')
  const [adsDirty, setAdsDirty] = useState(false)
  const [lp, setLp] = useState<string>(() => {
    if (typeof window === 'undefined') return LP_PADRAO
    return localStorage.getItem(LP_STORAGE_KEY) || LP_PADRAO
  })

  // Contas da Meta (dropdown sob demanda).
  const [contas, setContas] = useState<ContaMeta[] | null>(null)
  const [contasOpen, setContasOpen] = useState(false)
  const [contasLoading, setContasLoading] = useState(false)
  const [contasErro, setContasErro] = useState<string | null>(null)

  const parsed = parseBase(base)
  const baseInvalida = base.trim().length > 0 && !parsed
  const codigo = parsed?.codigo ?? ''

  // ADs na campanha nunca fica vazio: espelha o código do criativo até você mexer.
  useEffect(() => { if (!adsDirty) setAdsCampanha(codigo) }, [codigo, adsDirty])

  useEffect(() => {
    if (typeof window !== 'undefined' && lp.trim()) localStorage.setItem(LP_STORAGE_KEY, lp.trim())
  }, [lp])

  async function abrirContas() {
    setContasOpen(o => !o)
    if (contas || contasLoading) return
    setContasLoading(true); setContasErro(null)
    try {
      const r = await fetch('/api/meta/accounts')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Conecte a Meta em Fontes de dados › Contas de anúncio.')
      setContas(j.accounts ?? [])
    } catch (e) {
      setContasErro(e instanceof Error ? e.message : 'Falha ao carregar contas')
    } finally {
      setContasLoading(false)
    }
  }

  const adCodes = extrairAdCodes(adsCampanha)
  const adsVazio = !!parsed && adCodes.length === 0
  const mk = slug(contaMarker)

  const res = useMemo(() => {
    if (!parsed || adCodes.length === 0) return null
    const cfg = FASE_CFG[fase]
    const bm = mk ? [mk] : []          // conta (antes da fase)
    const temV2 = versao === 'v2'      // versão (no fim)

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
  }, [parsed, adCodes, fase, conjunto, mk, versao, lp])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h3 className="text-base font-bold text-foreground">Gerador de Nomenclatura</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Nomes pro gerenciador + link com sck, no padrão da conta</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Nome do criativo */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do criativo</label>
            <input
              type="text"
              value={base}
              onChange={e => setBase(e.target.value)}
              placeholder="ad00-exemplo"
              className={`${inputClass} ${baseInvalida ? 'border-rose-500/60 focus:ring-rose-500/30' : ''}`}
              autoFocus
            />
            {baseInvalida
              ? <p className="text-[10px] text-rose-400 mt-1">Comece pelo código do AD. Ex: <span className="font-mono">ad00-exemplo</span></p>
              : <p className="text-[10px] text-muted-foreground mt-1">O sufixo de fase (pré-escala / escala) é adicionado sozinho — digite só o nome base.</p>}
          </div>

          {/* Fase */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Fase</label>
            <Segmented<Fase>
              value={fase}
              onChange={setFase}
              options={(Object.keys(FASE_CFG) as Fase[]).map(f => ({ v: f, label: f, sub: `${FASE_CFG[f].tipoDisplay}${FASE_CFG[f].label ? ` · ${FASE_CFG[f].label}` : ''}` }))}
            />
          </div>

          {/* Conjunto + Versão */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Conjunto</label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setConjunto(c => Math.max(1, c - 1))} className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 transition text-lg leading-none">−</button>
                <div className="flex-1 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-sm font-mono font-bold text-foreground">CJ{String(conjunto).padStart(2, '0')}</div>
                <button type="button" onClick={() => setConjunto(c => Math.min(99, c + 1))} className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10 transition text-lg leading-none">+</button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Versão</label>
              <Segmented<Versao> value={versao} onChange={setVersao} options={[{ v: 'v1', label: 'v1' }, { v: 'v2', label: 'v2' }]} />
            </div>
          </div>

          {/* Conta de anúncio (manual + puxar da Meta) */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Conta de anúncio <span className="font-normal normal-case opacity-60">· opcional</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={contaMarker}
                onChange={e => setContaMarker(e.target.value)}
                placeholder="vazio = conta principal"
                className={inputClass}
              />
              <button
                type="button"
                onClick={abrirContas}
                className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-foreground hover:bg-white/10 transition"
              >
                {contasLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className={`w-3.5 h-3.5 transition-transform ${contasOpen ? 'rotate-180' : ''}`} />}
                Meta
              </button>
            </div>

            {contasOpen && (
              <div className="mt-2 rounded-lg border border-white/10 bg-white/5 max-h-44 overflow-y-auto">
                {contasLoading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></div>
                ) : contasErro ? (
                  <p className="text-[11px] text-amber-400 px-3 py-3">{contasErro}</p>
                ) : contas && contas.length > 0 ? (
                  contas.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setContaMarker(slug(c.name)); setContasOpen(false) }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/10 transition"
                    >
                      <span className="text-xs text-foreground truncate" translate="no">{c.name}</span>
                      {c.currency && <span className="text-[9px] font-bold text-muted-foreground shrink-0">{c.currency}</span>}
                    </button>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground px-3 py-3">Nenhuma conta encontrada.</p>
                )}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground mt-1">
              Preencha só quando subir o <b>mesmo</b> AD fora da conta principal. Digite um marcador curto ou puxe da Meta.
              {mk && !['bmsub', 'bmus'].includes(mk) && (
                <span className="block text-amber-400/90 mt-0.5">⚠ O dashboard ainda só separa ROAS por bmsub/bmus — “{mk}” vai somar junto até habilitar.</span>
              )}
            </p>
          </div>

          {/* ADs na campanha */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">ADs na campanha</label>
            <input
              type="text"
              value={adsCampanha}
              onChange={e => { setAdsDirty(true); setAdsCampanha(e.target.value) }}
              placeholder="ad00, ad01"
              className={`${inputClass} ${adsVazio ? 'border-rose-500/60 focus:ring-rose-500/30' : ''}`}
            />
            {adsVazio
              ? <p className="text-[10px] text-rose-400 mt-1">Liste ao menos um AD (ex: <span className="font-mono">ad00</span>).</p>
              : <p className="text-[10px] text-muted-foreground mt-1">Separe por vírgula. Na fase 01 a campanha agrupa vários (ex: <span className="font-mono">ad00, ad01</span>).</p>}
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
          {res ? (
            <div className="pt-4 border-t border-border space-y-2.5">
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
          ) : (
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground text-center py-4">Digite o nome do criativo pra gerar a nomenclatura.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
