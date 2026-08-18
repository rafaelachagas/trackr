'use server'

import { supabaseAdmin } from '@/lib/supabase'

export interface SwipeItem {
  ad_archive_id: string
  biblioteca_id: string
  page_name: string | null
  nicho: string | null
  oferta: string | null
  headline: string | null
  body: string | null
  angulo: string | null
  angulo_resumo: string | null
  classificacao: string | null
  dias_no_ar: number
  status: string
  snapshot_url: string | null
  transcricao: string | null
}

// Busca no "swipe file": criativos + transcrições de TODOS os concorrentes,
// filtrável por nicho, oferta, ângulo e texto livre.
export async function buscarSwipe(filtros: {
  termo?: string | null
  nicho?: string | null
  oferta?: string | null
  angulo?: string | null
  limite?: number
}) {
  try {
    const limite = Math.min(200, filtros.limite ?? 60)

    // Bibliotecas (pra nome/nicho/oferta e filtro por nicho/oferta).
    const { data: bibs } = await supabaseAdmin
      .from('rastreador_bibliotecas')
      .select('id, page_id, page_name, nome_custom, nicho, oferta')
    const meta = new Map<string, any>()
    for (const b of bibs ?? []) meta.set(b.id, b)

    let bibIds = [...meta.keys()]
    const nicho = filtros.nicho?.trim().toLowerCase()
    const oferta = filtros.oferta?.trim().toLowerCase()
    if (nicho) bibIds = bibIds.filter((id) => (meta.get(id)?.nicho || '').toLowerCase().includes(nicho))
    if (oferta) bibIds = bibIds.filter((id) => (meta.get(id)?.oferta || '').toLowerCase().includes(oferta))
    if (bibIds.length === 0) return { success: true, data: [] as SwipeItem[] }

    // Criativos do histórico dessas bibliotecas.
    let q = supabaseAdmin
      .from('rastreador_criativos_hist')
      .select('ad_archive_id, biblioteca_id, headline, body, angulo, angulo_resumo, classificacao, dias_no_ar, status, snapshot_url')
      .in('biblioteca_id', bibIds)
      .order('dias_no_ar', { ascending: false })
      .limit(limite * 3)
    if (filtros.angulo) q = q.eq('angulo', filtros.angulo)
    const termo = filtros.termo?.trim()
    if (termo) q = q.or(`headline.ilike.%${termo}%,body.ilike.%${termo}%,angulo_resumo.ilike.%${termo}%`)
    const { data: rows, error } = await q
    if (error) throw error

    let lista = rows ?? []

    // Transcrições dos ids retornados (e, se busca por texto, também casa na transcrição).
    const ids = lista.map((r: any) => r.ad_archive_id)
    const trans: Record<string, string> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin
        .from('rastreador_transcricoes').select('ad_archive_id, texto').in('ad_archive_id', ids.slice(i, i + 200))
      for (const r of data ?? []) if (r.ad_archive_id && r.texto) trans[r.ad_archive_id] = r.texto
    }

    // Se busca por texto, criativos sem match no headline/body mas com match na
    // transcrição também entram (busca separada limitada).
    if (termo) {
      const { data: tHits } = await supabaseAdmin
        .from('rastreador_transcricoes').select('ad_archive_id, texto').ilike('texto', `%${termo}%`).limit(limite)
      const jaTem = new Set(lista.map((r: any) => r.ad_archive_id))
      const faltantes = (tHits ?? []).map((t) => t.ad_archive_id).filter((id) => id && !jaTem.has(id))
      if (faltantes.length) {
        const { data: extra } = await supabaseAdmin
          .from('rastreador_criativos_hist')
          .select('ad_archive_id, biblioteca_id, headline, body, angulo, angulo_resumo, classificacao, dias_no_ar, status, snapshot_url')
          .in('ad_archive_id', faltantes).in('biblioteca_id', bibIds)
        for (const r of extra ?? []) {
          lista.push(r)
          const t = (tHits ?? []).find((x) => x.ad_archive_id === r.ad_archive_id)
          if (t?.texto) trans[r.ad_archive_id] = t.texto
        }
      }
    }

    const out: SwipeItem[] = lista.slice(0, limite).map((r: any) => {
      const b = meta.get(r.biblioteca_id)
      return {
        ad_archive_id: r.ad_archive_id,
        biblioteca_id: r.biblioteca_id,
        page_name: b?.nome_custom || b?.page_name || (b?.page_id ? `Página ${b.page_id}` : null),
        nicho: b?.nicho ?? null,
        oferta: b?.oferta ?? null,
        headline: r.headline, body: r.body,
        angulo: r.angulo, angulo_resumo: r.angulo_resumo,
        classificacao: r.classificacao, dias_no_ar: r.dias_no_ar ?? 0, status: r.status,
        snapshot_url: r.snapshot_url,
        transcricao: trans[r.ad_archive_id] ?? null,
      }
    })

    return { success: true, data: out }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as SwipeItem[] }
  }
}

// Lista de nichos/ofertas já cadastrados (pra montar os filtros na UI).
export async function listarNichosOfertas() {
  try {
    const { data } = await supabaseAdmin.from('rastreador_bibliotecas').select('nicho, oferta')
    const nichos = new Set<string>(), ofertas = new Set<string>()
    for (const r of data ?? []) {
      if (r.nicho?.trim()) nichos.add(r.nicho.trim())
      if (r.oferta?.trim()) ofertas.add(r.oferta.trim())
    }
    return { success: true, nichos: [...nichos].sort(), ofertas: [...ofertas].sort() }
  } catch (e: any) {
    return { success: false, error: e.message, nichos: [], ofertas: [] }
  }
}
