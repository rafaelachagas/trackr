import { NextRequest, NextResponse } from 'next/server'
import { getDashboardData } from '@/app/actions/dashboard'
import { formatarMoeda, spRangeISO } from '@/lib/utils'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import type { CriativoV2 } from '@/app/api/performance-v2/route'

// Recebe o webhook do Evolution API (mensagens do WhatsApp). Quando alguém manda
// "/relatorio" no grupo, responde com a performance vinda do trackr/Supabase.
export const maxDuration = 60

const TZ = 'America/Sao_Paulo'
const EVOLUTION_URL = process.env.EVOLUTION_URL ?? 'http://179.198.104.241:8080'
const INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'thetrack'
const APIKEY = process.env.EVOLUTION_APIKEY ?? ''
const SITE_URL = process.env.SITE_URL ?? 'https://thetrack.com.br'
// Se vazio, responde em QUALQUER grupo (modo setup, pra descobrir o id do grupo).
// Depois de saber o id, setar EVOLUTION_ALLOWED_GROUP pra travar só no grupo certo.
const ALLOWED_GROUP = process.env.EVOLUTION_ALLOWED_GROUP ?? ''

function extrairTexto(msg: any): string {
  return (msg?.conversation ?? msg?.extendedTextMessage?.text ?? '').trim()
}

async function enviar(to: string, text: string) {
  await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: APIKEY },
    body: JSON.stringify({ number: to, text }),
  })
}

const fmt = (v: number) => formatarMoeda(v)
const roasFmt = (r: number | null) => (r == null ? '—' : `${r.toFixed(2)}x`)

async function montarRelatorio(): Promise<string> {
  const agoraSP = toZonedTime(new Date(), TZ)
  const hoje = format(agoraSP, 'yyyy-MM-dd')
  const { desde, ate } = spRangeISO(hoje, hoje)

  // Resumo do dia (mesma fonte do overview)
  const dash = await getDashboardData('Qualquer', desde, ate)
  const m = dash.metrics
  const lucro = m ? m.revenue - m.spend - m.imposto : 0

  // Top criativos (mesma fonte da tabela Performance por Criativo V2)
  let top: CriativoV2[] = []
  try {
    const r = await fetch(`${SITE_URL}/api/performance-v2`, { cache: 'no-store' })
    const j = await r.json()
    top = (j.criativos ?? []).slice(0, 5)
  } catch {}

  const dataBR = format(agoraSP, 'dd/MM/yyyy')
  const linhas: string[] = []
  linhas.push(`📊 *The Track — Relatório de hoje*`)
  linhas.push(`_${dataBR}_`)
  linhas.push('')
  if (m) {
    linhas.push(`💰 Faturamento: *${fmt(m.revenue)}*`)
    linhas.push(`📣 Gasto em ADS: *${fmt(m.spend)}*`)
    linhas.push(`📈 ROAS: *${m.roas.toFixed(2)}*`)
    linhas.push(`🟢 Lucro: *${fmt(lucro)}*`)
    linhas.push(`🛒 Vendas: *${m.salesCount}*`)
  } else {
    linhas.push('_Sem dados do dia._')
  }

  if (top.length) {
    linhas.push('')
    linhas.push('*Top criativos (7d):*')
    top.forEach((c, i) => {
      linhas.push(`${i + 1}. *${c.criativo}* — ROAS ${roasFmt(c.roas_7d)} · Gasto ${fmt(c.gasto_7d)} · ${c.acao}`)
    })
  }
  linhas.push('')
  linhas.push('_Enviado pelo The Track_')
  return linhas.join('\n')
}

export async function GET() {
  // healthcheck simples
  return NextResponse.json({ ok: true, service: 'whatsapp-webhook' })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body?.data ?? {}
    const remoteJid: string = data?.key?.remoteJid ?? ''
    const fromMe: boolean = !!data?.key?.fromMe
    const texto = extrairTexto(data?.message).toLowerCase()

    // Ignora: mensagens do próprio bot, fora de grupo, ou que não são o comando.
    if (fromMe) return NextResponse.json({ ignored: 'fromMe' })
    if (!remoteJid.endsWith('@g.us')) return NextResponse.json({ ignored: 'not-group' })
    if (texto !== '/relatorio') return NextResponse.json({ ignored: 'no-command' })
    if (ALLOWED_GROUP && remoteJid !== ALLOWED_GROUP) return NextResponse.json({ ignored: 'other-group', grupo: remoteJid })

    if (!APIKEY) {
      console.error('[whatsapp] EVOLUTION_APIKEY não configurada')
      return NextResponse.json({ error: 'apikey ausente' }, { status: 500 })
    }

    const relatorio = await montarRelatorio()
    await enviar(remoteJid, relatorio)
    return NextResponse.json({ ok: true, grupo: remoteJid })
  } catch (err) {
    console.error('[whatsapp]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
