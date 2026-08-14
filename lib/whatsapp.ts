// Config compartilhada do bot de WhatsApp (aba /whatsapp + rota /api/whatsapp).

export const EVOLUTION_URL = process.env.EVOLUTION_URL ?? 'http://179.198.104.241:8080'
export const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'thetrack'
export const EVOLUTION_APIKEY = process.env.EVOLUTION_APIKEY ?? ''
export const SITE_URL = process.env.SITE_URL ?? 'https://www.thetrack.com.br'

// Seções prontas que um comando pode incluir na resposta.
export const BLOCOS = [
  { key: 'resumo', label: 'Resumo do dia', desc: 'Faturamento, gasto, ROAS, lucro, vendas' },
  { key: 'top_criativos', label: 'Top criativos (7d)', desc: 'Top 5 por gasto, com ROAS e ação' },
  { key: 'ranking', label: 'Ranking front/upsell/reembolso', desc: 'Criativos que mais vendem e mais reembolsam' },
  { key: 'pagamento', label: 'Vendas por pagamento', desc: 'Distribuição por método' },
  { key: 'alertas', label: 'Alertas de ação', desc: 'Criativos p/ escalar (+20%) ou pausar' },
] as const

export type BlocoKey = (typeof BLOCOS)[number]['key']

export interface WppCommand {
  id: string
  trigger: string        // ex: "/relatorio"
  enabled: boolean
  blocks: string[]       // BlocoKey[]
  header?: string        // texto de abertura opcional
  footer?: string        // texto de rodapé opcional
}

// Permissão POR GRUPO: cada grupo habilitado escolhe quais blocos pode ver.
// Ex.: grupo da equipe libera só ['top_criativos'] → o /relatorio nesse grupo
// esconde o Resumo (faturamento) mesmo que o comando inclua 'resumo'.
export interface WppGroup {
  jid: string
  name?: string
  enabled: boolean
  allowedBlocks: string[]  // vazio = todos os blocos liberados
}

export interface WppConfig {
  commands: WppCommand[]
  groups: WppGroup[]       // vazio = MODO SETUP: responde em qualquer grupo, tudo liberado
}

export const CONFIG_KEY = 'whatsapp_bot'

export const DEFAULT_WPP_CONFIG: WppConfig = {
  commands: [
    {
      id: 'relatorio',
      trigger: '/relatorio',
      enabled: true,
      blocks: ['resumo', 'top_criativos'],
      header: '',
      footer: 'Enviado pelo The Track',
    },
  ],
  groups: [],
}

export function parseWppConfig(valor: string | null | undefined): WppConfig {
  if (!valor) return DEFAULT_WPP_CONFIG
  try {
    const c = JSON.parse(valor)
    return {
      commands: Array.isArray(c.commands) ? c.commands : DEFAULT_WPP_CONFIG.commands,
      groups: Array.isArray(c.groups) ? c.groups : [],
    }
  } catch {
    return DEFAULT_WPP_CONFIG
  }
}

// Blocos que um comando pode renderizar NUM grupo específico (interseção da
// config do comando com a permissão do grupo).
export function blocosPermitidos(command: WppCommand, group: WppGroup | undefined): string[] {
  // Sem grupo configurado (modo setup) → tudo que o comando define.
  if (!group) return command.blocks
  // Grupo configurado → só os blocos explicitamente liberados pra ele.
  return command.blocks.filter((b) => (group.allowedBlocks ?? []).includes(b))
}
