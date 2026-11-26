import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { descobrir, transcreverProximo, analisarProximos } from '@/lib/censura-meta'

// Fase 2 da inteligência do Editor de Censura (lib/censura-meta.ts).
// A cada 30 min: (a cada 3h) busca reprovados/aprovados nas contas, transcreve
// UM vídeo na VPS e analisa os já transcritos. ?descobrir=1 força a busca.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CHAVE = 'censura_meta_descoberta'
const INTERVALO_DESCOBERTA_MS = 3 * 3600_000

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const ini = Date.now()
  const out: Record<string, unknown> = {}
  try {
    const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', CHAVE).maybeSingle()
    const ultima = data?.valor ? new Date(data.valor).getTime() : 0
    if (request.nextUrl.searchParams.get('descobrir') || Date.now() - ultima > INTERVALO_DESCOBERTA_MS) {
      out.descoberta = await descobrir()
      await supabaseAdmin.from('configuracoes').upsert({ chave: CHAVE, valor: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'chave' })
    }
    // Sobra ~1 min pra analisar depois de transcrever.
    const resta = 300_000 - (Date.now() - ini) - 70_000
    if (resta > 60_000) out.transcrito = await transcreverProximo(resta)
    out.analisados = await analisarProximos(3, ini + 285_000)
    return NextResponse.json({ ok: true, ...out, ms: Date.now() - ini })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), ...out }, { status: 500 })
  }
}
