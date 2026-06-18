import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data: configs } = await supabaseAdmin.from('configuracoes').select('*')
  const token = configs?.find(c => c.chave === 'meta_access_token')?.valor

  if (!token) {
    return NextResponse.json({ error: 'Não conectado ao Meta Ads' }, { status: 401 })
  }

  const res = await fetch(
    `https://graph.facebook.com/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${token}`
  )
  const json = await res.json()

  if (json.error) {
    return NextResponse.json({ error: json.error.message, code: json.error.code, type: json.error.type }, { status: 400 })
  }

  return NextResponse.json({ accounts: json.data ?? [] })
}
