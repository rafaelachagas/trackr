// Liga/desliga uma função do bot por grupo (transcrição, resumo...). Cada
// função guarda a lista dos grupos ligados numa chave própria de configuracoes.

import { supabaseAdmin } from '@/lib/supabase'
import { EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY } from '@/lib/whatsapp'

export type GrupoLigado = { jid: string; desde: string; por?: string }

export function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

export async function gruposLigados(chave: string): Promise<GrupoLigado[]> {
  const { data } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', chave).maybeSingle()
  try {
    const v = typeof data?.valor === 'string' ? JSON.parse(data.valor) : data?.valor
    return Array.isArray(v?.grupos) ? v.grupos : []
  } catch {
    return []
  }
}

async function salvarGrupos(chave: string, grupos: GrupoLigado[]) {
  // configuracoes.org_id é NOT NULL: inserir chave nova sem ele falha calado.
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave, valor: JSON.stringify({ grupos }), org_id: org?.id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw new Error(error.message)
}

/** true = ligou agora; false = já estava ligado. */
export async function ligarNoGrupo(chave: string, jid: string, por?: string): Promise<boolean> {
  const grupos = await gruposLigados(chave)
  if (grupos.some((g) => g.jid === jid)) return false
  await salvarGrupos(chave, [...grupos, { jid, desde: new Date().toISOString(), por }])
  return true
}

/** true = desligou agora; false = já estava desligado. */
export async function desligarNoGrupo(chave: string, jid: string): Promise<boolean> {
  const grupos = await gruposLigados(chave)
  if (!grupos.some((g) => g.jid === jid)) return false
  await salvarGrupos(chave, grupos.filter((g) => g.jid !== jid))
  return true
}

export async function grupoLigado(chave: string, jid: string): Promise<boolean> {
  return (await gruposLigados(chave)).some((g) => g.jid === jid)
}

export async function enviarTexto(to: string, text: string, quoted?: { key: any; message: any }) {
  await fetchTimeout(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
    body: JSON.stringify({ number: to, text, linkPreview: false, ...(quoted ? { quoted } : {}) }),
  }, 15000)
}
