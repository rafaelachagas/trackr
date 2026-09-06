import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Leitura pública (somente leitura) dos afazeres, via token. Sem login — o token
// resolve a org por afazeres_pub_<token>. Não expõe nada além da lista.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get('token') || '').trim()
  if (!token) return NextResponse.json({ error: 'token ausente' }, { status: 400 })
  const { data: map } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', `afazeres_pub_${token}`).maybeSingle()
  const orgId = map?.valor
  if (!orgId) return NextResponse.json({ error: 'link inválido ou revogado' }, { status: 404 })
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', `afazeres_${orgId}`).maybeSingle()
  let itens: any[] = []
  try { itens = data?.valor ? JSON.parse(data.valor) : [] } catch { itens = [] }
  return NextResponse.json({ itens }, { headers: { 'cache-control': 'no-store' } })
}
