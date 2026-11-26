// Inteligência do Editor de Censura — o que faz a análise melhorar com o uso.
//
//   Fase 1  censura_exemplos: cada decisão do usuário no editor (marcou, tirou,
//           contexto, observação) vira exemplo. Na análise, os parecidos vão
//           junto pra IA ("nessa operação, 'menina' é risco: a Meta lê como
//           menor de idade").
//   Fase 2  censura_casos_meta (app/api/censura/meta-cron): reprovações reais
//           das contas, com o motivo da Meta, viram exemplos origem 'meta'.
//   Fase 3  censura_propostas (app/api/censura/revisor-cron): o revisor
//           semanal propõe mudanças na biblioteca; só entra o que o usuário
//           aprova (WhatsApp ou página). Fica em configuracoes
//           'censura_biblioteca_extra' e vale pro editor e pra IA.
//   Fase 4  censura_placar: roda a análise contra casos com resultado
//           conhecido e dá a nota.
// Só servidor (supabaseAdmin).

import { supabaseAdmin } from '@/lib/supabase'
import { chamarLLM } from '@/lib/llm'
import { POLITICA_META } from '@/lib/censura-politica'
import { normalizar, Token } from '@/lib/censura'
import {
  GRAVIDADES, Gravidade, Risco, BibliotecaExtra, aplicarExtra, riscosLocais, censuraSozinho,
} from '@/lib/censura-riscos'

export const CHAVE_EXTRA = 'censura_biblioteca_extra'

export type Decisao = 'risco' | 'contexto' | 'nao_risco' | 'censurou' | 'liberou' | 'reprovado' | 'aprovado'

export interface Exemplo {
  origem?: 'editor' | 'meta'
  projeto_id?: string
  trecho: string
  contexto?: string | null
  decisao: Decisao
  gravidade?: string | null
  categoria?: string | null
  politica?: string | null
  motivo?: string | null
  fonte_risco?: string | null
}

const DECISOES: Decisao[] = ['risco', 'contexto', 'nao_risco', 'censurou', 'liberou', 'reprovado', 'aprovado']

export async function registrarExemplos(itens: Exemplo[]): Promise<{ ok: boolean; erro?: string }> {
  const linhas = itens
    .filter((e) => e && DECISOES.includes(e.decisao))
    .map((e) => ({
      origem: e.origem || 'editor',
      projeto_id: (e.projeto_id || '').slice(0, 80),
      trecho: normalizar(String(e.trecho || '')).slice(0, 200),
      contexto: e.contexto ? String(e.contexto).slice(0, 400) : null,
      decisao: e.decisao,
      gravidade: e.gravidade || null,
      categoria: e.categoria ? String(e.categoria).slice(0, 80) : null,
      politica: e.politica ? String(e.politica).slice(0, 160) : null,
      motivo: e.motivo ? String(e.motivo).slice(0, 500) : null,
      fonte_risco: e.fonte_risco || null,
      criado: new Date().toISOString(),
    }))
    .filter((e) => e.trecho)
  if (!linhas.length) return { ok: true }
  const { error } = await supabaseAdmin.from('censura_exemplos')
    .upsert(linhas, { onConflict: 'origem,projeto_id,trecho,decisao' })
  return error ? { ok: false, erro: error.message } : { ok: true }
}

// ---------- biblioteca extra ----------

export async function carregarExtra(): Promise<BibliotecaExtra> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', CHAVE_EXTRA).maybeSingle()
  try { return data?.valor ? JSON.parse(data.valor) : {} } catch { return {} }
}

export async function salvarExtra(extra: BibliotecaExtra) {
  const { error } = await supabaseAdmin.from('configuracoes')
    .upsert({ chave: CHAVE_EXTRA, valor: JSON.stringify(extra), updated_at: new Date().toISOString() }, { onConflict: 'chave' })
  if (error) throw new Error(error.message)
}

// ---------- exemplos pro prompt ----------

interface LinhaExemplo {
  origem: string; projeto_id: string; trecho: string; contexto: string | null; decisao: Decisao
  gravidade: string | null; categoria: string | null; politica: string | null; motivo: string | null; criado: string
}

/** Contém o trecho como palavras inteiras ("menina" não casa "meninada"). */
function contem(textoNorm: string, trecho: string) {
  return (' ' + textoNorm + ' ').includes(' ' + trecho + ' ')
}

const DESCRICAO: Record<Decisao, string> = {
  risco: 'o revisor marcou como RISCO',
  contexto: 'o revisor marcou como CONTEXTO de risco (juntas as palavras passam a ideia; regravar)',
  nao_risco: 'o revisor disse que NÃO é risco (alarme falso)',
  censurou: 'o revisor censurou',
  liberou: 'o revisor liberou (alarme falso)',
  reprovado: 'a Meta REPROVOU um anúncio por causa disso',
  aprovado: 'apareceu num anúncio que a Meta APROVOU e rodou',
}

