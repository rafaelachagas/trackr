// Notificação push (Web Push) pro app instalado na tela de início.
//
// As inscrições ficam em `configuracoes.push_subscriptions` (JSON) — são poucos
// aparelhos, não vale uma tabela. Inscrição que o navegador descartou (404/410)
// é removida sozinha no primeiro envio que falhar.

import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase'

const CHAVE = 'push_subscriptions'

export type Inscricao = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  aparelho?: string
  criada_em?: string
}

export function pushConfigurado(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function configurar() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contato@thetrack.com.br',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

export async function lerInscricoes(): Promise<Inscricao[]> {
  const { data } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', CHAVE).maybeSingle()
  try {
    const v = typeof data?.valor === 'string' ? JSON.parse(data.valor) : data?.valor
    return Array.isArray(v?.inscricoes) ? v.inscricoes : []
  } catch {
    return []
  }
}

async function salvarInscricoes(inscricoes: Inscricao[]) {
  // configuracoes.org_id é NOT NULL: chave nova precisa dele no insert.
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: CHAVE, valor: JSON.stringify({ inscricoes }), org_id: org?.id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw new Error(error.message)
}

export async function inscrever(nova: Inscricao): Promise<number> {
  const atuais = await lerInscricoes()
  const outras = atuais.filter((i) => i.endpoint !== nova.endpoint)
  outras.push({ ...nova, criada_em: new Date().toISOString() })
  await salvarInscricoes(outras)
  return outras.length
}

export async function desinscrever(endpoint: string): Promise<void> {
  const atuais = await lerInscricoes()
  await salvarInscricoes(atuais.filter((i) => i.endpoint !== endpoint))
}

/** Manda a notificação pra todos os aparelhos. Devolve quantos receberam. */
export async function enviarPush(msg: {
  titulo: string; mensagem: string; url?: string; tag?: string
}): Promise<number> {
  if (!pushConfigurado()) return 0
  const inscricoes = await lerInscricoes()
  if (!inscricoes.length) return 0
  configurar()

  const payload = JSON.stringify(msg)
  const mortas: string[] = []
  let ok = 0
  await Promise.all(inscricoes.map(async (i) => {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: i.keys }, payload, { TTL: 3600 })
      ok++
    } catch (e: any) {
      // 404/410 = o aparelho desinstalou ou revogou: tira da lista.
      if (e?.statusCode === 404 || e?.statusCode === 410) mortas.push(i.endpoint)
      else console.error('[push]', e?.statusCode, e?.body ?? e?.message)
    }
  }))
  if (mortas.length) await salvarInscricoes(inscricoes.filter((i) => !mortas.includes(i.endpoint)))
  return ok
}
