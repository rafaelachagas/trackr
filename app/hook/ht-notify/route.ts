import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    
    // Pegar o hottok do header ou body
    const hottokRecebido = req.headers.get('x-hotmart-hottok') || payload.hottok
    
    // Checar o hottok do DB
    const { data: config } = await supabaseAdmin
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'hotmart_hottok')
      .single()

    if (config?.valor && hottokRecebido !== config.valor) {
      return NextResponse.json({ error: 'Hottok inválido' }, { status: 401 })
    }

    // Estruturação e Mock da inserção (adaptável ao real payload recebido)
    // Extraímos os dados básicos (transaction, product, status, etc.)
    const ev = payload.event === 'PURCHASE_APPROVED' || payload.event === 'PURCHASE_COMPLETE'
    
    if (ev || payload.status === 'approved' || payload.status === 'complete') {
      const transactionId = payload.transaction || payload.id || `hm_${Date.now()}`
      const productName = payload.product?.name || payload.produto || 'Produto Hotmart'
      const rawPrice = payload.purchase?.price?.value || payload.price || 0
      
      const valorDecimal = Number(rawPrice)
      const valorCentavos = Math.round(valorDecimal * 100)

      // Identificar o tracking (src ou sck)
      const sck = payload.purchase?.tracking?.source || payload.sck || ''
      const utmCampaign = payload.purchase?.tracking?.utm_campaign || ''
      const utmContent = payload.purchase?.tracking?.utm_content || ''
      const criativo = utmContent || '' // Ou match padronizado
      const vsl = utmCampaign || '' 

      // Verificar se o produto é front ou upsell no DB
      let tipo = 'front'
      const { data: prod } = await supabaseAdmin
        .from('produtos_mapeamento')
        .select('tipo')
        .eq('nome_produto', productName)
        .single()
        
      if (prod) tipo = prod.tipo

      await supabaseAdmin.from('vendas').insert({
        transaction_id: transactionId.toString(),
        data: new Date().toISOString(),
        valor: valorDecimal,
        valor_centavos: valorCentavos,
        moeda: payload.purchase?.price?.currency || 'BRL',
        produto: productName,
        tipo: tipo,
        status: payload.status || 'approved',
        buyer_email: payload.buyer?.email || '',
        sck: sck,
        criativo: criativo,
        vsl: vsl,
        raw_payload: payload
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Erro no Hook Hotmart:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
