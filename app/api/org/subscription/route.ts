import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/org/subscription?org_id=...
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id obrigatório' }, { status: 400 })

  // Verifica se é admin
  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
  if (membership.role !== 'admin') return NextResponse.json({ error: 'Apenas admins podem ver assinatura' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_name, status, subscriber_email, purchase_date, access_until, transaction_id, subscriber_code, max_members, max_criativos')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscription: data })
}
