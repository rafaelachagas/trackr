/**
 * Fatores de correção do gasto por conta de anúncio da Meta.
 *
 * - Contas em USD (BMUS): converte para BRL pela cotação do dia (AwesomeAPI,
 *   fallback pro campo manual `usd_brl_rate`).
 * - Contas em BRL: fator 1 — o gasto fica CRU, batendo com Meta/Utmify.
 *
 * O IMPOSTO sobre gastos em anúncios (alíquota `meta_imposto_pct`, ex 13.83)
 * NÃO entra no valor_gasto: ele é calculado por dia sobre o gasto das contas
 * BRL e salvo em `meta_imposto_diario` (ver /api/meta/sync), aparecendo no
 * card "Imposto total" do overview.
 */

const META_API_BASE = 'https://graph.facebook.com/v25.0'

// Moeda por conta (id sem "act_") a partir da Graph API.
export async function buscarMoedasContas(accessToken: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const r = await fetch(`${META_API_BASE}/me/adaccounts?fields=id,currency&limit=200&access_token=${accessToken}`)
    const j = await r.json()
    for (const a of j.data ?? []) {
      if (a.id) map.set(String(a.id).replace('act_', ''), a.currency)
    }
  } catch (e) {
    console.error('[Meta] Erro ao buscar moedas das contas:', e)
  }
  return map
}

// Cotação USD→BRL: tenta a AwesomeAPI (fonte BR, sem chave); cai para o valor
// configurado manualmente (usd_brl_rate) e, por fim, para um padrão seguro.
export async function getUsdBrlRate(rateConfig?: string | null): Promise<number> {
  const manual = rateConfig ? parseFloat(String(rateConfig).replace(',', '.')) : NaN
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL', { cache: 'no-store' })
    if (r.ok) {
      const j = await r.json()
      const bid = parseFloat(j?.USDBRL?.bid)
      if (bid > 0) return bid
    }
  } catch (e) {
    console.error('[Meta] Cotação USD-BRL falhou, usando fallback:', e)
  }
  if (manual > 0) return manual
  return 5.4
}

export type FatoresGasto = {
  /** multiplicador do gasto por conta (id sem "act_"): USD→cotação, BRL→1 */
  fatores: Map<string, number>
  /** moeda por conta (id sem "act_") */
  moedas: Map<string, string>
  /** alíquota do imposto sobre gastos em anúncios, em % (0 = desligado) */
  impostoPct: number
}

/**
 * Resolve fatores cambiais + alíquota do imposto para as contas selecionadas.
 * configMap precisa conter (se existirem) `usd_brl_rate` e `meta_imposto_pct`.
 */
export async function resolverFatoresGasto(
  accessToken: string,
  adAccountIds: string[],
  configMap: Record<string, string>
): Promise<FatoresGasto> {
  const moedas = await buscarMoedasContas(accessToken)

  const impostoPct = parseFloat(String(configMap['meta_imposto_pct'] ?? '').replace(',', '.')) || 0

  const idsLimpos = adAccountIds.map((id) => id.replace('act_', ''))
  const temUSD = idsLimpos.some((id) => moedas.get(id) === 'USD')
  const usdBrlRate = temUSD ? await getUsdBrlRate(configMap['usd_brl_rate']) : 1

  const fatores = new Map<string, number>()
  for (const id of idsLimpos) {
    fatores.set(id, moedas.get(id) === 'USD' ? usdBrlRate : 1)
  }
  return { fatores, moedas, impostoPct }
}
