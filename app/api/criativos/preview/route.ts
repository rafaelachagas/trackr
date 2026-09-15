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

  // Nome completo do anúncio da linha (quando a tela tem) — é o que garante
  // abrir o vídeo CERTO.
  const alvo = (req.nextUrl.searchParams.get('nome') || '').trim().toLowerCase()

  // Casa "ad74" em "ad74-..." mas não em "ad740"/"ad741".
  const re = new RegExp(`(^|[^a-z0-9])${codigo}([^0-9]|$)`, 'i')

  // Várias contas têm anúncios com o mesmo código que NÃO são o seu criativo
  // (ex: "AD61 [VID] - Snapinst..." de uma campanha de 2025 noutra conta,
  // "ADV-AD61" de outro produto). Antes ficava o primeiro que aparecesse.
  // Agora cada candidato ganha nota e fica o melhor de TODAS as contas:
  //   nome idêntico ao da linha > padrão "ad61-..." > ativo > tem post.
  type Cand = { nome: string; status: string; creativeId: string | null; permalink: string | null; nota: number }
  let escolhido: Cand | null = null

  for (const id of ids) {
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: codigo }]))
    const url = `${BASE}/act_${id.replace('act_', '')}/ads?fields=name,effective_status,creative{id,instagram_permalink_url}&filtering=${filtering}&limit=200&access_token=${token}`
    try {
      const j = await fetch(url, { cache: 'no-store' }).then((r) => r.json())
      for (const ad of j.data || []) {
        const nome: string = ad.name || ''
        if (!re.test(nome)) continue
        const n = nome.toLowerCase()
        const permalink = ad.creative?.instagram_permalink_url ?? null
        const nota = (alvo && n === alvo ? 1000 : 0)
          + (n.startsWith(`${codigo}-`) ? 100 : 0)
          + (ad.effective_status === 'ACTIVE' ? 10 : 0)
          + (permalink ? 1 : 0)
        if (!escolhido || nota > escolhido.nota) {
          escolhido = { nome, status: ad.effective_status, creativeId: ad.creative?.id ?? null, permalink, nota }
        }
      }
    } catch {}
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
