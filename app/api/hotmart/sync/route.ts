import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extrairCriativo } from '@/lib/utils'

export const maxDuration = 60

const HOTMART_TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const HOTMART_SALES_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'

const STATUS_MAP: Record<string, string> = {
  COMPLETE: 'approved',
  APPROVED: 'approved',
  REFUNDED: 'refunded',
  CHARGEBACK: 'chargeback',
  PROTESTED: 'reclamada',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function getAccessToken(basicToken: string): Promise<string> {
  console.log('[Hotmart Sync] Autenticando...')
  const res = await fetchWithTimeout(
    `${HOTMART_TOKEN_URL}?grant_type=client_credentials`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicToken}`,
        'Content-Type': 'application/json',
      },
    },
    15000
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Hotmart auth falhou (${res.status}): ${body}`)
  }
  const data = await res.json()
  console.log('[Hotmart Sync] Token obtido com sucesso')
  return data.access_token
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

export async function POST() {
  try {
    const { data: configs } = await supabaseAdmin
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['hotmart_basic'])

    const basicToken = configs?.find((c) => c.chave === 'hotmart_basic')?.valor
    if (!basicToken) {
      return NextResponse.json(
        { error: 'Credenciais Hotmart não configuradas. Adicione o Basic token em Configurações.' },
        { status: 400 }
      )
    }

    const accessToken = await getAccessToken(basicToken)

    // Resolver organização (single-tenant). Coluna org_id é NOT NULL na tabela vendas.
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    const orgId = org?.id
    if (!orgId) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 500 })
    }

    const { data: mapeamentos } = await supabaseAdmin
      .from('produtos_mapeamento')
      .select('*')
      .eq('ativo', true)

    const now = Date.now()
    const startDate = now - 30 * 24 * 60 * 60 * 1000

    let pageToken: string | null = null
    let totalProcessed = 0
    let page = 0

    do {
      const params = new URLSearchParams({
        max_results: '50',
        start_date: String(startDate),
        end_date: String(now),
      })
      if (pageToken) params.set('page_token', pageToken)

      console.log(`[Hotmart Sync] Buscando página ${page + 1}...`)
      const res = await fetchWithTimeout(
        `${HOTMART_SALES_URL}?${params}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
        20000
      )

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Hotmart API error (${res.status}): ${body}`)
      }
      const json = await res.json()
      const items: any[] = json.items ?? []

      const batch: any[] = []
      const upsellsParaVincular: { email: string; orderDate: number }[] = []

      for (const item of items) {
        const { purchase, product, buyer } = item
        if (!purchase?.transaction) continue

        const status = STATUS_MAP[purchase.status] ?? 'pending'

        let tipo: 'front' | 'upsell' = 'front'
        if (mapeamentos && mapeamentos.length > 0) {
          const mapeamento = mapeamentos.find((m: any) =>
            product?.name?.toLowerCase().includes(m.nome_produto.toLowerCase())
          )
          if (mapeamento) tipo = mapeamento.tipo
        } else {
          const palavrasUpsell = ['upsell', 'order bump', 'bump', 'plataforma de marcas', 'plataforma']
          if (palavrasUpsell.some((p) => product?.name?.toLowerCase().includes(p))) {
            tipo = 'upsell'
          }
        }

        const sck = purchase.tracking?.source_sck ?? null
        const criativo = extrairCriativo(sck)
        const valorBruto = purchase.original_offer_price?.value ?? purchase.price?.value ?? 0
        const valorCentavos = Math.round(valorBruto * 100)

        batch.push({
          org_id: orgId,
          transaction_id: purchase.transaction,
          // Data da COMPRA (order_date) — é como a Hotmart agrupa o faturamento diário.
          data: new Date(purchase.order_date).toISOString(),
          valor: valorCentavos / 100,
          valor_centavos: valorCentavos,
          moeda: purchase.original_offer_price?.currency_value ?? 'BRL',
          produto: product?.name ?? 'Desconhecido',
          tipo,
          status,
          buyer_email: buyer?.email ?? null,
          sck,
          criativo,
          vsl: null as string | null,
        })

        if (tipo === 'upsell' && buyer?.email && !criativo) {
          upsellsParaVincular.push({ email: buyer.email, orderDate: purchase.approved_date ?? purchase.order_date })
        }
      }

      if (batch.length > 0) {
        const { error } = await supabaseAdmin
          .from('vendas')
          .upsert(batch, { onConflict: 'transaction_id' })

        if (error) {
          console.error('[Hotmart Sync] Erro ao salvar batch:', error)
        } else {
          totalProcessed += batch.length
        }
      }

      // Vincular upsells em paralelo
      await Promise.allSettled(
        upsellsParaVincular.map(({ email, orderDate }) => vincularUpsell('', email, orderDate))
      )

      pageToken = json.page_info?.next_page_token ?? null
      page++
    } while (pageToken && page < 20)

    await supabaseAdmin
      .from('configuracoes')
      .upsert(
        { chave: 'hotmart_ultima_sync', valor: new Date().toISOString() },
        { onConflict: 'chave' }
      )

    await supabaseAdmin.from('sync_logs').insert({
      tipo: 'hotmart',
      status: 'sucesso',
      mensagem: `${totalProcessed} vendas sincronizadas`,
      registros_processados: totalProcessed,
    })

    return NextResponse.json({ success: true, total_registros: totalProcessed })
  } catch (error: any) {
    console.error('[Hotmart Sync] Erro:', error)
    await supabaseAdmin.from('sync_logs').insert({
      tipo: 'hotmart',
      status: 'erro',
      mensagem: error.message,
      registros_processados: 0,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
