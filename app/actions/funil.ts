'use server'

// Análise de Funil — cadastro de funis, observações por dia e relatório IA.
// Um funil = produto front + orderbumps + upsells (nomes iguais aos de
// vendas.produto) + VSL vinculada + filtro opcional de campanhas. Precisa do
// supabase_funil.sql rodado; sem ele as actions degradam com mensagem clara.

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import { chamarLLM, llmDisponivel } from '@/lib/llm'

export interface Funil {
  id: string
  nome: string
  produto_front: string
  orderbumps: string[]
  upsells: string[]
  vsl_id: string | null
  campanhas: string[]   // campaign_name; [] = todas
  ativo: boolean
}

const SEM_TABELA = 'Tabela de funis ainda não existe — rode o supabase_funil.sql no SQL Editor do Supabase.'
const ehSemTabela = (e: any) => e?.code === 'PGRST205' || /schema cache|does not exist/i.test(e?.message ?? '')

function normalizarFunil(f: any): Funil {
  return {
    id: f.id, nome: f.nome, produto_front: f.produto_front,
    orderbumps: Array.isArray(f.orderbumps) ? f.orderbumps : [],
    upsells: Array.isArray(f.upsells) ? f.upsells : [],
    vsl_id: f.vsl_id ?? null,
    campanhas: Array.isArray(f.campanhas) ? f.campanhas : [],
    ativo: !!f.ativo,
  }
}

export async function listarFunis(): Promise<{ success: boolean; data: Funil[]; error?: string; precisaSql?: boolean }> {
  try {
    const { data, error } = await supabaseAdmin.from('funis').select('*').order('created_at', { ascending: true })
    if (error) throw error
    return { success: true, data: (data ?? []).map(normalizarFunil) }
  } catch (e: any) {
    if (ehSemTabela(e)) return { success: false, error: SEM_TABELA, data: [], precisaSql: true }
    return { success: false, error: e.message, data: [] }
  }
}

export async function salvarFunil(input: {
  id?: string
  nome: string
  produto_front: string
  orderbumps: string[]
  upsells: string[]
  vsl_id: string | null
  campanhas: string[]
}): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    if (!input.nome.trim()) throw new Error('Dê um nome pro funil.')
    if (!input.produto_front.trim()) throw new Error('Escolha o produto front.')
    const row = {
      nome: input.nome.trim(),
      produto_front: input.produto_front,
      orderbumps: input.orderbumps ?? [],
      upsells: input.upsells ?? [],
      vsl_id: input.vsl_id || null,
      campanhas: input.campanhas ?? [],
    }
    if (input.id) {
      const { error } = await supabaseAdmin.from('funis').update(row).eq('id', input.id)
      if (error) throw error
      return { success: true, id: input.id }
    }
    const { data, error } = await supabaseAdmin.from('funis').insert({ ...row, org_id: orgId }).select('id').single()
    if (error) throw error
    return { success: true, id: data.id }
  } catch (e: any) {
    if (ehSemTabela(e)) return { success: false, error: SEM_TABELA }
    return { success: false, error: e.message }
  }
}

export async function excluirFunil(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin.from('funis').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Opções pros selects do formulário: produtos distintos das vendas + campanhas
// distintas dos gastos. Pagina em blocos de 1000 (teto do PostgREST).
export async function opcoesFormFunil(): Promise<{ produtos: string[]; campanhas: string[] }> {
  const produtos = new Set<string>()
  const campanhas = new Set<string>()
  for (let off = 0; off < 50_000; off += 1000) {
    const { data } = await supabaseAdmin.from('vendas').select('produto').not('produto', 'is', null).range(off, off + 999)
    if (!data?.length) break
    for (const v of data) if (v.produto) produtos.add(v.produto)
    if (data.length < 1000) break
  }
  for (let off = 0; off < 50_000; off += 1000) {
    const { data } = await supabaseAdmin.from('gastos').select('campaign_name').not('campaign_name', 'is', null).range(off, off + 999)
    if (!data?.length) break
    for (const g of data) if (g.campaign_name) campanhas.add(g.campaign_name)
    if (data.length < 1000) break
  }
  return { produtos: [...produtos].sort(), campanhas: [...campanhas].sort() }
}

export async function salvarObservacaoFunil(funilId: string, data: string, texto: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from('funil_observacoes')
      .upsert({ funil_id: funilId, data, texto, updated_at: new Date().toISOString() }, { onConflict: 'funil_id,data' })
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    if (ehSemTabela(e)) return { success: false, error: SEM_TABELA }
    return { success: false, error: e.message }
  }
}