/** Bloco de exemplos pro prompt: os que aparecem neste texto + os mais
 *  recentes com observação/reprovação (ensinam o critério geral). */
export async function exemplosParaPrompt(textoNorm: string, excluirProjeto?: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from('censura_exemplos')
    .select('origem, projeto_id, trecho, contexto, decisao, gravidade, categoria, politica, motivo, criado')
    .order('criado', { ascending: false }).limit(1500)
  if (error || !data?.length) return ''
  const linhas = (data as LinhaExemplo[]).filter((e) => !excluirProjeto || e.projeto_id !== excluirProjeto)

  // Mesmo trecho com várias decisões: conta cada uma (ex.: 5x liberou, 1x risco).
  const porTrecho = new Map<string, { e: LinhaExemplo; n: Map<Decisao, number> }>()
  for (const e of linhas) {
    const k = e.trecho
    const a = porTrecho.get(k) || { e, n: new Map() }
    a.n.set(e.decisao, (a.n.get(e.decisao) || 0) + 1)
    if (!a.e.motivo && e.motivo) a.e = e
    porTrecho.set(k, a)
  }
  const fmt = ({ e, n }: { e: LinhaExemplo; n: Map<Decisao, number> }) => {
    const ds = [...n].map(([d, q]) => `${DESCRICAO[d]}${q > 1 ? ` (${q}x)` : ''}`).join('; ')
    return `- "${e.trecho}": ${ds}${e.gravidade ? ` · gravidade ${e.gravidade}` : ''}${e.politica ? ` · política: ${e.politica}` : ''}${e.motivo ? ` · por quê: ${e.motivo}` : ''}${e.contexto ? ` · frase: "${e.contexto}"` : ''}`
  }
  const aqui = [...porTrecho.values()].filter((x) => contem(textoNorm, x.e.trecho)).slice(0, 60)
  const usados = new Set(aqui.map((x) => x.e.trecho))
  const gerais = [...porTrecho.values()]
    .filter((x) => !usados.has(x.e.trecho) && (x.e.motivo || x.n.has('contexto') || x.n.has('reprovado')))
    .slice(0, 25)
  if (!aqui.length && !gerais.length) return ''
  return [
    'EXPERIÊNCIA DESTA OPERAÇÃO (decisões reais do revisor humano e reprovações da Meta — siga esse critério; ele vale mais que a sua intuição):',
    aqui.length ? 'Trechos que aparecem nesta transcrição:\n' + aqui.map(fmt).join('\n') : '',
    gerais.length ? 'Outros casos que ensinam o critério:\n' + gerais.map(fmt).join('\n') : '',
  ].filter(Boolean).join('\n\n')
}

// ---------- análise ----------

export const SISTEMA_ANALISE = `Você é o revisor de criativos da operação. Segue o manual abaixo à risca.

${POLITICA_META}

---
LEITURA LITERAL DA META
O robô de revisão da Meta lê a transcrição sem entender o tom. Palavras inocentes no contexto viram risco na leitura literal:
- "menina", "novinha" (mesmo chamando uma adulta de "menina", papo de amiga) → lido como menor de idade.
- "banheiro", "sem roupa", "pelada" → lido como nudez/conteúdo sexual.
- "testando", "cobaia", "teste em você" → lido como exploração humana / pessoa usada como cobaia.
Aponte essas também, explicando a leitura literal no motivo.

---
TAREFA NESTA FERRAMENTA
Você recebe a transcrição de um criativo em vídeo, palavra por palavra, no formato id:palavra. O usuário vai usar o resultado num editor que marca palavras pra bipar/silenciar no áudio e esconder na legenda.

Aponte os trechos com risco de política, do mais grave pro mais leve, seguindo os princípios do manual:
- Leia o sentido, não só a palavra. Ex.: "ela te paga 250, 300, 500 pelo vídeo" é risco mesmo sem nenhuma palavra "proibida".
- Marque o MENOR trecho que carrega o risco (a marca, o valor, a expressão), não a frase inteira — é isso que vai ser bipado.
- bip_resolve = false quando, mesmo bipando esse trecho, a frase continua passando a ideia proibida (o sentido fica). Nesse caso diga na "troca" como regravar ou reescrever. Não sugira disfarce (gíria, sinônimo com o mesmo sentido) — o manual proíbe.
- gravidade: "muito_alto" | "alto" | "medio" | "baixo", pelos critérios do manual (a combinação VOCÊ + VALOR + PRAZO + FACILIDADE pesa mais).
- Se houver EXPERIÊNCIA DESTA OPERAÇÃO no pedido, ela manda: trecho que o revisor disse que não é risco não entra; trecho que ele marcou ou que a Meta reprovou entra com a gravidade dele.
- Não invente risco pra preencher lista. Trecho sem risco fica de fora.
- Português do Brasil, frases curtas.

Responda SÓ com JSON, sem texto fora dele:
{"riscos":[{"de":<id da primeira palavra>,"ate":<id da última palavra>,"gravidade":"...","categoria":"nome curto da política","politica":"seção da política da Meta","motivo":"por que pesa, em 1 frase","troca":"o que pôr no lugar ou como regravar","bip_resolve":true}]}`

