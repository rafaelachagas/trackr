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

// Acesso no PRIVADO (1:1): só números cadastrados respondem, cada um com suas
// permissões de bloco. Fora da lista, o bot não responde no privado.
export interface WppNumber {
  number: string          // só dígitos (com ou sem 55) — normalizado na comparação
  name?: string
  enabled: boolean
  allowedBlocks: string[]
}

export interface WppConfig {
  commands: WppCommand[]
  groups: WppGroup[]       // vazio = MODO SETUP: responde em qualquer grupo, tudo liberado
  numbers: WppNumber[]     // privado — vazio = não responde no privado
}

// Reduz um número BR a DDD + 8 dígitos (tira código do país 55 e o 9º dígito),
// pra comparar de forma robusta números que vêm em formatos diferentes.
function nucleoNumero(n: string): string {
  let d = (n || '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2) // remove país
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3) // remove 9º dígito
  return d
}

// Compara dois números tolerando 9º dígito / código do país (55).
export function mesmoNumero(a: string, b: string): boolean {
  const da = (a || '').replace(/\D/g, '')
  const db = (b || '').replace(/\D/g, '')
  if (!da || !db) return false
  if (da === db || da.endsWith(db) || db.endsWith(da)) return true
  const na = nucleoNumero(da)
  const nb = nucleoNumero(db)
  return !!na && na === nb
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
  numbers: [],
}

export function parseWppConfig(valor: string | null | undefined): WppConfig {
  if (!valor) return DEFAULT_WPP_CONFIG
  try {
    const c = JSON.parse(valor)
    return {
      commands: Array.isArray(c.commands) ? c.commands : DEFAULT_WPP_CONFIG.commands,
      groups: Array.isArray(c.groups) ? c.groups : [],
      numbers: Array.isArray(c.numbers) ? c.numbers : [],
    }
  } catch {
    return DEFAULT_WPP_CONFIG
  }
}

// Blocos que um comando pode renderizar NUM grupo específico (interseção da
// config do comando com a permissão do grupo).
// Aceita grupo OU número (ambos têm allowedBlocks). `undefined` = modo setup.
export function blocosPermitidos(command: WppCommand, alvo: { allowedBlocks?: string[] } | undefined): string[] {
  // Sem alvo configurado (modo setup de grupo) → tudo que o comando define.
  if (!alvo) return command.blocks
  // Alvo configurado → só os blocos explicitamente liberados pra ele.
  return command.blocks.filter((b) => (alvo.allowedBlocks ?? []).includes(b))
}
