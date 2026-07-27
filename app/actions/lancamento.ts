'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'
import { chaveDoGasto } from '@/lib/meta-chave'
import { revalidatePath } from 'next/cache'

async function getActiveOrgId(passedOrgId?: string): Promise<string | null> {
  // Se veio um UUID válido do cliente, usa
  if (passedOrgId && /^[0-9a-f-]{36}$/i.test(passedOrgId)) return passedOrgId

  // Fallback: pega a primeira org do usuário logado via sessão do servidor
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabaseAdmin
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  return data?.org_id ?? null
}

export async function adicionarVenda(payload: {
  data: string
  criativo: string
  produto: string
  valor: number
  org_id: string
}) {
  // Trava: não permite duplicata de criativo+produto no mesmo dia
  const { data: existente } = await supabaseAdmin
    .from('vendas')
    .select('id')
    .like('transaction_id', 'manual_%')
    .eq('criativo', payload.criativo)
    .eq('produto', payload.produto)
    .gte('data', `${payload.data}T00:00:00`)
    .lte('data', `${payload.data}T23:59:59`)
    .limit(1)
    .single()

  if (existente) {
    return { success: false, error: `Já existe um lançamento de "${payload.produto}" para este criativo nesta data.` }
  }

  const orgId = await getActiveOrgId(payload.org_id)
  if (!orgId) return { success: false, error: 'Organização não encontrada.' }

  const { error } = await supabaseAdmin.from('vendas').insert({
    data: `${payload.data}T12:00:00`,
    criativo: payload.criativo,
    produto: payload.produto,
    valor: payload.valor,
    valor_liquido: payload.valor,
    status: 'approved',
    tipo: 'front',
    transaction_id: `manual_${Date.now()}`,
    org_id: orgId,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true }
}

export async function adicionarGasto(payload: {
  data: string
  criativo: string
  campanha?: string
  valor_gasto: number
  org_id: string
}) {
  // Trava: não permite duplicata de criativo no mesmo dia
  const { data: existente } = await supabaseAdmin
    .from('gastos')
    .select('id')
    .is('ad_id', null)
    .eq('criativo', payload.criativo)
    .eq('data', payload.data)
    .limit(1)
    .single()

  if (existente) {
    return { success: false, error: `Já existe um gasto lançado para este criativo nesta data.` }
  }

  const orgId = await getActiveOrgId(payload.org_id)
  if (!orgId) return { success: false, error: 'Organização não encontrada.' }

  const { error } = await supabaseAdmin.from('gastos').insert({
    data: payload.data,
    criativo: payload.criativo,
    ad_name: `${payload.criativo}_manual_${Date.now()}`,
    campaign_name: payload.campanha ?? null,
    valor_gasto: payload.valor_gasto,
    impressions: 0,
    clicks: 0,
    org_id: orgId,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true }
}

export async function editarVenda(id: string, payload: { valor: number; produto: string; data: string; criativo?: string }) {
  const update: Record<string, unknown> = {
    valor: payload.valor,
    valor_liquido: payload.valor,
    produto: payload.produto,
    data: `${payload.data}T12:00:00`,
  }
  if (payload.criativo !== undefined) update.criativo = payload.criativo
  const { error } = await supabaseAdmin
    .from('vendas')
    .update(update)
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true }
}

export async function editarGasto(id: string, payload: { valor_gasto: number; data: string }) {
  const { error } = await supabaseAdmin
    .from('gastos')
    .update({ valor_gasto: payload.valor_gasto, data: payload.data })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true }
}

