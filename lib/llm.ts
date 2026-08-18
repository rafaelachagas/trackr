// Camada fina de LLM (Anthropic Claude) para a inteligência do rastreador:
// clusterização de ângulos e gerador de variações de copy.
// Sem SDK — só fetch. Degrada com mensagem clara se a chave não existir.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
// Modelo padrão: bom custo/qualidade pra classificar e gerar copy.
export const LLM_MODELO = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'

export function llmDisponivel(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export interface LLMResult {
  ok: boolean
  texto: string
  erro?: string
}

// Chamada única. Se `json` for true, instrui o modelo a devolver só JSON e
// tentamos extrair o primeiro bloco {...} / [...] da resposta.
export async function chamarLLM(opts: {
  system?: string
  prompt: string
  maxTokens?: number
  temperatura?: number
}): Promise<LLMResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, texto: '', erro: 'ANTHROPIC_API_KEY não configurada no servidor.' }

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 60000)
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: LLM_MODELO,
        max_tokens: opts.maxTokens ?? 1500,
        temperature: opts.temperatura ?? 0.7,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
      }),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return { ok: false, texto: '', erro: `LLM respondeu ${r.status}: ${body.slice(0, 300)}` }
    }
    const j = await r.json()
    const texto = (j?.content ?? []).map((b: any) => b?.text ?? '').join('').trim()
    return { ok: true, texto }
  } catch (e: any) {
    return { ok: false, texto: '', erro: e?.name === 'AbortError' ? 'LLM demorou demais (timeout).' : e.message }
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
  // Tenta direto, depois recorta do primeiro { ou [ até o par.
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
