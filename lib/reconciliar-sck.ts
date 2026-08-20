import { supabaseAdmin } from '@/lib/supabase'
import { extrairCriativo, extrairFase, extrairCampanha } from '@/lib/utils'

const TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const SALES_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'

// O gateway do Hotmart (developers.hotmart.com) passou a rejeitar com 400 o fetch
// "pelado" vindo do IP de datacenter da Vercel. Mandar cabeçalhos de navegador
// costuma passar pelo WAF. Do IP residencial funciona sem isso, mas o cron roda
// na Vercel — então esses headers são o que destrava a reconciliação em produção.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

async function getToken(basic: string): Promise<string> {
  const r = await fetch(`${TOKEN_URL}?grant_type=client_credentials`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json', ...BROWSER_HEADERS },
  })
  if (!r.ok) throw new Error(`Hotmart auth falhou (${r.status})`)
  return (await r.json()).access_token
}

/**
 * Busca o sck de UMA transação específica, na hora, direto na API do Hotmart.
 * Usada pelo webhook quando o payload não traz tracking.source_sck — em vez de
 * esperar o cron horário (que chega tarde demais pra decisão de ROAS 1d/3d/7d,
 * o criativo já foi pausado/escalado antes da reconciliação em lote rodar).
 * Só essa transação, então é rápida (1-2 chamadas), mas ainda depende da API
 * do Hotmart responder — por isso tem timeout e nunca lança erro pro caller.
 */
export async function buscarSckUnico(transactionId: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const { data: cfg } = await supabaseAdmin
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'hotmart_basic')
      .single()
    const basic = cfg?.valor
    if (!basic) return null

    const token = await getToken(basic)

    // Sem transaction_status: cobre a maioria (aprovada) numa chamada só.
    // Se não achar, tenta os outros status (vendas que já nascem canceladas/
    // reembolsadas raramente têm sck relevante, mas não custa tentar).
    const STATUSES = ['', 'CANCELLED', 'REFUNDED', 'PROTESTED', 'CHARGEBACK', 'EXPIRED']
    for (const status of STATUSES) {
      const p = new URLSearchParams({
        max_results: '10',
        transaction: transactionId,
        // A API exige start_date/end_date; usa uma janela larga (90 dias) pra
        // não perder transações antigas reprocessadas.
        start_date: String(Date.now() - 90 * 24 * 60 * 60 * 1000),
        end_date: String(Date.now()),
      })
      if (status) p.set('transaction_status', status)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let r: Response
      try {
        r = await fetch(`${SALES_URL}?${p}`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...BROWSER_HEADERS },
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      if (!r.ok) continue
      const j = await r.json()
      const item = (j.items ?? []).find((it: any) => it.purchase?.transaction === transactionId)
      const sck = item?.purchase?.tracking?.source_sck
      if (sck) return sck
    }
    return null
  } catch (e) {
    console.error('[buscarSckUnico] Erro:', (e as Error).message)
    return null
  }
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
}): Promise<{ atualizadas: number; coletadas: number; pages: number; upsellsVinculados: number; erros?: string[] }> {
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
  const erros: string[] = []
  // O Hotmart às vezes joga 429/5xx (rate-limit no IP do servidor). ANTES o
  // código fazia `break` e engolia o erro → o cron "terminava" com 0 e ninguém
  // via. Agora retenta com backoff e só desiste da PÁGINA após 4 tentativas,
  // registrando o erro pra aparecer na resposta.
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
  async function fetchPagina(url: string): Promise<Response | null> {
    for (let tent = 0; tent < 4; tent++) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...BROWSER_HEADERS } })
      if (r.ok) return r
      // 429/5xx: espera e retenta. 4xx (menos 429): erro definitivo, não adianta.
      if (r.status !== 429 && r.status < 500) {
        const body = await r.text().catch(() => '')
        erros.push(`${r.status}${body ? ': ' + body.slice(0, 120) : ''}`)
        return null
      }
      await sleep(1000 * (tent + 1))
      if (tent === 3) erros.push(`${r.status} (após retries)`)
    }
    return null
  }
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

      const r = await fetchPagina(`${SALES_URL}?${p}`)
      if (!r) break
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
  // à parte que não carrega o sck. Se houver um front com o MESMO email nos
  // últimos 30 dias, herda o sck/criativo do front e marca atribuicao_manual
  // (asterisco na UI). Às vezes o upsell só é comprado dias depois do front,
  // então a janela precisa ser larga (regra do usuário: procurar até 30 dias
  // antes de desistir e deixar a venda sem atribuição — ela continua contando
  // no faturamento total, só não entra no ROAS de nenhum criativo específico).
  const upsellsVinculados = await vincularUpsellsSemSck(opts.startDate, endDate)

  return { atualizadas, coletadas: apiSck.size, pages, upsellsVinculados, erros: erros.length ? erros : undefined }
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
    const janela = new Date(new Date(up.data).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
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
