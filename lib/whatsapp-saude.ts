// Saúde dos criativos de hora em hora pelo bot do WhatsApp (teste de intraday).
// Vai SÓ no PRIVADO do Isaías (DONO_SAUDE) — nunca em grupo, nem pra outro número.
// Os comandos abaixo só funcionam mandados por ele, no privado com o bot:
//
//   /start-saude → passa a receber, toda hora cheia, o ROAS de HOJE de cada criativo
//   /stop-saude  → desliga
//   /saude       → manda o painel agora
//
// Depois do total do dia vem a saúde de cada VSL ativa (tabela vsls), com os
// números de HOJE da VTurb via /api/vturb/vsl-stats (views, play rate, retenção
// no pitch, conversão). VTurb fora do ar não derruba o painel — só some o bloco.
//
// Fonte: /api/performance-v2 (colunas de TEMPO REAL: gasto_hoje/receita_hoje/roas_hoje).
// Antes de ler, força uma sync curta da Meta (dias=1) — o sync diário só roda de
// madrugada, então sem isso o gasto de hoje ficaria parado.
//
// "Última hora" = diferença pro painel anterior, guardado em configuracoes
// (CHAVE_SNAPSHOT). Primeiro painel do dia não tem comparação.

import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/utils'
import { SITE_URL } from '@/lib/whatsapp'
import { gruposLigados, enviarTexto, fetchTimeout } from '@/lib/whatsapp-grupos'

export const CHAVE_SAUDE = 'whatsapp_saude'
export const CMD_SAUDE_START = '/start-saude'
export const CMD_SAUDE_STOP = '/stop-saude'
export const CMD_SAUDE_AGORA = '/saude'

// Único destino permitido. A lista ligada (CHAVE_SAUDE) só guarda este número.
export const DONO_SAUDE = '5547991273266'

const CHAVE_SNAPSHOT = 'whatsapp_saude_snapshot'
const TZ = 'America/Sao_Paulo'

// Criativo só entra no painel se gastou pelo menos isso hoje (tira resto de centavos).
const GASTO_MIN_HOJE = 5

// —— Sugestão de orçamento (intraday) ——
// Meta fixa do Isaías: ROAS líquido acima de 2. Cruza o ROAS do DIA (acumulado)
// com o da ÚLTIMA HORA (diferença pro painel anterior):
//   dia ≥ meta e hora ≥ meta (ou hora sem sinal) → +20%
//   dia ≥ meta mas a hora caiu                   → manter
//   dia < meta mas a hora voltou pra meta        → manter (recuperando)
//   dia < meta e hora < meta (ou sem sinal)      → −20%
// Abaixo de GASTO_MIN_DECISAO no dia não sugere nada: 1 venda a mais ou a menos
// muda o ROAS inteiro. Hora com menos de GASTO_MIN_HORA de gasto não conta como
// sinal (pouco dinheiro pra dizer se a hora foi boa ou ruim).
const ROAS_META = 2
const GASTO_MIN_DECISAO = 150
const GASTO_MIN_HORA = 40

type Sugestao = 'subir' | 'manter' | 'reduzir' | 'aguardar'
const SUGESTAO_TXT: Record<Sugestao, string> = {
  subir: '⬆️ *+20% orçamento*',
  manter: '➡️ *Manter*',
  reduzir: '⬇️ *−20% orçamento*',
  aguardar: '⏳ Aguardar (pouco gasto pra decidir)',
}

function sugerir(roasDia: number, gastoDia: number, roasHora: number | null): Sugestao {
  if (gastoDia < GASTO_MIN_DECISAO) return 'aguardar'
  if (roasDia >= ROAS_META) return roasHora != null && roasHora < ROAS_META ? 'manter' : 'subir'
  return roasHora != null && roasHora >= ROAS_META ? 'manter' : 'reduzir'
}

type CriativoHoje = {
  chave: string
  criativo: string
  ad_name: string
  fase: string | null
  gasto_hoje: number
  receita_hoje: number
  vendas_hoje?: number
  roas_hoje: number | null
  roas_7d: number | null
}

type VslHoje = {
  id: string
  nome: string
  views: number
  plays: number
  playRate: number
  retencaoPitch: number
  retencao1Min: number
  conversoes: number
  taxaConversao: number
  playRateReal: number | null
}

type Snapshot = {
  dia: string
  hora: string
  porChave: Record<string, { gasto: number; receita: number; vendas: number }>
  porVsl?: Record<string, { views: number; plays: number; conversoes: number }>
}

function headerInterno(): Record<string, string> {
  const s = process.env.CRON_SECRET
  return s ? { authorization: `Bearer ${s}` } : {}
}

