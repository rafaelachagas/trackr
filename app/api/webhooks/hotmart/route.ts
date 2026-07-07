import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extrairCriativo, extrairFase, extrairCampanha } from '@/lib/utils'
import { HotmartWebhookPayload } from '@/types'

// Eventos Hotmart que processamos
const EVENTOS_ACEITOS = [
  'PURCHASE_COMPLETE',
  'PURCHASE_APPROVED',
  'PURCHASE_REFUNDED',
  'PURCHASE_CHARGEBACK',
  'PURCHASE_CANCELED',
  'PURCHASE_PROTEST', // reclamada / disputa
  'PURCHASE_EXPIRED',
]

export async function POST(request: NextRequest) {
  try {
    // 1. Validar hottok
    const hottokHeader = request.headers.get('x-hotmart-hottok')
    const { data: configData } = await supabaseAdmin
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'hotmart_hottok')
      .single()

    const hottokEsperado = configData?.valor
    if (hottokEsperado && hottokHeader !== hottokEsperado) {
      console.error('[Hotmart] Hottok inválido:', hottokHeader)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse do payload
    const payload: HotmartWebhookPayload = await request.json()
    const { event, data } = payload

    console.log('[Hotmart] Evento recebido:', event, data?.purchase?.transaction)

    if (!EVENTOS_ACEITOS.includes(event)) {
      return NextResponse.json({ message: 'Evento ignorado', event })
    }

    if (!data?.purchase?.transaction) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const { purchase, product, buyer } = data

    // 3. Mapear status
    const statusMap: Record<string, string> = {
      PURCHASE_COMPLETE: 'approved',
      PURCHASE_APPROVED: 'approved',
      PURCHASE_REFUNDED: 'refunded',
      PURCHASE_CHARGEBACK: 'chargeback',
      PURCHASE_CANCELED: 'cancelled',
      PURCHASE_PROTEST: 'reclamada',
      PURCHASE_EXPIRED: 'expired',
    }
    const status = statusMap[event] ?? 'pending'

    // 3.1. Resolver organização (single-tenant: usa a org existente).
    // O webhook é público (sem sessão de usuário), então não dá para derivar do login.
    // TODO: se virar multi-tenant, associar a org à credencial Hotmart (ex: configuracoes.org_id).
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    const orgId = org?.id
    if (!orgId) {
      console.error('[Hotmart] Nenhuma organização encontrada para associar a venda')
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 500 })
    }

    // 4. Verificar se é front ou upsell
    const { data: mapeamentos } = await supabaseAdmin
      .from('produtos_mapeamento')
      .select('*')
      .eq('ativo', true)

    let tipo: 'front' | 'upsell' = 'front'
    if (mapeamentos && mapeamentos.length > 0) {
      const mapeamento = mapeamentos.find((m) =>
        product.name.toLowerCase().includes(m.nome_produto.toLowerCase())
      )
      if (mapeamento) {
        tipo = mapeamento.tipo
      }
    } else {
      // Heurística: se contém palavras típicas de upsell
      const palavrasUpsell = ['upsell', 'order bump', 'bump', 'adicional', 'plataforma']
      if (palavrasUpsell.some((p) => product.name.toLowerCase().includes(p))) {
        tipo = 'upsell'
      }
    }

    // 5. Extrair SCK e criativo (payload 2.0.0: purchase.tracking.source_sck)
    const sck = purchase.tracking?.source_sck ?? purchase.sckPaymentLink ?? null
    const criativo = extrairCriativo(sck)

    // 6. Calcular valor (bruto) e valor líquido (comissão do produtor = "Receita
    // Líquida" da Hotmart: preço − taxa Hotmart − comissão coprodutor/afiliado)
    const valorCentavos = Math.round((purchase.original_offer_price?.value ?? purchase.price?.value ?? 0) * 100)
    const valor = valorCentavos / 100

    const comissaoProdutor = (data.commissions ?? []).find((c) => c.source === 'PRODUCER')
    const valorLiquido = comissaoProdutor
      ? Number(
          typeof comissaoProdutor.value === 'object'
            ? comissaoProdutor.value?.value
            : comissaoProdutor.value
        )
      : null

    // 7. Preparar registro
    const novaVenda = {
      org_id: orgId,
      transaction_id: purchase.transaction,
      // Data da COMPRA (order_date) — é como a Hotmart agrupa o faturamento diário.
      data: new Date(purchase.order_date).toISOString(),
      valor,
      valor_centavos: valorCentavos,
      valor_liquido: Number.isFinite(valorLiquido as number) ? valorLiquido : null,
      moeda: purchase.original_offer_price?.currency_value ?? purchase.price?.currency_value ?? 'BRL',
      produto: product.name,
      tipo,
      status,
      buyer_email: buyer?.email ?? null,
      sck,
      criativo,
      fase: extrairFase(sck),
      campanha: extrairCampanha(sck),
      vsl: null as string | null, // será preenchido via VTurb
    }

    // 8. Upsert (atualiza se a transação já existe)
    const { data: vendaSalva, error: erroInsert } = await supabaseAdmin
      .from('vendas')
      .upsert(novaVenda, { onConflict: 'transaction_id' })
      .select()
      .single()

    if (erroInsert) {
      console.error('[Hotmart] Erro ao salvar venda:', erroInsert)
      return NextResponse.json({ error: erroInsert.message }, { status: 500 })
    }

    // 9. Vincular upsell ao front (se aplicável)
    if (tipo === 'upsell' && buyer?.email && vendaSalva) {
      await vincularUpsell(vendaSalva.id, buyer.email, purchase.order_date)
    }

    // 10. Buscar VSL via VTurb (se tiver SCK)
    if (sck && vendaSalva) {
      await buscarEVincularVsl(vendaSalva.id, sck)
    }

    console.log('[Hotmart] Venda processada com sucesso:', vendaSalva?.id)
    return NextResponse.json({ success: true, id: vendaSalva?.id })
  } catch (error) {
    console.error('[Hotmart] Erro inesperado:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

      console.log('[Hotmart] Upsell vinculado ao front:', vendaFront.id)
    }
  } catch (error) {
    console.error('[Hotmart] Erro ao vincular upsell:', error)
  }
}

