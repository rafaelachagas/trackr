import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extrairCriativo, extrairFase, extrairCampanha } from '@/lib/utils'

const STATUS_MAP: Record<string, string> = {
  PURCHASE_COMPLETE: 'approved',
  PURCHASE_APPROVED: 'approved',
  APPROVED: 'approved',
  COMPLETE: 'approved',
  PURCHASE_REFUNDED: 'refunded',
  REFUNDED: 'refunded',
  PURCHASE_CHARGEBACK: 'chargeback',
  CHARGEBACK: 'chargeback',
  PURCHASE_CANCELED: 'cancelled',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
}

export async function POST(request: NextRequest) {
  try {
    // Auth por API key (header ou query param)
    const apiKey =
      request.headers.get('x-api-key') ?? request.nextUrl.searchParams.get('key')

    const { data: configKey } = await supabaseAdmin
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'make_api_key')
      .single()

    if (configKey?.valor && apiKey !== configKey.valor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[Make] Payload recebido:', JSON.stringify(body, null, 2))

    // Suporta dois formatos:
    // 1. Payload bruto Hotmart: { event, data: { purchase, product, buyer } }
    // 2. Payload simplificado: { transaction_id, order_date, produto, valor, email, sck, status }
    let purchase: any, product: any, buyer: any, status: string, evento: string

    if (body.data?.purchase) {
      // Formato bruto Hotmart (Make repassando o webhook completo)
      evento = body.event ?? 'PURCHASE_COMPLETE'
      purchase = body.data.purchase
      product = body.data.product
      buyer = body.data.buyer
      status = STATUS_MAP[evento] ?? 'pending'
    } else {
      // Formato simplificado
      const b = body
      purchase = {
        transaction: b.transaction_id ?? b.transacao,
        order_date: b.order_date ?? Date.now(),
        price: { value: b.valor_total ?? b.valor ?? 0, currency_value: b.moeda ?? 'BRL' },
        price_liquido: b.valor_liquido ?? null,
        origin: { sck: b.sck ?? null },
        payment: { type: b.metodo_pagamento ?? null },
        status: b.status ?? 'COMPLETE',
      }
      product = { name: b.produto ?? 'Desconhecido', id: b.produto_id ?? null }
      buyer = { email: b.email ?? null, checkout_phone: b.telefone ?? null }
      status = STATUS_MAP[b.status ?? 'COMPLETE'] ?? 'approved'
    }

    if (!purchase?.transaction) {
      return NextResponse.json({ error: 'transaction_id ausente' }, { status: 400 })
    }

    // Tipo: front ou upsell via mapeamento de produtos
    const { data: mapeamentos } = await supabaseAdmin
      .from('produtos_mapeamento')
      .select('*')
      .eq('ativo', true)

    let tipo: 'front' | 'upsell' = 'front'
    if (mapeamentos && mapeamentos.length > 0) {
      const mapeamento = mapeamentos.find((m: any) =>
        product.name?.toLowerCase().includes(m.nome_produto.toLowerCase())
      )
      if (mapeamento) tipo = mapeamento.tipo
    } else {
      const palavrasUpsell = ['upsell', 'order bump', 'bump', 'plataforma']
      if (palavrasUpsell.some((p) => product.name?.toLowerCase().includes(p))) {
        tipo = 'upsell'
      }
    }

    // SCK → criativo
    const sck = purchase.sckPaymentLink ?? purchase.origin?.sck ?? null
    const criativo = extrairCriativo(sck)
    const fase = extrairFase(sck)
    const campanha = extrairCampanha(sck)

    const valorBruto = purchase.original_offer_price?.value ?? purchase.price?.value ?? 0
    const valorCentavos = Math.round(valorBruto * 100)

    // Tabela de conversão: parte inteira do valor bruto → líquido
    const LIQUIDO_MAP: Record<number, number> = {
      196: 174.60, 197: 174.60,
      265: 234.58, 266: 234.58,
      296: 261.31, 297: 261.31,
      396: 352.82, 397: 352.82,
      596: 531.01, 597: 531.01,
    }
    const valorInteiro = Math.floor(valorBruto)

    const valorLiquido =
      purchase.price_liquido != null ? Number(purchase.price_liquido)
      : purchase.price?.base_value != null ? Number(purchase.price.base_value)
      : LIQUIDO_MAP[valorInteiro] ?? null

    const novaVenda = {
      transaction_id: purchase.transaction,
      data: new Date(purchase.approved_date ?? purchase.order_date).toISOString(),
      valor: valorCentavos / 100,
      valor_centavos: valorCentavos,
      valor_liquido: valorLiquido,
      moeda: purchase.original_offer_price?.currency_value ?? purchase.price?.currency_value ?? 'BRL',
      produto: product.name ?? 'Desconhecido',
      tipo,
      status,
      buyer_email: buyer?.email ?? null,
      sck,
      criativo,
      fase,
      campanha,
      vsl: null as string | null,
    }

    const { data: vendaSalva, error: erroInsert } = await supabaseAdmin
      .from('vendas')
      .upsert(novaVenda, { onConflict: 'transaction_id' })
      .select()
      .single()

    if (erroInsert) {
      console.error('[Make] Erro ao salvar venda:', erroInsert)
      return NextResponse.json({ error: erroInsert.message }, { status: 500 })
    }

    // Vincular upsell por email (janela 24h)
    if (tipo === 'upsell' && buyer?.email && vendaSalva) {
      await vincularUpsell(
        vendaSalva.id,
        buyer.email,
        purchase.approved_date ?? purchase.order_date
      )
    }

    console.log('[Make] Venda processada:', vendaSalva?.id, criativo)
    return NextResponse.json({ success: true, id: vendaSalva?.id, criativo })
  } catch (error: any) {
    console.error('[Make] Erro:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function vincularUpsell(upsellId: string, buyerEmail: string, orderDate: number) {
  try {
    const janela24h = new Date(orderDate - 24 * 60 * 60 * 1000).toISOString()

    const { data: vendaFront } = await supabaseAdmin
      .from('vendas')
      .select('id, criativo, vsl')
      .eq('buyer_email', buyerEmail)
      .eq('tipo', 'front')
      .gte('data', janela24h)
      .order('data', { ascending: false })
      .limit(1)
      .single()

    if (vendaFront) {
      await supabaseAdmin
        .from('vendas')
        .update({
          venda_front_id: vendaFront.id,
          criativo: vendaFront.criativo,
          vsl: vendaFront.vsl,
        })
        .eq('id', upsellId)
    }
  } catch {}
}
