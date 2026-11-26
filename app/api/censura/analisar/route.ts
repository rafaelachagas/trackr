import { NextRequest, NextResponse } from 'next/server'
import { analisarPalavras } from '@/lib/censura-inteligencia'

// Editor de Censura → "Analisar riscos". A IA lê a transcrição com a política
// da Meta (a skill do usuário) + a experiência acumulada da operação
// (lib/censura-inteligencia.ts) e devolve os trechos de risco apontando pros
// ids das palavras, que é o que o editor sabe censurar.
//
// POST { palavras: [{id, w}], motivos?: string } → { riscos: Risco[] }
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(req: NextRequest) {
  try {
    const { palavras, motivos } = await req.json() as { palavras?: { id: number; w: string }[]; motivos?: string }
    if (!Array.isArray(palavras) || !palavras.length) return NextResponse.json({ error: 'transcrição vazia' }, { status: 400 })
    if (palavras.length > 12000) return NextResponse.json({ error: 'Vídeo longo demais pra analisar de uma vez.' }, { status: 400 })
    const r = await analisarPalavras({ palavras, motivos })
    if (r.erro) return NextResponse.json({ error: r.erro }, { status: 502 })
    return NextResponse.json({ riscos: r.riscos })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
