// Registro central de alertas (painel + WhatsApp), com dedupe.
// Um alerta é único por (org_id, tipo, chave) — a mesma ocorrência não
// alerta duas vezes. Ex.: fadiga do ad_id X no dia Y => chave = `${adId}:${dia}`.

import { supabaseAdmin } from '@/lib/supabase'
import { broadcastAlerta } from '@/lib/whatsapp-send'

export type TipoAlerta = 'fadiga' | 'anomalia_gasto' | 'concorrente_removido' | 'concorrente_novo' | 'pagina_mudou' | 'pagina_url' | 'concorrente_escala'
export type Severidade = 'info' | 'atencao' | 'critico'

const EMOJI: Record<TipoAlerta, string> = {
  fadiga: '📉',
  anomalia_gasto: '💸',
  concorrente_removido: '🪦',
  concorrente_novo: '🆕',
  pagina_mudou: '🎥',
  pagina_url: '🔀',
  concorrente_escala: '🚀',
}

// Registra um alerta (idempotente). Se for inédito, envia pro WhatsApp.
// Retorna { novo: true } quando de fato criou (útil pra contar no cron).
export async function registrarAlerta(params: {
  orgId: string
  tipo: TipoAlerta
  chave: string
  titulo: string
  mensagem: string
  severidade?: Severidade
  enviarWhats?: boolean
}): Promise<{ novo: boolean; enviado: boolean }> {
  const { orgId, tipo, chave, titulo, mensagem, severidade = 'info', enviarWhats = true } = params

  // Já existe? (dedupe)
  const { data: existe } = await supabaseAdmin
    .from('alertas_log').select('id').eq('org_id', orgId).eq('tipo', tipo).eq('chave', chave).maybeSingle()
  if (existe) return { novo: false, enviado: false }

  let enviado = false
  if (enviarWhats) {
    const texto = `${EMOJI[tipo] ?? '🔔'} *${titulo}*\n\n${mensagem}`
    const n = await broadcastAlerta(texto)
    enviado = n > 0
  }

  const { error } = await supabaseAdmin.from('alertas_log').insert({
    org_id: orgId, tipo, chave, titulo, mensagem, severidade, enviado_whatsapp: enviado,
  })
  // Se colidiu por corrida, tratamos como não-novo.
  if (error && /duplicate|unique/i.test(error.message)) return { novo: false, enviado: false }
  if (error) throw error
  return { novo: true, enviado }
}
