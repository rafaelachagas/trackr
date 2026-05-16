import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const sck = request.nextUrl.searchParams.get('sck')

  if (!sck) {
    return NextResponse.json({ error: 'SCK é obrigatório' }, { status: 400 })
  }

  // Verificar cache
  const { data: cache } = await supabaseAdmin
    .from('vturb_conversions')
    .select('vsl_nome, vturb_video_id')
    .eq('conversion_key', sck)
    .not('vsl_nome', 'is', null)
    .limit(1)
    .single()

  if (cache) {
    return NextResponse.json({ vsl: cache.vsl_nome, video_id: cache.vturb_video_id, source: 'cache' })
  }

  // Consultar VTurb
  const { data: config } = await supabaseAdmin
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'vturb_api_key')
    .single()

  if (!config?.valor) {
    return NextResponse.json({ error: 'VTurb API Key não configurada' }, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://api.vturb.com.br/v1/analytics/conversions?conversion_key=${encodeURIComponent(sck)}`,
      {
        headers: {
          Authorization: `Bearer ${config.valor}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      return NextResponse.json({ vsl: null, message: 'SCK não encontrado no VTurb' })
    }

    const data = await response.json()
    const vslNome = data?.video_name ?? data?.data?.[0]?.video_name ?? null

    if (vslNome) {
      // Salvar no cache
      const videoId = data?.video_id ?? data?.data?.[0]?.video_id ?? 'unknown'
      await supabaseAdmin.from('vturb_conversions').upsert(
        { vturb_video_id: videoId, vsl_nome: vslNome, conversion_key: sck },
        { onConflict: 'conversion_key,vturb_video_id' }
      )

      // Atualizar venda se existir
      await supabaseAdmin
        .from('vendas')
        .update({ vsl: vslNome })
        .eq('sck', sck)
        .is('vsl', null)
    }

    return NextResponse.json({ vsl: vslNome, source: 'vturb' })
  } catch (error) {
    return NextResponse.json({ error: `Erro ao consultar VTurb: ${error}` }, { status: 500 })
  }
}
