// VTurb Analytics API (nova). Base e auth conforme a doc:
// https://vturb.gitbook.io/analytics-api/pt/autenticacao-da-api
// Auth por headers: X-Api-Token + X-Api-Version. NUNCA hardcodar o token —
// ele é salvo pelo usuário no painel (configuracoes.vturb_api_key).
export const VTURB_ANALYTICS_BASE = 'https://analytics.vturb.net'
export const VTURB_API_VERSION = 'v1'

export function vturbHeaders(token: string): Record<string, string> {
  return {
    'X-Api-Token': token,
    'X-Api-Version': VTURB_API_VERSION,
    Accept: 'application/json',
  }
}

// Mascara o token pra exibição (mostra só os últimos 4 dígitos).
export function mascararToken(token: string): string {
  const t = (token || '').trim()
  if (t.length <= 4) return '••••'
  return `••••••••${t.slice(-4)}`
}