interface Bruto { de?: unknown; ate?: unknown; gravidade?: unknown; categoria?: unknown; politica?: unknown; motivo?: unknown; troca?: unknown; bip_resolve?: unknown }

function extrairJson(texto: string): { riscos?: Bruto[] } | null {
  const ini = texto.indexOf('{'), fim = texto.lastIndexOf('}')
  if (ini < 0 || fim <= ini) return null
  try { return JSON.parse(texto.slice(ini, fim + 1)) } catch { return null }
}

export async function analisarPalavras(opts: {
  palavras: { id: number; w: string }[]
  motivos?: string
  /** Placar: não deixa a IA ver o exemplo do próprio caso. */
  excluirProjeto?: string
  timeoutMs?: number
}): Promise<{ riscos?: Risco[]; erro?: string }> {
  const { palavras, motivos } = opts
  const ordem = palavras.map((p) => p.id)
  const pos = new Map(ordem.map((id, i) => [id, i]))
  const texto = palavras.map((p) => `${p.id}:${String(p.w).replace(/\s+/g, '')}`).join(' ')
  const textoNorm = palavras.map((p) => normalizar(String(p.w))).filter(Boolean).join(' ')
  const experiencia = await exemplosParaPrompt(textoNorm, opts.excluirProjeto).catch(() => '')
  const prompt = [
    motivos?.trim() ? `Motivos de reprovação/bloqueio que a Meta já mandou pra esta operação (dê peso extra a isso):\n${motivos.trim().slice(0, 4000)}\n` : '',
    experiencia,
    `Transcrição:\n${texto}`,
  ].filter(Boolean).join('\n\n')

  const r = await chamarLLM({ system: SISTEMA_ANALISE, prompt, json: true, maxTokens: 8000, timeoutMs: opts.timeoutMs ?? 170000 })
  if (!r.ok) return { erro: r.erro || 'A IA não respondeu.' }
  const j = extrairJson(r.texto)
  if (!j || !Array.isArray(j.riscos)) return { erro: 'A IA respondeu num formato que não entendi. Tente de novo.' }

  const riscos: Risco[] = []
  for (const b of j.riscos) {
    const a = pos.get(Number(b.de)), z = pos.get(Number(b.ate ?? b.de))
    if (a == null || z == null) continue
    const [i0, i1] = a <= z ? [a, z] : [z, a]
    if (i1 - i0 > 25) continue // trecho enorme não é "o que bipar"
    const g = String(b.gravidade) as Gravidade
    riscos.push({
      ids: ordem.slice(i0, i1 + 1),
      gravidade: GRAVIDADES.includes(g) ? g : 'medio',
      categoria: String(b.categoria || 'Risco').slice(0, 60),
      politica: String(b.politica || '').slice(0, 120),
      motivo: String(b.motivo || '').slice(0, 300),
      troca: b.troca ? String(b.troca).slice(0, 300) : undefined,
      bipResolve: b.bip_resolve !== false,
      fonte: 'ia',
    })
  }
  return { riscos }
}

/** Texto corrido → palavras com id (pra casos da Meta, que não têm tokens). */
export function palavrasDoTexto(texto: string): { id: number; w: string }[] {
  return texto.split(/\s+/).filter(Boolean).slice(0, 6000).map((w, id) => ({ id, w }))
}

/** Biblioteca (com o extra aprovado) num texto corrido: o que ela pegaria. */
export function riscosDaBiblioteca(texto: string, extra: BibliotecaExtra): Risco[] {
  const bib = aplicarExtra(extra)
  const tokens: Token[] = palavrasDoTexto(texto).map(({ id, w }) => ({ id, word: w, start_time: id, end_time: id + 0.5, confidence: 1 }))
  return riscosLocais(tokens, new Set(bib.map((c) => c.id)), '', bib)
}

/** "Esse texto seria reprovado?" — alto/muito alto de qualquer fonte. */
export function preveReprovacao(riscos: Risco[]) {
  return riscos.some((r) => censuraSozinho(r.gravidade))
}
