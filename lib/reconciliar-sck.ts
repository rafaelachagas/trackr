import { supabaseAdmin } from '@/lib/supabase'
import { extrairCriativo, extrairFase, extrairCampanha } from '@/lib/utils'

const TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const SALES_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'

async function getToken(basic: string): Promise<string> {
  const r = await fetch(`${TOKEN_URL}?grant_type=client_credentials`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
  })
  if (!r.ok) throw new Error(`Hotmart auth falhou (${r.status})`)
  return (await r.json()).access_token
}

/**
 * Reconcilia o SCK das vendas a partir da API sales/history do Hotmart.
 * É NÃO-DESTRUTIVO: só preenche linhas onde sck ainda está null.
 * O webhook às vezes não traz o sck no payload; a API sempre tem — então
 * essa função é a fonte da verdade para criativo/fase/campanha.
 */
export async function reconciliarSck(opts: {
  startDate: number
  endDate?: number
  maxPages?: number
}): Promise<{ atualizadas: number; coletadas: number; pages: number }> {
  const { data: cfg } = await supabaseAdmin
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'hotmart_basic')
    .single()

  const basic = cfg?.valor
  if (!basic) throw new Error('hotmart_basic não configurado')

  const token = await getToken(basic)
  const endDate = opts.endDate ?? Date.now()
  const maxPages = opts.maxPages ?? 100

  // 1. Coleta transaction -> sck da API
  const apiSck = new Map<string, string>()
  let pageToken: string | null = null
  let pages = 0
  do {
    const p = new URLSearchParams({
      max_results: '100',
      start_date: String(opts.startDate),
      end_date: String(endDate),
    })
    if (pageToken) p.set('page_token', pageToken)

    const r = await fetch(`${SALES_URL}?${p}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (!r.ok) break
    const j = await r.json()
    for (const it of j.items ?? []) {
      const tx = it.purchase?.transaction
      const sck = it.purchase?.tracking?.source_sck
      if (tx && sck) apiSck.set(tx, sck)
    }
    pageToken = j.page_info?.next_page_token ?? null
    pages++
  } while (pageToken && pages < maxPages)

  if (apiSck.size === 0) return { atualizadas: 0, coletadas: 0, pages }

  // 2. Atualiza somente as vendas que estão sem sck
  const txs = [...apiSck.keys()]
  let atualizadas = 0
  const BLOCO = 200
  for (let i = 0; i < txs.length; i += BLOCO) {
    const bloco = txs.slice(i, i + BLOCO)
    const { data: rows } = await supabaseAdmin
      .from('vendas')
      .select('transaction_id')
      .in('transaction_id', bloco)
      .is('sck', null)

    if (!rows?.length) continue

    await Promise.all(
      rows.map(async (row) => {
        const sck = apiSck.get(row.transaction_id)!
        const { error } = await supabaseAdmin
          .from('vendas')
          .update({
            sck,
            criativo: extrairCriativo(sck),
            fase: extrairFase(sck),
            campanha: extrairCampanha(sck),
          })
          .eq('transaction_id', row.transaction_id)
          .is('sck', null)
        if (!error) atualizadas++
      })
    )
  }

  return { atualizadas, coletadas: apiSck.size, pages }
}
