import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getDashboardData } from '@/app/actions/dashboard'
import { formatarMoeda, spRangeISO } from '@/lib/utils'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import {
  CONFIG_KEY, parseWppConfig, blocosPermitidos, mesmoNumero, WppGroup, WppNumber,
  EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY, SITE_URL,
} from '@/lib/whatsapp'

export const maxDuration = 60
const TZ = 'America/Sao_Paulo'

function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

function extrairTexto(msg: any): string {
  return (msg?.conversation ?? msg?.extendedTextMessage?.text ?? '').trim()
}

async function enviar(to: string, text: string) {
  await fetchTimeout(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
    body: JSON.stringify({ number: to, text }),
  }, 15000)
}

const fmt = (v: number) => formatarMoeda(v)
const roasFmt = (r: number | null) => (r == null ? '—' : `${r.toFixed(2)}x`)

// —— Fontes de dados (carregadas sob demanda, uma vez por requisição) ——
function makeLoader() {
  const hoje = format(toZonedTime(new Date(), TZ), 'yyyy-MM-dd')
  const { desde, ate } = spRangeISO(hoje, hoje)
  let dash: any, perf: any, brk: any
  return {
    async dashboard() { return (dash ??= await getDashboardData('Qualquer', desde, ate)) },
    async perfV2() {
      if (!perf) {
        try { perf = await (await fetchTimeout(`${SITE_URL}/api/performance-v2`, { cache: 'no-store' }, 25000)).json() }
        catch { perf = { criativos: [] } }
      }
      return perf
    },
    async breakdown() {
      if (!brk) {
        try { brk = await (await fetchTimeout(`${SITE_URL}/api/dashboard/vendas-breakdown?d_inicio=${hoje}&d_fim=${hoje}`, { cache: 'no-store' }, 25000)).json() }
        catch { brk = {} }
      }
      return brk
    },
  }
}
type Loader = ReturnType<typeof makeLoader>

async function renderBloco(key: string, L: Loader): Promise<string | null> {
  if (key === 'resumo') {
    const d = await L.dashboard()
    const m = d?.metrics
    if (!m) return null
    const lucro = m.revenue - m.spend - m.imposto
    return [
      `💰 Faturamento: *${fmt(m.revenue)}*`,
      `📣 Gasto em ADS: *${fmt(m.spend)}*`,
      `📈 ROAS: *${m.roas.toFixed(2)}*`,
      `🟢 Lucro: *${fmt(lucro)}*`,
      `🛒 Vendas: *${m.salesCount}*`,
    ].join('\n')
  }
  if (key === 'top_criativos') {
    const p = await L.perfV2()
    const top = [...(p.criativos ?? [])].sort((a: any, b: any) => b.gasto_7d - a.gasto_7d).slice(0, 5)
    if (!top.length) return null
    return ['*🎬 Top criativos (7d):*', ...top.map((c: any, i: number) =>
      `${i + 1}. *${c.criativo}* — ROAS ${roasFmt(c.roas_7d)} · Gasto ${fmt(c.gasto_7d)} · ${c.acao}`)].join('\n')
  }
  if (key === 'alertas') {
    const p = await L.perfV2()
    const cs = p.criativos ?? []
    const escalar = cs.filter((c: any) => c.acao === '+20% orçamento').slice(0, 5)
    const pausar = cs.filter((c: any) => c.acao === 'Pausar').slice(0, 5)
    const out: string[] = ['*⚠️ Alertas de ação:*']
    if (escalar.length) out.push('🟢 Escalar (+20%): ' + escalar.map((c: any) => c.criativo).join(', '))
    if (pausar.length) out.push('🔴 Pausar: ' + pausar.map((c: any) => c.criativo).join(', '))
    return out.length > 1 ? out.join('\n') : null
  }
  if (key === 'ranking') {
    const b = await L.breakdown()
    const cr = b.porCriativo ?? []
    if (!cr.length) return null
    const front = [...cr].sort((a: any, b: any) => b.front - a.front).slice(0, 3)
    const upsell = [...cr].sort((a: any, b: any) => b.upsell - a.upsell).slice(0, 3)
    const taxa = (c: any) => { const v = c.front + c.upsell; return v > 0 ? c.reembolsoCount / v : 0 }
    const reemb = [...cr].filter((c: any) => c.reembolsoCount > 0).sort((a: any, b: any) => taxa(b) - taxa(a)).slice(0, 3)
    const out = ['*🏆 Ranking (hoje):*']
    out.push('Front: ' + (front.map((c: any) => `${c.criativo}(${c.front})`).join(', ') || '—'))
    out.push('Upsell: ' + (upsell.map((c: any) => `${c.criativo}(${c.upsell})`).join(', ') || '—'))
    out.push('Reembolso: ' + (reemb.map((c: any) => `${c.criativo}(${(taxa(c) * 100).toFixed(0)}%)`).join(', ') || '—'))
    return out.join('\n')
  }
  if (key === 'pagamento') {
    const b = await L.breakdown()
    const pg = (b.porPagamento ?? []).filter((m: any) => m.metodo !== 'Não informado')
    if (!pg.length) return null
    const total = pg.reduce((a: number, m: any) => a + m.total, 0)
    return ['*💳 Vendas por pagamento (hoje):*', ...pg.map((m: any) =>
      `${m.metodo}: *${m.total}* (${total > 0 ? ((m.total / total) * 100).toFixed(0) : 0}%)`)].join('\n')
  }
  return null
}

