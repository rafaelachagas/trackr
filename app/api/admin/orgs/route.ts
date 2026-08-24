import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSuperAdminEmail } from '@/lib/admin'

async function getSuperAdmin() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isSuperAdminEmail(user.email)) return null
  return user
}

// GET — lista todas as organizações com plano e nº de membros. Painel /admin
// só (Isaías); NÃO usa organization_members do usuário — é visão de dono.
export async function GET() {
  const user = await getSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })

  const [{ data: orgs, error: e1 }, { data: subs, error: e2 }, { data: membros, error: e3 }] = await Promise.all([
    supabaseAdmin.from('organizations').select('id, name, slug, created_at').order('created_at', { ascending: true }),
    supabaseAdmin.from('subscriptions').select('org_id, plan_name, status, access_until, max_workspaces, updated_at'),
    supabaseAdmin.from('organization_members').select('org_id, user_id, role'),
  ])
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 })

  const subPorOrg = new Map((subs ?? []).map((s: any) => [s.org_id, s]))
  const membrosPorOrg = new Map<string, number>()
  for (const m of membros ?? []) membrosPorOrg.set(m.org_id, (membrosPorOrg.get(m.org_id) ?? 0) + 1)

  const data = (orgs ?? []).map((o: any) => ({
    ...o,
    subscription: subPorOrg.get(o.id) ?? null,
    membros: membrosPorOrg.get(o.id) ?? 0,
  }))

  return NextResponse.json({ orgs: data })
}

// POST — cria uma organização nova + assinatura (plano à sua escolha) + já
// gera um convite de admin, pronto pra mandar pro cliente entrar.
export async function POST(req: NextRequest) {
  const user = await getSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const nome = String(body.nome ?? '').trim()
  const planName = String(body.plan_name ?? 'Trial').trim()
  if (!nome) return NextResponse.json({ error: 'Nome da organização é obrigatório' }, { status: 400 })

  const slug = nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    || `org-${Date.now()}`

  const { data: org, error: eOrg } = await supabaseAdmin
    .from('organizations')
    .insert({ name: nome, slug })
    .select('id, name, slug, created_at')
    .single()
  if (eOrg) return NextResponse.json({ error: eOrg.message }, { status: 500 })

  await supabaseAdmin.from('subscriptions').insert({
    org_id: org.id,
    plan_name: planName,
    status: 'active',
    max_workspaces: 1,
  })

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: invite } = await supabaseAdmin
    .from('organization_invites')
    .insert({ org_id: org.id, invited_by: user.id, role: 'admin', expires_at: expiresAt })
    .select('token')
    .single()

  return NextResponse.json({ org, inviteToken: invite?.token ?? null })
}
