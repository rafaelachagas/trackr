import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { VTURB_ANALYTICS_BASE, vturbHeaders } from '@/lib/vturb'
import { toZonedTime } from 'date-fns-tz'
import { subDays, format } from 'date-fns'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TZ = 'America/Sao_Paulo'

// Lê um número tolerando vários nomes de campo e caminhos aninhados.
function pick(obj: any, keys: string[]): number {
  if (!obj) return 0
  for (const k of keys) {
    const parts = k.split('.')
    let v: any = obj
    for (const p of parts) v = v?.[p]
    if (v != null && !isNaN(Number(v))) return Number(v)
  }
  return 0
}

async function vturbPost(token: string, path: string, body: any) {
  const r = await fetch(`${VTURB_ANALYTICS_BASE}${path}`, {
    method: 'POST',
    headers: { ...vturbHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!r.ok) return { erro: `${path} respondeu ${r.status}`, data: null }
  return { erro: null, data: await r.json().catch(() => null) }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const vslId = sp.get('vsl_id')
  if (!vslId) return NextResponse.json({ error: 'vsl_id obrigatório.' }, { status: 400 })

  const agora = toZonedTime(new Date(), TZ)
  const dInicio = sp.get('d_inicio') ?? format(subDays(agora, 6), 'yyyy-MM-dd')
  const dFim = sp.get('d_fim') ?? format(agora, 'yyyy-MM-dd')

  // Chave VTurb + VSL
  const [{ data: cfg }, { data: vsl }] = await Promise.all([
    supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'vturb_api_key').maybeSingle(),
    supabaseAdmin.from('vsls').select('*').eq('id', vslId).maybeSingle(),
  ])
  const token = cfg?.valor?.toString().trim()
  if (!token) return NextResponse.json({ error: 'Chave VTurb não configurada.' }, { status: 400 })
  if (!vsl) return NextResponse.json({ error: 'VSL não encontrado.' }, { status: 404 })

  const playerId = vsl.vturb_player_id
  const dur = Number(vsl.video_duration) || undefined
  const campanhas: string[] = Array.isArray(vsl.campanhas) ? vsl.campanhas : []

  // 1) Métricas agregadas + 2) curva de retenção (VTurb) — em paralelo.
  const [stats, reten] = await Promise.all([
    vturbPost(token, '/sessions/stats', { player_id: playerId, start_date: dInicio, end_date: dFim, video_duration: dur }),
    vturbPost(token, '/times/user_engagement', { player_id: playerId, start_date: dInicio, end_date: dFim, video_duration: dur }),
  ])

  const s = stats.data ?? {}
  const viewsUnicas = pick(s, ['unique_views', 'views_unique', 'uniqueViews', 'views'])
  const playsUnicos = pick(s, ['unique_plays', 'plays_unique', 'uniquePlays', 'plays'])
  const playRateVturb = pick(s, ['play_rate', 'playRate']) || (viewsUnicas > 0 ? (playsUnicos / viewsUnicas) * 100 : 0)
  const engajamento = pick(s, ['engagement_rate', 'engagement', 'engagementRate'])
  const conversoes = pick(s, ['conversions', 'conversions_count', 'conversionsCount'])
  const receitaVturb = pick(s, ['revenue_brl', 'revenue.brl', 'revenueBRL', 'revenue'])

  // Curva de retenção → [{ t, pct }] normalizada pelo 1º ponto.
  const grouped: any[] = reten.data?.grouped_timed ?? reten.data?.groupedTimed ?? reten.data?.retention ?? []
  let base = 0
  const curva = (Array.isArray(grouped) ? grouped : []).map((g: any) => ({
    t: Number(g?.time ?? g?.second ?? g?.t ?? 0),
    users: Number(g?.count ?? g?.users ?? g?.value ?? 0),
  }))
  if (curva.length) base = curva[0].users || Math.max(...curva.map((c) => c.users), 1)
  const retencao = curva.map((c) => ({ t: c.t, pct: base > 0 ? Math.min(100, (c.users / base) * 100) : 0 }))

  // 3) LP views + gasto da Meta (campanhas mapeadas; vazio = todas).
  let lpViews = 0, gasto = 0
  for (let off = 0; ; off += 1000) {
    let q = supabaseAdmin
      .from('gastos')
      .select('lp_views, valor_gasto, campaign_id')
      .gte('data', dInicio).lte('data', dFim)
      .not('ad_id', 'is', null)
      .range(off, off + 999)
    if (campanhas.length > 0) q = q.in('campaign_id', campanhas)
    const { data, error } = await q
    if (error) break
    if (!data || data.length === 0) break
    for (const g of data) {
      lpViews += Number((g as any).lp_views) || 0
      gasto += Number((g as any).valor_gasto) || 0
    }
    if (data.length < 1000) break
  }

  // Play Rate REAL: plays únicos (VTurb) ÷ LP views (Meta).
  const playRateReal = lpViews > 0 ? (playsUnicos / lpViews) * 100 : null
  const custoPorPlay = playsUnicos > 0 ? gasto / playsUnicos : null
  const custoPorLp = lpViews > 0 ? gasto / lpViews : null
  const roas = gasto > 0 ? receitaVturb / gasto : null
  const cpa = conversoes > 0 ? gasto / conversoes : null

  return NextResponse.json({
    ok: true,
    periodo: { d_inicio: dInicio, d_fim: dFim },
    vturb: { viewsUnicas, playsUnicos, playRateVturb, engajamento, conversoes, receitaVturb },
    meta: { lpViews, gasto },
    real: { playRateReal, custoPorPlay, custoPorLp, roas, cpa },
    retencao,
    // Eco cru pra depurar/lapidar os nomes de campo sem adivinhar.
    _raw: { statsErro: stats.erro, retenErro: reten.erro, statsKeys: s && typeof s === 'object' ? Object.keys(s) : null },
  })
}
