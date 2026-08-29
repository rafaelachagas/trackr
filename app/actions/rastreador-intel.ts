'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { resolveOrgId } from '@/lib/resolve-org'
import {
  aplicarLoteHistorico, scoreForca, frequenciaTroca,
  type HistRow, type ClassificacaoTeste,
} from '@/lib/rastreador-intel'

// Colunas que persistimos (sem os campos auxiliares tipo _dirty).
const COLS_HIST = 'ad_archive_id,page_name,headline,body,cta_text,link_url,media_type,video_url,image_url,snapshot_url,start_date,primeiro_visto,ultimo_visto,removido_em,status,copias,pico_copias,dias_no_ar,classificacao,angulo,angulo_resumo,transcricao_hash'

function linhaParaDB(orgId: string, bibliotecaId: string, r: HistRow) {
  return {
    org_id: orgId,
    biblioteca_id: bibliotecaId,
    ad_archive_id: r.ad_archive_id,
    page_name: r.page_name, headline: r.headline, body: r.body, cta_text: r.cta_text,
    link_url: r.link_url, media_type: r.media_type, video_url: r.video_url,
    image_url: r.image_url, snapshot_url: r.snapshot_url, start_date: r.start_date,
    primeiro_visto: r.primeiro_visto, ultimo_visto: r.ultimo_visto, removido_em: r.removido_em,
    status: r.status, copias: r.copias, pico_copias: r.pico_copias,
    dias_no_ar: r.dias_no_ar, classificacao: r.classificacao,
    angulo: r.angulo ?? null, angulo_resumo: r.angulo_resumo ?? null,
    transcricao_hash: r.transcricao_hash ?? null,
    atualizado_em: new Date().toISOString(),
  }
}

async function carregarMapa(bibliotecaId: string): Promise<Map<string, HistRow>> {
  const map = new Map<string, HistRow>()
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabaseAdmin
      .from('rastreador_criativos_hist').select(COLS_HIST)
      .eq('biblioteca_id', bibliotecaId).range(off, off + 999)
    if (error || !data || data.length === 0) break
    for (const r of data as any[]) map.set(r.ad_archive_id, { ...(r as HistRow), _dirty: false })
    if (data.length < 1000) break
  }
  return map
}

async function gravarDirty(orgId: string, bibliotecaId: string, map: Map<string, HistRow>) {
  const dirty = [...map.values()].filter((r) => r._dirty).map((r) => linhaParaDB(orgId, bibliotecaId, r))
  for (let i = 0; i < dirty.length; i += 500) {
    const { error } = await supabaseAdmin
      .from('rastreador_criativos_hist')
      .upsert(dirty.slice(i, i + 500), { onConflict: 'biblioteca_id,ad_archive_id' })
    if (error) throw error
  }
}

// Fold ao vivo: aplica UM lote novo de criativos (vindo de um pull) ao
// histórico existente. Retorna o que saiu/entrou pra quem quiser alertar.
export async function foldHistoricoAoVivo(bibliotecaId: string, criativos: any[]) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    const map = await carregarMapa(bibliotecaId)
    const delta = aplicarLoteHistorico(map, criativos ?? [], new Date().toISOString())
    await gravarDirty(orgId, bibliotecaId, map)
    return { success: true, ...delta }
  } catch (e: any) {
    return { success: false, error: e.message, removidos: [], novos: [], reativados: [] }
  }
}

// Reconstrói o histórico de uma biblioteca a partir de TODOS os snapshots
// já salvos (ordem cronológica). Use pra popular o histórico da 1ª vez.
export async function reconstruirHistorico(bibliotecaId: string) {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')

    const { data: snaps, error } = await supabaseAdmin
      .from('rastreador_snapshots').select('puxado_em, criativos')
      .eq('biblioteca_id', bibliotecaId).order('puxado_em', { ascending: true })
    if (error) throw error

    const map = new Map<string, HistRow>()
    for (const s of snaps ?? []) {
      const criativos = Array.isArray((s as any).criativos) ? (s as any).criativos : []
      aplicarLoteHistorico(map, criativos, (s as any).puxado_em)
    }
    // Marca tudo como dirty pra regravar do zero.
    for (const r of map.values()) r._dirty = true
    await gravarDirty(orgId, bibliotecaId, map)
    return { success: true, total: map.size }
  } catch (e: any) {
    return { success: false, error: e.message, total: 0 }
  }
}

