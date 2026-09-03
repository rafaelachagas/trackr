import { AcaoOtimizacao, PeriodoDashboard } from '@/types'
import { subDays, format, startOfDay, endOfDay } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const TIMEZONE = 'America/Sao_Paulo'

/**
 * Bordas de um intervalo de dias-calendário de São Paulo, como instantes
 * absolutos (Date). Serializa certo pra qualquer fuso — o dia do NEGÓCIO é
 * sempre o de Brasília, não o do navegador. Use SEMPRE isto para montar
 * dateRange/filtros de período. Ver memória fuso-periodo-navegador.
 */
export function spDayRangeInstants(startStr: string, endStr: string): { start: Date; end: Date } {
  return {
    start: fromZonedTime(`${startStr}T00:00:00.000`, TIMEZONE),
    end: fromZonedTime(`${endStr}T23:59:59.999`, TIMEZONE),
  }
}

/** Converte um par de datas yyyy-MM-dd de SP nos ISO (UTC) das bordas do dia. */
export function spRangeISO(startStr: string, endStr: string): { desde: string; ate: string } {
  const { start, end } = spDayRangeInstants(startStr, endStr)
  return { desde: start.toISOString(), ate: end.toISOString() }
}

// ============================================================
// Extração de Criativo
// ============================================================

/**
 * Extrai o código do criativo do SCK ou nome do anúncio
 * Ex: "ad01-video-voce-quer-fazer-uma-grana" → "ad01"
 */
// SCK format: "iz-adv-vendas-f-fase02-pre-escala|cj01|ad12-nome-do-ad"

export function extrairCriativo(texto: string | null | undefined): string | null {
  if (!texto) return null
  const partes = texto.split('|')
  const alvo = partes.length >= 3 ? partes[2] : texto
  const match = alvo.match(/^(ad\d+)/i)
  return match ? match[1].toLowerCase() : null
}

// Nome COMPLETO do criativo (a parte descritiva do sck), ex.:
// "ad74-dia3-da-serie-te-mostrando-rendas-extras-reais-na-internet-pre-escala".
// O sck vem como `campanha|conjunto|criativo-completo`; pegamos a 3ª parte. Em
// imports manuais o próprio campo já é o slug — então cai no texto todo.
export function extrairCriativoCompleto(sck: string | null | undefined): string | null {
  if (!sck) return null
  const partes = sck.split('|')
  const alvo = (partes.length >= 3 ? partes[2] : sck).trim()
  // só conta como criativo se começar com adNN (evita agrupar bio/orgânico)
  return /^ad\d+/i.test(alvo) ? alvo.toLowerCase() : null
}

export function extrairFase(sck: string | null | undefined): string | null {
  if (!sck) return null
  const match = sck.split('|')[0].match(/(fase\d+)/i)
  return match ? match[1].toUpperCase() : null
}

export function extrairCampanha(sck: string | null | undefined): string | null {
  if (!sck) return null
  return sck.split('|')[0] ?? null
}

// ============================================================
// Cálculo de ROAS
// ============================================================

export function calcularRoas(receita: number, gasto: number): number {
  if (gasto === 0) return 0
  return Number((receita / gasto).toFixed(2))
}

// ============================================================
// Framework de Otimização
// ============================================================

export function calcularAcao(
  roas7d: number | null,
  roas3d: number | null,
  roas1d: number | null,
  roasMinimo = 1.0
): AcaoOtimizacao {
  const p7 = roas7d !== null && roas7d >= roasMinimo
  const p3 = roas3d !== null && roas3d >= roasMinimo
  const p1 = roas1d !== null && roas1d >= roasMinimo

  if (p7 && p3 && p1) return '+20% orçamento'
  if (p7 && p3 && !p1) return 'Manter'
  if (p7 && !p3 && !p1) return '-20% ou pausar'
  if (!p7 && p3 && p1) return '+20% orçamento'
  if (!p7 && !p3 && p1) return 'Manter'
  if (!p7 && !p3 && !p1) return 'Pausar'

  return 'Manter'
}

