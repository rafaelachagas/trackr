// Campanhas da Meta pra página /campaigns: leitura ao vivo + edição de status e
// orçamento direto pela Graph API (token com ads_management).
//
// GASTO vem AO VIVO da Meta (insights nível campanha no período) — não da tabela
// `gastos`, que só é sincronizada de tempos em tempos. VENDAS vêm de `vendas`
// pela mesma chave do performance-v2 (lib/meta-chave): a venda cai na campanha
// cujo nome "slugado" bate com o part[0] do sck, via criarResolvedor.
// Nada aqui escreve em `vendas` nem em `gastos` (ver docs/VENDAS-ATRIBUICAO-ROAS.md).
//
// ⚠️ NÃO oferecer RENOMEAR campanha: o nome da campanha é o que casa a venda
// (sck part[0] ↔ campaign_name). Renomear no meio do dia joga a receita pra
// "sem campanha".

import { supabaseAdmin } from '@/lib/supabase'
import { resolverFatoresGasto } from '@/lib/meta-fatores'
import { criarResolvedor, campanhaToken, faseToken } from '@/lib/meta-chave'

const META = 'https://graph.facebook.com/v25.0'
const LOG_CHAVE = 'campanhas_log'
const LOG_MAX = 500

// Só vendas APROVADAS (pedido do Isaías): reclamada/reembolso/chargeback ficam
// fora, diferente da tabela do framework (performance-v2), que conta as quatro.
const STATUS_RECEITA = ['approved']

export type OrcamentoTipo = 'diario' | 'vitalicio' | 'conjunto'

export interface CampanhaLinha {
  id: string
  nome: string
  conta_id: string
  conta_nome: string
  moeda: string
  fase: string | null
  status: 'ACTIVE' | 'PAUSED' | string    // o que está configurado na campanha (o toggle)
  status_efetivo: string                   // o que a Meta diz que está rodando
  orcamento_tipo: OrcamentoTipo
  orcamento: number | null                 // na MOEDA DA CONTA (não convertido)
  gasto: number                            // em BRL
  vendas: number                           // vendas FRONT
  upsells: number                          // vendas de UPSELL (herdam o sck do front por e-mail)
  receita: number                          // líquida, front + upsell
  receita_upsell: number                   // parte da receita que veio de upsell
}

export interface MetaCfg { token: string; contas: string[]; configMap: Record<string, string> }

export async function carregarMetaCfg(): Promise<MetaCfg | null> {
  const { data } = await supabaseAdmin
    .from('configuracoes').select('chave, valor')
    .in('chave', ['meta_access_token', 'meta_ad_account_ids', 'meta_ad_account_id', 'usd_brl_rate', 'meta_imposto_pct'])
  const configMap = Object.fromEntries((data ?? []).map((c) => [c.chave, c.valor])) as Record<string, string>
  const token = configMap['meta_access_token']
  let contas: string[] = []
  try { contas = JSON.parse(configMap['meta_ad_account_ids'] || '[]') } catch {}
  if (contas.length === 0 && configMap['meta_ad_account_id']) contas = [configMap['meta_ad_account_id']]
  if (!token || contas.length === 0) return null
  return { token, contas: contas.map((c) => c.replace('act_', '')), configMap }
}

async function metaGetAll(url: string): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  for (let i = 0; next && i < 20; i++) {
    const r: Response = await fetch(next, { cache: 'no-store' })
    const j = await r.json()
    if (j.error) throw new Error(j.error.message)
    out.push(...(j.data ?? []))
    next = j.paging?.next ?? null
  }
  return out
}

async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const todas: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    todas.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return todas
}

const STATUS_LISTADOS = ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'DISAPPROVED']

// Moedas sem centavos na Meta (orçamento vem em unidade inteira). Pra BRL/USD o
// orçamento vem em CENTAVOS.
const SEM_CENTAVOS = new Set(['JPY', 'KRW', 'CLP', 'COP', 'HUF', 'ISK', 'PYG', 'TWD', 'VND', 'IDR'])
const divisor = (moeda: string) => (SEM_CENTAVOS.has(moeda) ? 1 : 100)

