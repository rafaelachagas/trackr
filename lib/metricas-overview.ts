// Catálogo de TUDO que pode aparecer no Overview — usado pelo editor de layout
// (lápis na Topbar, estilo Utmify): os 8 cards de métrica do topo E as seções
// grandes da página (gráficos, painéis, tabelas). Adicionar um bloco novo ao
// dashboard = só adicionar uma entrada aqui + o case correspondente em
// components/dashboard/BlocoById.tsx.

export type BlocoId =
  | 'revenue' | 'spend' | 'roas' | 'lucro' | 'imposto' | 'reembolso' | 'cpm' | 'cpa'
  | 'grafico-diario' | 'vendas-por-tipo' | 'vendas-extra' | 'vendas-por-produto' | 'vendas-por-pagamento' | 'graficos-por-hora'
  | 'funil-conversao'
  | 'tabela-criativos-v2' | 'tabela-criativos' | 'historico-criativos'

// Compat com código antigo que ainda usa o nome anterior.
export type MetricaId = BlocoId

export type CategoriaBloco = 'Geral' | 'Impostos e Reembolsos' | 'Tráfego pago' | 'Gráficos' | 'Vendas' | 'Criativos'

// Quantas colunas (de 12) o bloco ocupa em telas grandes — no mobile tudo vira
// largura cheia. 3 = do tamanho de um card de métrica (4 por linha), 12 = full.
export type SpanBloco = 3 | 4 | 6 | 8 | 12

export interface BlocoDef {
  id: BlocoId
  categoria: CategoriaBloco
  label: string
  span: SpanBloco
}

export const CATALOGO_METRICAS: BlocoDef[] = [
  { id: 'revenue', categoria: 'Geral', label: 'Faturamento Líquido', span: 3 },
  { id: 'spend', categoria: 'Geral', label: 'Gastos com anúncios', span: 3 },
  { id: 'roas', categoria: 'Geral', label: 'ROAS', span: 3 },
  { id: 'lucro', categoria: 'Geral', label: 'Lucro', span: 3 },
  { id: 'imposto', categoria: 'Impostos e Reembolsos', label: 'Imposto total', span: 3 },
  { id: 'reembolso', categoria: 'Impostos e Reembolsos', label: 'Reembolsos', span: 3 },
  { id: 'cpm', categoria: 'Tráfego pago', label: 'CPM médio', span: 3 },
  { id: 'cpa', categoria: 'Tráfego pago', label: 'CPA médio', span: 3 },
  { id: 'grafico-diario', categoria: 'Gráficos', label: 'Receita vs Gasto + ROAS Diário', span: 8 },
  { id: 'vendas-por-tipo', categoria: 'Gráficos', label: 'Vendas por Tipo', span: 4 },
  { id: 'vendas-por-produto', categoria: 'Vendas', label: 'Vendas por Produto', span: 6 },
  { id: 'vendas-por-pagamento', categoria: 'Vendas', label: 'Vendas por Pagamento', span: 6 },
  { id: 'graficos-por-hora', categoria: 'Gráficos', label: 'Gráficos por Hora', span: 12 },
  { id: 'funil-conversao', categoria: 'Gráficos', label: 'Funil de Conversão (Meta Ads)', span: 12 },
  { id: 'tabela-criativos-v2', categoria: 'Criativos', label: 'Performance por Criativo', span: 12 },
  // 'tabela-criativos' (Performance por Criativo MANUAL) removido do catálogo —
  // hoje os criativos são puxados automaticamente (tabela-criativos-v2).
  { id: 'historico-criativos', categoria: 'Criativos', label: 'Histórico de Criativos', span: 12 },
]

// Ordem/seleção padrão — o que já temos hoje. "Redefinir configurações" volta pra isto.
export const LAYOUT_PADRAO: BlocoId[] = [
  'revenue', 'spend', 'roas', 'lucro', 'imposto', 'reembolso', 'cpm', 'cpa',
  'grafico-diario', 'vendas-por-tipo', 'vendas-por-produto', 'vendas-por-pagamento', 'graficos-por-hora',
  'funil-conversao',
  'tabela-criativos-v2', 'historico-criativos',
]

export function chaveLayout(device: 'desktop' | 'mobile') {
  return `overview_layout_${device}`
}