// Relatório IA — recebe os números já agregados pela página (mesmos da tela,
// sem refazer query) e devolve diagnóstico + projeções de melhoria.
export async function gerarRelatorioFunilIA(input: {
  funilNome: string
  periodo: string
  investimento: number
  faturamentoFront: number
  faturamentoFunil: number
  vendasFront: number
  vendasTotais: number
  cpa: number | null
  roi: number | null
  lucro: number
  aov: number | null
  impressoes: number
  cliques: number
  lpViews: number
  checkouts: number
  ctr: number | null
  cpm: number | null
  custoPorLp: number | null
  custoPorCheckout: number | null
  taxaCarregamento: number | null     // LP views ÷ cliques
  passagemCheckout: number | null     // checkouts ÷ LP views
  checkoutVenda: number | null        // vendas front ÷ checkouts
  reembolsos: number
  taxaReembolso: number | null
  orderbumps: { nome: string; qtd: number; faturamento: number; conversao: number | null }[]
  upsells: { nome: string; qtd: number; faturamento: number; conversao: number | null }[]
  vturb: { playRate: number | null; retencaoPitch: number | null; audienciaPitch: number | null; pitchCheckout: number | null; pitchVenda: number | null } | null
}): Promise<{ success: boolean; texto?: string; error?: string }> {
  if (!(await llmDisponivel())) {
    return { success: false, error: 'IA não configurada — escolha um modelo e cole a chave em Configurações → IA.' }
  }
  const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')}%`)
  const num = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))

  const prompt = `Você é um analista sênior de funis de venda direta (VSL + front + orderbumps + upsell) de infoproduto no Brasil. Analise o funil "${input.funilNome}" no período ${input.periodo} e escreva um relatório curto e acionável pra dona do negócio (não-técnica).

NÚMEROS DO PERÍODO:
Tráfego: ${num(input.impressoes)} impressões, ${num(input.cliques)} cliques (CTR ${pct(input.ctr)}, CPM ${input.cpm != null ? brl(input.cpm) : '—'}), ${num(input.lpViews)} LP views (taxa de carregamento ${pct(input.taxaCarregamento)}, custo/LP ${input.custoPorLp != null ? brl(input.custoPorLp) : '—'}), ${num(input.checkouts)} checkouts iniciados (passagem pro checkout ${pct(input.passagemCheckout)}, custo/IC ${input.custoPorCheckout != null ? brl(input.custoPorCheckout) : '—'}).
${input.vturb ? `VSL: Play Rate ${pct(input.vturb.playRate)}, Retenção ao Pitch ${pct(input.vturb.retencaoPitch)}, Audiência do Pitch ${num(input.vturb.audienciaPitch)}, Pitch→Checkout ${pct(input.vturb.pitchCheckout)}, Pitch→Venda ${pct(input.vturb.pitchVenda)}.` : 'VSL: sem VTurb vinculado nesse funil.'}
Vendas: ${num(input.vendasFront)} vendas front (Checkout→Venda ${pct(input.checkoutVenda)}), ${num(input.vendasTotais)} vendas totais no funil.
Orderbumps: ${input.orderbumps.length ? input.orderbumps.map((o) => `${o.nome}: ${o.qtd} vendas, ${brl(o.faturamento)}, conversão ${pct(o.conversao)}`).join(' | ') : 'nenhum cadastrado'}.
Upsells: ${input.upsells.length ? input.upsells.map((u) => `${u.nome}: ${u.qtd} vendas, ${brl(u.faturamento)}, conversão ${pct(u.conversao)}`).join(' | ') : 'nenhum cadastrado'}.
Financeiro: investimento ${brl(input.investimento)}, faturamento front ${brl(input.faturamentoFront)}, faturamento total do funil ${brl(input.faturamentoFunil)}, CPA ${input.cpa != null ? brl(input.cpa) : '—'}, ROI ${num(input.roi)}, lucro ${brl(input.lucro)}, AOV ${input.aov != null ? brl(input.aov) : '—'}, ${num(input.reembolsos)} reembolsos (taxa ${pct(input.taxaReembolso)}).

ESCREVA em português do Brasil, como um FRAGMENTO DE HTML (sem <html>/<head>/<body>, sem markdown, sem cercas de código) usando SOMENTE as tags <h3>, <p>, <ul>, <li>, <b>:
1. <h3>Diagnóstico</h3> — qual etapa do funil é o maior gargalo hoje e por quê (compare as taxas entre si; benchmarks de VSL no Brasil: CTR 1-2% ok, passagem pro checkout 2-5% da LP, checkout→venda 20-40%, play rate 50-70%, retenção ao pitch 15-30%).
2. <h3>Alavancas</h3> — as 2-3 melhorias mais promissoras em ordem de prioridade (como <ul>), e pra cada uma: se melhorar X% (número realista), quanto isso adicionaria de faturamento no período, mantendo o investimento fixo — mostre a conta de forma simples e destaque os valores com <b>.
3. <h3>Orderbumps e Upsell</h3> — (se os dados existirem) qual está carregando o funil e qual está fraco.
Máximo ~400 palavras. Comece direto no diagnóstico, sem saudação nem introdução.`

  // Gemini 3.x gasta "thinking" dentro do maxOutputTokens — teto baixo corta o
  // texto no meio (relatório saía só com a 1ª frase). Folga generosa aqui.
  const r = await chamarLLM({ prompt, maxTokens: 6000, temperatura: 0.5 })
  if (!r.ok) return { success: false, error: r.erro || 'Falha ao chamar a IA.' }
  return { success: true, texto: sanitizarHtmlRelatorio(r.texto) }
}

// Só as tags que o prompt permite sobrevivem — qualquer outra (script, img,
// style, atributos...) é removida antes do dangerouslySetInnerHTML na página.
function sanitizarHtmlRelatorio(html: string): string {
  let s = html.trim()
  const cerca = s.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (cerca) s = cerca[1].trim()
  return s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag) => {
    const t = String(tag).toLowerCase()
    if (!['h3', 'p', 'ul', 'li', 'b', 'strong', 'em', 'i', 'br'].includes(t)) return ''
    return m.startsWith('</') ? `</${t}>` : `<${t}>`
  })
}
