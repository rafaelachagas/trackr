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
    // Transcreve em sequência (a maioria cai no "só texto" em 1–2 s) e deixa
    // metade do tempo pra IA achar os trechos culpados.
    let transcritos = 0
    while (Date.now() - ini < 140_000) {
      const id = await transcreverProximo(Math.max(30_000, 150_000 - (Date.now() - ini)))
      if (!id) break
      transcritos++
    }
    out.transcritos = transcritos
    out.analisados = await analisarProximos(15, ini + 270_000)
    return NextResponse.json({ ok: true, ...out, ms: Date.now() - ini })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e), ...out }, { status: 500 })
  }
}
