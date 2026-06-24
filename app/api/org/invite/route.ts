import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

async function getAdminCtx(req: NextRequest) {
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
  if (membership.role !== 'admin') return { error: 'Apenas admins podem gerenciar convites', status: 403 }

  return { user, orgId }
}

// POST /api/org/invite?org_id=...
// body: { role: 'admin'|'member', email?: string }
export async function POST(req: NextRequest) {
  const ctx = await getAdminCtx(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const body = await req.json().catch(() => ({}))
  const role = ['admin', 'member'].includes(body.role) ? body.role : 'member'

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('organization_invites')
    .insert({
      org_id: ctx.orgId,
      invited_by: ctx.user.id,
      role,
      expires_at: expiresAt,
    })
    .select('token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ token: data.token, expires_at: expiresAt })
}

// GET /api/org/invite?org_id=...
export async function GET(req: NextRequest) {
  const ctx = await getAdminCtx(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const { data, error } = await supabaseAdmin
    .from('organization_invites')
    .select('token, role, expires_at, accepted_at, created_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invites: data ?? [] })
}

// DELETE /api/org/invite?org_id=...&token=...
export async function DELETE(req: NextRequest) {
  const ctx = await getAdminCtx(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token obrigatório' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('organization_invites')
    .delete()
    .eq('org_id', ctx.orgId)
    .eq('token', token)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
