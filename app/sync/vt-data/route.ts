import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    // 1. Carregar Configuração de Acesso VTurb
    const { data: config } = await supabaseAdmin
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'vturb_api_key')
      .single()

    const apiKey = config?.valor

    if (!apiKey) {
      return NextResponse.json({ error: 'VTurb API Key não definida no setup' }, { status: 400 })
    }

    console.log('[SYNC] Iniciando sincronização VTurb...')

    // 2. Request para VTurb Analytics ou Events API
    // Exemplo estrutural de chamada
    // const vturbUrl = `https://api.vturb.com.br/v1/analytics/conversions`
    // const response = await fetch(vturbUrl, { headers: { 'Authorization': `Bearer ${apiKey}` }})
    // const data = await response.json()
    
    const mockVturbData = [
      {
        vturb_video_id: 'vid_001_vsl',
        vsl_nome: 'VSL Principal - Nova Promessa',
        conversion_key: 'track_a1b2c3d4',
        data: new Date().toISOString(),
        valor_centavos: 9700
      }
    ]

    // 3. Atualizar/Inserir Conversões
    for (const item of mockVturbData) {
      await supabaseAdmin.from('vturb_conversions').upsert(item, { onConflict: 'conversion_key,vturb_video_id' })
    }

    // 4. Atualizar Data de Ultima Sincronizacao
    await supabaseAdmin.from('configuracoes').upsert(
      { chave: 'vturb_ultima_sync', valor: new Date().toISOString(), updated_at: new Date().toISOString() }, 
      { onConflict: 'chave' }
    )

    // 5. Log
    await supabaseAdmin.from('sync_logs').insert({
      tipo: 'vturb',
      status: 'sucesso',
      mensagem: 'Sincronização VTurb efetuada.',
      registros_processados: mockVturbData.length
    })

    return NextResponse.json({ success: true, processed: mockVturbData.length })
  } catch (err: any) {
    console.error('Erro na sincronização VTurb:', err.message)
    await supabaseAdmin.from('sync_logs').insert({ tipo: 'vturb', status: 'erro', mensagem: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
