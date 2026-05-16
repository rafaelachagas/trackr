import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Chaves que não devem ser retornadas completas por segurança
const CHAVES_SENSIVEIS = [
  'meta_access_token',
  'hotmart_hottok',
  'hotmart_client_id',
  'hotmart_client_secret',
  'hotmart_basic',
  'vturb_api_key',
]

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor, updated_at')
    .order('chave')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Mascarar valores sensíveis
  const configs = (data ?? []).map((c) => ({
    chave: c.chave,
    valor: CHAVES_SENSIVEIS.includes(c.chave) && c.valor
      ? c.valor.length > 8
        ? `${c.valor.slice(0, 4)}${'*'.repeat(Math.max(0, c.valor.length - 8))}${c.valor.slice(-4)}`
        : '****'
      : c.valor,
    configurado: !!c.valor && c.valor !== '',
    updated_at: c.updated_at,
  }))

  return NextResponse.json(configs)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { chave, valor } = body

  if (!chave) {
    return NextResponse.json({ error: 'Chave é obrigatória' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('configuracoes')
    .upsert({ chave, valor: valor ?? '' }, { onConflict: 'chave' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