export async function listarCampanhas(ini: string, fim: string): Promise<{ campanhas: CampanhaLinha[]; semCampanha: { vendas: number; receita: number } }> {
  const cfg = await carregarMetaCfg()
  if (!cfg) throw new Error('Meta Ads não configurado.')
  const { token, contas, configMap } = cfg
  const { fatores } = await resolverFatoresGasto(token, contas, configMap)

  const porConta = await Promise.all(contas.map(async (id) => {
    const act = `act_${id}`
    const [info, camps, ins] = await Promise.all([
      fetch(`${META}/${act}?fields=name,currency&access_token=${token}`, { cache: 'no-store' }).then((r) => r.json()),
      metaGetAll(`${META}/${act}/campaigns?${new URLSearchParams({
        fields: 'id,name,status,effective_status,daily_budget,lifetime_budget',
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: STATUS_LISTADOS }]),
        limit: '500',
        access_token: token,
      })}`),
      metaGetAll(`${META}/${act}/insights?${new URLSearchParams({
        level: 'campaign',
        fields: 'campaign_id,spend',
        time_range: JSON.stringify({ since: ini, until: fim }),
        limit: '500',
        access_token: token,
      })}`),
    ])
    if (info.error) throw new Error(info.error.message)
    return { id, nome: info.name as string, moeda: info.currency as string, camps, ins }
  }))

  // Vendas com código de anúncio no período (bordas do dia em SP) + gastos do
  // banco no período só pra alimentar o resolvedor de campanha.
  const [vendas, gastosDb] = await Promise.all([
    fetchAll<{ criativo: string; sck: string | null; valor: number; valor_liquido: number | null; tipo: string | null }>((f, t) =>
      supabaseAdmin.from('vendas')
        .select('criativo, sck, valor, valor_liquido, tipo')
        .in('status', STATUS_RECEITA)
        .not('transaction_id', 'like', 'manual_%')
        .not('criativo', 'is', null)
        .gte('data', `${ini}T00:00:00-03:00`)
        .lte('data', `${fim}T23:59:59.999-03:00`)
        .range(f, t)),
    fetchAll<{ criativo: string | null; campaign_name: string | null; ad_name: string | null }>((f, t) =>
      supabaseAdmin.from('gastos')
        .select('criativo, campaign_name, ad_name')
        .not('ad_id', 'is', null)
        .gte('data', ini).lte('data', fim)
        .range(f, t)),
  ])

  const linhas: CampanhaLinha[] = []
  const porToken = new Map<string, CampanhaLinha>()
  for (const c of porConta) {
    const gastoPorCamp = new Map<string, number>()
    for (const i of c.ins) gastoPorCamp.set(i.campaign_id, (gastoPorCamp.get(i.campaign_id) ?? 0) + (parseFloat(i.spend) || 0))
    const fator = fatores.get(c.id) ?? 1
    const div = divisor(c.moeda)
    for (const k of c.camps) {
      const daily = k.daily_budget ? Number(k.daily_budget) / div : null
      const life = k.lifetime_budget ? Number(k.lifetime_budget) / div : null
      const l: CampanhaLinha = {
        id: k.id,
        nome: k.name,
        conta_id: c.id,
        conta_nome: c.nome,
        moeda: c.moeda,
        fase: faseToken(k.name),
        status: k.status,
        status_efetivo: k.effective_status,
        orcamento_tipo: daily != null ? 'diario' : life != null ? 'vitalicio' : 'conjunto',
        orcamento: daily ?? life,
        gasto: (gastoPorCamp.get(k.id) ?? 0) * fator,
        vendas: 0,
        upsells: 0,
        receita: 0,
        receita_upsell: 0,
      }
      linhas.push(l)
      const tk = campanhaToken(k.name)
      // Nome repetido em duas contas: a venda vai pra que está rodando.
      const atual = porToken.get(tk)
      if (!atual || (atual.status_efetivo !== 'ACTIVE' && l.status_efetivo === 'ACTIVE')) porToken.set(tk, l)
    }
  }

  const chaves = criarResolvedor(gastosDb)
  const semCampanha = { vendas: 0, receita: 0 }
  for (const v of vendas) {
    const tk = chaves.doVenda(v.criativo, v.sck).split('|')[3] ?? ''
    const alvo = porToken.get(tk)
    const liq = Number(v.valor_liquido ?? v.valor) || 0
    const front = v.tipo !== 'upsell' ? 1 : 0
    if (alvo) {
      alvo.receita += liq
      alvo.vendas += front
      if (!front) { alvo.upsells++; alvo.receita_upsell += liq }
    }
    else { semCampanha.receita += liq; semCampanha.vendas += front }
  }

  return { campanhas: linhas, semCampanha }
}

