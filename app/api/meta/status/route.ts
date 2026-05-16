import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data: ultimaSync } = await supabaseAdmin
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'meta_ultima_sync')
    .single()

  const { data: logs } = await supabaseAdmin
    .from('sync_logs')
    .select('*')
    .eq('tipo', 'meta')
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({
    ultima_sync: ultimaSync?.valor ?? null,
    logs: logs ?? [],
  })
}
