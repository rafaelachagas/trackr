// Catálogo de modelos de IA (Anthropic + Google Gemini) para o seletor.
// Puro — sem I/O. A seleção é guardada como "provider:id" (ex.: "anthropic:claude-sonnet-5").

export type ProviderLLM = 'anthropic' | 'gemini'

export interface ModeloLLM {
  id: string            // id técnico do modelo (o que vai pra API)
  label: string         // nome amigável
  provider: ProviderLLM
  nota?: string         // dica curta (custo/uso)
}

// Anthropic — famílias atuais + legados ainda ativos.
export const MODELOS_ANTHROPIC: ModeloLLM[] = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', provider: 'anthropic', nota: 'Mais inteligente (caro)' },
  { id: 'claude-fable-5', label: 'Claude Fable 5', provider: 'anthropic', nota: 'Topo de linha (mais caro)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'anthropic', nota: 'Equilíbrio custo/qualidade' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic', nota: 'Rápido e barato' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'anthropic' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'anthropic' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', provider: 'anthropic', nota: 'Legado' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'anthropic', nota: 'Legado' },
]

// Google Gemini (geração 3.x atual — o 2.5 Pro e o 2.0/1.5 foram desativados pelo Google).
export const MODELOS_GEMINI: ModeloLLM[] = [
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'gemini', nota: 'Mais capaz (raciocínio)' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'gemini', nota: 'Rápido e barato (recomendado)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', provider: 'gemini', nota: 'Mais barato' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3.1 Flash', provider: 'gemini' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini', nota: 'Estável (sai out/2026)' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', provider: 'gemini', nota: 'Estável' },
]

export const MODELOS_LLM: ModeloLLM[] = [...MODELOS_ANTHROPIC, ...MODELOS_GEMINI]

export const MODELO_PADRAO = 'anthropic:claude-sonnet-5'

export function parseModelo(sel: string | null | undefined): { provider: ProviderLLM; id: string } {
  const s = (sel || MODELO_PADRAO).trim()
  const idx = s.indexOf(':')
  if (idx > 0) {
    const provider = s.slice(0, idx) as ProviderLLM
    const id = s.slice(idx + 1)
    if ((provider === 'anthropic' || provider === 'gemini') && id) return { provider, id }
  }
  // Sem prefixo: tenta adivinhar pelo nome.
  if (s.startsWith('gemini')) return { provider: 'gemini', id: s }
  return { provider: 'anthropic', id: s.startsWith('claude') ? s : 'claude-sonnet-5' }
}

export function metaModelo(sel: string): ModeloLLM | null {
  const { provider, id } = parseModelo(sel)
  return MODELOS_LLM.find((m) => m.provider === provider && m.id === id) ?? null
}

// Modelos Anthropic que REJEITAM o parâmetro temperature (erro 400).
const ANTHROPIC_SEM_TEMPERATURE = new Set([
  'claude-opus-5', 'claude-fable-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5',
])
export function anthropicAceitaTemperature(id: string): boolean {
  return !ANTHROPIC_SEM_TEMPERATURE.has(id)
}
