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
    return { erro: `${path} respondeu ${r.status}`, data: null as any, body: txt.slice(0, 600) }
  }
  return { erro: null, data: await r.json().catch(() => null), body: null }
}

// Curva de retenção no formato da VTurb. A API (/times/user_engagement) devolve
// `grouped_timed` = quantos usuários SAÍRAM em cada marca de 5s (ponto de abandono),
// não quantos ainda estão assistindo. A retenção em t é a soma dos que saíram em
// t ou depois ÷ total — acumulada do fim pro começo. É isso que dá a curva que
// começa em 100% e vai caindo, igual ao painel da VTurb. (Ver prova em
// scripts/tmp/vt3.mjs: pitch 20,30% vs 20,31 da VTurb; 1 min 39,22% vs 39,25.)
function curvaSobreviventes(grouped: any[]): { pontos: { t: number; pct: number; users: number }[]; total: number } {
  const saidas = (Array.isArray(grouped) ? grouped : [])
    .map((g: any) => ({ t: Number(g?.timed ?? g?.time ?? g?.second ?? 0), n: Number(g?.total_users ?? g?.count ?? g?.users ?? 0) }))
    .sort((a, b) => a.t - b.t)
  const total = saidas.reduce((a, s) => a + s.n, 0)
  if (total === 0) return { pontos: [], total: 0 }
  let acumAntes = 0
  const pontos = saidas.map((s) => {
    const vivos = total - acumAntes
    acumAntes += s.n
    return { t: s.t, users: vivos, pct: (vivos / total) * 100 }
  })
  return { pontos, total }
}

// % de usuários que ainda assistiam no segundo `t` (último ponto <= t).
function sobreviventesEm(pontos: { t: number; pct: number; users: number }[], t: number) {
  let p = pontos[0]
  for (const x of pontos) { if (x.t <= t) p = x; else break }
  return p ?? { pct: 0, users: 0, t }
}

