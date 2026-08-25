import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const BASE = 'https://graph.facebook.com/v25.0'

export interface PreviewCriativo {
  nome: string
  status: string | null
  thumbnail_url: string | null
  link_anuncio: string | null
  fase: string | null
}

/**
 * Busca AO VIVO na Meta o anúncio de um código (ad74...) e devolve thumbnail +
 * link do Instagram — pro modal "ver criativo" clicado em qualquer tabela que
 * só tem o código (ex.: Vendas × Criativos). Mesma técnica de casar código
 * de app/api/criativos/instagram/route.ts, mas devolve dado pra exibir na
 * hora em vez de redirecionar.
 */
export async function GET(req: NextRequest) {
  const codigo = (req.nextUrl.searchParams.get('codigo') || '').trim().toLowerCase()
  if (!/^ad\d+$/.test(codigo)) {
    return NextResponse.json({ error: 'código inválido' }, { status: 400 })
  }

  const { data: cfg } = await supabaseAdmin
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['meta_access_token', 'meta_ad_account_ids', 'meta_ad_account_id'])
  const map = Object.fromEntries((cfg || []).map((c) => [c.chave, c.valor]))
  const token = map['meta_access_token']
  let ids: string[] = []
  try { ids = JSON.parse(map['meta_ad_account_ids'] || '[]') } catch {}
  if (!ids.length && map['meta_ad_account_id']) ids = [map['meta_ad_account_id']]
  if (!token || !ids.length) {
    return NextResponse.json({ error: 'Meta Ads não configurado' }, { status: 400 })
  }

  // Casa "ad74" em "ad74-..." mas não em "ad740"/"ad741".
  const re = new RegExp(`(^|[^a-z0-9])${codigo}([^0-9]|$)`, 'i')

  let escolhido: { nome: string; status: string; creativeId: string | null; permalink: string | null } | null = null

  for (const id of ids) {
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: codigo }]))
    const url = `${BASE}/act_${id.replace('act_', '')}/ads?fields=name,effective_status,creative{id,instagram_permalink_url}&filtering=${filtering}&limit=200&access_token=${token}`
    try {
      const j = await fetch(url, { cache: 'no-store' }).then((r) => r.json())
      for (const ad of j.data || []) {
        const nome = ad.name || ''
        if (!re.test(nome)) continue
        const cand = { nome, status: ad.effective_status, creativeId: ad.creative?.id ?? null, permalink: ad.creative?.instagram_permalink_url ?? null }
        if (!escolhido) escolhido = cand
        if (ad.effective_status === 'ACTIVE') { escolhido = cand; break }
      }
    } catch {}
    if (escolhido?.status === 'ACTIVE') break
  }

  if (!escolhido) {
    return NextResponse.json({ error: `Não encontrei nenhum anúncio ativo ou recente pra ${codigo}.` }, { status: 404 })
  }

  let thumbnail_url: string | null = null
  if (escolhido.creativeId) {
    try {
      const r = await fetch(`${BASE}/${escolhido.creativeId}?fields=thumbnail_url,image_url&thumbnail_width=640&thumbnail_height=640&access_token=${token}`, { cache: 'no-store' })
      const j = await r.json()
      thumbnail_url = j.thumbnail_url || j.image_url || null
    } catch {}
  }

  const fase = escolhido.nome.match(/\[?(FASE\d+)\]?/i)?.[1]?.toUpperCase() ?? null

  const resultado: PreviewCriativo = {
    nome: escolhido.nome,
    status: escolhido.status,
    thumbnail_url,
    link_anuncio: escolhido.permalink,
    fase,
  }
  return NextResponse.json(resultado)
}
