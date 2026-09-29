// Página "Meta" (/campaigns): contas, campanhas, conjuntos e anúncios da Meta com
// leitura ao vivo + edição de status e orçamento direto pela Graph API (token
// com ads_management). Layout no estilo Utmify.
//
// GASTO/impressões/cliques/IC vêm AO VIVO da Meta (insights nível ANÚNCIO no
// período, somados pra cima) — não da tabela `gastos`, que só sincroniza de
// tempos em tempos. VENDAS vêm de `vendas` pela mesma chave do performance-v2
// (lib/meta-chave): a venda cai no anúncio cuja chave código|fase|flags|campanha
// bate (criarResolvedor); se nenhum anúncio com gasto bate, cai só na CAMPANHA
// pelo nome "slugado" (conta na campanha e na conta, não em conjunto/anúncio).
// Nada aqui escreve em `vendas` nem em `gastos` (ver docs/VENDAS-ATRIBUICAO-ROAS.md).
//
// ⚠️ NÃO oferecer RENOMEAR campanha/anúncio: o nome é o que casa a venda
// (sck ↔ campaign_name/ad_name). Renomear no meio do dia joga a receita pra
// "sem campanha".

import { supabaseAdmin } from '@/lib/supabase'
import { resolverFatoresGasto } from '@/lib/meta-fatores'
import { criarResolvedor, chaveDoAnuncio, campanhaToken, faseToken } from '@/lib/meta-chave'
import { extrairCriativo } from '@/lib/utils'

const META = 'https://graph.facebook.com/v25.0'
const LOG_CHAVE = 'campanhas_log'
const LOG_MAX = 500

// Só vendas APROVADAS (pedido do Isaías): reclamada/reembolso/chargeback ficam
// fora, diferente da tabela do framework (performance-v2), que conta as quatro.
const STATUS_RECEITA = ['approved']

export type Nivel = 'conta' | 'campanha' | 'conjunto' | 'anuncio'
export const NIVEIS: Nivel[] = ['conta', 'campanha', 'conjunto', 'anuncio']

// diario/vitalicio = orçamento do próprio objeto (editável);
// 'conjuntos' = campanha ABO (orçamento nos conjuntos); 'campanha' = conjunto de campanha CBO.
export type OrcamentoTipo = 'diario' | 'vitalicio' | 'conjuntos' | 'campanha' | null

export interface LinhaMeta {
  id: string
  nivel: Nivel
  nome: string
  conta_id: string
  conta_nome: string
  moeda: string
  campanha_id: string | null
  campanha_nome: string | null
  conjunto_id: string | null
  conjunto_nome: string | null
  fase: string | null
  status: string                 // configurado (o toggle). Conta: ACTIVE/DISABLED
  status_efetivo: string         // o que a Meta diz que está rodando
  orcamento_tipo: OrcamentoTipo
  orcamento: number | null       // na MOEDA DA CONTA (não convertido)
  atualizado_em: string | null   // updated_time da Meta
  gasto: number                  // BRL
  impressoes: number
  cliques: number                // cliques no link
  ic: number                     // initiate checkout
  vendas: number                 // FRONT
  upsells: number
  receita: number                // líquida, front + upsell
  receita_upsell: number
}

export interface ResultadoMeta {
  linhas: LinhaMeta[]
  semCampanha: { vendas: number; receita: number }
  produtos: string[]
  atualizado_em: string
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
  for (let i = 0; next && i < 30; i++) {
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

// Deixa de fora só DELETED/ARCHIVED.
const STATUS_LISTADOS = [
  'ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES',
  'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO',
]

// Conjuntos/anúncios: listar tudo que não foi apagado dá milhares de linhas
// (5.855 anúncios, 38s). Lista só o que está RODANDO e completa com os pausados
// que gastaram no período (buscados por id).
const STATUS_RODANDO = ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED', 'PENDING_BILLING_INFO']

async function buscarPorIds(ids: string[], fields: string, token: string): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50)
    const j = await fetch(`${META}/?${new URLSearchParams({ ids: lote.join(','), fields, access_token: token })}`, { cache: 'no-store' }).then((r) => r.json())
    if (j.error) throw new Error(j.error.message)
    out.push(...Object.values(j))
  }
  return out
}

// Moedas sem centavos na Meta (orçamento em unidade inteira). BRL/USD vêm em CENTAVOS.
const SEM_CENTAVOS = new Set(['JPY', 'KRW', 'CLP', 'COP', 'HUF', 'ISK', 'PYG', 'TWD', 'VND', 'IDR'])
const divisor = (moeda: string) => (SEM_CENTAVOS.has(moeda) ? 1 : 100)