const CAMPOS_ABA: Record<string, { tipo: 'field' | 'traffic'; chave: string }> = {
  paises: { tipo: 'field', chave: 'country' },
  dispositivos: { tipo: 'field', chave: 'device_type' },
  navegadores: { tipo: 'field', chave: 'browser' },
  origem: { tipo: 'traffic', chave: 'utm_source' },
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const vslId = sp.get('vsl_id')
  if (!vslId) return NextResponse.json({ error: 'vsl_id obrigatório.' }, { status: 400 })

  const agora = toZonedTime(new Date(), TZ)
  const dInicio = sp.get('d_inicio') ?? format(subDays(agora, 6), 'yyyy-MM-dd')
  const dFim = sp.get('d_fim') ?? format(agora, 'yyyy-MM-dd')
  // A VTurb exige datetime com hora/min/seg (yyyy-MM-dd HH:mm:ss), não só a data.
  // E o `timezone` é obrigatório pra bater com o painel deles — sem ele a VTurb
  // corta o dia em UTC e os números divergem do que aparece lá.
  const dtInicio = `${dInicio} 00:00:00`
  const dtFim = `${dFim} 23:59:59`
  const aba = sp.get('aba') // paises | dispositivos | navegadores | origem | (vazio = geral)
  const queryKey = sp.get('query_key') || 'utm_source'

  // Chave VTurb + VSL
  const [{ data: cfg }, { data: vsl }] = await Promise.all([
    supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'vturb_api_key').maybeSingle(),
    supabaseAdmin.from('vsls').select('*').eq('id', vslId).maybeSingle(),
  ])
  const token = cfg?.valor?.toString().trim()
  if (!token) return NextResponse.json({ error: 'Chave VTurb não configurada.' }, { status: 400 })
  if (!vsl) return NextResponse.json({ error: 'VSL não encontrado.' }, { status: 404 })

  const playerId = vsl.vturb_player_id
  const campanhas: string[] = Array.isArray(vsl.campanhas) ? vsl.campanhas : []
  const base = { player_id: playerId, start_date: dtInicio, end_date: dtFim, timezone: TZ }

  // Player: duração e pitch_time (o "Retenção ao Pitch" da VTurb depende dele).
  let dur = Number(vsl.video_duration) || undefined
  let pitchTime: number | undefined
  try {
    const r = await fetch(`${VTURB_ANALYTICS_BASE}/players/list`, { headers: vturbHeaders(token), cache: 'no-store' })
    const arr: any[] = r.ok ? await r.json() : []
    const p = (Array.isArray(arr) ? arr : []).find((x: any) => String(x?.id) === String(playerId))
    if (p) {
      dur = Number(p.duration ?? p.video_duration) || dur
      pitchTime = Number(p.pitch_time) || undefined
    }
  } catch {}

  // ---- Abas de quebra (Países / Dispositivos / Navegadores / Origem) ----
  if (aba && CAMPOS_ABA[aba]) {
    const cfgAba = CAMPOS_ABA[aba]
    const path = cfgAba.tipo === 'field' ? '/sessions/stats_by_field' : '/traffic_origin/stats'
    const body = cfgAba.tipo === 'field'
      ? { ...base, field: cfgAba.chave, video_duration: dur, pitch_time: pitchTime }
      : { ...base, query_key: queryKey, video_duration: dur, pitch_time: pitchTime }
    const r = await vturbPost(token, path, body)
    const rows = (Array.isArray(r.data) ? r.data : []).map((x: any) => ({
      grupo: String(x.grouped_field ?? '—'),
      visualizacoes: pick(x, ['total_viewed']),
      visualizacoesUnicas: pick(x, ['total_viewed_device_uniq', 'total_viewed_session_uniq']),
      plays: pick(x, ['total_started']),
      playsUnicos: pick(x, ['total_started_device_uniq', 'total_started_session_uniq']),
      playRate: pick(x, ['play_rate']),
      retencaoPitch: pick(x, ['over_pitch_rate']),
      engajamento: pick(x, ['engagement_rate']),
      cliques: pick(x, ['total_clicked_session_uniq', 'total_clicked']),
      conversoes: pick(x, ['total_conversions']),
      taxaConversao: pick(x, ['overall_conversion_rate']),
      receita: pick(x, ['total_amount_brl']) / 100,
    })).sort((a: any, b: any) => b.visualizacoes - a.visualizacoes)
    return NextResponse.json({ ok: true, aba, rows, erro: r.erro })
  }

  // ---- Geral ----
  const [reten, stats, convTimed] = await Promise.all([
    vturbPost(token, '/times/user_engagement', { ...base, video_duration: dur }),
    vturbPost(token, '/sessions/stats', { ...base, video_duration: dur, pitch_time: pitchTime }),
    vturbPost(token, '/conversions/video_timed', base),
  ])

  const grouped: any[] = reten.data?.grouped_timed ?? reten.data?.groupedTimed ?? (Array.isArray(reten.data) ? reten.data : [])
  const { pontos, total: totalCurva } = curvaSobreviventes(grouped)
  const duracao = dur ?? (pontos.length ? pontos[pontos.length - 1].t : undefined)

  const s = stats.data ?? {}
  const visualizacoes = pick(s, ['total_viewed'])
  const visualizacoesUnicas = pick(s, ['total_viewed_device_uniq', 'total_viewed_session_uniq', 'total_viewed'])
  const plays = pick(s, ['total_started'])
  const playsUnicos = pick(s, ['total_started_device_uniq', 'total_started_session_uniq', 'total_started'])
  const playRateVturb = pick(s, ['play_rate']) || (visualizacoesUnicas > 0 ? (playsUnicos / visualizacoesUnicas) * 100 : 0)
  const engajamento = pick(reten.data, ['engagement_rate']) || pick(s, ['engagement_rate'])
  const cliques = pick(s, ['total_clicked_session_uniq', 'total_clicked_device_uniq', 'total_clicked'])
  const conversoes = pick(s, ['total_conversions'])
  const taxaConversao = pick(s, ['overall_conversion_rate']) || (playsUnicos > 0 ? (conversoes / playsUnicos) * 100 : 0)
  const receitaBrlCent = pick(s, ['total_amount_brl'])
  const receitaUsdCent = pick(s, ['total_amount_usd'])
  const receitaVturb = receitaBrlCent > 0 ? receitaBrlCent / 100 : (receitaUsdCent > 0 ? (receitaUsdCent / 100) * 5.2 : 0)

  // Pitch e 1 min: lidos da curva (é assim que o painel da VTurb calcula).
  const noPitch = pitchTime ? sobreviventesEm(pontos, pitchTime) : null
  const retencaoPitch = noPitch ? noPitch.pct : pick(s, ['over_pitch_rate'])
  const audienciaPitch = noPitch ? noPitch.users : pick(s, ['total_over_pitch'])
  const retencao1Min = pontos.length ? sobreviventesEm(pontos, 60).pct : 0

  // Conversões ao longo do vídeo (toggle "Conversões" do gráfico).
  const conversoesTimed = (Array.isArray(convTimed.data) ? convTimed.data : []).map((c: any) => ({
    t: Number(c.timed) || 0,
    conversoes: Number(c.timed_conversions) || 0,
    acumulado: Number(c.cumulative_conversions) || 0,
    receita: (Number(c.timed_amount_brl) || 0) / 100,
  }))

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
    player: { id: playerId, duracao, pitchTime },
    vturb: {
      visualizacoes, visualizacoesUnicas, plays, playsUnicos, playRateVturb,
      retencaoPitch, audienciaPitch, engajamento, cliques, conversoes, taxaConversao,
      receitaVturb, retencao1Min,
      // compat com quem ainda lê os nomes antigos
      viewsUnicas: visualizacoesUnicas,
    },
    meta: { lpViews, gasto },
    real: { playRateReal, custoPorPlay, custoPorLp, roas, cpa },
    retencao: pontos.map((p) => ({ t: p.t, pct: p.pct })),
    retencaoTotal: totalCurva,
    conversoesTimed,
    _raw: {
      statsErro: stats.erro, statsBody: stats.body, retenErro: reten.erro,
      statsKeys: s && typeof s === 'object' ? Object.keys(s) : null,
    },
  })
}
