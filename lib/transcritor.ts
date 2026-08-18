// Config do Transcritor (Whisper self-hosted) — serviço na VPS, porta 8082.
export const TRANSCRITOR_URL = process.env.TRANSCRITOR_URL ?? 'http://179.198.104.241:8082'
// Reusa a chave do rastreador se não houver uma específica.
export const TRANSCRITOR_APIKEY = process.env.TRANSCRITOR_APIKEY ?? process.env.RASTREADOR_APIKEY ?? ''