// ———————————————————————— Edição ————————————————————————

export type Alteracao =
  | { acao: 'status'; status: 'ACTIVE' | 'PAUSED' }
  | { acao: 'orcamento'; valor: number }

export interface LogCampanha {
  em: string
  por: string | null
  campanha_id: string
  campanha: string
  acao: 'status' | 'orcamento'
  de: string | number | null
  para: string | number
}

export async function alterarCampanha(id: string, alt: Alteracao, por: string | null): Promise<{ ok: true; log: LogCampanha }> {
  if (!/^\d+$/.test(id)) throw new Error('id de campanha inválido')
  const cfg = await carregarMetaCfg()
  if (!cfg) throw new Error('Meta Ads não configurado.')
  const { token } = cfg

  const atual = await fetch(`${META}/${id}?fields=name,status,daily_budget,lifetime_budget,account_id&access_token=${token}`, { cache: 'no-store' }).then((r) => r.json())
  if (atual.error) throw new Error(atual.error.message)
  // Só mexe em campanha das contas que o painel gerencia.
  if (!cfg.contas.includes(String(atual.account_id))) throw new Error('Campanha fora das contas conectadas.')

  const conta = await fetch(`${META}/act_${atual.account_id}?fields=currency&access_token=${token}`, { cache: 'no-store' }).then((r) => r.json())
  const div = divisor(conta.currency ?? 'BRL')

  const body = new URLSearchParams({ access_token: token })
  let de: string | number | null
  let para: string | number
  if (alt.acao === 'status') {
    if (alt.status !== 'ACTIVE' && alt.status !== 'PAUSED') throw new Error('status inválido')
    body.set('status', alt.status)
    de = atual.status
    para = alt.status
  } else {
    const valor = Number(alt.valor)
    if (!(valor > 0) || !isFinite(valor)) throw new Error('orçamento inválido')
    const campo = atual.daily_budget ? 'daily_budget' : atual.lifetime_budget ? 'lifetime_budget' : null
    if (!campo) throw new Error('O orçamento desta campanha fica nos conjuntos (ABO) — edite pelo gerenciador.')
    body.set(campo, String(Math.round(valor * div)))
    de = Number(atual[campo]) / div
    para = valor
  }

  const r = await fetch(`${META}/${id}`, { method: 'POST', body, cache: 'no-store' })
  const j = await r.json()
  if (j.error) throw new Error(j.error.error_user_msg || j.error.message)

  const log: LogCampanha = { em: new Date().toISOString(), por, campanha_id: id, campanha: atual.name, acao: alt.acao, de, para }
  await registrarLog(log)
  return { ok: true, log }
}

export async function lerLog(): Promise<LogCampanha[]> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', LOG_CHAVE).maybeSingle()
  try {
    const v = typeof data?.valor === 'string' ? JSON.parse(data.valor) : data?.valor
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

async function registrarLog(item: LogCampanha) {
  try {
    const log = [item, ...(await lerLog())].slice(0, LOG_MAX)
    // configuracoes.org_id é NOT NULL: inserir chave nova sem ele falha calado.
    const { data: org } = await supabaseAdmin
      .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
    const { error } = await supabaseAdmin.from('configuracoes').upsert(
      { chave: LOG_CHAVE, valor: JSON.stringify(log), org_id: org?.id, updated_at: new Date().toISOString() },
      { onConflict: 'chave' },
    )
    if (error) console.error('[campanhas] log não salvo:', error.message)
  } catch (e) {
    console.error('[campanhas] log', e)
  }
}
