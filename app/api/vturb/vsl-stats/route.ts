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
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    return { erro: `${path} respondeu ${r.status}`, data: null, body: txt.slice(0, 600) }
  }
  return { erro: null, data: await r.json().catch(() => null), body: null }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const vslId = sp.get('vsl_id')
  if (!vslId) return NextResponse.json({ error: 'vsl_id obrigatório.' }, { status: 400 })

  const agora = toZonedTime(new Date(), TZ)
  const dInicio = sp.get('d_inicio') ?? format(subDays(agora, 6), 'yyyy-MM-dd')
  const dFim = sp.get('d_fim') ?? format(agora, 'yyyy-MM-dd')
  // A VTurb exige datetime com hora/min/seg (yyyy-MM-dd HH:mm:ss), não só a data.
  const dtInicio = `${dInicio} 00:00:00`
  const dtFim = `${dFim} 23:59:59`

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

  // 1) Curva de retenção primeiro — além da curva, ela dá a DURAÇÃO do vídeo
  // (maior "timed"), que o /sessions/stats exige (e faltava → dava 400).
  const reten = await vturbPost(token, '/times/user_engagement', { player_id: playerId, start_date: dtInicio, end_date: dtFim, video_duration: dur })

  const grouped: any[] = reten.data?.grouped_timed ?? reten.data?.groupedTimed ?? reten.data?.retention ?? (Array.isArray(reten.data) ? reten.data : [])
  const curva = (Array.isArray(grouped) ? grouped : []).map((g: any) => ({
    t: Number(g?.timed ?? g?.time ?? g?.second ?? g?.t ?? 0),
    users: Number(g?.total_users ?? g?.count ?? g?.users ?? g?.value ?? 0),
  })).sort((a, b) => a.t - b.t)
  const base = curva.length ? (curva[0].users || Math.max(...curva.map((c) => c.users), 1)) : 0
  const retencao = curva.map((c) => ({ t: c.t, pct: base > 0 ? Math.min(100, (c.users / base) * 100) : 0 }))

  // Duração: a do cadastro, ou a maior marca de tempo da curva.
  const duracaoEstimada = curva.length ? Math.max(...curva.map((c) => c.t)) : undefined
  const durFinal = dur ?? (duracaoEstimada || undefined)

  // 2) Métricas agregadas, agora com a duração resolvida.
  const stats = await vturbPost(token, '/sessions/stats', { player_id: playerId, start_date: dtInicio, end_date: dtFim, video_duration: durFinal })

  const s = stats.data ?? {}
  // Nomes REAIS da VTurb (/sessions/stats):
  // views = total_viewed_*, plays/started = total_started_*, receita = total_amount_brl (em centavos).
  const viewsUnicas = pick(s, ['total_viewed_device_uniq', 'total_viewed_session_uniq', 'total_viewed'])
  const playsUnicos = pick(s, ['total_started_device_uniq', 'total_started_session_uniq', 'total_started'])
  const playRateVturb = pick(s, ['play_rate', 'playRate']) || (viewsUnicas > 0 ? (playsUnicos / viewsUnicas) * 100 : 0)
  const engajamento = pick(s, ['engagement_rate', 'engagement', 'engagementRate'])
  const conversoes = pick(s, ['total_conversions', 'conversions', 'conversions_count'])
  // total_amount_brl vem em centavos (inteiro) → divide por 100. Fallback USD × ~5,2.
  const receitaBrlCent = pick(s, ['total_amount_brl'])
  const receitaUsdCent = pick(s, ['total_amount_usd'])
  const receitaVturb = receitaBrlCent > 0 ? receitaBrlCent / 100 : (receitaUsdCent > 0 ? (receitaUsdCent / 100) * 5.2 : 0)

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
    _raw: {
      statsErro: stats.erro,
      statsBody: stats.body,
      durEnviada: durFinal,
      retenErro: reten.erro,
      statsKeys: s && typeof s === 'object' ? Object.keys(s) : null,
      statsRaw: stats.data,
      retenSample: Array.isArray(grouped) ? grouped.slice(0, 2) : reten.data,
    },
  })
}
