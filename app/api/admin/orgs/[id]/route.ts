import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSuperAdminEmail } from '@/lib/admin'

async function requireSuperAdmin() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdminEmail(user.email)) return null
  return user
}

// PATCH — edita o plano da organização. body: { plan_name?, status?, access_until?, max_workspaces? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
  const { id: orgId } = await params

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  if (typeof body.plan_name === 'string') patch.plan_name = body.plan_name
  if (typeof body.status === 'string') patch.status = body.status
  if ('access_until' in body) patch.access_until = body.access_until || null
  if (typeof body.max_workspaces === 'number') patch.max_workspaces = body.max_workspaces

  const { data: existente } = await supabaseAdmin.from('subscriptions').select('id').eq('org_id', orgId).maybeSingle()
  const { error } = existente
    ? await supabaseAdmin.from('subscriptions').update(patch).eq('org_id', orgId)
    : await supabaseAdmin.from('subscriptions').insert({ org_id: orgId, ...patch })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — apaga a organização (e cascata de members/subscriptions/convites).
// Só pra org sem nenhum membro além de quem criou por engano — proteção simples.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
  const { id: orgId } = await params

  await supabaseAdmin.from('organization_invites').delete().eq('org_id', orgId)
  await supabaseAdmin.from('organization_members').delete().eq('org_id', orgId)
  await supabaseAdmin.from('subscriptions').delete().eq('org_id', orgId)
  const { error } = await supabaseAdmin.from('organizations').delete().eq('id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
