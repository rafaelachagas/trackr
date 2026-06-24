import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

async function getCallerAndOrg(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado', status: 401 }

  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return { error: 'org_id obrigatório', status: 400 }

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!membership) return { error: 'Sem acesso a esta organização', status: 403 }

  return { user, orgId, role: membership.role as 'admin' | 'member' }
}

// GET /api/org/members?org_id=...
export async function GET(req: NextRequest) {
  const ctx = await getCallerAndOrg(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('user_id, role, joined_at, users:user_id(email, raw_user_meta_data)')
    .eq('org_id', ctx.orgId)
    .order('joined_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = (data ?? []).map((m: any) => ({
    user_id: m.user_id,
    email: m.users?.email ?? '',
    full_name: m.users?.raw_user_meta_data?.full_name ?? '',
    role: m.role,
    joined_at: m.joined_at,
  }))

  return NextResponse.json({ members })
}

// DELETE /api/org/members?org_id=...&user_id=...
export async function DELETE(req: NextRequest) {
  const ctx = await getCallerAndOrg(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Apenas admins podem remover membros' }, { status: 403 })

  const targetUserId = req.nextUrl.searchParams.get('user_id')
  if (!targetUserId) return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })
  if (targetUserId === ctx.user.id) return NextResponse.json({ error: 'Não é possível remover a si mesmo' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('organization_members')
    .delete()
    .eq('org_id', ctx.orgId)
    .eq('user_id', targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/org/members?org_id=...
// body: { user_id, role }
export async function PATCH(req: NextRequest) {
  const ctx = await getCallerAndOrg(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Apenas admins podem alterar papéis' }, { status: 403 })

  const body = await req.json()
  const { user_id, role } = body
  if (!user_id || !['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }
  if (user_id === ctx.user.id) return NextResponse.json({ error: 'Não é possível alterar seu próprio papel' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('organization_members')
    .update({ role })
    .eq('org_id', ctx.orgId)
    .eq('user_id', user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