const fmt = (v: number) => formatarMoeda(v)
const fmtCurto = (v: number) => formatarMoeda(v).replace(/,\d{2}$/, '')
const roasFmt = (r: number | null) => (r == null ? '—' : `${r.toFixed(2)}x`)
const sinal = (v: number) => (v >= 0 ? '+' : '−')

function farol(roas: number | null, gasto: number, receita: number, roasMin: number): string {
  if (receita <= 0) return gasto >= 50 ? '🔴' : '⚪'   // gastou pouco e não vendeu ainda: cedo pra julgar
  if (roas == null) return '⚪'
  if (roas >= roasMin && roas >= 1) return '🟢'
  if (roas >= 1) return '🟡'
  return '🔴'
}

function nomeCurto(c: CriativoHoje): string {
  const nome = c.ad_name.length > 42 ? `${c.ad_name.slice(0, 41)}…` : c.ad_name
  return c.fase ? `${nome} · ${c.fase}` : nome
}

const num = (v: number) => Math.round(v).toLocaleString('pt-BR')
const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`)

// Números de HOJE de cada VSL ativa. Falha de uma VSL não derruba as outras.
async function buscarVsls(dia: string): Promise<{ vsls: VslHoje[]; erro: boolean }> {
  const { data } = await supabaseAdmin.from('vsls').select('id, nome').eq('ativo', true)
  let erro = false
  const vsls = await Promise.all((data ?? []).map(async (v): Promise<VslHoje | null> => {
    try {
      const r = await fetchTimeout(
        `${SITE_URL}/api/vturb/vsl-stats?vsl_id=${v.id}&d_inicio=${dia}&d_fim=${dia}`,
        { cache: 'no-store', headers: headerInterno() }, 50000)
      const j = await r.json()
      if (!r.ok || !j?.ok) throw new Error(j?.error || String(r.status))
      const t = j.vturb ?? {}
      return {
        id: v.id,
        nome: v.nome,
        views: Number(t.visualizacoesUnicas) || 0,
        plays: Number(t.playsUnicos) || 0,
        playRate: Number(t.playRateVturb) || 0,
        retencaoPitch: Number(t.retencaoPitch) || 0,
        retencao1Min: Number(t.retencao1Min) || 0,
        conversoes: Number(t.conversoes) || 0,
        taxaConversao: Number(t.taxaConversao) || 0,
        playRateReal: j.real?.playRateReal ?? null,
      }
    } catch (e) {
      console.error('[whatsapp/saude] vsl', v.nome, e)
      erro = true
      return null
    }
  }))
  return { vsls: vsls.filter((v): v is VslHoje => v != null), erro }
}

async function lerSnapshot(): Promise<Snapshot | null> {
  const { data } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', CHAVE_SNAPSHOT).maybeSingle()
  try {
    const v = typeof data?.valor === 'string' ? JSON.parse(data.valor) : data?.valor
    return v?.dia ? v : null
  } catch {
    return null
  }
}

async function salvarSnapshot(snap: Snapshot) {
  // configuracoes.org_id é NOT NULL: inserir chave nova sem ele falha calado.
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const { error } = await supabaseAdmin.from('configuracoes').upsert(
    { chave: CHAVE_SNAPSHOT, valor: JSON.stringify(snap), org_id: org?.id, updated_at: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) console.error('[whatsapp/saude] não salvou snapshot:', error.message)
}

/**
 * Monta o painel. `gravar` = salva como base da próxima comparação (o cron grava;
 * o /saude manual não, senão bagunça a "última hora" do cron seguinte).
 */
export async function montarSaude(gravar: boolean): Promise<string> {
  const agora = toZonedTime(new Date(), TZ)
  const dia = format(agora, 'yyyy-MM-dd')
  const hora = format(agora, 'HH:mm')

  // 1) Gasto de hoje fresco. dias=1 cobre ontem+hoje: na Vercel (UTC) depois das
  // 21h de SP o "hoje" UTC já é amanhã, e dias=0 perderia o dia de SP.
  let syncOk = true
  try {
    const r = await fetchTimeout(`${SITE_URL}/api/meta/sync?dias=1`, { method: 'POST', cache: 'no-store', headers: headerInterno() }, 120000)
    syncOk = r.ok
  } catch {
    syncOk = false
  }

  // 2) ROAS de hoje por criativo + VSLs (em paralelo, os dois depois da sync:
  // o play rate real da VSL usa as LP views da Meta).
  const [r, vslRes] = await Promise.all([
    fetchTimeout(`${SITE_URL}/api/performance-v2?so_aprovadas=1`, { cache: 'no-store', headers: headerInterno() }, 60000),
    buscarVsls(dia),
  ])
  const perf = await r.json()
  if (!r.ok || !Array.isArray(perf?.criativos)) throw new Error(perf?.error || `performance-v2 respondeu ${r.status}`)
  const roasMin: number = Number(perf.roasMinimo) || 1

  const todos: CriativoHoje[] = perf.criativos
  const ativos = todos
    .filter((c) => c.gasto_hoje >= GASTO_MIN_HOJE || c.receita_hoje > 0)
    .sort((a, b) => b.gasto_hoje - a.gasto_hoje)

  const anterior = await lerSnapshot()
  const base = anterior && anterior.dia === dia ? anterior : null

  const totG = ativos.reduce((a, c) => a + c.gasto_hoje, 0)
  const totR = ativos.reduce((a, c) => a + c.receita_hoje, 0)
  const totV = ativos.reduce((a, c) => a + (c.vendas_hoje ?? 0), 0)
  const totRoas = totG > 0 ? totR / totG : null
  const totL = totR - totG

  // Última hora e sugestão de cada criativo (calculadas antes pra ir no resumo do topo).
  const analise = new Map<string, { dG: number; dR: number; dV: number; novo: boolean; sug: Sugestao }>()
  for (const c of ativos) {
    const b = base?.porChave[c.chave]
    const dG = c.gasto_hoje - (b?.gasto ?? 0)
    const dR = c.receita_hoje - (b?.receita ?? 0)
    const dV = (c.vendas_hoje ?? 0) - (b?.vendas ?? 0)
    const roasHora = base && b && dG >= GASTO_MIN_HORA ? dR / dG : null
    const roasDia = c.gasto_hoje > 0 ? c.receita_hoje / c.gasto_hoje : 0
    analise.set(c.chave, { dG, dR, dV, novo: !!base && !b, sug: sugerir(roasDia, c.gasto_hoje, roasHora) })
  }
  const contaSug = (s: Sugestao) => [...analise.values()].filter((a) => a.sug === s).length

  const linhas: string[] = []
  linhas.push(`⏱️ *Saúde dos criativos e VSL — ${hora}*`)
  linhas.push(`_Hoje até agora · líquido · só vendas aprovadas_`)
  linhas.push('')
  linhas.push(`💸 Gasto ${fmt(totG)} · 💰 Receita ${fmt(totR)}`)
  linhas.push(`📊 ROAS *${roasFmt(totRoas)}* · ${totL >= 0 ? '✅' : '❌'} Lucro ${sinal(totL)}${fmt(Math.abs(totL))} · 🛒 ${totV} vendas`)

  if (base) {
    let dG = 0, dR = 0
    for (const c of ativos) {
      const b = base.porChave[c.chave]
      dG += c.gasto_hoje - (b?.gasto ?? 0)
      dR += c.receita_hoje - (b?.receita ?? 0)
    }
    linhas.push(`🕐 Desde ${base.hora}: +${fmtCurto(dG)} gasto · +${fmtCurto(dR)} receita${dG > 0 ? ` (ROAS ${roasFmt(dR / dG)})` : ''}`)
  }
  if (ativos.length > 0) {
    linhas.push(`💡 Meta ROAS ${ROAS_META}x: ⬆️ ${contaSug('subir')} subir · ➡️ ${contaSug('manter')} manter · ⬇️ ${contaSug('reduzir')} reduzir · ⏳ ${contaSug('aguardar')} aguardar`)
  }

  for (const v of vslRes.vsls) {
    linhas.push('')
    linhas.push(`🎬 *${v.nome}* (VTurb, hoje)`)
    linhas.push(`👀 ${num(v.views)} views · ▶️ ${num(v.plays)} plays · Play rate ${pct(v.playRate)}${v.playRateReal != null ? ` (real ${pct(v.playRateReal)})` : ''}`)
    linhas.push(`🎯 Retenção 1 min ${pct(v.retencao1Min)} · no pitch ${pct(v.retencaoPitch)}`)
    linhas.push(`🛒 ${num(v.conversoes)} ${v.conversoes === 1 ? 'conversão' : 'conversões'} · ${pct(v.taxaConversao)} dos plays`)
    const b = base?.porVsl?.[v.id]
    if (base && b) {
      const dViews = v.views - b.views
      const dPlays = v.plays - b.plays
      const dConv = v.conversoes - b.conversoes
      const prHora = dViews > 0 ? ` · play rate ${pct((dPlays / dViews) * 100)}` : ''
      const convHora = dPlays > 0 ? ` · conv. ${pct((dConv / dPlays) * 100)}` : ''
      linhas.push(`↳ desde ${base.hora}: +${num(dViews)} views · +${num(dPlays)} plays · +${num(dConv)} conv.${prHora}${convHora}`)
    }
  }
  if (vslRes.erro) linhas.push('⚠️ Não consegui ler a VTurb de alguma VSL agora.')

  if (ativos.length === 0) {
    linhas.push('')
    linhas.push('Nenhum criativo gastou hoje ainda.')
  }

  for (const c of ativos) {
    const lucro = c.receita_hoje - c.gasto_hoje
    const vendas = c.vendas_hoje ?? 0
    linhas.push('')
    linhas.push(`${farol(c.roas_hoje, c.gasto_hoje, c.receita_hoje, roasMin)} *${nomeCurto(c)}*`)
    linhas.push(`ROAS hoje *${roasFmt(c.roas_hoje)}* (7d ${roasFmt(c.roas_7d)}) · ${vendas} ${vendas === 1 ? 'venda' : 'vendas'}`)
    linhas.push(`${fmtCurto(c.gasto_hoje)} → ${fmtCurto(c.receita_hoje)} · ${sinal(lucro)}${fmtCurto(Math.abs(lucro))}`)
    const a = analise.get(c.chave)!
    if (base) {
      const roasH = a.dG >= 1 ? ` · ROAS ${roasFmt(a.dR / a.dG)}` : ''
      if (a.novo) linhas.push(`🆕 começou a gastar depois das ${base.hora}`)
      else if (a.dG >= 1 || a.dR > 0) linhas.push(`↳ desde ${base.hora}: +${fmtCurto(a.dG)} gasto · +${fmtCurto(a.dR)} receita (${a.dV} ${a.dV === 1 ? 'venda' : 'vendas'})${roasH}`)
      else linhas.push(`↳ desde ${base.hora}: parado`)
    }
    linhas.push(`💡 ${SUGESTAO_TXT[a.sug]}`)
  }

  linhas.push('')
  linhas.push(`🟢 ROAS ≥ ${roasMin.toFixed(2)}x · 🟡 entre 1x e ${roasMin.toFixed(2)}x · 🔴 prejuízo · ⚪ cedo pra dizer`)
  linhas.push(`💡 Sugestão = ROAS do dia × ROAS da última hora contra a meta de ${ROAS_META}x. Venda da Hotmart pode chegar com atraso — confira a tendência de 2–3 horas antes de mexer. Em campanha com vários criativos, o orçamento é da campanha inteira.`)
  if (!syncOk) linhas.push('⚠️ Não consegui atualizar o gasto da Meta agora — o gasto pode estar atrasado.')

  if (gravar) {
    const porChave: Snapshot['porChave'] = {}
    for (const c of todos) porChave[c.chave] = { gasto: c.gasto_hoje, receita: c.receita_hoje, vendas: c.vendas_hoje ?? 0 }
    const porVsl: NonNullable<Snapshot['porVsl']> = {}
    for (const v of vslRes.vsls) porVsl[v.id] = { views: v.views, plays: v.plays, conversoes: v.conversoes }
    await salvarSnapshot({ dia, hora, porChave, porVsl })
  }

  return linhas.join('\n')
}

/** /saude — painel na hora, sem mexer na base do cron. */
export async function responderSaudeAgora(): Promise<void> {
  try {
    await enviarTexto(DONO_SAUDE, await montarSaude(false))
  } catch (e) {
    await enviarTexto(DONO_SAUDE, `⏱️ Não consegui montar o painel: ${e instanceof Error ? e.message : e}`).catch(() => {})
  }
}

/** Cron de hora em hora: manda o painel no privado do dono, se ligado. */
// Roda 24h por dia, todo dia (pedido do Isaías) — sem janela de horário.
export async function enviarSaudeHoraria(): Promise<{ status: string; grupos?: { grupo: string; status: string }[] }> {

  // Mesmo que alguém grave outro destino na config, só o dono recebe.
  const grupos = (await gruposLigados(CHAVE_SAUDE)).filter((g) => g.jid === DONO_SAUDE)
  if (grupos.length === 0) return { status: 'desligado' }

  const texto = await montarSaude(true)
  const out: { grupo: string; status: string }[] = []
  for (const g of grupos) {
    try {
      await enviarTexto(g.jid, texto)
      out.push({ grupo: g.jid, status: 'enviado' })
    } catch (e) {
      out.push({ grupo: g.jid, status: `erro: ${e instanceof Error ? e.message : e}` })
    }
  }
  return { status: 'ok', grupos: out }
}
