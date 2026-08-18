import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { registrarAlerta } from '@/lib/alertas'
import { toZonedTime } from 'date-fns-tz'
import { subDays, format } from 'date-fns'

// Vigia a performance DA NOSSA conta (só leitura de `gastos`) e dispara:
//  - Fadiga de criativo: CTR caindo / CPM subindo vs a base recente.
//  - Anomalia de gasto: gasto do dia muito acima/abaixo da média.
// Não altera nada em gastos nem na sincronização da Meta.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TZ = 'America/Sao_Paulo'

interface Cfg { ctrDrop: number; cpmRise: number; minImpr: number; anomaliaPct: number }
const PADRAO: Cfg = { ctrDrop: 0.25, cpmRise: 0.30, minImpr: 1000, anomaliaPct: 0.5 }

async function lerConfig(): Promise<Cfg> {
  try {
    const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'alertas_config').maybeSingle()
    if (!data?.valor) return PADRAO
    const v = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor
    return {
      ctrDrop: Number(v?.ctrDrop) || PADRAO.ctrDrop,
      cpmRise: Number(v?.cpmRise) || PADRAO.cpmRise,
      minImpr: Number(v?.minImpr) || PADRAO.minImpr,
      anomaliaPct: Number(v?.anomaliaPct) || PADRAO.anomaliaPct,
    }
  } catch { return PADRAO }
}

interface LinhaGasto { data: string; ad_id: string | null; ad_name: string | null; impressions: number; clicks: number; valor_gasto: number }

async function puxarGastos(dIni: string, dFim: string): Promise<LinhaGasto[]> {
  const linhas: LinhaGasto[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabaseAdmin
      .from('gastos')
      .select('data, ad_id, ad_name, impressions, clicks, valor_gasto')
      .gte('data', dIni).lte('data', dFim)
      .not('ad_id', 'is', null)
      .range(off, off + 999)
    if (error || !data || data.length === 0) break
    for (const r of data as any[]) linhas.push(r)
    if (data.length < 1000) break
  }
  return linhas
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  const orgId = org?.id
  if (!orgId) return NextResponse.json({ error: 'org não encontrada' }, { status: 500 })

  const cfg = await lerConfig()
  const hoje = toZonedTime(new Date(), TZ)
  // Trabalhamos com dias COMPLETOS: ontem pra trás.
  const dOntem = format(subDays(hoje, 1), 'yyyy-MM-dd')
  const d8 = format(subDays(hoje, 8), 'yyyy-MM-dd')

  const linhas = await puxarGastos(d8, dOntem)
  const recentesIni = format(subDays(hoje, 3), 'yyyy-MM-dd')   // últimos 3 dias completos
  const baseFim = format(subDays(hoje, 4), 'yyyy-MM-dd')       // base = dias 4..7

  // ---------- FADIGA DE CRIATIVO ----------
  type Ac = { impr: number; clk: number; gasto: number; nome: string | null }
  const rec = new Map<string, Ac>()
  const base = new Map<string, Ac>()
  const soma = (m: Map<string, Ac>, r: LinhaGasto) => {
    const k = r.ad_id as string
    const a = m.get(k) ?? { impr: 0, clk: 0, gasto: 0, nome: r.ad_name }
    a.impr += Number(r.impressions) || 0
    a.clk += Number(r.clicks) || 0
    a.gasto += Number(r.valor_gasto) || 0
    if (r.ad_name) a.nome = r.ad_name
    m.set(k, a)
  }
  for (const r of linhas) {
    if (r.data >= recentesIni) soma(rec, r)
    else if (r.data <= baseFim) soma(base, r)
  }

  const ctr = (a: Ac) => (a.impr > 0 ? a.clk / a.impr : 0)
  const cpm = (a: Ac) => (a.impr > 0 ? (a.gasto / a.impr) * 1000 : 0)
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`

  let fadigas = 0
  for (const [adId, a] of rec) {
    const b = base.get(adId)
    if (!b) continue
    if (a.impr < cfg.minImpr || b.impr < cfg.minImpr) continue
    const ctrR = ctr(a), ctrB = ctr(b), cpmR = cpm(a), cpmB = cpm(b)
    const quedaCtr = ctrB > 0 ? (ctrB - ctrR) / ctrB : 0
    const altaCpm = cpmB > 0 ? (cpmR - cpmB) / cpmB : 0
    const fadigaCtr = quedaCtr >= cfg.ctrDrop
    const fadigaCpm = altaCpm >= cfg.cpmRise
    if (!fadigaCtr && !fadigaCpm) continue

    const motivos: string[] = []
    if (fadigaCtr) motivos.push(`CTR caiu ${pct(quedaCtr)} (${(ctrB * 100).toFixed(2)}% → ${(ctrR * 100).toFixed(2)}%)`)
    if (fadigaCpm) motivos.push(`CPM subiu ${pct(altaCpm)} (R$ ${cpmB.toFixed(2)} → R$ ${cpmR.toFixed(2)})`)
    const res = await registrarAlerta({
      orgId, tipo: 'fadiga', chave: `${adId}:${dOntem}`,
      titulo: `Fadiga: ${a.nome || adId}`,
      mensagem: `Sinais de fadiga nos últimos 3 dias:\n• ${motivos.join('\n• ')}\nGasto no período: R$ ${a.gasto.toFixed(2)}. Considere renovar o criativo.`,
      severidade: (fadigaCtr && fadigaCpm) ? 'critico' : 'atencao',
    }).catch(() => ({ novo: false }))
    if ((res as any).novo) fadigas++
  }

  // ---------- ANOMALIA DE GASTO (nível conta/dia) ----------
  const gastoPorDia = new Map<string, number>()
  for (const r of linhas) gastoPorDia.set(r.data, (gastoPorDia.get(r.data) || 0) + (Number(r.valor_gasto) || 0))
  const gastoOntem = gastoPorDia.get(dOntem) || 0
  const outros = [...gastoPorDia.entries()].filter(([d]) => d !== dOntem).map(([, v]) => v)
  const media = outros.length ? outros.reduce((s, v) => s + v, 0) / outros.length : 0

  let anomalia = false
  if (media > 0 && gastoOntem > 0) {
    const desvio = (gastoOntem - media) / media
    if (Math.abs(desvio) >= cfg.anomaliaPct) {
      const dir = desvio > 0 ? 'ACIMA' : 'ABAIXO'
      const res = await registrarAlerta({
        orgId, tipo: 'anomalia_gasto', chave: `dia:${dOntem}`,
        titulo: `Gasto ${dir} da média`,
        mensagem: `Ontem (${dOntem}) o gasto foi R$ ${gastoOntem.toFixed(2)}, ${pct(Math.abs(desvio))} ${dir.toLowerCase()} da média dos últimos dias (R$ ${media.toFixed(2)}). Confere se não é conta pausada, erro de verba ou pico inesperado.`,
        severidade: 'atencao',
      }).catch(() => ({ novo: false }))
      anomalia = (res as any).novo
    }
  }

  return NextResponse.json({ ok: true, fadigas, anomalia, criativosAvaliados: rec.size, gastoOntem, mediaGasto: Number(media.toFixed(2)) })
}
