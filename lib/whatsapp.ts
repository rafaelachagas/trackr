// Config compartilhada do bot de WhatsApp (aba /whatsapp + rota /api/whatsapp).

export const EVOLUTION_URL = process.env.EVOLUTION_URL ?? 'http://179.198.104.241:8080'
export const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'thetrack'
export const EVOLUTION_APIKEY = process.env.EVOLUTION_APIKEY ?? ''
export const SITE_URL = process.env.SITE_URL ?? 'https://www.thetrack.com.br'

// Seções prontas que um comando pode incluir na resposta.
export const BLOCOS = [
  { key: 'resumo', label: 'Resumo do dia', desc: 'Faturamento, gasto, ROAS, lucro, vendas' },
  { key: 'comparativo', label: 'Comparativo (tendência)', desc: 'Ontem vs anteontem e 7d vs 7d anteriores' },
  { key: 'meta', label: 'Projeção do dia', desc: 'Projeção de faturamento no ritmo atual (e % da meta)' },
  { key: 'top_criativos', label: 'Top criativos (7d)', desc: 'Top 5 por lucro (fase 02+), com link' },
  { key: 'caindo', label: 'Criativos caindo', desc: 'ROAS bom em 7d mas ruim em 1d (esfriando)' },
  { key: 'novos', label: 'Criativos novos (hoje)', desc: 'Criativos cadastrados hoje' },
  { key: 'ranking', label: 'Ranking front/upsell/reembolso', desc: 'Criativos que mais vendem e mais reembolsam' },
  { key: 'produtos', label: 'Vendas por produto', desc: 'Contagem e receita por produto' },
  { key: 'pagamento', label: 'Vendas por pagamento', desc: 'Distribuição por método' },
  { key: 'reembolsos', label: 'Reembolsos do dia', desc: 'Quantos, quanto e de quais criativos' },
  { key: 'alertas', label: 'Alertas de ação', desc: 'Criativos p/ escalar (+20%) ou pausar' },
] as const

export type BlocoKey = (typeof BLOCOS)[number]['key']

// Campos configuráveis dentro de um bloco (o usuário liga/desliga por comando).
export const CAMPOS_BLOCO: Record<string, { key: string; label: string }[]> = {
  resumo: [
    { key: 'faturamento', label: 'Faturamento' },
    { key: 'gasto', label: 'Gasto' },
    { key: 'roas', label: 'ROAS' },
    { key: 'lucro', label: 'Lucro' },
    { key: 'vendas', label: 'Vendas' },
  ],
  top_criativos: [
    { key: 'roas', label: 'ROAS' },
    { key: 'gasto', label: 'Gasto' },
    { key: 'acao', label: 'Ação' },
    { key: 'fase', label: 'Fase' },
    { key: 'link', label: 'Link do anúncio' },
  ],
}

// Padrão = comportamento atual (o que já aparecia). Fase/link vêm DESLIGADOS.
export const CAMPOS_DEFAULT: Record<string, string[]> = {
  resumo: ['faturamento', 'gasto', 'roas', 'lucro', 'vendas'],
  top_criativos: ['roas', 'gasto', 'acao'],
}

export interface WppCommand {
  id: string
  trigger: string        // ex: "/relatorio"
  enabled: boolean
  blocks: string[]       // BlocoKey[]
  fields?: Record<string, string[]>  // por bloco: quais campos mostrar (ausente = padrão)
  header?: string        // texto de abertura opcional
  footer?: string        // texto de rodapé opcional
}

// Campos ativos de um bloco num comando (default se não configurado).
export function camposDe(cmd: WppCommand, blockKey: string): string[] {
  const f = cmd.fields?.[blockKey]
  if (Array.isArray(f)) return f
  return CAMPOS_DEFAULT[blockKey] ?? []
}

// Permissão POR GRUPO: cada grupo habilitado escolhe quais COMANDOS são
// permitidos nele. O que cada comando mostra (blocos/campos) é definido no
// próprio comando. Ex.: grupo da edição libera só o comando /criativos.
export interface WppGroup {
  jid: string
  name?: string
  enabled: boolean
  allowedCommands?: string[] // ids de comando permitidos; ausente = todos liberados
  allowedBlocks?: string[]   // legado (modelo antigo por bloco) — não usado mais
}

// Acesso no PRIVADO (1:1): só números cadastrados respondem, cada um escolhendo
// quais comandos pode usar. Fora da lista, o bot não responde no privado.
export interface WppNumber {
  number: string          // só dígitos (com ou sem 55) — normalizado na comparação
  name?: string
  enabled: boolean
  allowedCommands?: string[] // ids de comando permitidos; ausente = todos liberados
  allowedBlocks?: string[]   // legado — não usado mais
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

// Um comando pode ser usado num alvo (grupo/número)?
//   - alvo undefined (modo setup de grupo) → sim.
//   - allowedCommands ausente (nunca configurado) → sim (todos liberados).
//   - allowedCommands presente → só se o id do comando estiver na lista.
export function comandoPermitido(command: WppCommand, alvo: { allowedCommands?: string[] } | undefined): boolean {
  if (!alvo) return true
  if (!alvo.allowedCommands) return true
  return alvo.allowedCommands.includes(command.id)
}