// Initiate Checkout — mesmo critério do /api/meta/sync.
function extrairIC(actions: { action_type: string; value: string }[] | undefined): number {
  const a = actions?.find((x) => x.action_type === 'initiate_checkout')
    ?? actions?.find((x) => x.action_type === 'omni_initiated_checkout')
  return a ? parseInt(a.value) || 0 : 0
}

const CAMPOS_OBJETO: Record<Exclude<Nivel, 'conta'>, { edge: string; fields: string }> = {
  campanha: { edge: 'campaigns', fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,updated_time' },
  conjunto: { edge: 'adsets', fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,updated_time,campaign{id,name}' },
  anuncio: { edge: 'ads', fields: 'id,name,status,effective_status,updated_time,campaign{id,name},adset{id,name}' },
}

type Agg = { gasto: number; impressoes: number; cliques: number; ic: number; vendas: number; upsells: number; receita: number; receita_upsell: number }
const aggVazio = (): Agg => ({ gasto: 0, impressoes: 0, cliques: 0, ic: 0, vendas: 0, upsells: 0, receita: 0, receita_upsell: 0 })

export async function listarMeta(nivel: Nivel, ini: string, fim: string, produto?: string | null): Promise<ResultadoMeta> {
  const cfg = await carregarMetaCfg()
  if (!cfg) throw new Error('Meta Ads não configurado.')
  const { token, contas, configMap } = cfg
  const { fatores } = await resolverFatoresGasto(token, contas, configMap)

  const porConta = await Promise.all(contas.map(async (id) => {
    const act = `act_${id}`
    const obj = nivel === 'conta' ? null : CAMPOS_OBJETO[nivel]
    const statusLista = nivel === 'campanha' ? STATUS_LISTADOS : STATUS_RODANDO
    const [info, objetos, campanhasNomes, ins] = await Promise.all([
      fetch(`${META}/${act}?fields=name,currency,account_status&access_token=${token}`, { cache: 'no-store' }).then((r) => r.json()),
      obj ? metaGetAll(`${META}/${act}/${obj.edge}?${new URLSearchParams({
        fields: obj.fields,
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: statusLista }]),
        limit: '500',
        access_token: token,
      })}`) : Promise.resolve([]),
      // Nome de todas as campanhas: venda de campanha sem gasto no período (ex.:
      // upsell de um front de outro dia) ainda cai na campanha certa em qualquer aba.
      nivel === 'campanha' ? Promise.resolve([]) : metaGetAll(`${META}/${act}/campaigns?${new URLSearchParams({
        fields: 'id,name',
        filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: STATUS_LISTADOS }]),
        limit: '500',
        access_token: token,
      })}`),
      // Nível ANÚNCIO sempre: é nele que a venda casa (chave do criativo), e dele
      // se soma pra conjunto/campanha/conta.
      metaGetAll(`${META}/${act}/insights?${new URLSearchParams({
        level: 'ad',
        fields: 'campaign_id,campaign_name,adset_id,ad_id,ad_name,spend,impressions,inline_link_clicks,actions',
        time_range: JSON.stringify({ since: ini, until: fim }),
        limit: '500',
        access_token: token,
      })}`),
    ])
    if (info.error) throw new Error(info.error.message)
    if (obj && nivel !== 'campanha') {
      const campoId = nivel === 'conjunto' ? 'adset_id' : 'ad_id'
      const listados = new Set(objetos.map((o) => o.id))
      const faltando = [...new Set(ins.filter((i) => (parseFloat(i.spend) || 0) > 0).map((i) => i[campoId] as string))].filter((x) => !listados.has(x))
      if (faltando.length) objetos.push(...(await buscarPorIds(faltando, obj.fields, token)))
    }
    return { id, nome: info.name as string, moeda: info.currency as string, accountStatus: Number(info.account_status), objetos, campanhasNomes, ins }
  }))

  // Vendas de anúncio no período (bordas do dia em SP).
  const todasVendas = await fetchAll<{ criativo: string; sck: string | null; valor: number; valor_liquido: number | null; tipo: string | null; produto: string | null }>((f, t) =>
    supabaseAdmin.from('vendas')
      .select('criativo, sck, valor, valor_liquido, tipo, produto')
      .in('status', STATUS_RECEITA)
      .not('transaction_id', 'like', 'manual_%')
      .not('criativo', 'is', null)
      .gte('data', `${ini}T00:00:00-03:00`)
      .lte('data', `${fim}T23:59:59.999-03:00`)
      .range(f, t))
  const produtos = [...new Set(todasVendas.map((v) => v.produto).filter((p): p is string => !!p))].sort()
  const vendas = produto ? todasVendas.filter((v) => v.produto === produto) : todasVendas

  // —— Agregação dos insights (anúncio → conjunto → campanha → conta) ——
  const aggAd = new Map<string, Agg>(), aggSet = new Map<string, Agg>(), aggCamp = new Map<string, Agg>(), aggConta = new Map<string, Agg>()
  const pegar = (m: Map<string, Agg>, k: string) => { let a = m.get(k); if (!a) m.set(k, (a = aggVazio())); return a }
  type AdInfo = { ad_id: string; adset_id: string; campaign_id: string; conta: string; gasto: number }
  const adsPorChave = new Map<string, AdInfo[]>()
  const campPorToken = new Map<string, { campaign_id: string; conta: string; gasto: number }>()
  const insResolver: { criativo: string | null; campaign_name: string | null; ad_name: string | null }[] = []

  for (const c of porConta) {
    const fator = fatores.get(c.id) ?? 1
    for (const i of c.ins) {
      const g = (parseFloat(i.spend) || 0) * fator
      const imp = parseInt(i.impressions) || 0
      const cli = parseInt(i.inline_link_clicks) || 0
      const ic = extrairIC(i.actions)
      for (const a of [pegar(aggAd, i.ad_id), pegar(aggSet, i.adset_id), pegar(aggCamp, i.campaign_id), pegar(aggConta, c.id)]) {
        a.gasto += g; a.impressoes += imp; a.cliques += cli; a.ic += ic
      }
      const criativo = extrairCriativo(i.ad_name)
      insResolver.push({ criativo, campaign_name: i.campaign_name, ad_name: i.ad_name })
      if (criativo) {
        const k = chaveDoAnuncio(criativo, i.campaign_name, i.ad_name)
        const lista = adsPorChave.get(k) ?? []
        lista.push({ ad_id: i.ad_id, adset_id: i.adset_id, campaign_id: i.campaign_id, conta: c.id, gasto: g })
        adsPorChave.set(k, lista)
      }
      const tk = campanhaToken(i.campaign_name)
      const atual = campPorToken.get(tk)
      if (!atual || g > atual.gasto) campPorToken.set(tk, { campaign_id: i.campaign_id, conta: c.id, gasto: g })
    }
    // Campanhas sem gasto no período também recebem venda pelo nome.
    for (const o of nivel === 'campanha' ? c.objetos : c.campanhasNomes) {
      const tk = campanhaToken(o.name)
      if (!campPorToken.has(tk)) campPorToken.set(tk, { campaign_id: o.id, conta: c.id, gasto: 0 })
    }
  }

  // —— Vendas → anúncio (ou só campanha) ——
  const chaves = criarResolvedor(insResolver)
  const semCampanha = { vendas: 0, receita: 0 }
  for (const v of vendas) {
    const liq = Number(v.valor_liquido ?? v.valor) || 0
    const front = v.tipo !== 'upsell'
    const somar = (a: Agg) => {
      a.receita += liq
      if (front) a.vendas++
      else { a.upsells++; a.receita_upsell += liq }
    }
    const key = chaves.doVenda(v.criativo, v.sck)
    const ads = adsPorChave.get(key)
    if (ads?.length) {
      // Mesmo criativo duplicado em conjuntos da mesma campanha: vai pro de maior gasto.
      const ad = ads.reduce((m, x) => (x.gasto > m.gasto ? x : m))
      for (const a of [pegar(aggAd, ad.ad_id), pegar(aggSet, ad.adset_id), pegar(aggCamp, ad.campaign_id), pegar(aggConta, ad.conta)]) somar(a)
      continue
    }
    const camp = campPorToken.get(key.split('|')[3] ?? '')
    if (camp) { somar(pegar(aggCamp, camp.campaign_id)); somar(pegar(aggConta, camp.conta)) }
    else { semCampanha.receita += liq; if (front) semCampanha.vendas++ }
  }

  // —— Linhas do nível pedido ——
  const linhas: LinhaMeta[] = []
  for (const c of porConta) {
    const div = divisor(c.moeda)
    const base = { conta_id: c.id, conta_nome: c.nome, moeda: c.moeda }
    if (nivel === 'conta') {
      const ativa = c.accountStatus === 1
      linhas.push({
        ...base, id: c.id, nivel, nome: c.nome, campanha_id: null, campanha_nome: null, conjunto_id: null, conjunto_nome: null,
        fase: null, status: ativa ? 'ACTIVE' : 'DISABLED', status_efetivo: ativa ? 'ACTIVE' : 'DISABLED',
        orcamento_tipo: null, orcamento: null, atualizado_em: null, ...(aggConta.get(c.id) ?? aggVazio()),
      })
      continue
    }
    for (const o of c.objetos) {
      const daily = o.daily_budget ? Number(o.daily_budget) / div : null
      const life = o.lifetime_budget ? Number(o.lifetime_budget) / div : null
      let orcamento_tipo: OrcamentoTipo = daily != null ? 'diario' : life != null ? 'vitalicio' : null
      if (!orcamento_tipo && nivel === 'campanha') orcamento_tipo = 'conjuntos'
      if (!orcamento_tipo && nivel === 'conjunto') orcamento_tipo = 'campanha'
      const agg = (nivel === 'campanha' ? aggCamp : nivel === 'conjunto' ? aggSet : aggAd).get(o.id) ?? aggVazio()
      const campNome = nivel === 'campanha' ? o.name : o.campaign?.name ?? null
      linhas.push({
        ...base,
        id: o.id,
        nivel,
        nome: o.name,
        campanha_id: nivel === 'campanha' ? o.id : o.campaign?.id ?? null,
        campanha_nome: campNome,
        conjunto_id: nivel === 'conjunto' ? o.id : o.adset?.id ?? null,
        conjunto_nome: nivel === 'conjunto' ? o.name : o.adset?.name ?? null,
        fase: faseToken(campNome),
        status: o.status,
        status_efetivo: o.effective_status,
        orcamento_tipo,
        orcamento: daily ?? life,
        atualizado_em: o.updated_time ?? null,
        ...agg,
      })
    }
  }

  return { linhas, semCampanha, produtos, atualizado_em: new Date().toISOString() }
}

// ———————————————————————— Edição ————————————————————————

export type Alteracao =
  | { acao: 'status'; nivel?: Nivel; status: 'ACTIVE' | 'PAUSED' }
  | { acao: 'orcamento'; nivel?: Nivel; valor: number }

export interface LogCampanha {
  em: string
  por: string | null
  nivel?: Nivel
  campanha_id: string            // id do objeto alterado (campanha, conjunto ou anúncio)
  campanha: string               // nome do objeto alterado
  acao: 'status' | 'orcamento'
  de: string | number | null
  para: string | number
}

export async function alterarObjeto(id: string, alt: Alteracao, por: string | null): Promise<{ ok: true; log: LogCampanha }> {
  if (!/^\d+$/.test(id)) throw new Error('id inválido')
  const nivel: Nivel = alt.nivel ?? 'campanha'
  if (nivel === 'conta') throw new Error('Conta não pode ser alterada por aqui.')
  if (alt.acao === 'orcamento' && nivel === 'anuncio') throw new Error('Anúncio não tem orçamento.')
  const cfg = await carregarMetaCfg()
  if (!cfg) throw new Error('Meta Ads não configurado.')
  const { token } = cfg

  const campos = nivel === 'anuncio' ? 'name,status,account_id' : 'name,status,daily_budget,lifetime_budget,account_id'
  const atual = await fetch(`${META}/${id}?fields=${campos}&access_token=${token}`, { cache: 'no-store' }).then((r) => r.json())
  if (atual.error) throw new Error(atual.error.message)
  // Só mexe em objeto das contas que o painel gerencia.
  if (!cfg.contas.includes(String(atual.account_id))) throw new Error('Fora das contas conectadas.')

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
    if (!campo) throw new Error(nivel === 'campanha'
      ? 'O orçamento desta campanha fica nos conjuntos (ABO) — edite na aba Conjuntos.'
      : 'O orçamento deste conjunto fica na campanha (CBO) — edite na aba Campanhas.')
    const conta = await fetch(`${META}/act_${atual.account_id}?fields=currency&access_token=${token}`, { cache: 'no-store' }).then((r) => r.json())
    const div = divisor(conta.currency ?? 'BRL')
    body.set(campo, String(Math.round(valor * div)))
    de = Number(atual[campo]) / div
    para = valor
  }

  const r = await fetch(`${META}/${id}`, { method: 'POST', body, cache: 'no-store' })
  const j = await r.json()
  if (j.error) throw new Error(j.error.error_user_msg || j.error.message)

  const log: LogCampanha = { em: new Date().toISOString(), por, nivel, campanha_id: id, campanha: atual.name, acao: alt.acao, de, para }
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
