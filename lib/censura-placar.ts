// Fase 4 da inteligência do Editor de Censura: o placar.
//
// Pega anúncios com resultado conhecido (reprovado/aprovado pela Meta, Fase 2)
// e pergunta pra inteligência ATUAL: "esse seria reprovado?". Acerto = bateu
// com a Meta. A IA não vê os exemplos tirados do próprio caso (senão cola).
// Roda em pedaços (cron de hora em hora + botão na página) — cada caso é uma
// chamada de IA de ~40 s.

import { supabaseAdmin } from '@/lib/supabase'
import { analisarPalavras, palavrasDoTexto, riscosDaBiblioteca, preveReprovacao, carregarExtra } from '@/lib/censura-inteligencia'

const POR_LADO = 20
const EM_PARALELO = 4

export interface ResultadoPlacar { ad_id: string; nome?: string; real: 'reprovado' | 'aprovado'; previsto: 'reprovado' | 'aprovado' | 'erro'; trechos: string[] }

export async function placarRodando() {
  const { data } = await supabaseAdmin.from('censura_placar').select('*').eq('status', 'rodando').order('criado', { ascending: false }).limit(1)
  return data?.[0] ?? null
}

export async function iniciarPlacar(motivo: string) {
  const ja = await placarRodando()
  if (ja) return ja
  const pega = async (situacao: string) => {
    const { data } = await supabaseAdmin.from('censura_casos_meta').select('ad_id, nome, situacao')
      .eq('etapa', 'analisado').eq('situacao', situacao).order('atualizado', { ascending: false }).limit(POR_LADO)
    return data ?? []
  }
  const casos = [...await pega('reprovado'), ...await pega('aprovado')].map((c) => ({ ad_id: c.ad_id, nome: c.nome, real: c.situacao }))
  if (!casos.length) throw new Error('Ainda não tem anúncio analisado da Meta pra montar o placar. O robô da Fase 2 precisa rodar antes.')
  const { data, error } = await supabaseAdmin.from('censura_placar').insert({ motivo, casos, total: casos.length }).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

/** Avança o placar até o prazo. Devolve o placar atualizado. */
export async function passoPlacar(id: string, prazo: number) {
  const { data: p } = await supabaseAdmin.from('censura_placar').select('*').eq('id', id).single()
  if (!p || p.status !== 'rodando') return p
  const feitos = new Set((p.resultados as ResultadoPlacar[]).map((r) => r.ad_id))
  const faltam = (p.casos as { ad_id: string; nome?: string; real: ResultadoPlacar['real'] }[]).filter((c) => !feitos.has(c.ad_id))
  const extra = await carregarExtra()
  const resultados: ResultadoPlacar[] = [...p.resultados]

  for (let i = 0; i < faltam.length && Date.now() + 100_000 < prazo; i += EM_PARALELO) {
    const lote = faltam.slice(i, i + EM_PARALELO)
    const { data: textos } = await supabaseAdmin.from('censura_casos_meta').select('ad_id, transcricao, texto_anuncio').in('ad_id', lote.map((c) => c.ad_id))
    const txt = new Map((textos ?? []).map((t) => [t.ad_id, [t.transcricao, t.texto_anuncio].filter(Boolean).join('\n')]))
    resultados.push(...await Promise.all(lote.map(async (c): Promise<ResultadoPlacar> => {
      const texto = txt.get(c.ad_id) || ''
      const palavras = palavrasDoTexto(texto)
      const r = await analisarPalavras({ palavras, excluirProjeto: c.ad_id, timeoutMs: 95_000 })
      if (r.erro) return { ad_id: c.ad_id, nome: c.nome, real: c.real, previsto: 'erro', trechos: [] }
      const riscos = [...(r.riscos || []), ...riscosDaBiblioteca(texto, extra)]
      const graves = riscos.filter((x) => x.gravidade === 'muito_alto' || x.gravidade === 'alto')
      return {
        ad_id: c.ad_id, nome: c.nome, real: c.real,
        previsto: preveReprovacao(riscos) ? 'reprovado' : 'aprovado',
        trechos: [...new Set(graves.map((x) => x.ids.map((k) => palavras[k]?.w).join(' ')))].slice(0, 6),
      }
    })))
  }
  const validos = resultados.filter((r) => r.previsto !== 'erro')
  const acertos = validos.filter((r) => r.previsto === r.real).length
  const pronto = resultados.length >= p.casos.length
  const { data } = await supabaseAdmin.from('censura_placar').update({
    resultados, acertos, total: pronto ? validos.length : p.total,
    status: pronto ? 'pronto' : 'rodando', terminado: pronto ? new Date().toISOString() : null,
  }).eq('id', id).select('*').single()
  return data
}
