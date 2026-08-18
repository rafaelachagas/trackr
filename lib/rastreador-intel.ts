// Helpers puros da camada de inteligência do Rastreador.
// NÃO é 'use server' — pode exportar constantes, tipos e funções síncronas.

export type ClassificacaoTeste = 'em_teste' | 'reprovado' | 'mediano' | 'bom' | 'espetacular'

// Regra do Isaías: nº de dias que o criativo ficou no ar =
// < 7 não passou no teste | 7–15 mediano | 15–30 bom | 30+ espetacular.
// Enquanto ainda está ativo e com menos de 7 dias, fica "em_teste".
export function classificarPorDias(dias: number | null | undefined, aindaAtivo: boolean): ClassificacaoTeste {
  const d = Number(dias) || 0
  if (d >= 30) return 'espetacular'
  if (d >= 15) return 'bom'
  if (d >= 7) return 'mediano'
  if (aindaAtivo) return 'em_teste'
  return 'reprovado'
}

export const CLASSIFICACAO_META: Record<ClassificacaoTeste, { label: string; cor: string; bg: string; desc: string }> = {
  em_teste:    { label: 'Em teste',    cor: '#9aa4a8', bg: 'rgba(154,164,168,0.12)', desc: 'Menos de 7 dias no ar — ainda provando' },
  reprovado:   { label: 'Reprovado',   cor: '#f87171', bg: 'rgba(248,113,113,0.12)', desc: 'Saiu antes de 7 dias — não passou no teste' },
  mediano:     { label: 'Mediano',     cor: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  desc: '7 a 15 dias no ar' },
  bom:         { label: 'Bom',         cor: '#34d399', bg: 'rgba(52,211,153,0.12)',  desc: '15 a 30 dias no ar' },
  espetacular: { label: 'Espetacular', cor: '#22d3ee', bg: 'rgba(34,211,238,0.14)',  desc: 'Mais de 30 dias — provavelmente escalou demais' },
}

// Ângulos de copy usados na clusterização por IA dos hooks/transcrições.
export type AnguloCopy =
  | 'dor'
  | 'prova_social'
  | 'urgencia'
  | 'oferta'
  | 'curiosidade'
  | 'autoridade'
  | 'historia'
  | 'medo'
  | 'desejo'
  | 'indefinido'

export const ANGULOS: { id: AnguloCopy; label: string; cor: string; desc: string }[] = [
  { id: 'dor',          label: 'Dor / Problema',   cor: '#f87171', desc: 'Ataca a dor, frustração ou problema do público' },
  { id: 'prova_social', label: 'Prova social',     cor: '#34d399', desc: 'Depoimentos, resultados, "todo mundo está usando"' },
  { id: 'urgencia',     label: 'Urgência / Escassez', cor: '#fb923c', desc: 'Tempo acabando, vagas limitadas, agora ou nunca' },
  { id: 'oferta',       label: 'Oferta / Preço',   cor: '#22d3ee', desc: 'Desconto, bônus, condição, garantia' },
  { id: 'curiosidade',  label: 'Curiosidade',      cor: '#a78bfa', desc: 'Segredo, método desconhecido, "isso ninguém te conta"' },
  { id: 'autoridade',   label: 'Autoridade',       cor: '#60a5fa', desc: 'Especialista, credencial, ciência, dados' },
  { id: 'historia',     label: 'História',         cor: '#f472b6', desc: 'Narrativa pessoal, jornada, storytelling' },
  { id: 'medo',         label: 'Medo / Alerta',    cor: '#fca5a5', desc: 'Consequência de não agir, aviso, risco' },
  { id: 'desejo',       label: 'Desejo / Aspiração', cor: '#fcd34d', desc: 'Sonho, transformação, vida ideal' },
  { id: 'indefinido',   label: 'Sem classificar',  cor: '#6b7280', desc: 'Ainda não analisado pela IA' },
]

export function anguloMeta(id: string | null | undefined) {
  return ANGULOS.find((a) => a.id === id) ?? ANGULOS[ANGULOS.length - 1]
}

// Score de força do criativo do concorrente (0–100). Combina sinais:
//  - tempo no ar (quanto mais dias, mais forte): até 45 pts
//  - variações ativas simultâneas (sinal de escala): até 35 pts
//  - pico histórico de variações: até 20 pts
export function scoreForca(input: {
  diasNoAr: number | null | undefined
  variacoesAtivas: number | null | undefined
  picoVariacoes: number | null | undefined
}): number {
  const dias = Number(input.diasNoAr) || 0
  const varAtivas = Number(input.variacoesAtivas) || 0
  const pico = Number(input.picoVariacoes) || 0

  // Tempo no ar: satura em 30 dias (espetacular) = 45 pts.
  const ptsTempo = Math.min(45, (dias / 30) * 45)
  // Variações ativas agora: satura em 8 = 35 pts.
  const ptsVarAtivas = Math.min(35, (varAtivas / 8) * 35)
  // Pico de variações: satura em 12 = 20 pts.
  const ptsPico = Math.min(20, (pico / 12) * 20)

  return Math.round(ptsTempo + ptsVarAtivas + ptsPico)
}

export function scoreLabel(score: number): { label: string; cor: string } {
  if (score >= 75) return { label: 'Escalando forte', cor: '#22d3ee' }
  if (score >= 50) return { label: 'Consistente', cor: '#34d399' }
  if (score >= 25) return { label: 'Testando', cor: '#fbbf24' }
  return { label: 'Fraco / novo', cor: '#9aa4a8' }
}

