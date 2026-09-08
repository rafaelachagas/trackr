import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buscarViraisPerfil } from '@/app/actions/conteudo'

// Re-puxa automaticamente os perfis agendados do Rastreador de Conteúdos
// (conteudo_perfis_<org>), mantendo virais e thumbnails frescos (os thumbs do
// Instagram/TikTok expiram). Roda via cron (vercel.json). Sem isto, "rastreando
// a cada 1d" nunca acontecia e as fotos quebravam.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: rows, error } = await supabaseAdmin
    .from('configuracoes').select('chave, valor, org_id').like('chave', 'conteudo_perfis_%')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agora = Date.now()
  const forcar = request.nextUrl.searchParams.get('forcar') === '1'
  let orgs = 0, atualizados = 0, falhas = 0
  const detalhe: any[] = []

  for (const row of rows ?? []) {
    let perfis: any[]
    try { perfis = JSON.parse(row.valor || '[]') } catch { continue }
    if (!Array.isArray(perfis) || !perfis.length) continue
    orgs++
    let mudou = false
    for (const p of perfis) {
      // só os agendados; pula "só salvar" (freqDias null)
      if (!p.freqDias) continue
      const ultima = p.ultimaBusca ? new Date(p.ultimaBusca).getTime() : 0
      const vencido = forcar || (agora - ultima) >= p.freqDias * 86400000
      if (!vencido) continue
      const r = await buscarViraisPerfil(p.url, '', 60)
      if (r.success) {
        p.virais = r.videos.slice(0, 60)
        if (r.perfil) { p.nome = r.perfil.nome ?? p.nome; p.bio = r.perfil.bio ?? p.bio; p.link = r.perfil.link ?? p.link }
        p.ultimaBusca = new Date().toISOString()
        mudou = true; atualizados++
        detalhe.push({ handle: p.handle, ok: true, virais: p.virais.length })
      } else {
        falhas++
        detalhe.push({ handle: p.handle, ok: false, erro: r.error })
      }
    }
    if (mudou) {
      await supabaseAdmin.from('configuracoes').upsert(
        { chave: row.chave, valor: JSON.stringify(perfis.slice(0, 60)), org_id: row.org_id, updated_at: new Date().toISOString() },
        { onConflict: 'chave' })
    }
  }

  return NextResponse.json({ ok: true, orgs, atualizados, falhas, detalhe })
}
