import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chaveLayout, LAYOUT_PADRAO, type MetricaId } from '@/lib/metricas-overview'

export const dynamic = 'force-dynamic'

function device(req: NextRequest): 'desktop' | 'mobile' {
  return req.nextUrl.searchParams.get('device') === 'mobile' ? 'mobile' : 'desktop'
}

// GET — layout salvo pro dispositivo, ou null (front usa o padrão).
export async function GET(req: NextRequest) {
  const { data } = await supabaseAdmin
    .from('configuracoes')
    .select('valor')
    .eq('chave', chaveLayout(device(req)))
    .maybeSingle()

  if (!data?.valor) return NextResponse.json({ items: null })
  try {
    const items = JSON.parse(data.valor) as MetricaId[]
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: null })
  }
}

// PUT — salva a ordem/seleção. body: { device, items: MetricaId[] }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dev = body.device === 'mobile' ? 'mobile' : 'desktop'
  const items: MetricaId[] = Array.isArray(body.items) ? body.items : LAYOUT_PADRAO

  const { error } = await supabaseAdmin
    .from('configuracoes')
    .upsert({ chave: chaveLayout(dev), valor: JSON.stringify(items), updated_at: new Date().toISOString() }, { onConflict: 'chave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — "Redefinir configurações": remove a customização, volta pro padrão.
export async function DELETE(req: NextRequest) {
  const { error } = await supabaseAdmin
    .from('configuracoes')
    .delete()
    .eq('chave', chaveLayout(device(req)))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
