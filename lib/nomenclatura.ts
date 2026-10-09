// Nomenclatura de campanha / conjunto / criativo + link com sck.
// Fonte única: usada pelo Gerador de Nomenclatura (tools/ad-naming) e pelo bot
// de WhatsApp que monta anúncios na Meta (lib/whatsapp-subir-anuncio). Se mudar
// aqui, muda nos dois — e o sck precisa continuar batendo com lib/meta-chave.ts.
//
//   FASE01 (CBO):  [IZ][CBO][VENDAS][F][FASE01] AD00 | AD01
//                  sck=iz-cbo-vendas-f-fase01-ad00-ad01|cj01|ad00-exemplo
//   FASE02 (ADV+): [IZ][ADV+][VENDAS][F][FASE02] Pré Escala - AD00
//                  sck=iz-adv-vendas-f-fase02-pre-escala-ad00|cj01|ad00-exemplo-pre-escala
//   FASE03 (ADV+): [IZ][ADV+][VENDAS][F][FASE03] Escala - AD00
//                  sck=iz-adv-vendas-f-fase03-escala-ad00|cj01|ad00-exemplo-escala
//
// Marcador de conta (subir o MESMO ad fora da conta principal) entra ANTES do
// sufixo de fase; v2 entra no FIM.

export const LP_PADRAO = 'https://lp.rafaelachagas.com.br/fpf-vsl-v1'

export type Fase = 'FASE01' | 'FASE02' | 'FASE03'
export type Versao = 'v1' | 'v2'

export const FASE_CFG: Record<Fase, { tipoDisplay: string; tipoSck: string; label: string | null; slug: string | null }> = {
  FASE01: { tipoDisplay: 'CBO',  tipoSck: 'cbo', label: null,          slug: null },
  FASE02: { tipoDisplay: 'ADV+', tipoSck: 'adv', label: 'Pré Escala',  slug: 'pre-escala' },
  FASE03: { tipoDisplay: 'ADV+', tipoSck: 'adv', label: 'Escala',      slug: 'escala' },
}

export function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function parseBase(base: string): { codigo: string; slug: string } | null {
  const t = base.trim().toLowerCase()
  const m = t.match(/^(ad\d+)[-_ ]*(.*)$/)
  if (!m) return null
  const sl = m[2].replace(/^[-_\s]+/, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/-$/, '')
  return { codigo: m[1], slug: sl }
}

// Aceita vírgula, espaço ou pipe. Preserva a ordem digitada e remove repetidos.
export function extrairAdCodes(texto: string): string[] {
  const m = texto.toLowerCase().match(/ad\d+/g)
  return m ? Array.from(new Set(m)) : []
}

// Aceita colar "&hpid=abc", "hpid=abc" ou só o hash — devolve só o valor.
export function limparHpid(h: string): string {
  return h.trim().replace(/^[?&]?hpid=/i, '').trim()
}

export interface Nomenclatura {
  campDisplay: string
  cjDisplay: string
  adName: string
  sck: string
  link: string
}

export function gerarNomenclatura(o: {
  base: { codigo: string; slug: string }
  fase: Fase
  conjunto: number
  versao?: Versao
  marcador?: string          // vazio = conta principal
  adCodes: string[]          // ADs que a campanha agrupa (vai no nome dela)
  lp?: string
  hpid?: string
}): Nomenclatura {
  const cfg = FASE_CFG[o.fase]
  const mk = slug(o.marcador || '')
  const bm = mk ? [mk] : []
  const temV2 = o.versao === 'v2'

  const adName = [o.base.slug ? `${o.base.codigo}-${o.base.slug}` : o.base.codigo, ...bm, cfg.slug, temV2 ? 'v2' : null]
    .filter(Boolean).join('-')

  const cj = String(o.conjunto).padStart(2, '0')
  const cjDisplay = `CJ${cj}`

  const campSck = ['iz', cfg.tipoSck, 'vendas', 'f', o.fase.toLowerCase(), ...bm, cfg.slug, ...o.adCodes, temV2 ? 'v2' : null]
    .filter(Boolean).join('-')

  const brackets = `[IZ][${cfg.tipoDisplay}][VENDAS][F][${o.fase}]`
    + bm.map(m => `[${m.toUpperCase()}]`).join('')
    + (temV2 ? '[V2]' : '')
  const adsUpper = o.adCodes.map(c => c.toUpperCase()).join(' | ')
  const campDisplay = brackets + (cfg.label ? ` ${cfg.label} - ${adsUpper}` : ` ${adsUpper}`)

  const sck = `${campSck}|cj${cj}|${adName}`
  const hash = limparHpid(o.hpid || '')
  const link = `${(o.lp?.trim() || LP_PADRAO).replace(/\?.*$/, '')}?sck=${sck}` + (hash ? `&hpid=${hash}` : '')

  return { campDisplay, cjDisplay, adName, sck, link }
}
