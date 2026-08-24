// Catálogo dos cards de métrica do topo do Overview — usado pelo editor de
// layout (lápis na Topbar, estilo Utmify: sidebar de métricas disponíveis +
// canvas com o que já foi adicionado, reordenável, por dispositivo).
// Adicionar um card novo ao dashboard = só adicionar uma entrada aqui.

export type MetricaId =
  | 'revenue' | 'spend' | 'roas' | 'lucro' | 'imposto' | 'reembolso' | 'cpm' | 'cpa'

export type CategoriaMetrica = 'Geral' | 'Impostos e Reembolsos' | 'Tráfego pago'

export interface MetricaDef {
  id: MetricaId
  categoria: CategoriaMetrica
  label: string
}

export const CATALOGO_METRICAS: MetricaDef[] = [
  { id: 'revenue', categoria: 'Geral', label: 'Faturamento Líquido' },
  { id: 'spend', categoria: 'Geral', label: 'Gastos com anúncios' },
  { id: 'roas', categoria: 'Geral', label: 'ROAS' },
  { id: 'lucro', categoria: 'Geral', label: 'Lucro' },
  { id: 'imposto', categoria: 'Impostos e Reembolsos', label: 'Imposto total' },
  { id: 'reembolso', categoria: 'Impostos e Reembolsos', label: 'Reembolsos' },
  { id: 'cpm', categoria: 'Tráfego pago', label: 'CPM médio' },
  { id: 'cpa', categoria: 'Tráfego pago', label: 'CPA médio' },
]

// Ordem/seleção padrão — o que já temos hoje. "Redefinir configurações" volta pra isto.
export const LAYOUT_PADRAO: MetricaId[] = ['revenue', 'spend', 'roas', 'lucro', 'imposto', 'reembolso', 'cpm', 'cpa']

export function chaveLayout(device: 'desktop' | 'mobile') {
  return `overview_layout_${device}`
}
