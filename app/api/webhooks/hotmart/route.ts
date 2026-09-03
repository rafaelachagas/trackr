import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buscarSckUnico } from '@/lib/reconciliar-sck'
import { extrairCriativo, extrairFase, extrairCampanha, normalizarPagamento } from '@/lib/utils'
import { HotmartWebhookPayload } from '@/types'

// Hotmart às vezes dispara o webhook ANTES de terminar de indexar o tracking
// da compra na própria API sales/history — uma busca em tempo real feita nos
// primeiros segundos pode vir vazia mesmo pra transação que, minutos depois,
// já aparece com sck certinho (confirmado em produção: HP1632312192, 20/08).
// Por isso a busca em tempo real tenta de novo antes de desistir.
export const maxDuration = 30

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

    // [DEBUG TEMPORÁRIO] Guarda o `tracking` cru dos últimos webhooks pra
    // diagnosticar por que o sck está vindo null. Não afeta o processamento.
    // (configuracoes.org_id é NOT NULL — sem ele o upsert falhava silencioso e
    // esse capturador nunca gravou nada desde que foi criado; o erro pelo menos
    // agora vai pro log em vez de sumir.)
    try {
      const snap = {
        ts: new Date().toISOString(),
        transaction: purchase?.transaction ?? null,
        event,
        tracking: purchase?.tracking ?? null,
        trackingKeys: purchase?.tracking ? Object.keys(purchase.tracking) : null,
        purchaseKeys: purchase ? Object.keys(purchase) : null,
        origin: (purchase as any)?.origin ?? null,
        sckPaymentLink: (purchase as any)?.sckPaymentLink ?? null,
      }
      const { data: orgDebug } = await supabaseAdmin
        .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
      const { data: prev } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'hotmart_webhook_debug').maybeSingle()
      let arr: any[] = []
      try { arr = prev?.valor ? JSON.parse(prev.valor) : [] } catch {}
      arr.unshift(snap)
      const { error: errDebug } = await supabaseAdmin.from('configuracoes').upsert(
        { chave: 'hotmart_webhook_debug', valor: JSON.stringify(arr.slice(0, 12)), updated_at: new Date().toISOString(), org_id: orgDebug?.id },
        { onConflict: 'chave' }
      )
      if (errDebug) console.error('[Hotmart][debug] falha ao gravar snapshot:', errDebug.message)
    } catch (e) {
      console.error('[Hotmart][debug] erro inesperado:', (e as Error).message)
    }

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

    // 5. Extrair SCK e criativo (payload 2.0.0: purchase.tracking.source_sck).
    // Eventos de ciclo de vida (PURCHASE_PROTEST/REFUNDED/CHARGEBACK) às vezes
    // vêm SEM tracking no payload do webhook (só o evento de aprovação original
    // traz). Como o upsert regrava a linha inteira, isso apagava um sck que já
    // estava correto — a reconciliação nunca conserta pq só olha sck IS NULL,
    // e o sck só ficou null POR CAUSA disso. Busca o que já está salvo e não
    // deixa um evento sem tracking apagar um sck bom.
    // A Hotmart mudou o formato do webhook: o sck que vinha em
    // purchase.tracking.source_sck passou a vir em purchase.origin.sck
    // (payload capturado 20/08 não traz mais a chave `tracking`, só `origin`).
    // Lê os dois — formato novo primeiro, antigo como fallback.
    let sck = (purchase as any).origin?.sck ?? purchase.tracking?.source_sck ?? purchase.sckPaymentLink ?? null
    if (!sck) {
      const { data: existente } = await supabaseAdmin
        .from('vendas').select('sck').eq('transaction_id', purchase.transaction).maybeSingle()
      if (existente?.sck) sck = existente.sck
    }
    // Ainda sem sck? Busca na hora, direto na API do Hotmart, pra essa
    // transação específica — não dá pra esperar o cron horário, o criativo já
    // pode ter sido pausado/escalado com base num ROAS de 1d errado até lá.
    // Uma tentativa às vezes vem vazia porque a Hotmart ainda não terminou de
    // indexar o tracking na API deles (confirmado: HP1632312192, 20/08 — sck
    // não veio na primeira busca, mas já estava lá minutos depois). Por isso
    // tenta de novo com um espaço curto antes de desistir.
    if (!sck) {
      sck = await buscarSckUnico(purchase.transaction)
      if (!sck) {
        await new Promise((res) => setTimeout(res, 5000))
        sck = await buscarSckUnico(purchase.transaction)
      }
      if (sck) console.log('[Hotmart] sck resolvido em tempo real via API:', purchase.transaction)
      else console.warn('[Hotmart] sck NÃO resolvido em tempo real (2 tentativas):', purchase.transaction)
    }
    const criativo = extrairCriativo(sck)

    // 6. Calcular valor (bruto) e valor líquido (comissão do produtor = "Receita
    // Líquida" da Hotmart: preço − taxa Hotmart − comissão coprodutor/afiliado)
    // original_offer_price já vem CONVERTIDO pra BRL pelo Hotmart (câmbio do dia);
    // price vem na moeda original da venda (USD/EUR em compra internacional).
    const valorCentavos = Math.round((purchase.original_offer_price?.value ?? purchase.price?.value ?? 0) * 100)
    const valor = valorCentavos / 100

    // Comissão do produtor (data.commissions) às vezes vem na moeda ORIGINAL da
    // venda (ex: USD), mesmo quando original_offer_price já está em BRL — Hotmart
    // não converte esse campo. Sem isso, uma venda de US$122 (R$631,80) entrava
    // no banco como R$108,94 de líquido (o número em dólar, sem câmbio nenhum),
    // furando o ROAS de todo criativo com comprador internacional. A razão
    // original_offer_price/price É o câmbio do dia da Hotmart pra essa venda —
    // aplica ela em cima da comissão bruta pra converter pro mesmo padrão.
    const precoOriginal = purchase.price?.value
    const precoConvertidoBRL = purchase.original_offer_price?.value
    let taxaCambio = 1
    if (precoOriginal && precoConvertidoBRL && precoOriginal > 0) {
      const r = precoConvertidoBRL / precoOriginal
      if (r > 0.01 && r < 100) taxaCambio = r
    }

    const comissaoProdutor = (data.commissions ?? []).find((c) => c.source === 'PRODUCER')
    const valorLiquidoBruto = comissaoProdutor
      ? Number(
          typeof comissaoProdutor.value === 'object'
            ? comissaoProdutor.value?.value
            : comissaoProdutor.value
        )
      : null
    const valorLiquido = valorLiquidoBruto != null && Number.isFinite(valorLiquidoBruto)
      ? Math.round(valorLiquidoBruto * taxaCambio * 100) / 100
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
      metodo_pagamento: normalizarPagamento(purchase.payment?.type),
      vsl: null as string | null, // será preenchido via VTurb
      // Data do reembolso — só em reembolso/chargeback. O webhook chega quando o
      // reembolso acontece, então "agora" ≈ o momento do reembolso (precisão de
      // minutos, ótimo pras faixas de 24h/48h/7d). A Hotmart não expõe essa data
      // no histórico, então só dá pra capturar daqui pra frente.
      ...((status === 'refunded' || status === 'chargeback') ? { data_reembolso: new Date().toISOString() } : {}),
    }

    // 8. Upsert (atualiza se a transação já existe). Se a coluna
    // metodo_pagamento ainda não existir no banco (SQL não rodado), regrava SEM
    // ela — nunca deixa de salvar a venda por causa disso.
    let { data: vendaSalva, error: erroInsert } = await supabaseAdmin
      .from('vendas')
      .upsert(novaVenda, { onConflict: 'transaction_id' })
      .select()
      .single()

    // Colunas que podem não existir ainda (SQL não rodado): tira e regrava, nunca
    // deixa de salvar a venda por causa de uma coluna nova.
    if (erroInsert && /metodo_pagamento|data_reembolso/i.test(erroInsert.message ?? '')) {
      const { metodo_pagamento, data_reembolso, ...semExtras } = novaVenda as any
      ;({ data: vendaSalva, error: erroInsert } = await supabaseAdmin
        .from('vendas')
        .upsert(semExtras, { onConflict: 'transaction_id' })
        .select()
        .single())
    }

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
    // Janela de 30 dias: às vezes a pessoa compra o upsell dias depois do
    // front (regra do usuário). Copia sck/fase/campanha também — antes só
    // copiava criativo/vsl e deixava sck null, obrigando o cron a refazer o
    // trabalho depois.
    const janela30d = new Date(orderDate - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: vendaFront } = await supabaseAdmin
      .from('vendas')
      .select('id, criativo, vsl, sck, fase, campanha')
      .eq('buyer_email', buyerEmail)
      .eq('tipo', 'front')
      .not('sck', 'is', null)
      .gte('data', janela30d)
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
          sck: vendaFront.sck,
          fase: vendaFront.fase,
          campanha: vendaFront.campanha,
          atribuicao_manual: true,
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
