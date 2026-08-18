import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { VTURB_ANALYTICS_BASE, vturbHeaders } from '@/lib/vturb'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Testa a conexão com a VTurb Analytics API usando a chave salva.
// Chama /players/list (valida o token) e, se der, /quota/usage (mostra o limite).
export async function GET() {
  const { data: config } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', 'vturb_api_key').maybeSingle()
  const token = config?.valor?.toString().trim()
  if (!token) return NextResponse.json({ ok: false, error: 'Nenhuma chave VTurb salva.' }, { status: 400 })

  try {
    const r = await fetch(`${VTURB_ANALYTICS_BASE}/players/list`, {
      headers: vturbHeaders(token), cache: 'no-store',
    })
    if (r.status === 401) return NextResponse.json({ ok: false, error: 'Chave rejeitada (401). Confira se copiou a API Key certa.' }, { status: 200 })
    if (r.status === 429) return NextResponse.json({ ok: false, error: 'Limite de requisições atingido (429). Tente de novo em 1 minuto.' }, { status: 200 })
    if (!r.ok) return NextResponse.json({ ok: false, error: `A VTurb respondeu ${r.status}.` }, { status: 200 })

    const j: any = await r.json().catch(() => null)
    const players = Array.isArray(j) ? j : (j?.players ?? j?.data ?? [])
    const totalPlayers = Array.isArray(players) ? players.length : null

    // Quota (best-effort — não quebra o teste se falhar).
    let quota: any = null
    try {
      const q = await fetch(`${VTURB_ANALYTICS_BASE}/quota/usage`, { headers: vturbHeaders(token), cache: 'no-store' })
      if (q.ok) quota = await q.json().catch(() => null)
    } catch {}

    return NextResponse.json({ ok: true, totalPlayers, quota })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'Não consegui falar com a VTurb. Verifique sua conexão.' }, { status: 200 })
  }
}
