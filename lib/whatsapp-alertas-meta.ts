// Alertas da Meta no WhatsApp (junto da saúde horária, só no privado do dono):
//   - anúncio REPROVADO, em qualquer conta que o token enxerga
//   - conta desativada / pagamento pendente / em análise / fechada
//   - conta pré-paga com saldo acabando, ou limite de gasto da conta atingido
//
// Só avisa MUDANÇA: o estado da última checagem fica em configuracoes
// (CHAVE_ESTADO). Anúncio reprovado avisa uma vez; problema de conta avisa quando
// aparece e quando resolve. Na primeira checagem os reprovados antigos entram
// calados (senão chegava a lista de meses), mas os problemas de conta atuais vão.

import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase'
import { carregarMetaCfg } from '@/lib/meta-campanhas'
import { faseToken } from '@/lib/meta-chave'
import { extrairCriativo } from '@/lib/utils'

const META = 'https://graph.facebook.com/v25.0'
const TZ = 'America/Sao_Paulo'
const CHAVE_ESTADO = 'whatsapp_alertas_meta'
const SALDO_MINIMO_PREPAGO = 50       // R$ — abaixo disso avisa que o saldo está acabando
const DIAS_GUARDAR_REPROVADOS = 30    // ids de reprovados mais velhos que isso saem do estado
const PRIMEIRA_VEZ_JANELA_H = 6       // na 1ª checagem, só avisa reprovado das últimas 6h

type Estado = {
  reprovados: Record<string, string>   // ad_id → updated_time
  contas: Record<string, string[]>     // account_id → problemas (texto) da última checagem
}

// account_status da Meta → texto. 1 = ativa (sem problema).
const STATUS_CONTA: Record<number, string> = {
  2: 'desativada',
  3: 'pagamento pendente',
  7: 'em análise de risco',
  8: 'aguardando acerto de pagamento',
  9: 'em período de carência (pagamento)',
  100: 'fechamento pendente',
  101: 'fechada',
}
const MOTIVO_DESATIVADA: Record<number, string> = {
  1: 'política de anúncios',
  2: 'revisão de propriedade intelectual',
  3: 'risco de pagamento',
  4: 'conta encerrada pela Meta',
  5: 'revisão de anúncios',
  6: 'integridade da empresa',
  7: 'encerrada permanentemente',
  8: 'conta de revenda sem uso',
  9: 'conta sem uso',
  11: 'política do Gerenciador de Negócios',
  12: 'conta deturpada',
  15: 'conta comprometida',
}

async function metaAll(url: string): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  for (let i = 0; next && i < 20; i++) {
    const r: Response = await fetch(next, { cache: 'no-store' })
    const j = await r.json()
    if (j.error) throw new Error(j.error.message)
    out.push(...(j.data ?? []))
    next = j.paging?.next ?? null
  }
  return out
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

// "Saldo disponível (R$4,64 BRL)" → 4.64
function saldoPrepago(display: string | undefined): number | null {
  const m = (display ?? '').match(/([\d.]+,\d{2})/)
  return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : null
}

function problemasDaConta(a: any): string[] {
  const p: string[] = []
  const st = Number(a.account_status)
  if (st !== 1 && st !== 201) {
    let t = STATUS_CONTA[st] ?? `status ${st}`
    if (st === 2 && MOTIVO_DESATIVADA[Number(a.disable_reason)]) t += ` (${MOTIVO_DESATIVADA[Number(a.disable_reason)]})`
    p.push(t)
  }
  const cap = Number(a.spend_cap) || 0
  if (cap > 0 && Number(a.amount_spent) >= cap * 0.98) p.push('limite de gasto da conta atingido')
  if (a.is_prepay_account) {
    const saldo = saldoPrepago(a.funding_source_details?.display_string)
    if (saldo != null && saldo < SALDO_MINIMO_PREPAGO) p.push(`saldo pré-pago acabando (${brl(saldo)})`)
  }
  return p
}

async function lerEstado(): Promise<Estado | null> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', CHAVE_ESTADO).maybeSingle()
  try {
    const v = typeof data?.valor === 'string' ? JSON.parse(data.valor) : data?.valor
    return v?.reprovados ? v : null
  } catch {
    return null
  }
}

async function salvarEstado(e: Estado) {
  // configuracoes.org_id é NOT NULL: inserir chave nova sem ele falha calado.
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: CHAVE_ESTADO, valor: JSON.stringify(e), org_id: org?.id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) console.error('[alertas-meta] não salvou estado:', error.message)
}

