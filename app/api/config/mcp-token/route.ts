import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'

// Token do conector MCP (Claude). A URL do conector é /api/mcp/<token> — quem
// tem a URL lê os dados, então só usuário logado vê/gera, e "gerar novo"
// invalida a URL antiga na hora.
export const dynamic = 'force-dynamic'

const CHAVE = 'mcp_token'

async function logado() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  if (!(await logado())) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', CHAVE).maybeSingle()
  return NextResponse.json({ token: data?.valor ?? null })
}

export async function POST() {
  if (!(await logado())) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  // configuracoes.org_id é NOT NULL — sem ele o upsert falha calado.
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const token = randomBytes(24).toString('hex')
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: CHAVE, valor: token, org_id: org?.id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token })
}
