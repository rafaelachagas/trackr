import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { VTURB_ANALYTICS_BASE, vturbHeaders } from '@/lib/vturb'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Lista os players (VSLs) da conta VTurb pra o usuário escolher no cadastro.
export async function GET() {
  const { data: config } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', 'vturb_api_key').maybeSingle()
  const token = config?.valor?.toString().trim()
  if (!token) return NextResponse.json({ error: 'Nenhuma chave VTurb salva.' }, { status: 400 })

  try {
    const r = await fetch(`${VTURB_ANALYTICS_BASE}/players/list`, { headers: vturbHeaders(token), cache: 'no-store' })
    if (!r.ok) return NextResponse.json({ error: `VTurb respondeu ${r.status}.` }, { status: 200 })
    const j: any = await r.json().catch(() => null)
    const arr = Array.isArray(j) ? j : (j?.players ?? j?.data ?? j?.items ?? [])
    // Normaliza id/nome de forma tolerante (o shape exato varia).
    const players = (Array.isArray(arr) ? arr : []).map((p: any) => ({
      id: String(p?.id ?? p?.player_id ?? p?._id ?? p?.uuid ?? ''),
      name: String(p?.name ?? p?.title ?? p?.player_name ?? p?.reference ?? p?.id ?? 'Player'),
      duration: Number(p?.video_duration ?? p?.duration ?? 0) || null,
    })).filter((p: any) => p.id)
    return NextResponse.json({ ok: true, players })
  } catch {
    return NextResponse.json({ error: 'Não consegui listar os players da VTurb.' }, { status: 200 })
  }
}
