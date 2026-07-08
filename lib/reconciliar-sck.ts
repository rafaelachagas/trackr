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
}): Promise<{ atualizadas: number; coletadas: number; pages: number; upsellsVinculados: number }> {
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

  // A API sales/history, sem transaction_status, só devolve vendas aprovadas.
  // Para reconciliar também canceladas/reembolsos/reclamadas/chargeback é
  // preciso consultar cada status explicitamente. ''= padrão (aprovadas).
  const STATUSES = ['', 'CANCELLED', 'REFUNDED', 'PROTESTED', 'CHARGEBACK', 'EXPIRED']

  // 1. Coleta transaction -> sck da API (todos os status)
  const apiSck = new Map<string, string>()
  let pages = 0
  for (const status of STATUSES) {
    let pageToken: string | null = null
    let statusPages = 0
    do {
      const p = new URLSearchParams({
        max_results: '100',
        start_date: String(opts.startDate),
        end_date: String(endDate),
      })
      if (status) p.set('transaction_status', status)
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
      statusPages++
      pages++
    } while (pageToken && statusPages < maxPages)
  }

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

  // 3. Upsells sem sck: muitas vezes a pessoa compra o upsell por link de checkout
  // à parte que não carrega o sck. Se houver um front com o MESMO email na janela
  // de 48h, herda o sck/criativo do front e marca atribuicao_manual (asterisco na UI).
  const upsellsVinculados = await vincularUpsellsSemSck(opts.startDate, endDate)

  return { atualizadas, coletadas: apiSck.size, pages, upsellsVinculados }
}

async function vincularUpsellsSemSck(startDate: number, endDate: number): Promise<number> {
  const { data: upsells } = await supabaseAdmin
    .from('vendas')
    .select('id, buyer_email, data')
    .eq('tipo', 'upsell')
    .is('sck', null)
    .not('buyer_email', 'is', null)
    .gte('data', new Date(startDate).toISOString())
    .lte('data', new Date(endDate).toISOString())

  if (!upsells?.length) return 0

  let vinculados = 0
  for (const up of upsells) {
    const janela = new Date(new Date(up.data).getTime() - 48 * 60 * 60 * 1000).toISOString()
    const { data: front } = await supabaseAdmin
      .from('vendas')
      .select('id, criativo, fase, campanha, sck, vsl')
      .eq('buyer_email', up.buyer_email)
      .eq('tipo', 'front')
      .not('sck', 'is', null)
      .gte('data', janela)
      .lte('data', up.data)
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (front?.sck) {
      const { error } = await supabaseAdmin
        .from('vendas')
        .update({
          venda_front_id: front.id,
          sck: front.sck,
          criativo: front.criativo,
          fase: front.fase,
          campanha: front.campanha,
          vsl: front.vsl,
          atribuicao_manual: true,
        })
        .eq('id', up.id)
        .is('sck', null)
      if (!error) vinculados++
    }
  }
  return vinculados
}