export interface CriativoHist extends HistRow {
  biblioteca_id?: string
}

// Lista o histórico de criativos de uma biblioteca (reconstrói na hora se
// ainda estiver vazio, pra funcionar de primeira sem passo manual).
export async function listarCriativosHist(bibliotecaId: string) {
  try {
    let { data, error } = await supabaseAdmin
      .from('rastreador_criativos_hist')
      .select(COLS_HIST)
      .eq('biblioteca_id', bibliotecaId)
      .order('dias_no_ar', { ascending: false })
      .limit(500)
    if (error) throw error
    if (!data || data.length === 0) {
      await reconstruirHistorico(bibliotecaId)
      const r2 = await supabaseAdmin
        .from('rastreador_criativos_hist').select(COLS_HIST)
        .eq('biblioteca_id', bibliotecaId).order('dias_no_ar', { ascending: false }).limit(500)
      data = r2.data as any
    }
    return { success: true, data: (data ?? []) as CriativoHist[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as CriativoHist[] }
  }
}

export interface ResumoInteligencia {
  score: number
  variacoesAtivas: number
  picoVariacoes: number
  freqTroca: number
  diasObservados: number
  ativos: number
  removidos: number
  campeao: { headline: string | null; dias: number; classificacao: string } | null
  porClassificacao: Record<string, number>
  porAngulo: Record<string, number>
}

// Resumo da força do concorrente (score + distribuições).
export async function resumoInteligencia(bibliotecaId: string): Promise<{ success: boolean; error?: string; data: ResumoInteligencia | null }> {
  try {
    const { data: rows } = await listarCriativosHist(bibliotecaId)
    const lista = rows ?? []
    if (lista.length === 0) {
      return { success: true, data: { score: 0, variacoesAtivas: 0, picoVariacoes: 0, freqTroca: 0, diasObservados: 0, ativos: 0, removidos: 0, campeao: null, porClassificacao: {}, porAngulo: {} } }
    }

    const ativosRows = lista.filter((r) => r.status === 'ativo')
    const variacoesAtivas = ativosRows.reduce((s, r) => s + (Number(r.copias) || 1), 0)
    const picoVariacoes = lista.reduce((m, r) => Math.max(m, Number(r.pico_copias) || 1), 0)

    // Janela observada = do primeiro "primeiro_visto" até agora.
    const primeiros = lista.map((r) => Date.parse(r.primeiro_visto)).filter((n) => !isNaN(n))
    const inicioObs = primeiros.length ? Math.min(...primeiros) : Date.now()
    const diasObservados = Math.max(1, Math.round((Date.now() - inicioObs) / 86400000))
    const freqTroca = frequenciaTroca(lista.length, diasObservados)

    // Campeão = maior tempo no ar.
    const campeaoRow = [...lista].sort((a, b) => (b.dias_no_ar || 0) - (a.dias_no_ar || 0))[0]
    const maiorDias = campeaoRow?.dias_no_ar || 0

    const score = scoreForca({ diasNoAr: maiorDias, variacoesAtivas, picoVariacoes })

    const porClassificacao: Record<string, number> = {}
    const porAngulo: Record<string, number> = {}
    for (const r of lista) {
      const cl = r.classificacao || 'em_teste'
      porClassificacao[cl] = (porClassificacao[cl] || 0) + 1
      const an = r.angulo || 'indefinido'
      porAngulo[an] = (porAngulo[an] || 0) + 1
    }

    return {
      success: true,
      data: {
        score, variacoesAtivas, picoVariacoes, freqTroca, diasObservados,
        ativos: ativosRows.length, removidos: lista.length - ativosRows.length,
        campeao: campeaoRow ? { headline: campeaoRow.headline, dias: maiorDias, classificacao: campeaoRow.classificacao } : null,
        porClassificacao, porAngulo,
      },
    }
  } catch (e: any) {
    return { success: false, error: e.message, data: null }
  }
}

export interface PontoEscala {
  dia: string          // yyyy-MM-dd
  ativos: number       // criativos únicos no ar
  totalComCopias: number  // únicos + duplicações (pressão real de veiculação)
}

// Série histórica de "pressão de escala": quantos anúncios o concorrente
// mantém no ar ao longo do tempo (1 ponto por dia, último snapshot do dia).
export async function serieEscala(bibliotecaId: string): Promise<{ success: boolean; data: PontoEscala[]; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_snapshots')
      .select('puxado_em, total, duplicacoes')
      .eq('biblioteca_id', bibliotecaId)
      .order('puxado_em', { ascending: true })
      .limit(400)
    if (error) throw error
    const porDia = new Map<string, PontoEscala>()
    for (const s of data ?? []) {
      const dia = String(s.puxado_em).slice(0, 10)
      porDia.set(dia, {
        dia,
        ativos: Number(s.total) || 0,
        totalComCopias: (Number(s.total) || 0) + (Number(s.duplicacoes) || 0),
      })
    }
    return { success: true, data: [...porDia.values()] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] }
  }
}

