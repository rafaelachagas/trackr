// ============================================================
// Tipos TypeScript - ROAS Dashboard
// ============================================================

export type TipoVenda = 'front' | 'upsell'
export type StatusVenda = 'approved' | 'refunded' | 'chargeback' | 'pending' | 'cancelled'
export type StatusVsl = 'ativo' | 'pausado' | 'arquivado'

export interface Venda {
  id: string
  transaction_id: string
  data: string
  valor: number
  valor_centavos: number
  moeda: string
  produto: string
  tipo: TipoVenda
  status: StatusVenda
  buyer_email?: string
  sck?: string
  criativo?: string
  vsl?: string
  venda_front_id?: string
  raw_payload?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Gasto {
  id: string
  data: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  criativo?: string
  valor_gasto: number
  impressions: number
  clicks: number
  cpc?: number
  created_at: string
}

export interface Vsl {
  id: string
  vturb_video_id?: string
  nome: string
  descricao?: string
  status: StatusVsl
  created_at: string
}

export interface VturbConversion {
  id: string
  vturb_video_id: string
  vsl_nome?: string
  conversion_key?: string
  data?: string
  valor_centavos?: number
  created_at: string
}

export interface Configuracao {
  id: string
  chave: string
  valor?: string
  updated_at: string
}

export interface ProdutoMapeamento {
  id: string
  nome_produto: string
  tipo: TipoVenda
  ativo: boolean
  created_at: string
}

export interface SyncLog {
  id: string
  tipo: 'meta' | 'vturb'
  status: 'sucesso' | 'erro' | 'em_andamento'
  mensagem?: string
  registros_processados: number
  created_at: string
}

// ============================================================
// DTOs de API
// ============================================================

export interface ResumoDashboard {
  receita_total: number
  gasto_total: number
  lucro: number
  roas: number
  total_vendas: number
  total_upsells: number
  ticket_medio: number
  taxa_upsell: number
}

export interface RoasPorCriativo {
  criativo: string
  ad_name: string
  campaign_name: string | null
  fase: string | null
  vendas: number
  upsells: number
  receita: number
  gasto: number
  roas_7d: number | null
  roas_3d: number | null
  roas_1d: number | null
  roas: number
  acao: AcaoOtimizacao
}

export interface RoasPorVsl {
  vsl: string
  vendas: number
  receita: number
  rpv: number // Receita por visualização
  conversao_pct: number
}

export interface RoasDiario {
  data: string
  receita: number
  gasto: number
  roas: number
  vendas: number
}

export interface CombinacaoCriativoVsl {
  criativo: string
  vsl: string
  vendas: number
  upsells: number
  receita: number
  gasto: number
  roas: number
}

export type AcaoOtimizacao =
  | '+20% orçamento'
  | 'Manter'
  | '-20% ou pausar'
  | 'Pausar'

export interface FrameworkCriativo {
  criativo: string
  roas_7d: number | null
  roas_3d: number | null
  roas_1d: number | null
  positivo_7d: boolean
  positivo_3d: boolean
  positivo_1d: boolean
  acao: AcaoOtimizacao
  receita_7d: number
  gasto_7d: number
  vendas_7d: number
}

// ============================================================
// Payloads Externos
// ============================================================

export interface HotmartWebhookPayload {
  event: string
  data: {
    purchase: {
      transaction: string
      order_date: number
      approved_date?: number
      original_offer_price?: {
        value: number
        currency_value: string
      }
      price?: {
        value: number
        currency_value?: string
      }
      status: string
      sckPaymentLink?: string
      tracking?: {
        source_sck?: string
        source?: string
        utm_campaign?: string
        utm_content?: string
      }
      payment?: {
        installments_number?: number
        type?: string
      }
    }
    product: {
      id: number
      name: string
      has_co_production: boolean
    }
    buyer: {
      name: string
      email: string
      checkout_phone?: string
    }
    commissions?: Array<{
      source?: string
      // No webhook o valor costuma vir como número direto; deixamos flexível.
      value?: number | { value?: number }
      currency_value?: string
    }>
  }
}

export interface MetaAdInsight {
  campaign_id: string
  campaign_name: string
  adset_id: string
  adset_name: string
  ad_id: string
  ad_name: string
  spend: string
  impressions: string
  clicks: string
  cpc?: string
  date_start: string
  date_stop: string
}

// ============================================================
// Período do Dashboard
// ============================================================

export type PeriodoDashboard = '1d' | '3d' | '7d' | '14d' | '30d' | 'custom'

export interface FiltroDashboard {
  periodo: PeriodoDashboard
  data_inicio?: string
  data_fim?: string
  criativo?: string
  vsl?: string
  campanha?: string
}