/** Texto do alerta (null = nada novo). Atualiza o estado salvo. */
export async function verificarAlertasMeta(): Promise<string | null> {
  const cfg = await carregarMetaCfg()
  if (!cfg) return null
  const { token } = cfg

  // Todas as contas que o token enxerga — não só as marcadas no painel.
  const contas = await metaAll(`${META}/me/adaccounts?${new URLSearchParams({
    fields: 'account_id,name,account_status,disable_reason,is_prepay_account,spend_cap,amount_spent,funding_source_details',
    limit: '200',
    access_token: token,
  })}`)

  // Anúncios reprovados de cada conta (uma conta que falhe não derruba as outras).
  const reprovadosPorConta = await Promise.all(contas.map(async (c) => {
    try {
      const ads = await metaAll(`${META}/act_${c.account_id}/ads?${new URLSearchParams({
        fields: 'name,updated_time,campaign{name}',
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['DISAPPROVED'] }]),
        limit: '500',
        access_token: token,
      })}`)
      return { conta: c, ads }
    } catch (e) {
      console.error('[alertas-meta] reprovados', c.name, e)
      return { conta: c, ads: [] as any[] }
    }
  }))

  const anterior = await lerEstado()
  const primeiraVez = !anterior
  const agora = Date.now()
  const limiteGuardar = agora - DIAS_GUARDAR_REPROVADOS * 86400000
  const limitePrimeira = agora - PRIMEIRA_VEZ_JANELA_H * 3600000

  const novoEstado: Estado = { reprovados: {}, contas: {} }
  const novosReprovados: { conta: string; ad: any }[] = []
  for (const { conta, ads } of reprovadosPorConta) {
    for (const ad of ads) {
      const t = new Date(ad.updated_time).getTime()
      if (t >= limiteGuardar) novoEstado.reprovados[ad.id] = ad.updated_time
      const jaVisto = !!anterior?.reprovados[ad.id]
      if (jaVisto) continue
      if (primeiraVez ? t >= limitePrimeira : t >= limiteGuardar) novosReprovados.push({ conta: conta.name, ad })
    }
  }

  const contasNovas: { nome: string; problemas: string[] }[] = []
  const contasResolvidas: string[] = []
  for (const c of contas) {
    const p = problemasDaConta(c)
    if (p.length) novoEstado.contas[c.account_id] = p
    const antes = anterior?.contas[c.account_id] ?? []
    const surgiu = p.filter((x) => !antes.includes(x))
    if (surgiu.length) contasNovas.push({ nome: c.name, problemas: surgiu })
    if (antes.length && !p.length && anterior) contasResolvidas.push(c.name)
  }

  await salvarEstado(novoEstado)
  if (!novosReprovados.length && !contasNovas.length && !contasResolvidas.length) return null

  const linhas: string[] = [`🚨 *Alertas da Meta* · ${format(toZonedTime(new Date(), TZ), 'HH:mm')}`]

  if (novosReprovados.length) {
    linhas.push('')
    linhas.push(`🚫 *ANÚNCIOS REPROVADOS* (${novosReprovados.length})`)
    const porConta = new Map<string, any[]>()
    for (const r of novosReprovados) porConta.set(r.conta, [...(porConta.get(r.conta) ?? []), r.ad])
    for (const [conta, ads] of porConta) {
      linhas.push('')
      linhas.push(`🏦 *${conta}*`)
      for (const ad of ads.sort((a, b) => b.updated_time.localeCompare(a.updated_time))) {
        const cod = extrairCriativo(ad.name)?.toLowerCase()
        const fase = faseToken(ad.campaign?.name)
        const rot = cod ? `*${cod}${fase ? ` F${fase.slice(-1)}` : ''}*` : `*${ad.name.slice(0, 40)}*`
        const hora = format(toZonedTime(new Date(ad.updated_time), TZ), 'dd/MM HH:mm')
        linhas.push(`• ${rot} — ${hora}`)
        linhas.push(`  _${ad.name.slice(0, 60)}_`)
      }
    }
  }

  if (contasNovas.length) {
    linhas.push('')
    linhas.push(primeiraVez ? '💳 *CONTAS COM PROBLEMA (situação atual)*' : '💳 *CONTAS COM PROBLEMA*')
    for (const c of contasNovas) linhas.push(`• *${c.nome}*: ${c.problemas.join(' · ')}`)
  }

  if (contasResolvidas.length) {
    linhas.push('')
    linhas.push('✅ *CONTAS NORMALIZADAS*')
    for (const n of contasResolvidas) linhas.push(`• *${n}*`)
  }

  return linhas.join('\n')
}