// Frequência de troca: nº de criativos distintos que passaram pela biblioteca
// dividido pela janela de dias observada. Alto = troca muito (testa muito).
export function frequenciaTroca(totalCriativosHistoricos: number, diasObservados: number): number {
  if (diasObservados <= 0) return 0
  return Number((totalCriativosHistoricos / diasObservados).toFixed(2))
}

// =====================================================================
//  REDUCER DE HISTÓRICO (puro, sem I/O)
//  "Dobra" lotes de criativos (cada snapshot é um lote) num mapa de
//  histórico por ad_archive_id. Usado tanto no fold ao vivo (1 lote novo)
//  quanto na reconstrução (todos os snapshots em ordem).
// =====================================================================

export interface HistRow {
  ad_archive_id: string
  page_name: string | null
  headline: string | null
  body: string | null
  cta_text: string | null
  link_url: string | null
  media_type: string | null
  video_url: string | null
  image_url: string | null
  snapshot_url: string | null
  start_date: string | null
  primeiro_visto: string
  ultimo_visto: string
  removido_em: string | null
  status: 'ativo' | 'removido'
  copias: number
  pico_copias: number
  dias_no_ar: number
  classificacao: ClassificacaoTeste
  angulo?: string | null
  angulo_resumo?: string | null
  transcricao_hash?: string | null
  _dirty?: boolean
}

// Dias no ar: preferimos a data que a Meta informa (start_date). Fim =
// removido_em se já saiu, senão a última vez que vimos ativo.
export function calcDiasNoAr(row: Pick<HistRow, 'start_date' | 'primeiro_visto' | 'ultimo_visto' | 'removido_em' | 'status'>): number {
  const fimStr = row.status === 'removido' && row.removido_em ? row.removido_em : row.ultimo_visto
  const fim = Date.parse(fimStr)
  const iniMeta = row.start_date ? Date.parse(row.start_date) : NaN
  const ini = !isNaN(iniMeta) ? iniMeta : Date.parse(row.primeiro_visto)
  if (isNaN(fim) || isNaN(ini)) return 0
  return Math.max(0, Math.round((fim - ini) / 86400000))
}

function copiar(dest: HistRow, c: any) {
  if (c?.page_name) dest.page_name = c.page_name
  if (c?.headline) dest.headline = c.headline
  if (c?.body) dest.body = c.body
  if (c?.cta_text) dest.cta_text = c.cta_text
  if (c?.link_url) dest.link_url = c.link_url
  if (c?.media_type) dest.media_type = c.media_type
  if (c?.video_url) dest.video_url = c.video_url
  if (c?.image_url) dest.image_url = c.image_url
  if (c?.snapshot_url) dest.snapshot_url = c.snapshot_url
  if (c?.start_date) dest.start_date = c.start_date
}

// Aplica UM lote (os criativos de um snapshot) capturado no instante tISO.
// Muta o mapa. Retorna quais ids acabaram de ser marcados como removidos
// e quais nasceram agora, pra quem quiser alertar.
export function aplicarLoteHistorico(
  map: Map<string, HistRow>,
  criativos: any[],
  tISO: string
): { removidos: string[]; novos: string[]; reativados: string[] } {
  const idsAgora = new Set<string>()
  const novos: string[] = []
  const reativados: string[] = []

  for (const c of criativos ?? []) {
    const id = c?.ad_archive_id != null ? String(c.ad_archive_id) : null
    if (!id) continue
    idsAgora.add(id)
    const copias = Math.max(1, Number(c?.copias) || 1)
    const ex = map.get(id)
    if (!ex) {
      const row: HistRow = {
        ad_archive_id: id,
        page_name: c?.page_name ?? null, headline: c?.headline ?? null, body: c?.body ?? null,
        cta_text: c?.cta_text ?? null, link_url: c?.link_url ?? null, media_type: c?.media_type ?? null,
        video_url: c?.video_url ?? null, image_url: c?.image_url ?? null, snapshot_url: c?.snapshot_url ?? null,
        start_date: c?.start_date ?? null,
        primeiro_visto: tISO, ultimo_visto: tISO, removido_em: null, status: 'ativo',
        copias, pico_copias: copias, dias_no_ar: 0, classificacao: 'em_teste',
        angulo: null, angulo_resumo: null, transcricao_hash: null, _dirty: true,
      }
      map.set(id, row)
      novos.push(id)
    } else {
      if (ex.status === 'removido') reativados.push(id)
      ex.ultimo_visto = tISO
      ex.status = 'ativo'
      ex.removido_em = null
      ex.copias = copias
      ex.pico_copias = Math.max(ex.pico_copias || 1, copias)
      copiar(ex, c)
      ex._dirty = true
    }
  }

  const removidos: string[] = []
  for (const row of map.values()) {
    if (row.status === 'ativo' && !idsAgora.has(row.ad_archive_id)) {
      row.status = 'removido'
      row.removido_em = tISO
      row._dirty = true
      removidos.push(row.ad_archive_id)
    }
  }

  // Recalcula derivados de tudo que mudou.
  for (const row of map.values()) {
    if (!row._dirty) continue
    row.dias_no_ar = calcDiasNoAr(row)
    row.classificacao = classificarPorDias(row.dias_no_ar, row.status === 'ativo')
  }

  return { removidos, novos, reativados }
}
