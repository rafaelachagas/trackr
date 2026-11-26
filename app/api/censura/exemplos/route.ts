import { NextRequest, NextResponse } from 'next/server'
import { registrarExemplos, carregarExtra, Exemplo } from '@/lib/censura-inteligencia'

// Editor de Censura: cada decisão do usuário vira exemplo pra IA (Fase 1).
// POST { projetoId, itens: Exemplo[] }  ·  GET → { extra } (biblioteca aprovada)
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { projetoId, itens } = await req.json() as { projetoId?: string; itens?: Exemplo[] }
    if (!Array.isArray(itens) || !itens.length) return NextResponse.json({ ok: true })
    const r = await registrarExemplos(itens.slice(0, 50).map((e) => ({ ...e, origem: 'editor', projeto_id: projetoId || '' })))
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.erro }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ extra: await carregarExtra().catch(() => ({})) })
}
