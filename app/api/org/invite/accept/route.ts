import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/org/invite/accept
// body: { token }
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 })

  // Busca o convite
  const { data: invite } = await supabaseAdmin
    .from('organization_invites')
    .select('org_id, role, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (!invite) return NextResponse.json({ error: 'Convite inválido ou não encontrado' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Este convite já foi utilizado' }, { status: 400 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Este convite expirou' }, { status: 400 })

  // Verifica se já é membro
  const { data: existing } = await supabaseAdmin
    .from('organization_members')
    .select('user_id')
    .eq('org_id', invite.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Você já é membro desta organização' }, { status: 400 })

  // Adiciona como membro
  const { error: insertError } = await supabaseAdmin
    .from('organization_members')
    .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Marca convite como aceito
  await supabaseAdmin
    .from('organization_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token)

  return NextResponse.json({ ok: true, org_id: invite.org_id })
}
