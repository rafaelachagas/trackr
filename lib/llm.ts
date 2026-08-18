// Camada de LLM multi-provider (Anthropic Claude + Google Gemini).
// O modelo e as chaves ficam salvos em `configuracoes` (podem cair pra env).
// Sem SDK — só fetch. Degrada com mensagem clara se faltar a chave.

import { supabaseAdmin } from '@/lib/supabase'
import { parseModelo, anthropicAceitaTemperature, MODELO_PADRAO, type ProviderLLM } from '@/lib/llm-models'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface LLMConfig {
  provider: ProviderLLM
  model: string
  selecao: string        // "provider:id"
  anthropicKey?: string
  geminiKey?: string
}

async function lerConfigValor(chave: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', chave).maybeSingle()
  return data?.valor?.toString().trim() || null
}

export async function getLLMConfig(): Promise<LLMConfig> {
  const [sel, aKey, gKey] = await Promise.all([
    lerConfigValor('llm_modelo'),
    lerConfigValor('anthropic_api_key'),
    lerConfigValor('gemini_api_key'),
  ])
  const selecao = sel || MODELO_PADRAO
  const { provider, id } = parseModelo(selecao)
  return {
    provider,
    model: id,
    selecao: `${provider}:${id}`,
    anthropicKey: aKey || process.env.ANTHROPIC_API_KEY || undefined,
    geminiKey: gKey || process.env.GEMINI_API_KEY || undefined,
  }
}

// A IA está pronta pra usar? (chave do provider selecionado existe)
export async function llmDisponivel(): Promise<boolean> {
  const c = await getLLMConfig()
  return c.provider === 'gemini' ? !!c.geminiKey : !!c.anthropicKey
}

// Modelo atualmente selecionado, em "provider:id" (pra registrar no histórico).
export async function modeloSelecionado(): Promise<string> {
  return (await getLLMConfig()).selecao
}

export interface LLMResult {
  ok: boolean
  texto: string
  erro?: string
}

// Chamada única, roteada pro provider certo.
export async function chamarLLM(opts: {
  system?: string
  prompt: string
  maxTokens?: number
  temperatura?: number
}): Promise<LLMResult> {
  const cfg = await getLLMConfig()
  if (cfg.provider === 'gemini') return chamarGemini(cfg, opts)
  return chamarAnthropic(cfg, opts)
}

async function chamarAnthropic(cfg: LLMConfig, opts: { system?: string; prompt: string; maxTokens?: number; temperatura?: number }): Promise<LLMResult> {
  if (!cfg.anthropicKey) return { ok: false, texto: '', erro: 'Chave da Anthropic não configurada.' }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 60000)
  try {
    const body: Record<string, any> = {
      model: cfg.model,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    }
    // Modelos 5/4.7/4.8 rejeitam temperature — só manda quando aceito.
    if (opts.temperatura != null && anthropicAceitaTemperature(cfg.model)) body.temperature = opts.temperatura

    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      const b = await r.text().catch(() => '')
      return { ok: false, texto: '', erro: `Anthropic respondeu ${r.status}: ${b.slice(0, 300)}` }
    }
    const j = await r.json()
    const texto = (j?.content ?? []).map((b: any) => b?.text ?? '').join('').trim()
    return { ok: true, texto }
  } catch (e: any) {
    return { ok: false, texto: '', erro: e?.name === 'AbortError' ? 'IA demorou demais (timeout).' : e.message }
  } finally {
    clearTimeout(t)
  }
}

async function chamarGemini(cfg: LLMConfig, opts: { system?: string; prompt: string; maxTokens?: number; temperatura?: number }): Promise<LLMResult> {
  if (!cfg.geminiKey) return { ok: false, texto: '', erro: 'Chave do Gemini não configurada.' }
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 60000)
  try {
    const body: Record<string, any> = {
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig: { maxOutputTokens: opts.maxTokens ?? 1500, temperature: opts.temperatura ?? 0.7 },
    }
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] }

    const r = await fetch(`${GEMINI_BASE}/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.geminiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      const b = await r.text().catch(() => '')
      return { ok: false, texto: '', erro: `Gemini respondeu ${r.status}: ${b.slice(0, 300)}` }
    }
    const j = await r.json()
    const texto = (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('').trim()
    if (!texto && j?.promptFeedback?.blockReason) {
      return { ok: false, texto: '', erro: `Gemini bloqueou: ${j.promptFeedback.blockReason}` }
    }
    return { ok: true, texto }
  } catch (e: any) {
    return { ok: false, texto: '', erro: e?.name === 'AbortError' ? 'IA demorou demais (timeout).' : e.message }
  } finally {
    clearTimeout(t)
  }
}

// Extrai JSON de uma resposta do modelo (tolerante a texto ao redor / cercas ```).
export function extrairJSON<T = any>(texto: string): T | null {
  if (!texto) return null
  let s = texto.trim()
  const cerca = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (cerca) s = cerca[1].trim()
  try { return JSON.parse(s) as T } catch { /* continua */ }
  const ini = s.search(/[[{]/)
  if (ini < 0) return null
  const abre = s[ini]
  const fecha = abre === '{' ? '}' : ']'
  let nivel = 0
  for (let i = ini; i < s.length; i++) {
    if (s[i] === abre) nivel++
    else if (s[i] === fecha) { nivel--; if (nivel === 0) { try { return JSON.parse(s.slice(ini, i + 1)) as T } catch { return null } } }
  }
  return null
}

// Hash simples (não-cripto) só pra saber se uma transcrição já foi classificada.
export function hashTexto(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0 }
  return (h >>> 0).toString(36)
}
