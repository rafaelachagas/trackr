import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { alterarCampanha, type Alteracao } from '@/lib/meta-campanhas'

// Liga/pausa ou muda o orçamento de uma campanha na Meta. Exige sessão (o
// middleware já barra /api sem login; aqui pego o e-mail pro histórico).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  let body: Alteracao
  try { body = await req.json() } catch { return NextResponse.json({ error: 'corpo inválido' }, { status: 400 }) }
  if (body?.acao !== 'status' && body?.acao !== 'orcamento') return NextResponse.json({ error: 'ação inválida' }, { status: 400 })

  try {
    return NextResponse.json(await alterarCampanha(id, body, user.email ?? null))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
