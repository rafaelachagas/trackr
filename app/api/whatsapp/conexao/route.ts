import { NextRequest, NextResponse } from 'next/server'
import { EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY } from '@/lib/whatsapp'

// Status e reconexão da instância do Evolution (bot do WhatsApp). GET = estado
// atual; POST = gera um QR novo pra reparear. Usa a apikey do servidor — o
// navegador nunca vê a chave nem o IP da VPS.
export const dynamic = 'force-dynamic'

function headers() { return { apikey: EVOLUTION_APIKEY, 'Content-Type': 'application/json' } }

export async function GET() {
  if (!EVOLUTION_APIKEY) return NextResponse.json({ error: 'apikey do Evolution não configurada' }, { status: 500 })
  try {
    const r = await fetch(`${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, { headers: headers(), cache: 'no-store' })
    const j = await r.json().catch(() => null)
    // Evolution devolve { instance: { state: 'open'|'connecting'|'close' } }
    const state = j?.instance?.state ?? j?.state ?? 'desconhecido'
    return NextResponse.json({ state }, { headers: { 'cache-control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: `não consegui falar com o Evolution: ${e.message}` }, { status: 502 })
  }
}

export async function POST(_req: NextRequest) {
  if (!EVOLUTION_APIKEY) return NextResponse.json({ error: 'apikey do Evolution não configurada' }, { status: 500 })
  try {
    const r = await fetch(`${EVOLUTION_URL}/instance/connect/${EVOLUTION_INSTANCE}`, { headers: headers(), cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (!j) return NextResponse.json({ error: 'resposta inválida do Evolution' }, { status: 502 })
    // Já conectado: o connect devolve o estado em vez de QR.
    if (j?.instance?.state === 'open') return NextResponse.json({ state: 'open' })
    const base64 = j.base64 || (j.qrcode?.base64) || null
    const pairingCode = j.pairingCode || j.qrcode?.pairingCode || null
    if (!base64 && !pairingCode) return NextResponse.json({ error: 'Evolution não retornou QR (talvez já esteja conectando).', raw: j?.instance?.state }, { status: 502 })
    return NextResponse.json({ base64, pairingCode })
  } catch (e: any) {
    return NextResponse.json({ error: `não consegui gerar o QR: ${e.message}` }, { status: 502 })
  }
}
