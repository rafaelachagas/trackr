// Envio de WhatsApp reutilizável (Evolution API sendText).
// A rota /api/whatsapp tem um `enviar` privado; aqui é a versão compartilhada
// pra alertas/push de qualquer feature, com destinatários salvos no banco.

import { supabaseAdmin } from '@/lib/supabase'
import { EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY } from '@/lib/whatsapp'

function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

// Envia uma mensagem de texto para UM destino (número E.164 sem +, ex.:
// 5511999999999, ou id de grupo @g.us).
export async function enviarWhatsapp(to: string, text: string): Promise<boolean> {
  if (!EVOLUTION_APIKEY || !to) return false
  try {
    const r = await fetchTimeout(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
      body: JSON.stringify({ number: to, text, linkPreview: false }),
    }, 15000)
    return r.ok
  } catch {
    return false
  }
}

export interface DestinosAlerta {
  numeros: string[]   // números/grupos que recebem alertas
  ativo: boolean      // liga/desliga o envio por WhatsApp
}

// Lê os destinatários de alerta salvos em configuracoes (chave 'alertas_whatsapp').
export async function getDestinosAlerta(): Promise<DestinosAlerta> {
  try {
    const { data } = await supabaseAdmin
      .from('configuracoes').select('valor').eq('chave', 'alertas_whatsapp').maybeSingle()
    if (!data?.valor) return { numeros: [], ativo: false }
    const v = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor
    return { numeros: Array.isArray(v?.numeros) ? v.numeros : [], ativo: !!v?.ativo }
  } catch {
    return { numeros: [], ativo: false }
  }
}

// Dispara uma mensagem para todos os destinos configurados (se ligado).
// Retorna quantos envios deram certo.
export async function broadcastAlerta(text: string): Promise<number> {
  const dest = await getDestinosAlerta()
  if (!dest.ativo || dest.numeros.length === 0) return 0
  let ok = 0
  for (const n of dest.numeros) {
    if (await enviarWhatsapp(n, text)) ok++
  }
  return ok
}
