import { extrairCriativo } from './utils'

// ============================================================
// CHAVE DO CRIATIVO — código|fase|flags|campanha
// ------------------------------------------------------------
// Mesma normalização usada em /api/performance-v2 para juntar GASTO (Meta) e
// FATURAMENTO (Hotmart) pelo anúncio. Casar por nome completo do anúncio é
// frágil (um typo no sck já quebra o match); código + fase + marcadores curtos
// (bmsub/bmus/v2) é estável. Extraído para módulo para reuso na importação em
// massa multi-dia (puxa o gasto da Meta por dia por criativo).
//
// CAMPANHA (set/2026): o mesmo criativo pode rodar em DUAS campanhas da mesma
// fase ao mesmo tempo — ex: ad111 em "[FASE01] AD111 | AD112 | AD113" e numa
// campanha nova "[FASE01] AD111 | AD112". Sem a campanha na chave as duas
// viravam uma linha só, com gasto e receita misturados. O part[0] do sck é o
// nome da campanha "slugado" (iz-cbo-vendas-f-fase01-ad111-ad112) e bate com o
// campaign_name da Meta em ~96% das vendas; os outros 4% são variações de
// escrita (carafa × CA RAFA). Por isso a venda NÃO exige match exato: ver
// criarResolvedor.
// ============================================================

// "...fase02..." -> "FASE02" (só reconhece fase 1/2/3, igual à performance-v2).
export function faseToken(t: string | null): string | null {
  const m = (t || '').toLowerCase().match(/fase\s*0?([123])/)
  return m ? `FASE0${m[1]}` : null
}

// Marcadores curtos e estáveis do nome/sck: bmsub (S), bmus (U), v2 (2), retest (R).
// O "retest" (campanha nova relançada com o mesmo criativo, nome terminando em
// -retest) aparece tanto no ad_name (gasto) quanto na 3ª parte do sck (venda),
// então entra na chave e separa a campanha de retest da original — com a receita
// casando no lado certo, em vez de fundir as duas numa linha só.
export function flagsToken(t: string | null): string {
  const s = (t || '').toLowerCase()
  const bmsub = s.includes('bmsub') ? 'S' : '-'
  const bmus = s.includes('bmus') ? 'U' : '-'
  const v2 = /(^|[^a-z0-9])v2([^0-9]|$)/.test(s) ? '2' : '-'
  const retest = s.includes('retest') ? 'R' : '-'
  return `${bmsub}${bmus}${v2}${retest}`
}

// Nome da campanha só com letras e números: "[IZ][CBO][VENDAS][F][FASE01] AD111 | AD112"
// e o sck "iz-cbo-vendas-f-fase01-ad111-ad112" viram o mesmo "izcbovendasffase01ad111ad112".
// Sem separador nenhum porque é aí que os dois lados mais divergem ("ca-rafa" × "carafa").
export function campanhaToken(t: string | null | undefined): string {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function base(codigo: string, fase: string | null, flags: string) {
  return `${codigo}|${fase ?? '?'}|${flags}`
}

// Chave de um anúncio da Meta (gasto, insight ou anúncio ativo).
export function chaveDoAnuncio(criativo: string, campaignName: string | null, adName: string | null): string {
  return `${base(criativo, faseToken(campaignName), flagsToken(adName))}|${campanhaToken(campaignName)}`
}

// Compat: nome antigo, mesma chave de anúncio.
export const chaveDoGasto = chaveDoAnuncio

// Chave SEM campanha a partir do SCK (código|fase|flags). Pra chave completa de
// uma venda use criarResolvedor — a campanha da venda depende dos gastos.
// Retorna null quando não há código de anúncio (venda orgânica / bio).
export function chaveDoSck(sck: string | null | undefined): string | null {
  const codigo = extrairCriativo(sck)
  if (!codigo) return null
  const parte0 = (sck || '').split('|')[0]
  return base(codigo, faseToken(parte0), flagsToken(sck ?? null))
}

function prefixoComum(a: string, b: string) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

export type ResolvedorChaves = {
  doGasto: (criativo: string, campaignName: string | null, adName: string | null) => string
  doVenda: (criativo: string, sck: string | null) => string
}

/**
 * Decide em qual campanha cada venda cai, olhando as campanhas que TÊM GASTO
 * pro mesmo código|fase|flags:
 *   - campanha do sck igual a uma delas → essa (o caso normal, ~96%);
 *   - só existe uma campanha → ela (tolera typo no sck, como sempre foi);
 *   - existem várias e nenhuma bate → a de nome mais parecido;
 *   - nenhuma tem gasto → a própria campanha do sck (linha só de receita).
 * Todas as rotas que mostram o mesmo número (tabela, modais, snapshot, grid)
 * precisam usar isto — senão a receita cai numa linha aqui e noutra lá.
 */
export function criarResolvedor(
  gastos: { criativo: string | null; campaign_name: string | null; ad_name: string | null }[],
): ResolvedorChaves {
  const campanhas = new Map<string, Set<string>>()
  for (const g of gastos) {
    if (!g.criativo) continue
    const b = base(g.criativo, faseToken(g.campaign_name), flagsToken(g.ad_name))
    let s = campanhas.get(b)
    if (!s) campanhas.set(b, (s = new Set()))
    s.add(campanhaToken(g.campaign_name))
  }
  return {
    doGasto: chaveDoAnuncio,
    doVenda(criativo, sck) {
      const parte0 = (sck || '').split('|')[0]
      const b = base(criativo, faseToken(parte0), flagsToken(sck))
      const alvo = campanhaToken(parte0)
      const cands = campanhas.get(b)
      if (!cands || cands.size === 0 || cands.has(alvo)) return `${b}|${alvo}`
      if (cands.size === 1) return `${b}|${[...cands][0]}`
      let melhor = '', nota = -1
      for (const c of cands) {
        const n = prefixoComum(c, alvo)
        if (n > nota) { nota = n; melhor = c }
      }
      return `${b}|${melhor}`
    },
  }
}

// A chave que o front manda pros modais pode ser antiga (3 partes, sem
// campanha) se a página ficou aberta durante o deploy — aí vale o criativo
// inteiro, como antes.
export function casaChave(gerada: string, alvo: string): boolean {
  return alvo.split('|').length >= 4 ? gerada === alvo : gerada.startsWith(`${alvo}|`)
}
