import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizarPagamento } from '@/lib/utils'

// Backfill do método de pagamento das vendas ANTIGAS via API sales/history da
// Hotmart (payment.type). Atualiza SÓ a coluna metodo_pagamento das vendas que
// já existem — não mexe em valor/status/nada. Idempotente: pode rodar de novo.
export const maxDuration = 60

const HOTMART_TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const HOTMART_SALES_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function getAccessToken(basicToken: string): Promise<string> {
  const res = await fetchWithTimeout(`${HOTMART_TOKEN_URL}?grant_type=client_credentials`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicToken}`, 'Content-Type': 'application/json' },
  }, 15000)
  if (!res.ok) throw new Error(`Hotmart auth falhou (${res.status}): ${await res.text()}`)
  return (await res.json()).access_token
}

export async function POST(request: NextRequest) {
  try {
    const dias = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('dias') ?? '365', 10) || 365, 1), 1095)
    const maxPaginas = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('paginas') ?? '500', 10) || 500, 1), 2000)

    const { data: configs } = await supabaseAdmin
      .from('configuracoes').select('chave, valor').in('chave', ['hotmart_basic'])
    const basicToken = configs?.find((c) => c.chave === 'hotmart_basic')?.valor
    if (!basicToken) return NextResponse.json({ error: 'Credenciais Hotmart não configuradas.' }, { status: 400 })

    const accessToken = await getAccessToken(basicToken)

    const now = Date.now()
    const startDate = now - dias * 24 * 60 * 60 * 1000

    // transaction_id -> método normalizado
    const mapa = new Map<string, string>()
    let pageToken: string | null = null
    let page = 0
    let vistos = 0

    do {
      const params = new URLSearchParams({ max_results: '100', start_date: String(startDate), end_date: String(now) })
      if (pageToken) params.set('page_token', pageToken)

      const res = await fetchWithTimeout(`${HOTMART_SALES_URL}?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }, 25000)
      if (!res.ok) throw new Error(`Hotmart API error (${res.status}): ${await res.text()}`)

      const json = await res.json()
      for (const item of (json.items ?? [])) {
        const tx = item?.purchase?.transaction
        const metodo = normalizarPagamento(item?.purchase?.payment?.type)
        vistos++
        if (tx && metodo) mapa.set(tx, metodo)
      }
      pageToken = json.page_info?.next_page_token ?? null
      page++
    } while (pageToken && page < maxPaginas)

    // Agrupa por método e atualiza em lote (só a coluna metodo_pagamento).
    const porMetodo = new Map<string, string[]>()
    for (const [tx, metodo] of mapa) {
      const arr = porMetodo.get(metodo) ?? []
      arr.push(tx)
      porMetodo.set(metodo, arr)
    }

    let atualizados = 0
    for (const [metodo, txs] of porMetodo) {
      for (let i = 0; i < txs.length; i += 200) {
        const chunk = txs.slice(i, i + 200)
        const { error, count } = await supabaseAdmin
          .from('vendas')
          .update({ metodo_pagamento: metodo }, { count: 'exact' })
          .in('transaction_id', chunk)
        if (error) throw new Error(`update ${metodo}: ${error.message}`)
        atualizados += count ?? 0
      }
    }

    return NextResponse.json({
      success: true,
      dias,
      vendas_hotmart_lidas: vistos,
      transacoes_com_metodo: mapa.size,
      linhas_atualizadas: atualizados,
      paginas: page,
    })
  } catch (err: any) {
    console.error('[backfill-pagamento]', err)
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 })
  }
}
