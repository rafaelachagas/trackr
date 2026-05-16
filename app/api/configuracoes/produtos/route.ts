import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .select('*')
    .order('nome_produto')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { nome_produto, tipo } = body

  if (!nome_produto || !tipo) {
    return NextResponse.json({ error: 'nome_produto e tipo são obrigatórios' }, { status: 400 })
  }

  if (!['front', 'upsell'].includes(tipo)) {
    return NextResponse.json({ error: 'tipo deve ser "front" ou "upsell"' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .upsert({ nome_produto, tipo }, { onConflict: 'nome_produto' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('produtos_mapeamento')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