async function montarResposta(blocks: string[], header?: string, footer?: string): Promise<string> {
  const L = makeLoader()
  const dataBR = format(toZonedTime(new Date(), TZ), 'dd/MM/yyyy')
  const partes: string[] = []
  partes.push(`📊 *The Track*  _(${dataBR})_`)
  if (header?.trim()) partes.push(header.trim())
  for (const b of blocks) {
    const txt = await renderBloco(b, L)
    if (txt) partes.push('\n' + txt)
  }
  if (footer?.trim()) partes.push('\n_' + footer.trim() + '_')
  return partes.join('\n')
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'whatsapp-webhook' })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body?.data ?? {}
    const remoteJid: string = data?.key?.remoteJid ?? ''
    const fromMe: boolean = !!data?.key?.fromMe
    const texto = extrairTexto(data?.message).toLowerCase()

    if (fromMe) return NextResponse.json({ ignored: 'fromMe' })

    const isGroup = remoteJid.endsWith('@g.us')
    const isDM = remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@c.us')
    if (!isGroup && !isDM) return NextResponse.json({ ignored: 'not-supported' })

    // Config do banco (editável pela aba /whatsapp)
    const { data: cfgRow } = await supabaseAdmin
      .from('configuracoes').select('valor').eq('chave', CONFIG_KEY).maybeSingle()
    const config = parseWppConfig(cfgRow?.valor)

    // Resolve o "alvo" (grupo ou número) e checa se pode responder.
    let alvo: WppGroup | WppNumber | undefined
    if (isGroup) {
      const setupMode = (config.groups?.length ?? 0) === 0
      const group = config.groups?.find((g) => g.jid === remoteJid)
      if (!setupMode && (!group || !group.enabled)) {
        return NextResponse.json({ ignored: 'group-not-allowed', grupo: remoteJid })
      }
      alvo = group
    } else {
      // PRIVADO: só números cadastrados e ativos respondem.
      const num = config.numbers?.find((n) => n.enabled && mesmoNumero(n.number, remoteJid))
      if (!num) return NextResponse.json({ ignored: 'number-not-allowed', numero: remoteJid })
      alvo = num
    }

    const cmd = config.commands?.find((c) => c.enabled && c.trigger === texto)
    if (!cmd) return NextResponse.json({ ignored: 'no-command' })

    if (!EVOLUTION_APIKEY) return NextResponse.json({ error: 'apikey ausente' }, { status: 500 })

    const blocks = blocosPermitidos(cmd, alvo)
    if (!blocks.length && !cmd.header?.trim() && !cmd.footer?.trim()) {
      return NextResponse.json({ ignored: 'no-permission', grupo: remoteJid })
    }

    const resposta = await montarResposta(blocks, cmd.header, cmd.footer)
    await enviar(remoteJid, resposta)
    return NextResponse.json({ ok: true, grupo: remoteJid, comando: cmd.trigger, blocks })
  } catch (err) {
    console.error('[whatsapp]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