// ============================================================
// Período de datas
// ============================================================

export function getPeriodoDatas(periodo: PeriodoDashboard, dataInicio?: string, dataFim?: string) {
  const agora = toZonedTime(new Date(), TIMEZONE)

  if (periodo === 'custom' && dataInicio && dataFim) {
    return {
      inicio: startOfDay(new Date(dataInicio)).toISOString(),
      fim: endOfDay(new Date(dataFim)).toISOString(),
    }
  }

  const dias: Record<string, number> = {
    '1d': 1,
    '3d': 3,
    '7d': 7,
    '14d': 14,
    '30d': 30,
  }

  const numDias = dias[periodo] ?? 7
  const inicio = startOfDay(subDays(agora, numDias - 1))
  const fim = endOfDay(agora)

  return {
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
  }
}

// ============================================================
// Formatação
// ============================================================

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

export function formatarRoas(roas: number): string {
  return roas.toFixed(2)
}

export function formatarPercentual(valor: number): string {
  return `${valor.toFixed(1)}%`
}

/**
 * Normaliza o método de pagamento (Hotmart `payment.type` ou label cru do Make)
 * num rótulo amigável e estável para agrupar no dashboard.
 * Ex: CREDIT_CARD → Cartão, BILLET → Boleto, PIX → Pix.
 */
export function normalizarPagamento(tipo: string | null | undefined): string | null {
  if (!tipo) return null
  const t = String(tipo).toUpperCase().replace(/[\s-]+/g, '_')
  // Valores reais observados na Hotmart: CREDIT_CARD, PIX, BILLET, PAYPAL,
  // APPLE_PAY, GOOGLE_PAY, SAMSUNG_PAY, DIRECT_DEBIT, PICPAY, WALLET.
  if (t.includes('PIX')) return 'Pix'
  if (t.includes('BILLET') || t.includes('BOLETO')) return 'Boleto'
  if (t.includes('APPLE')) return 'Apple Pay'
  if (t.includes('GOOGLE')) return 'Google Pay'
  if (t.includes('SAMSUNG')) return 'Samsung Pay'
  if (t.includes('PICPAY')) return 'PicPay'
  if (t.includes('PAYPAL')) return 'PayPal'
  if (t.includes('DIRECT_DEBIT') || t === 'DEBIT' || t.includes('DEBITO')) return 'Débito'
  if (t.includes('WALLET')) return 'Carteira'
  if (t.includes('CREDIT') || t.includes('CARD') || t.includes('CARTAO') || t.includes('CARTÃO')) return 'Cartão'
  return 'Outros'
}

export function formatarData(data: string): string {
  return format(new Date(data), 'dd/MM')
}

// ============================================================
// Cor do ROAS
// ============================================================

export function corDoRoas(roas: number, roasMinimo = 1.0): string {
  if (roas >= roasMinimo * 2) return 'text-green-600'
  if (roas >= roasMinimo) return 'text-yellow-600'
  return 'text-red-600'
}

export function bgCorDoRoas(roas: number, roasMinimo = 1.0): string {
  if (roas >= roasMinimo * 2) return 'bg-green-100 text-green-800'
  if (roas >= roasMinimo) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

export function corDaAcao(acao: AcaoOtimizacao): string {
  switch (acao) {
    case '+20% orçamento':
      return 'bg-green-100 text-green-800'
    case 'Manter':
      return 'bg-yellow-100 text-yellow-800'
    case '-20% ou pausar':
      return 'bg-orange-100 text-orange-800'
    case 'Pausar':
      return 'bg-red-100 text-red-800'
  }
}

export function iconeAcao(acao: AcaoOtimizacao): string {
  switch (acao) {
    case '+20% orçamento':
      return '▲'
    case 'Manter':
      return '→'
    case '-20% ou pausar':
      return '▼'
    case 'Pausar':
      return '⚠'
  }
}
