import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const BASE = 'https://graph.facebook.com/v25.0'

/**
 * Redireciona para o POST do Instagram do anúncio de um código (ad11, ad54...).
 * Automático: busca na Meta os anúncios cujo nome contém o código, prefere o
 * ATIVO e manda pro instagram_permalink_url do criativo. É a "prova real" de que
 * a Performance por Criativo v2 está puxando o anúncio certo. Nada é cadastrado.
 */
export async function GET(req: NextRequest) {
  const adName = (req.nextUrl.searchParams.get('ad_name') || '').trim()
  const codigoParam = (req.nextUrl.searchParams.get('codigo') || '').trim().toLowerCase()
  // O código (ad11) é a base do filtro barato na Meta. Vem do param ou do ad_name.
  const codigo = (codigoParam || (adName.match(/(ad\d+)/i)?.[1] ?? '')).toLowerCase()
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

  // Casa "ad11" em "ad11-..." / "ADV-ad11-..." mas NÃO em "ad110", "ad111".
  const re = new RegExp(`(^|[^a-z0-9])${codigo}([^0-9]|$)`, 'i')
  const alvo = adName.toLowerCase()
  // Outras contas têm anúncios com o mesmo código que não são o seu criativo
  // ("AD61 [VID] - Snapinst...", "ADV-AD61"). Nota por candidato, melhor de
  // todas as contas: nome idêntico > padrão "ad61-..." > ativo.
  let destino: string | null = null
  let notaDestino = -1

  for (const id of ids) {
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: codigo }]))
    const url = `${BASE}/act_${id.replace('act_', '')}/ads?fields=name,effective_status,creative{instagram_permalink_url}&filtering=${filtering}&limit=200&access_token=${token}`
    try {
      const j = await fetch(url).then((r) => r.json())
      for (const ad of j.data || []) {
        const nome = (ad.name || '')
        if (!re.test(nome)) continue
        const link = ad.creative?.instagram_permalink_url
        if (!link) continue
        const n = nome.toLowerCase()
        const nota = (alvo && n === alvo ? 1000 : 0)
          + (n.startsWith(`${codigo}-`) ? 100 : 0)
          + (ad.effective_status === 'ACTIVE' ? 10 : 0)
        if (nota > notaDestino) { destino = link; notaDestino = nota }
      }
    } catch {}
  }
  if (!destino) {
    const alvoTxt = adName || codigo
    return new NextResponse(
      `<!doctype html><meta charset="utf8"><body style="font-family:system-ui;background:#0b1114;color:#e2e8f0;padding:48px;text-align:center;line-height:1.6"><p style="font-size:16px">Não encontrei o post do Instagram para <b>${alvoTxt}</b>.</p><p style="color:#6b7980;font-size:13px">O anúncio pode ter sido removido, estar em outra conta ou não ter um post do Instagram vinculado.</p></body>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
  return NextResponse.redirect(destino)
}
