import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Chave do ElevenLabs e vozes disponíveis. A chave fica em `configuracoes`,
// do mesmo jeito que as de Anthropic/Gemini — nunca volta pro navegador.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CHAVE = 'elevenlabs_api_key'
const EL = 'https://api.elevenlabs.io/v1'

async function lerChave(): Promise<string> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', CHAVE).maybeSingle()
  return data?.valor?.toString().trim() || process.env.ELEVENLABS_API_KEY || ''
}

async function lerVoz(): Promise<string> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor')
    .eq('chave', 'elevenlabs_voz_id').maybeSingle()
  return data?.valor?.toString() || ''
}

export async function GET() {
  const [key, vozId] = await Promise.all([lerChave(), lerVoz()])
  if (!key) return NextResponse.json({ configurada: false, vozes: [], vozId })
  try {
    const r = await fetch(`${EL}/voices`, {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) {
      return NextResponse.json({ configurada: true, erro: `ElevenLabs respondeu ${r.status}`, vozes: [], vozId })
    }
    const j = await r.json()
    const vozes = (j?.voices || []).map((v: any) => ({
      id: v.voice_id,
      nome: v.name,
      categoria: v.category,
      previa: v.preview_url,
    }))
    return NextResponse.json({ configurada: true, vozes, vozId })
  } catch {
    return NextResponse.json({ configurada: true, erro: 'não consegui falar com o ElevenLabs', vozes: [], vozId })
  }
}

export async function POST(req: Request) {
  const { apiKey, vozId } = await req.json().catch(() => ({}))
  if (typeof apiKey === 'string' && apiKey.trim()) {
    // Confere antes de salvar: chave errada salva em silêncio vira bug chato
    // de achar depois, quando o vídeo falhar no meio da geração.
    const r = await fetch(`${EL}/voices`, {
      headers: { 'xi-api-key': apiKey.trim() },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null)
    if (!r || !r.ok) {
      return NextResponse.json({ error: 'chave recusada pelo ElevenLabs' }, { status: 400 })
    }
    await supabaseAdmin.from('configuracoes').upsert(
      { chave: CHAVE, valor: apiKey.trim() }, { onConflict: 'chave' })
  }
  if (typeof vozId === 'string') {
    await supabaseAdmin.from('configuracoes').upsert(
      { chave: 'elevenlabs_voz_id', valor: vozId }, { onConflict: 'chave' })
  }
  return NextResponse.json({ ok: true })
}