async function buscarEVincularVsl(vendaId: string, sck: string) {
  try {
    // Verificar cache primeiro
    const { data: cacheConversao } = await supabaseAdmin
      .from('vturb_conversions')
      .select('vsl_nome')
      .eq('conversion_key', sck)
      .not('vsl_nome', 'is', null)
      .limit(1)
      .single()

    if (cacheConversao?.vsl_nome) {
      await supabaseAdmin
        .from('vendas')
        .update({ vsl: cacheConversao.vsl_nome })
        .eq('id', vendaId)
      return
    }

    // Consultar VTurb API
    const { data: config } = await supabaseAdmin
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'vturb_api_key')
      .single()

    if (!config?.valor) return

    const vslNome = await buscarVslPorSck(sck, config.valor)
    if (vslNome) {
      await supabaseAdmin
        .from('vendas')
        .update({ vsl: vslNome })
        .eq('id', vendaId)

      console.log('[Hotmart] VSL vinculada:', vslNome, '→ sck:', sck)
    }
  } catch (error) {
    console.error('[Hotmart] Erro ao buscar VSL:', error)
  }
}

async function buscarVslPorSck(sck: string, vturbApiKey: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.vturb.com.br/v1/analytics/conversions?conversion_key=${encodeURIComponent(sck)}`,
      {
        headers: {
          Authorization: `Bearer ${vturbApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) return null

    const data = await response.json()
    return data?.video_name ?? data?.data?.[0]?.video_name ?? null
  } catch {
    return null
  }
}
