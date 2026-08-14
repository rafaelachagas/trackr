import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getDashboardData } from '@/app/actions/dashboard'
import { formatarMoeda, spRangeISO, extrairCriativo } from '@/lib/utils'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import {
  CONFIG_KEY, parseWppConfig, comandoPermitido, camposDe, mesmoNumero, WppCommand, WppGroup, WppNumber,
  EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_APIKEY, SITE_URL,
} from '@/lib/whatsapp'

export const maxDuration = 60
const TZ = 'America/Sao_Paulo'

// Piso de gasto (7d) pra um criativo entrar no Top: prova que teve volume real.
// Ajustável — se o corte estiver alto/baixo pro seu volume, é só mudar aqui.
const TOP_MIN_GASTO_7D = 1000

function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

function extrairTexto(msg: any): string {
  return (msg?.conversation ?? msg?.extendedTextMessage?.text ?? '').trim()
}

async function enviar(to: string, text: string) {
  await fetchTimeout(`${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
    // linkPreview:false → sem o card gigante de preview do 1º link.
    body: JSON.stringify({ number: to, text, linkPreview: false }),
  }, 15000)
}

const fmt = (v: number) => formatarMoeda(v)
const roasFmt = (r: number | null) => (r == null ? '—' : `${r.toFixed(2)}x`)

const META_API = 'https://graph.facebook.com/v25.0'

type MetaCfg = { token: string; ids: string[] }
async function carregarMetaCfg(): Promise<MetaCfg | null> {
  const { data: cfg } = await supabaseAdmin
    .from('configuracoes').select('chave, valor')
    .in('chave', ['meta_access_token', 'meta_ad_account_ids', 'meta_ad_account_id'])
  const m = Object.fromEntries((cfg ?? []).map((c) => [c.chave, c.valor]))
  const token = m['meta_access_token']
  let ids: string[] = []
  try { ids = JSON.parse(m['meta_ad_account_ids'] || '[]') } catch {}
  if (!ids.length && m['meta_ad_account_id']) ids = [m['meta_ad_account_id']]
  if (!token || !ids.length) return null
  return { token, ids }
}

// Permalink do Instagram de UM código (adNN), AUTOMÁTICO da Meta. Busca DIRECIONADA
// (filtro por nome CONTAIN o código) — rápida, sem listar a conta inteira. Prefere
// o anúncio ATIVO. Mesma fonte da rota /api/criativos/instagram e do painel.
async function resolverLinkInstagram(codigo: string, cfg: MetaCfg): Promise<string | null> {
  const re = new RegExp(`(^|[^a-z0-9])${codigo}([^0-9]|$)`, 'i')
  let ativo: string | null = null
  let qualquer: string | null = null
  for (const id of cfg.ids) {
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: codigo }]))
    const url = `${META_API}/act_${String(id).replace('act_', '')}/ads?fields=name,effective_status,creative{instagram_permalink_url}&filtering=${filtering}&limit=100&access_token=${cfg.token}`
    try {
      const j: any = await fetchTimeout(url, {}, 12000).then((r) => r.json())
      if (j.error) continue
      for (const ad of j.data ?? []) {
        if (!re.test(ad.name || '')) continue
        const link = ad.creative?.instagram_permalink_url
        if (!link) continue
        if (!qualquer) qualquer = link
        if (ad.effective_status === 'ACTIVE' && !ativo) ativo = link
      }
    } catch { /* ignora conta que falhou */ }
    if (ativo) break
  }
  return ativo ?? qualquer
}

// —— Fontes de dados (carregadas sob demanda, uma vez por requisição) ——
function makeLoader() {
  const hoje = format(toZonedTime(new Date(), TZ), 'yyyy-MM-dd')
  const { desde, ate } = spRangeISO(hoje, hoje)
  let dash: any, perf: any, brk: any
  let metaCfg: MetaCfg | null | undefined         // undefined = ainda não carregou
  let dbLinks: Map<string, string> | undefined    // reserva (link cadastrado à mão)
  const cacheLink = new Map<string, string | null>() // código -> link (evita refetch)
  return {
    async dashboard() { return (dash ??= await getDashboardData('Qualquer', desde, ate)) },
    // Link do Instagram de um código, sob demanda: Meta (direcionado) e, se não
    // vier, o link cadastrado à mão. Cacheia por código dentro da requisição.
    async linkDe(codigo: string | null | undefined, adName?: string | null): Promise<string | undefined> {
      const cod = (codigo || '').toLowerCase()
      if (!cod) return undefined
      if (cacheLink.has(cod)) return cacheLink.get(cod) ?? undefined
      if (metaCfg === undefined) metaCfg = await carregarMetaCfg().catch(() => null)
      let link: string | null = metaCfg ? await resolverLinkInstagram(cod, metaCfg).catch(() => null) : null
      if (!link) {
        if (!dbLinks) {
          dbLinks = new Map<string, string>()
          const { data } = await supabaseAdmin.from('criativos').select('nome, link_anuncio')
          for (const r of data ?? []) {
            const l = (r as any).link_anuncio, nome = (r as any).nome
            if (!l || !nome) continue
            dbLinks.set(String(nome).toLowerCase(), l)
            const c = extrairCriativo(nome)
            if (c && !dbLinks.has(c)) dbLinks.set(c, l)
          }
        }
        link = dbLinks.get(cod) ?? (adName ? dbLinks.get(String(adName).toLowerCase()) ?? null : null)
      }
      cacheLink.set(cod, link)
      return link ?? undefined
    },
    async perfV2() {
      if (!perf) {
        try { perf = await (await fetchTimeout(`${SITE_URL}/api/performance-v2`, { cache: 'no-store' }, 25000)).json() }
        catch { perf = { criativos: [] } }
      }
      return perf
    },
    async breakdown() {
      if (!brk) {
        try { brk = await (await fetchTimeout(`${SITE_URL}/api/dashboard/vendas-breakdown?d_inicio=${hoje}&d_fim=${hoje}`, { cache: 'no-store' }, 25000)).json() }
        catch { brk = {} }
      }
      return brk
    },
  }
}
type Loader = ReturnType<typeof makeLoader>

async function renderBloco(key: string, L: Loader, campos: string[]): Promise<string | null> {
  if (key === 'resumo') {
    const d = await L.dashboard()
    const m = d?.metrics
    if (!m) return null
    const lucro = m.revenue - m.spend - m.imposto
    const lines: string[] = []
    if (campos.includes('faturamento')) lines.push(`💰 Faturamento: *${fmt(m.revenue)}*`)
    if (campos.includes('gasto')) lines.push(`📣 Gasto em ADS: *${fmt(m.spend)}*`)
    if (campos.includes('roas')) lines.push(`📈 ROAS: *${m.roas.toFixed(2)}*`)
    if (campos.includes('lucro')) lines.push(`🟢 Lucro: *${fmt(lucro)}*`)
    if (campos.includes('vendas')) lines.push(`🛒 Vendas: *${m.salesCount}*`)
    return lines.length ? lines.join('\n') : null
  }
  if (key === 'top_criativos') {
    const p = await L.perfV2()
    // Seleção: só FASE02+ (criativo maduro), priorizando VOLUME + LUCRO. ROAS 2
    // não é requisito — gastou 5k e vendeu 9k (lucro 4k) é ótimo mesmo com ROAS 1,8.
    // Ranqueia por lucro dos 7d; exige um piso de gasto pra provar volume. Se
    // ninguém bater o piso, cai pra todos da fase 02+ (não volta vazio).
    const fase2mais = (p.criativos ?? []).filter((c: any) => c.fase === 'FASE02' || c.fase === 'FASE03')
    const comVolume = fase2mais.filter((c: any) => (c.gasto_7d ?? 0) >= TOP_MIN_GASTO_7D)
    const base = comVolume.length ? comVolume : fase2mais
    const top = [...base].sort((a: any, b: any) => (b.lucro_7d ?? 0) - (a.lucro_7d ?? 0)).slice(0, 5)
    if (!top.length) return null
    // Resolve os links só dos 5 do topo, em paralelo (rápido).
    const links = campos.includes('link')
      ? await Promise.all(top.map((c: any) => L.linkDe(c.criativo, c.ad_name)))
      : []
    const itens = top.map((c: any, i: number) => {
      let cabec = `${i + 1}. *${c.criativo}*`
      if (campos.includes('fase') && c.fase) cabec += ` - ${c.fase}`
      const metr: string[] = []
      if (campos.includes('roas')) metr.push(`ROAS ${roasFmt(c.roas_7d)}`)
      if (campos.includes('gasto')) metr.push(`Gasto ${fmt(c.gasto_7d)}`)
      if (campos.includes('acao')) metr.push(c.acao)
      if (metr.length) cabec += ` — ${metr.join(' · ')}`
      const link = campos.includes('link') ? links[i] : undefined
      return link ? `${cabec}\n${link}` : cabec
    })
    // Linha em branco entre os itens quando há link (fica mais legível).
    const sep = campos.includes('link') ? '\n\n' : '\n'
    return `*Top Criativos (7D)*\n\n${itens.join(sep)}`
  }
  if (key === 'alertas') {
    const p = await L.perfV2()
    const cs = p.criativos ?? []
    const escalar = cs.filter((c: any) => c.acao === '+20% orçamento').slice(0, 5)
    const pausar = cs.filter((c: any) => c.acao === 'Pausar').slice(0, 5)
    const out: string[] = ['*⚠️ Alertas de ação:*']
    if (escalar.length) out.push('🟢 Escalar (+20%): ' + escalar.map((c: any) => c.criativo).join(', '))
    if (pausar.length) out.push('🔴 Pausar: ' + pausar.map((c: any) => c.criativo).join(', '))
    return out.length > 1 ? out.join('\n') : null
  }
  if (key === 'ranking') {
    const b = await L.breakdown()
    const cr = b.porCriativo ?? []
    if (!cr.length) return null
    const front = [...cr].sort((a: any, b: any) => b.front - a.front).slice(0, 3)
    const upsell = [...cr].sort((a: any, b: any) => b.upsell - a.upsell).slice(0, 3)
    const taxa = (c: any) => { const v = c.front + c.upsell; return v > 0 ? c.reembolsoCount / v : 0 }
    const reemb = [...cr].filter((c: any) => c.reembolsoCount > 0).sort((a: any, b: any) => taxa(b) - taxa(a)).slice(0, 3)
    const out = ['*🏆 Ranking (hoje):*']
    out.push('Front: ' + (front.map((c: any) => `${c.criativo}(${c.front})`).join(', ') || '—'))
    out.push('Upsell: ' + (upsell.map((c: any) => `${c.criativo}(${c.upsell})`).join(', ') || '—'))
    out.push('Reembolso: ' + (reemb.map((c: any) => `${c.criativo}(${(taxa(c) * 100).toFixed(0)}%)`).join(', ') || '—'))
    return out.join('\n')
  }
  if (key === 'pagamento') {
    const b = await L.breakdown()
    const pg = (b.porPagamento ?? []).filter((m: any) => m.metodo !== 'Não informado')
    if (!pg.length) return null
    const total = pg.reduce((a: number, m: any) => a + m.total, 0)
    return ['*💳 Vendas por pagamento (hoje):*', ...pg.map((m: any) =>
      `${m.metodo}: *${m.total}* (${total > 0 ? ((m.total / total) * 100).toFixed(0) : 0}%)`)].join('\n')
  }
  return null
}

async function montarResposta(blocks: string[], cmd: WppCommand): Promise<string> {
  const L = makeLoader()
  const agora = toZonedTime(new Date(), TZ)
  const dataBR = format(agora, 'dd/MM/yyyy')
  const horaBR = format(agora, 'HH:mm')
  const dataHora = `${dataBR} às ${horaBR}`
  // Variáveis que o usuário pode usar no texto de abertura/rodapé.
  const aplicarVars = (t: string) => t
    .replace(/\{datahora\}/gi, dataHora)
    .replace(/\{data\}/gi, dataBR)
    .replace(/\{hora\}/gi, horaBR)

  // Se o usuário usa {data}/{hora}/{datahora} no cabeçalho OU no rodapé, ele
  // controla onde a hora aparece — não anexo nada. Senão, garanto a hora do envio.
  const temVarTempo = /\{(datahora|data|hora)\}/i.test(`${cmd.header ?? ''} ${cmd.footer ?? ''}`)

  const partes: string[] = []
  // Cabeçalho: se o comando define um header próprio, ele MANDA (a linha fixa
  // "The Track (data/hora)" some). Sem header, mantém o padrão com a hora do envio.
  if (cmd.header?.trim()) {
    partes.push(aplicarVars(cmd.header.trim()))
    if (!temVarTempo) partes.push(`_${dataHora}_`)
  } else {
    partes.push(`📊 *The Track*  _(${dataHora})_`)
  }
  for (const b of blocks) {
    const txt = await renderBloco(b, L, camposDe(cmd, b))
    if (txt) partes.push('\n' + txt)
  }
  if (cmd.footer?.trim()) partes.push('\n_' + aplicarVars(cmd.footer.trim()) + '_')
  return partes.join('\n')
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'whatsapp-webhook' })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = body?.data ?? {}
    const remoteJid: string = data?.key?.remoteJid ?? ''
    const fromMe: boolean = !!data?.key?.fromMe
    const texto = extrairTexto(data?.message).toLowerCase()

    if (fromMe) return NextResponse.json({ ignored: 'fromMe' })

    const isGroup = remoteJid.endsWith('@g.us')
    const isDM = remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@c.us')
    if (!isGroup && !isDM) return NextResponse.json({ ignored: 'not-supported' })

    // Config do banco (editável pela aba /whatsapp)
    const { data: cfgRow } = await supabaseAdmin
      .from('configuracoes').select('valor').eq('chave', CONFIG_KEY).maybeSingle()
    const config = parseWppConfig(cfgRow?.valor)

    // Resolve o "alvo" (grupo ou número) e checa se pode responder.
    let alvo: WppGroup | WppNumber | undefined
    if (isGroup) {
      const setupMode = (config.groups?.length ?? 0) === 0
      const group = config.groups?.find((g) => g.jid === remoteJid)
      if (!setupMode && (!group || !group.enabled)) {
        return NextResponse.json({ ignored: 'group-not-allowed', grupo: remoteJid })
      }
      alvo = group
    } else {
      // PRIVADO: só números cadastrados e ativos respondem.
      const num = config.numbers?.find((n) => n.enabled && mesmoNumero(n.number, remoteJid))
      if (!num) {
        console.log('[whatsapp] DM negado — número não autorizado:', remoteJid, '| cadastrados:', config.numbers?.map((n) => n.number))
        return NextResponse.json({ ignored: 'number-not-allowed', numero: remoteJid })
      }
      alvo = num
    }

    const cmd = config.commands?.find((c) => c.enabled && c.trigger === texto)
    if (!cmd) return NextResponse.json({ ignored: 'no-command' })

    if (!EVOLUTION_APIKEY) return NextResponse.json({ error: 'apikey ausente' }, { status: 500 })

    // Permissão agora é POR COMANDO: o grupo/número escolhe quais comandos pode
    // usar; o comando define o conteúdo (blocos/campos).
    if (!comandoPermitido(cmd, alvo)) {
      return NextResponse.json({ ignored: 'command-not-allowed', grupo: remoteJid, comando: cmd.trigger })
    }

    const blocks = cmd.blocks
    const resposta = await montarResposta(blocks, cmd)
    await enviar(remoteJid, resposta)
    return NextResponse.json({ ok: true, grupo: remoteJid, comando: cmd.trigger, blocks })
  } catch (err) {
    console.error('[whatsapp]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
