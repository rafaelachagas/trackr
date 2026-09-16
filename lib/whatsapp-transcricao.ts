// Transcrição de áudios de grupo pelo bot do WhatsApp.
//
//   /start-transcript  → liga no grupo (todo áudio novo vira texto, respondendo o áudio)
//   /stop-transcript   → desliga
//
// O áudio NÃO fica guardado: a Evolution entrega o arquivo, ele sobe por alguns
// segundos no Storage só pra VPS conseguir baixar (o /transcribe recebe URL), o
// Whisper transcreve e o arquivo é apagado.

import { supabaseAdmin } from '@/lib/supabase'
import { EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY } from '@/lib/whatsapp'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'

export const CHAVE_TRANSCRICAO = 'whatsapp_transcricao'
export const CMD_START = '/start-transcript'
export const CMD_STOP = '/stop-transcript'

const BUCKET = 'criativos'
const PASTA = 'whatsapp-audio'
// Teto de duração: o transcritor da VPS roda 1 transcrição por vez numa CPU só;
// um áudio de meia hora seguraria todas as outras (e estouraria o limite da Vercel).
const MAX_SEGUNDOS = 10 * 60

export type GrupoTranscricao = { jid: string; desde: string; por?: string }

function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

export async function gruposAtivos(): Promise<GrupoTranscricao[]> {
  const { data } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', CHAVE_TRANSCRICAO).maybeSingle()
  try {
    const v = typeof data?.valor === 'string' ? JSON.parse(data.valor) : data?.valor
    return Array.isArray(v?.grupos) ? v.grupos : []
  } catch {
    return []
  }
}

async function salvarGrupos(grupos: GrupoTranscricao[]) {
  // configuracoes.org_id é NOT NULL: inserir chave nova sem ele falha calado.
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: CHAVE_TRANSCRICAO, valor: JSON.stringify({ grupos }), org_id: org?.id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw new Error(error.message)
}

export async function ligarTranscricao(jid: string, por?: string): Promise<boolean> {
  const grupos = await gruposAtivos()
  if (grupos.some((g) => g.jid === jid)) return false
  await salvarGrupos([...grupos, { jid, desde: new Date().toISOString(), por }])
  return true
}

export async function desligarTranscricao(jid: string): Promise<boolean> {
  const grupos = await gruposAtivos()
  if (!grupos.some((g) => g.jid === jid)) return false
  await salvarGrupos(grupos.filter((g) => g.jid !== jid))
  return true
}

export function ehAudio(message: any): boolean {
  return !!message?.audioMessage
}

export async function enviarTexto(to: string, text: string, quoted?: { key: any; message: any }) {
  await fetchTimeout(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
    body: JSON.stringify({ number: to, text, linkPreview: false, ...(quoted ? { quoted } : {}) }),
  }, 15000)
}

/** Baixa o áudio da Evolution, transcreve na VPS e responde citando o áudio. */
export async function transcreverAudio(data: any): Promise<void> {
  const grupo: string = data?.key?.remoteJid
  const audio = data?.message?.audioMessage
  const quem: string = data?.pushName || 'Áudio'
  const citar = { key: data.key, message: data.message }

  const segundos = Number(audio?.seconds) || 0
  if (segundos > MAX_SEGUNDOS) {
    await enviarTexto(grupo, `🎙️ Áudio de ${Math.round(segundos / 60)} min é longo demais pra transcrever (máx. ${MAX_SEGUNDOS / 60} min).`, citar)
    return
  }

  const caminho = `${PASTA}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ogg`
  try {
    // 1. O arquivo, direto da Evolution (ela descriptografa a mídia do WhatsApp).
    const r = await fetchTimeout(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
      body: JSON.stringify({ message: { key: data.key, message: data.message }, convertToMp4: false }),
    }, 30000)
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || !j?.base64) throw new Error(`a Evolution não devolveu o áudio (${r.status})`)

    // 2. Sobe pro Storage só pra VPS baixar.
    const bytes = Buffer.from(String(j.base64).replace(/^data:[^,]+,/, ''), 'base64')
    const up = await supabaseAdmin.storage.from(BUCKET)
      .upload(caminho, bytes, { contentType: j.mimetype || 'audio/ogg', upsert: true })
    if (up.error) throw new Error(up.error.message)
    const { data: assinado } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(caminho, 900)
    if (!assinado?.signedUrl) throw new Error('não consegui gerar o link do áudio')

    // 3. Whisper na VPS.
    const t = await fetchTimeout(`${TRANSCRITOR_URL}/transcribe?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: assinado.signedUrl }),
    }, 270000)
    const tj: any = await t.json().catch(() => ({}))
    if (!t.ok || tj?.error) throw new Error(tj?.error || `transcritor respondeu ${t.status}`)

    const texto = String(tj?.texto || '').trim()
    await enviarTexto(grupo, texto
      ? `🎙️ *${quem}:*\n${texto}`
      : `🎙️ *${quem}:* _(não deu pra entender fala nesse áudio)_`, citar)
  } catch (e) {
    console.error('[whatsapp/transcricao]', e)
    await enviarTexto(grupo, `🎙️ Não consegui transcrever esse áudio: ${e instanceof Error ? e.message : e}`, citar).catch(() => {})
  } finally {
    await supabaseAdmin.storage.from(BUCKET).remove([caminho]).catch(() => {})
  }
}