// Troca o DIA de um lote de lançamentos MANUAIS (ex: lancei como dia 22 o que era
// dia 18 — corrige a data). Guardado a manuais: vendas por transaction_id manual_%,
// gastos por ad_id null. Não toca dado real da Meta/Hotmart.
// vendas.data é timestamptz (ancora no meio-dia, igual create/edit); gastos.data é DATE.
export async function trocarDiaDosLancamentos(tipo: 'vendas' | 'gastos', ids: string[], novaData: string) {
  if (!ids.length) return { success: false, error: 'Nenhum lançamento para mover.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { success: false, error: 'Data inválida.' }

  if (tipo === 'vendas') {
    const { error, count } = await supabaseAdmin
      .from('vendas')
      .update({ data: `${novaData}T12:00:00` }, { count: 'exact' })
      .in('id', ids)
      .like('transaction_id', 'manual_%')
    if (error) return { success: false, error: error.message }
    revalidatePath('/lancamento')
    return { success: true, movidos: count ?? 0 }
  }

  const { error, count } = await supabaseAdmin
    .from('gastos')
    .update({ data: novaData }, { count: 'exact' })
    .in('id', ids)
    .is('ad_id', null)
  if (error) return { success: false, error: error.message }
  revalidatePath('/lancamento')
  return { success: true, movidos: count ?? 0 }
}

const PAGE_SIZE = 1000

export async function listarVendasManuais(page = 0) {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const { data, error } = await supabaseAdmin
    .from('vendas')
    .select('id, data, criativo, produto, valor')
    .like('transaction_id', 'manual_%')
    .order('data', { ascending: false })
    .range(from, to)
  if (error) return { success: false, data: [], hasMore: false }
  return { success: true, data: data ?? [], hasMore: (data?.length ?? 0) === PAGE_SIZE }
}

export async function listarGastosManuais(page = 0) {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const { data, error } = await supabaseAdmin
    .from('gastos')
    .select('id, data, criativo, campaign_name, valor_gasto')
    .is('ad_id', null)
    .order('data', { ascending: false })
    .range(from, to)
  if (error) return { success: false, data: [], hasMore: false }
  return { success: true, data: data ?? [], hasMore: (data?.length ?? 0) === PAGE_SIZE }
}

export async function deletarVenda(id: string) {
  const { error } = await supabaseAdmin.from('vendas').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deletarGasto(id: string) {
  const { error } = await supabaseAdmin.from('gastos').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function limparTodasVendas() {
  const { error } = await supabaseAdmin.from('vendas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function limparTodosGastos() {
  const { error } = await supabaseAdmin.from('gastos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function getProdutos() {
  const { data } = await supabaseAdmin
    .from('produtos_mapeamento')
    .select('nome_produto')
    .order('nome_produto')
  return data?.map(p => p.nome_produto) ?? []
}

export async function getProdutosMapeamento() {
  const { data } = await supabaseAdmin
    .from('produtos_mapeamento')
    .select('nome_produto, tipo')
    .order('tipo', { ascending: false }) // 'front' antes de 'upsell'
  return data ?? []
}

type ItemImport = {
  criativo: string
  campanha?: string | null
  vendaFront?: number
  vendaUpsell?: number
  gasto?: number
  data?: string // yyyy-MM-dd — se ausente, usa payload.data (lote de dia único)
}

// Importa um lote de lançamentos. Cada item pode ter a SUA data (importação
// multi-dia por planilha); se o item não trouxer data, usa payload.data como
// fallback (lote de dia único / texto colado). Reaproveita as mesmas travas de
// duplicata do lançamento manual.
export async function importarLancamentosEmLote(payload: {
  data: string
  produtoFront: string
  produtoUpsell: string
  itens: ItemImport[]
}) {
  const orgId = await getActiveOrgId()
  if (!orgId) return { success: false, error: 'Organização não encontrada.', resumo: null }

  const resumo = {
    vendasInseridas: 0,
    gastosInseridos: 0,
    ignorados: 0, // duplicados ou linhas sem criativo
    erros: [] as string[],
  }
  let seq = 0

  async function lancarVenda(dia: string, criativo: string, produto: string, valor?: number) {
    if (!valor || valor <= 0) return
    const { data: existente } = await supabaseAdmin
      .from('vendas')
      .select('id')
      .like('transaction_id', 'manual_%')
      .eq('criativo', criativo)
      .eq('produto', produto)
      .gte('data', `${dia}T00:00:00`)
      .lte('data', `${dia}T23:59:59`)
      .limit(1)
      .maybeSingle()
    if (existente) { resumo.ignorados++; return }

    const { error } = await supabaseAdmin.from('vendas').insert({
      data: `${dia}T12:00:00`,
      criativo,
      produto,
      valor,
      valor_liquido: valor,
      status: 'approved',
      tipo: 'front',
      transaction_id: `manual_${Date.now()}_${seq++}`,
      org_id: orgId,
    })
    if (error) resumo.erros.push(`${dia} ${criativo} / ${produto}: ${error.message}`)
    else resumo.vendasInseridas++
  }

  for (const item of payload.itens) {
    const criativo = item.criativo?.trim()
    if (!criativo) { resumo.ignorados++; continue }
    const dia = (item.data && /^\d{4}-\d{2}-\d{2}$/.test(item.data)) ? item.data : payload.data

    await lancarVenda(dia, criativo, payload.produtoFront, item.vendaFront)
    await lancarVenda(dia, criativo, payload.produtoUpsell, item.vendaUpsell)

    if (item.gasto && item.gasto > 0) {
      const { data: existente } = await supabaseAdmin
        .from('gastos')
        .select('id')
        .is('ad_id', null)
        .eq('criativo', criativo)
        .eq('data', dia)
        .limit(1)
        .maybeSingle()
      if (existente) {
        resumo.ignorados++
      } else {
        const { error } = await supabaseAdmin.from('gastos').insert({
          data: dia,
          criativo,
          ad_name: `${criativo}_manual_${Date.now()}_${seq++}`,
          campaign_name: item.campanha ?? null,
          valor_gasto: item.gasto,
          impressions: 0,
          clicks: 0,
          org_id: orgId,
        })
        if (error) resumo.erros.push(`${dia} ${criativo} gasto: ${error.message}`)
        else resumo.gastosInseridos++
      }
    }
  }

  revalidatePath('/lancamento')
  return { success: resumo.erros.length === 0, resumo }
}

export type GastoMetaInfo = { valor: number; adName: string | null; criativo: string; campaignName: string | null }

// Gasto REAL da Meta (gastos.ad_id != null) agregado por DIA e por CHAVE de
// criativo (código|fase|flags) — a mesma chave da tela Performance por Criativo.
// Usado pela importação multi-dia para pré-preencher a coluna de gasto sem o
// usuário digitar E para trazer criativos que gastaram mas não venderam no dia.
// Retorna um mapa { `${dia}||${chave}`: { valor, adName, criativo, campaignName } }.
// adName = o anúncio de MAIOR gasto da chave (nome representativo p/ casar o criativo).
export async function buscarGastoMetaPorPeriodo(dataInicio: string, dataFim: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
    return { success: false, mapa: {} as Record<string, GastoMetaInfo> }
  }

  // Acumula valor total + o ad_name de maior gasto por chave/dia.
  const acc = new Map<string, { valor: number; criativo: string; campaignName: string | null; adNames: Map<string, number> }>()
  // Paginação: PostgREST corta em 1000 linhas; vários dias × anúncios passam disso.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from('gastos')
      .select('criativo, campaign_name, ad_name, valor_gasto, data')
      .not('ad_id', 'is', null)
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .range(offset, offset + 999)
    if (error) return { success: false, mapa: {} as Record<string, GastoMetaInfo> }
    if (!data || data.length === 0) break
    for (const g of data) {
      if (!g.criativo) continue
      const chave = chaveDoGasto(g.criativo, g.campaign_name, g.ad_name)
      const k = `${g.data}||${chave}`
      const val = Number(g.valor_gasto) || 0
      let e = acc.get(k)
      if (!e) { e = { valor: 0, criativo: g.criativo, campaignName: g.campaign_name, adNames: new Map() }; acc.set(k, e) }
      e.valor += val
      if (!e.campaignName && g.campaign_name) e.campaignName = g.campaign_name
      if (g.ad_name) e.adNames.set(g.ad_name, (e.adNames.get(g.ad_name) ?? 0) + val)
    }
    if (data.length < 1000) break
  }

  const mapa: Record<string, GastoMetaInfo> = {}
  for (const [k, e] of acc.entries()) {
    let adName: string | null = null, max = -1
    for (const [nome, v] of e.adNames) if (v > max) { max = v; adName = nome }
    mapa[k] = { valor: e.valor, adName, criativo: e.criativo, campaignName: e.campaignName }
  }
  return { success: true, mapa }
}
