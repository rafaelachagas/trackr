// Config do Rastreador de Anúncios — serviço de scraping na VPS (porta 8081).
export const RASTREADOR_URL = process.env.RASTREADOR_URL ?? 'http://179.198.104.241:8081'
export const RASTREADOR_APIKEY = process.env.RASTREADOR_APIKEY ?? ''

export interface CriativoRastreado {
  ad_archive_id: string | null
  page_name: string | null
  page_id: string | null
  headline: string | null
  body: string | null
  cta_text: string | null
  link_url: string | null
  media_type: 'video' | 'image' | 'unknown'
  video_url: string | null
  image_url: string | null
  start_date: string | null
  dias_ativo: number | null
  copias: number
  is_active: boolean
  snapshot_url: string | null
}

// Extrai o page_id de uma URL da Biblioteca de Anúncios, ou aceita só os dígitos.
export function extrairPageId(entrada: string): string | null {
  const s = (entrada || '').trim()
  const m = s.match(/view_all_page_id=(\d+)/) || s.match(/[?&]id=(\d+)/)
  if (m) return m[1]
  if (/^\d{5,}$/.test(s)) return s
  const qualquer = s.match(/(\d{6,})/)
  return qualquer ? qualquer[1] : null
}