// ---- Tráfego estimado (leituras manuais do SimilarWeb) ----
// A extensão do SimilarWeb dá visitas/mês estimadas do domínio; a gente não
// tem como puxar isso por API grátis, então o usuário registra a leitura e o
// painel cruza com a pressão de escala. Guardado em configuracoes (JSON).

export interface LeituraTrafego { mes: string; visitas: number }  // mes: yyyy-MM

export async function listarTrafegoManual(bibliotecaId: string): Promise<{ success: boolean; data: LeituraTrafego[] }> {
  try {
    const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', `sw_trafego_${bibliotecaId}`).maybeSingle()
    const arr = data?.valor ? JSON.parse(data.valor) : []
    return { success: true, data: Array.isArray(arr) ? arr : [] }
  } catch {
    return { success: true, data: [] }
  }
}

export async function salvarTrafegoManual(bibliotecaId: string, mes: string, visitas: number): Promise<{ success: boolean; error?: string; data: LeituraTrafego[] }> {
  try {
    const orgId = await resolveOrgId()
    if (!orgId) throw new Error('Organização não encontrada')
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês inválido.')
    if (!(visitas > 0)) throw new Error('Informe o número de visitas.')
    const { data: atual } = await listarTrafegoManual(bibliotecaId)
    const novo = [...atual.filter((l) => l.mes !== mes), { mes, visitas }].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-24)
    const { error } = await supabaseAdmin.from('configuracoes').upsert(
      { chave: `sw_trafego_${bibliotecaId}`, valor: JSON.stringify(novo), org_id: orgId, updated_at: new Date().toISOString() },
      { onConflict: 'chave' })
    if (error) throw error
    return { success: true, data: novo }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] }
  }
}

// Grava o ângulo/resumo de um criativo (usado pela clusterização por IA).
export async function salvarAngulo(bibliotecaId: string, adArchiveId: string, angulo: string, resumo: string | null, transcricaoHash: string | null) {
  try {
    const { error } = await supabaseAdmin
      .from('rastreador_criativos_hist')
      .update({ angulo, angulo_resumo: resumo, transcricao_hash: transcricaoHash, atualizado_em: new Date().toISOString() })
      .eq('biblioteca_id', bibliotecaId).eq('ad_archive_id', adArchiveId)
    if (error) throw error
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
