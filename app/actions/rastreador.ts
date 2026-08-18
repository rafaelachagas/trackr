'use server'

import { supabaseAdmin } from '@/lib/supabase'

async function resolveOrgId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  return data?.id ?? null
}

export interface BibliotecaRastreada {
  id: string
  page_id: string
  page_name: string | null
  nome_custom: string | null
  foto_url: string | null
  link: string | null
  freq_dias: number | null
  ativo: boolean
  ultima_puxada: string | null
  created_at: string
}

export async function atualizarBiblioteca(id: string, campos: { nome_custom?: string | null; foto_url?: string | null }) {
  try {
    const patch: Record<string, any> = {}
    if ('nome_custom' in campos) patch.nome_custom = campos.nome_custom?.toString().trim() || null
    if ('foto_url' in campos) patch.foto_url = campos.foto_url?.toString().trim() || null
    const { error } = await supabaseAdmin.from('rastreador_bibliotecas').update(patch).eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function listarBibliotecas() {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_bibliotecas')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return { success: true, data: (data ?? []) as BibliotecaRastreada[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as BibliotecaRastreada[] }
  }
}

export async function salvarBiblioteca(pageId: string, pageName: string | null, link: string | null, freqDias: number | null) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const { error } = await supabaseAdmin
      .from('rastreador_bibliotecas')
      .upsert(
        { org_id: orgId, page_id: pageId, page_name: pageName, link, freq_dias: freqDias, ativo: true },
        { onConflict: 'org_id,page_id' }
      )
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function definirAgendamento(id: string, freqDias: number | null) {
  try {
    const { error } = await supabaseAdmin
      .from('rastreador_bibliotecas').update({ freq_dias: freqDias }).eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Snapshot: fotografa o estado atual de uma biblioteca (nº de criativos, etc.)
// pra montar o "movimento" ao longo do tempo. Chamado nos pulls manuais de uma
// biblioteca já salva (o cron salva os automáticos). Se a página não estiver
// salva, não faz nada (retorna naoSalva).
export async function salvarSnapshot(
  pageId: string,
  stats: { encontrados?: number; duplicacoes?: number; idade_media_dias?: number | null } | null | undefined,
  criativos: any[]
) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const { data: bib } = await supabaseAdmin
      .from('rastreador_bibliotecas')
      .select('id, page_name, nome_custom, page_id')
      .eq('org_id', orgId).eq('page_id', pageId)
      .maybeSingle()
    if (!bib) return { success: true, naoSalva: true }

    // Snapshot anterior (pra detectar anúncios NOVOS).
    const { data: anterior } = await supabaseAdmin
      .from('rastreador_snapshots').select('criativos')
      .eq('biblioteca_id', bib.id).order('puxado_em', { ascending: false }).limit(1).maybeSingle()

    const { error } = await supabaseAdmin.from('rastreador_snapshots').insert({
      biblioteca_id: bib.id,
      total: stats?.encontrados ?? criativos.length,
      duplicacoes: stats?.duplicacoes ?? 0,
      idade_media: stats?.idade_media_dias ?? null,
      criativos: criativos ?? [],
    })
    if (error) throw error

    // Novidade: ids presentes agora que não estavam no snapshot anterior.
    const nomeDisplay = (bib.nome_custom?.trim() || bib.page_name?.trim()
      || (criativos ?? []).map((c: any) => c?.page_name).find((n: any) => n && String(n).trim())
      || `Página ${bib.page_id}`)
    await registrarNovidade(orgId, bib.id, nomeDisplay, anterior?.criativos ?? null, criativos ?? [])

    // Preenche o nome da página automaticamente a partir do scrape (só se ainda não tem).
    const nomeDoScrape = (criativos ?? []).map((c: any) => c?.page_name).find((n: any) => n && String(n).trim())
    const patch: Record<string, any> = { ultima_puxada: new Date().toISOString() }
    if (!bib.page_name && nomeDoScrape) patch.page_name = nomeDoScrape
    await supabaseAdmin.from('rastreador_bibliotecas').update(patch).eq('id', bib.id)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export interface SnapshotRastreador {
  id: string
  puxado_em: string
  total: number
  duplicacoes: number
  idade_media: number | null
  criativos: any[]
}

export async function listarSnapshots(bibliotecaId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_snapshots')
      .select('id, puxado_em, total, duplicacoes, idade_media, criativos')
      .eq('biblioteca_id', bibliotecaId)
      .order('puxado_em', { ascending: false })
      .limit(60)
    if (error) throw error
    return { success: true, data: (data ?? []) as SnapshotRastreador[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as SnapshotRastreador[] }
  }
}

export async function removerBiblioteca(id: string) {
  try {
    const { error } = await supabaseAdmin.from('rastreador_bibliotecas').delete().eq('id', id)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Transcrições — cache por anúncio (ad_archive_id).
export async function salvarTranscricao(adArchiveId: string, videoUrl: string | null, texto: string) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const { error } = await supabaseAdmin
      .from('rastreador_transcricoes')
      .upsert({ org_id: orgId, ad_archive_id: adArchiveId, video_url: videoUrl, texto }, { onConflict: 'org_id,ad_archive_id' })
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ---------- Novidades (push no painel: "Fulano subiu novos anúncios") ----------

export interface NovidadeRastreador {
  id: string
  biblioteca_id: string
  page_name: string
  qtd_novos: number
  novos_ids: string[]
  criado_em: string
  visto: boolean
}

// Compara os ids do snapshot anterior com o atual; se surgiram anúncios novos
// (e havia um snapshot anterior — não é a 1ª puxada), registra uma novidade.
// Reexportável e chamado tanto no pull manual quanto no cron.
export async function registrarNovidade(
  orgId: string, bibliotecaId: string, pageName: string,
  anteriores: any[] | null, atuais: any[]
) {
  try {
    if (anteriores == null) return { success: true, novos: 0 } // 1ª puxada: sem base de comparação
    const idsAntes = new Set((anteriores ?? []).map((c: any) => c?.ad_archive_id).filter(Boolean))
    const novos = (atuais ?? []).filter((c: any) => c?.ad_archive_id && !idsAntes.has(c.ad_archive_id))
    if (novos.length === 0) return { success: true, novos: 0 }
    await supabaseAdmin.from('rastreador_novidades').insert({
      org_id: orgId,
      biblioteca_id: bibliotecaId,
      page_name: pageName,
      qtd_novos: novos.length,
      novos_ids: novos.map((c: any) => c.ad_archive_id),
    })
    return { success: true, novos: novos.length }
  } catch (e: any) {
    return { success: false, error: e.message, novos: 0 }
  }
}

export async function listarNovidades() {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_novidades')
      .select('id, biblioteca_id, page_name, qtd_novos, novos_ids, criado_em, visto')
      .order('criado_em', { ascending: false })
      .limit(30)
    if (error) throw error
    return { success: true, data: (data ?? []) as NovidadeRastreador[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as NovidadeRastreador[] }
  }
}

export async function marcarNovidadesVistas(ids?: string[]) {
  try {
    let q = supabaseAdmin.from('rastreador_novidades').update({ visto: true }).eq('visto', false)
    if (ids && ids.length) q = q.in('id', ids)
    const { error } = await q
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function getTranscricoes(adIds: string[]) {
  try {
    if (!adIds.length) return { success: true, data: {} as Record<string, string> }
    const { data, error } = await supabaseAdmin
      .from('rastreador_transcricoes')
      .select('ad_archive_id, texto')
      .in('ad_archive_id', adIds)
    if (error) throw error
    const map: Record<string, string> = {}
    for (const r of data ?? []) if (r.ad_archive_id && r.texto) map[r.ad_archive_id] = r.texto
    return { success: true, data: map }
  } catch (e: any) {
    return { success: false, error: e.message, data: {} as Record<string, string> }
  }
}
