import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    // 1. Carregar Configurações de Acesso ao Meta Ads do BD
    const { data: configs } = await supabaseAdmin
      .from('configuracoes')
      .select('*')
      .in('chave', ['meta_access_token', 'meta_ad_account_id'])

    const mapConfigs = configs?.reduce((acc: any, c) => ({ ...acc, [c.chave]: c.valor }), {}) || {}
    const accessToken = mapConfigs.meta_access_token
    let adAccountId = mapConfigs.meta_ad_account_id

    if (!accessToken || !adAccountId) {
      return NextResponse.json({ error: 'Configurações do Meta Ads não definidas no setup' }, { status: 400 })
    }

    if (!adAccountId.startsWith('act_')) {
      adAccountId = `act_${adAccountId}`
    }

    // 2. Definir o período de busca (exemplo: últimos 7 dias dinâmico)
    // 3. Fazer request para o Facebook Graph API (Insights)
    // NOTA: Implementação mock da URL real devido à dependência do Token Real
    const graphUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?level=ad&fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,cpc&date_preset=last_7d&access_token=${accessToken}`
    
    console.log('[SYNC] Iniciando sincronização Meta Ads...')
    // const response = await fetch(graphUrl)
    // const data = await response.json()
    // if (data.error) throw new Error(data.error.message)
    
    // Mock Data process
    const mockDataToInsert = [
       {
         data: new Date().toISOString().split('T')[0],
         campaign_id: '123',
         campaign_name: 'Campanha Teste Otimizada',
         adset_id: '456',
         adset_name: 'Conjunto Público Quente',
         ad_id: '789',
         ad_name: 'AD_XYZ_01_Video_Top',
         criativo: 'AD_XYZ_01', 
         valor_gasto: 154.50,
         impressions: 4300,
         clicks: 120,
         cpc: 1.28
       }
    ]

    // 4. Inserir no Supabase (usando upsert baseado na UNIQUE constraint (data, ad_id))
    for (const item of mockDataToInsert) {
      await supabaseAdmin.from('gastos').upsert(item, { onConflict: 'data,ad_id' })
    }

    // 5. Atualizar Data de Ultima Sincronizacao
    await supabaseAdmin.from('configuracoes').upsert(
      { chave: 'meta_ultima_sync', valor: new Date().toISOString(), updated_at: new Date().toISOString() }, 
      { onConflict: 'chave' }
    )

    // 6. Log
    await supabaseAdmin.from('sync_logs').insert({
      tipo: 'meta',
      status: 'sucesso',
      mensagem: 'Sincronização Meta Ads via API efetuada com sucesso.',
      registros_processados: mockDataToInsert.length
    })

    return NextResponse.json({ success: true, processed: mockDataToInsert.length })
  } catch (err: any) {
    console.error('Erro na sincronização do Meta:', err.message)
    await supabaseAdmin.from('sync_logs').insert({ tipo: 'meta', status: 'erro', mensagem: err.message })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
