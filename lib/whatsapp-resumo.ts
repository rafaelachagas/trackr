// Resumo das conversas de grupo pelo bot do WhatsApp.
//
//   /start-resumo  → passa a guardar as mensagens do grupo e manda o resumo do dia anterior toda manhã
//   /stop-resumo   → desliga (e para de guardar)
//   /resumo        → resumo de hoje até agora, na hora
//
// Mensagens ficam em whatsapp_mensagens (supabase_whatsapp_mensagens.sql) e são
// apagadas depois de DIAS_GUARDADOS — só existem pra virar resumo.

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { format, subDays } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase'
import { chamarLLM } from '@/lib/llm'
import { grupoLigado, gruposLigados, enviarTexto } from '@/lib/whatsapp-grupos'

export const CHAVE_RESUMO = 'whatsapp_resumo'
export const CMD_RESUMO_START = '/start-resumo'
export const CMD_RESUMO_STOP = '/stop-resumo'
export const CMD_RESUMO_AGORA = '/resumo'

const TZ = 'America/Sao_Paulo'
const DIAS_GUARDADOS = 3
// Teto do que vai pra IA num resumo: dia muito movimentado não estoura o modelo.
const MAX_MENSAGENS = 1500
const MAX_CARACTERES = 90_000

/** Texto que dá pra resumir a partir de uma mensagem do webhook (null = ignorar). */
export function textoParaResumo(message: any): { texto: string; tipo: 'texto' | 'midia' } | null {
  const t = (message?.conversation ?? message?.extendedTextMessage?.text ?? '').trim()
  if (t) return t.startsWith('/') ? null : { texto: t, tipo: 'texto' }
  const legenda = (message?.imageMessage?.caption ?? message?.videoMessage?.caption ?? message?.documentMessage?.caption ?? '').trim()
  if (message?.imageMessage) return { texto: legenda ? `[imagem] ${legenda}` : '[imagem]', tipo: 'midia' }
  if (message?.videoMessage) return { texto: legenda ? `[vídeo] ${legenda}` : '[vídeo]', tipo: 'midia' }
  if (message?.documentMessage) return { texto: `[arquivo] ${message.documentMessage.fileName ?? ''} ${legenda}`.trim(), tipo: 'midia' }
  return null
}

/** Guarda uma mensagem, SE o resumo estiver ligado no grupo. Nunca derruba o webhook. */
export async function registrarMensagem(
  grupo: string, autor: string | null, texto: string, tipo: 'texto' | 'audio' | 'midia', timestamp?: number | string,
): Promise<void> {
  try {
    if (!(await grupoLigado(CHAVE_RESUMO, grupo))) return
    const ts = Number(timestamp)
    const enviada_em = ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString()
    const { error } = await supabaseAdmin.from('whatsapp_mensagens')
      .insert({ grupo, autor: autor || null, texto: texto.slice(0, 8000), tipo, enviada_em })
    if (error) console.error('[whatsapp/resumo] não salvou mensagem:', error.message)
  } catch (e) {
    console.error('[whatsapp/resumo]', e)
  }
}

const SISTEMA = `Você resume conversas de grupo de WhatsApp de uma equipe de marketing digital.
Escreva em português do Brasil, tom direto e profissional (sem piadas nem adjetivos exagerados).
Use a formatação do WhatsApp: *negrito*, _itálico_. Nada de markdown com # ou **.

Formato EXATO:
*ASSUNTOS*
• Tema curto — Nomes de quem puxou o assunto (HH:MM)
(um item por assunto, na ordem em que aconteceram)

Depois, um parágrafo por assunto, começando com o tema em *negrito* — nomes (HH:MM). No parágrafo:
o que foi discutido, o que ficou decidido, e pendências com responsável quando houver.

Regras:
- Agrupe mensagens do mesmo tema num assunto só. Ignore cumprimentos, "ok", figurinhas e conversa sem conteúdo.
- Não invente nada que não esteja nas mensagens. Se algo ficou em aberto, diga que ficou em aberto.
- Nas mensagens, [áudio] indica fala transcrita de um áudio e [imagem]/[vídeo]/[arquivo] indica mídia enviada.
  NUNCA copie esses colchetes pro resumo — escreva natural ("Vitoria sugeriu, por áudio, ...", "Julio mandou um print ...").
- Se não houver nada relevante, responda só: Nada relevante nas conversas.`

/** Resumo de um intervalo. null = nenhuma mensagem no período. */
export async function gerarResumo(grupo: string, desde: Date, ate: Date): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('whatsapp_mensagens')
    .select('autor, tipo, texto, enviada_em')
    .eq('grupo', grupo)
    .gte('enviada_em', desde.toISOString())
    .lt('enviada_em', ate.toISOString())
    .order('enviada_em', { ascending: true })
    .limit(MAX_MENSAGENS)
  if (error) throw new Error(error.message)
  if (!data?.length) return null

  let conversa = ''
  for (const m of data) {
    const hora = format(toZonedTime(new Date(m.enviada_em), TZ), 'HH:mm')
    const marca = m.tipo === 'audio' ? '[áudio] ' : ''
    const linha = `${hora} ${m.autor || 'Alguém'}: ${marca}${m.texto}\n`
    if (conversa.length + linha.length > MAX_CARACTERES) break
    conversa += linha
  }

  const r = await chamarLLM({ system: SISTEMA, prompt: `Conversa do grupo:\n\n${conversa}`, maxTokens: 4000, temperatura: 0.3 })
  if (!r.ok) throw new Error(r.erro || 'a IA não respondeu')
  return r.texto.trim()
}

/** Início do dia em SP, n dias atrás (0 = hoje), como instante UTC. */
function inicioDoDiaSP(diasAtras: number): Date {
  const dia = format(subDays(toZonedTime(new Date(), TZ), diasAtras), 'yyyy-MM-dd')
  return fromZonedTime(`${dia}T00:00:00`, TZ)
}

/** /resumo — de hoje 00h até agora. */
export async function responderResumoAgora(grupo: string): Promise<void> {
  try {
    const texto = await gerarResumo(grupo, inicioDoDiaSP(0), new Date())
    await enviarTexto(grupo, texto
      ? `📝 *Resumo de hoje até agora*\n\n${texto}`
      : '📝 Ainda não tem mensagem guardada hoje pra resumir.')
  } catch (e) {
    await enviarTexto(grupo, `📝 Não consegui gerar o resumo: ${e instanceof Error ? e.message : e}`).catch(() => {})
  }
}

/** Cron da manhã: resumo de ONTEM em cada grupo ligado + limpeza. */
export async function enviarResumosDoDia(): Promise<{ grupo: string; status: string }[]> {
  const desde = inicioDoDiaSP(1)
  const ate = inicioDoDiaSP(0)
  const out: { grupo: string; status: string }[] = []
  for (const g of await gruposLigados(CHAVE_RESUMO)) {
    try {
      const texto = await gerarResumo(g.jid, desde, ate)
      if (!texto) { out.push({ grupo: g.jid, status: 'sem mensagens' }); continue }
      await enviarTexto(g.jid, `☀️ Bom dia! Segue o resumo de ontem.\n\n${texto}`)
      out.push({ grupo: g.jid, status: 'enviado' })
    } catch (e) {
      out.push({ grupo: g.jid, status: `erro: ${e instanceof Error ? e.message : e}` })
    }
  }
  await supabaseAdmin.from('whatsapp_mensagens').delete().lt('enviada_em', inicioDoDiaSP(DIAS_GUARDADOS).toISOString())
  return out
}
