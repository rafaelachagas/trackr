import { extrairCriativo } from './utils'

// ============================================================
// CHAVE DO CRIATIVO — código|fase|flags
// ------------------------------------------------------------
// Mesma normalização usada em /api/performance-v2 para juntar GASTO (Meta) e
// FATURAMENTO (Hotmart) pelo anúncio. Casar por nome completo do anúncio é
// frágil (um typo no sck já quebra o match); código + fase + marcadores curtos
// (bmsub/bmus/v2) é estável. Extraído para módulo para reuso na importação em
// massa multi-dia (puxa o gasto da Meta por dia por criativo).
// ============================================================

// "...fase02..." -> "FASE02" (só reconhece fase 1/2/3, igual à performance-v2).
export function faseToken(t: string | null): string | null {
  const m = (t || '').toLowerCase().match(/fase\s*0?([123])/)
  return m ? `FASE0${m[1]}` : null
}

// Marcadores curtos e estáveis do nome/sck: bmsub (S), bmus (U), v2 (2).
export function flagsToken(t: string | null): string {
  const s = (t || '').toLowerCase()
  const bmsub = s.includes('bmsub') ? 'S' : '-'
  const bmus = s.includes('bmus') ? 'U' : '-'
  const v2 = /(^|[^a-z0-9])v2([^0-9]|$)/.test(s) ? '2' : '-'
  return `${bmsub}${bmus}${v2}`
}

// Chave a partir do GASTO (Meta): fase vem do campaign_name, flags do ad_name.
export function chaveDoGasto(criativo: string, campaignName: string | null, adName: string | null): string {
  return `${criativo}|${faseToken(campaignName) ?? '?'}|${flagsToken(adName)}`
}

// Chave a partir do SCK / Origem de Checkout de uma venda.
// Ex: "iz-adv-vendas-f-fase02-pre-escala-ad51|cj01|ad51-...-pre-escala"
//   código = ad51 (part[2]); fase = FASE02 (part[0]); flags = do sck inteiro.
// Retorna null quando não há código de anúncio (venda orgânica / bio).
export function chaveDoSck(sck: string | null | undefined): string | null {
  const codigo = extrairCriativo(sck)
  if (!codigo) return null
  const parte0 = (sck || '').split('|')[0]
  return `${codigo}|${faseToken(parte0) ?? '?'}|${flagsToken(sck ?? null)}`
}
