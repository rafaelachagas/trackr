// Fase 2 da inteligência do Editor de Censura: reprovações REAIS da Meta.
//
//   descobrir()  lista anúncios reprovados (com o motivo, ad_review_feedback) e
//                uma amostra de ativos (aprovados) de todas as contas do token.
//   transcrever()  baixa o vídeo do anúncio pela API e transcreve na VPS — um
//                por vez, o transcritor é CPU.
//   analisar()   reprovado: a IA aponta o trecho culpado lendo o motivo da Meta
//                → vira exemplo 'reprovado'. Aprovado: o que a biblioteca
//                pegaria nele vira exemplo 'aprovado' (passou de verdade).
// Roda pelo cron app/api/censura/meta-cron.

import { supabaseAdmin } from '@/lib/supabase'
import { carregarMetaCfg } from '@/lib/meta-campanhas'
import { chamarLLM } from '@/lib/llm'
import { extrairCriativo } from '@/lib/utils'
import { normalizar } from '@/lib/censura'
import { POLITICA_META } from '@/lib/censura-politica'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import { registrarExemplos, carregarExtra, riscosDaBiblioteca, Exemplo } from '@/lib/censura-inteligencia'
import { bucket, lerJsonStorage, RAIZ_CENSURA, MetaProjeto } from '@/lib/censura-projetos'

const META = 'https://graph.facebook.com/v25.0'
const AMOSTRA_APROVADOS_POR_CONTA = 25
const CAMPOS_AD = 'id,name,account_id,updated_time,ad_review_feedback,creative{id,video_id,body,title,object_story_spec,asset_feed_spec}'

async function metaAll(url: string, max = 10): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  for (let i = 0; next && i < max; i++) {
    const r: Response = await fetch(next, { cache: 'no-store' })
    const j = await r.json()
    if (j.error) throw new Error(j.error.message)
    out.push(...(j.data ?? []))
    next = j.paging?.next ?? null
  }
  return out
}

function videoDoCriativo(c: any): string | null {
  return c?.video_id || c?.object_story_spec?.video_data?.video_id || c?.asset_feed_spec?.videos?.[0]?.video_id || null
}

function textoDoCriativo(c: any): string {
  const oss = c?.object_story_spec || {}
  const partes = [
    c?.title, c?.body,
    oss.video_data?.title, oss.video_data?.message,
    oss.link_data?.name, oss.link_data?.message,
    ...(c?.asset_feed_spec?.titles || []).map((t: any) => t?.text),
    ...(c?.asset_feed_spec?.bodies || []).map((t: any) => t?.text),
  ].filter((x): x is string => typeof x === 'string' && !!x.trim())
  return [...new Set(partes.map((x) => x.trim()))].join('\n').slice(0, 4000)
}

/** "Política: explicação" de cada motivo que a Meta deu. */
export function motivosEmTexto(m: any): string {
  if (!m || typeof m !== 'object') return ''
  const linhas: string[] = []
  for (const grupo of Object.values(m)) {
    if (grupo && typeof grupo === 'object') for (const [k, v] of Object.entries(grupo as Record<string, unknown>)) linhas.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
  }
  return [...new Set(linhas)].join('\n')
}

export async function descobrir(): Promise<{ contas: number; novos: number; mudaram: number }> {
  const cfg = await carregarMetaCfg()
  if (!cfg) throw new Error('Meta não configurada (sem token).')
  const { token } = cfg
  // Só as contas marcadas no painel (a operação); o token enxerga outras de clientes.
  const marcadas = new Set(cfg.contas.map(String))
  const contas = (await metaAll(`${META}/me/adaccounts?${new URLSearchParams({ fields: 'account_id,name', limit: '200', access_token: token })}`))
    .filter((c) => marcadas.has(String(c.account_id)))

  const achados: { ad: any; conta: string; contaId: string; situacao: 'reprovado' | 'aprovado' }[] = []
  await Promise.all(contas.map(async (c) => {
    const q = (status: string[], limit: string) => `${META}/act_${c.account_id}/ads?${new URLSearchParams({
      fields: CAMPOS_AD, limit, access_token: token,
      filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: status }]),
    })}`
    try {
      for (const ad of await metaAll(q(['DISAPPROVED', 'WITH_ISSUES'], '100'), 5)) achados.push({ ad, conta: c.name, contaId: String(c.account_id), situacao: 'reprovado' })
    } catch (e) { console.error('[censura-meta] reprovados', c.name, e) }
    try {
      // Amostra de aprovados: só a 1ª página, os mais recentes.
      const r = await fetch(q(['ACTIVE'], String(AMOSTRA_APROVADOS_POR_CONTA)), { cache: 'no-store' }).then((x) => x.json())
      for (const ad of r.data ?? []) achados.push({ ad, conta: c.name, contaId: String(c.account_id), situacao: 'aprovado' })
    } catch (e) { console.error('[censura-meta] aprovados', c.name, e) }
  }))

  const ids = achados.map((a) => a.ad.id)
  const existentes = new Map<string, { situacao: string; transcricao: string | null; etapa: string }>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabaseAdmin.from('censura_casos_meta').select('ad_id, situacao, transcricao, etapa').in('ad_id', ids.slice(i, i + 300))
    for (const r of data ?? []) existentes.set(r.ad_id, r)
  }

  let novos = 0, mudaram = 0
  const agora = new Date().toISOString()
  for (const { ad, conta, contaId, situacao } of achados) {
    const ex = existentes.get(ad.id)
    const base = {
      conta, conta_id: contaId, nome: ad.name, criativo: extrairCriativo(ad.name || '') || null,
      motivos: ad.ad_review_feedback || null,
      video_id: videoDoCriativo(ad.creative), texto_anuncio: textoDoCriativo(ad.creative) || null,
      situacao, visto_em: agora, atualizado: agora,
    }
    if (!ex) {
      const { error } = await supabaseAdmin.from('censura_casos_meta').insert({ ad_id: ad.id, ...base, etapa: 'novo' })
      if (!error) novos++
    } else if (ex.situacao !== situacao) {
      // Aprovado que foi reprovado (ou voltou): analisa de novo com o motivo novo.
      const etapa = ex.etapa === 'analisado' ? 'transcrito' : ex.etapa
      await supabaseAdmin.from('censura_casos_meta').update({ ...base, etapa }).eq('ad_id', ad.id)
      mudaram++
    } else {
      await supabaseAdmin.from('censura_casos_meta').update({ visto_em: agora, motivos: base.motivos ?? undefined }).eq('ad_id', ad.id)
    }
  }
  return { contas: contas.length, novos, mudaram }
}

/** Projeto do Editor de Censura cujo nome tem o código do criativo (ad74…). */
async function transcricaoDoEditor(criativo: string): Promise<string | null> {
  const cod = criativo.toLowerCase()
  const { data: pastas } = await bucket().list(RAIZ_CENSURA, { limit: 1000 })
  for (const p of pastas ?? []) {
    const meta = await lerJsonStorage<MetaProjeto>(`${RAIZ_CENSURA}/${p.name}/meta.json`)
    const nome = (meta?.nome || '').toLowerCase()
    if (!new RegExp(`(^|[^a-z0-9])${cod.replace(/[^a-z0-9-]/g, '')}([^0-9]|$)`).test(nome)) continue
    const trab = await lerJsonStorage<{ tokens?: { word: string; removida?: boolean }[] }>(`${RAIZ_CENSURA}/${p.name}/projeto.json`)
    const texto = (trab?.tokens || []).filter((t) => !t.removida).map((t) => t.word).join(' ').trim()
    if (texto) return texto
  }
  return null
}

/** Um caso por chamada: o transcritor da VPS é CPU. */
export async function transcreverProximo(tempoMs: number): Promise<string | null> {
  const { data } = await supabaseAdmin.from('censura_casos_meta')
    .select('ad_id, video_id, texto_anuncio, tentativas, situacao, conta_id, criativo')
    .eq('etapa', 'novo').lt('tentativas', 3)
    .order('situacao', { ascending: false }) // 'reprovado' > 'aprovado': reprovados primeiro
    .order('visto_em', { ascending: false }).limit(1)
  const caso = data?.[0]
  if (!caso) return null
  const marcar = (campos: Record<string, unknown>) => supabaseAdmin.from('censura_casos_meta').update({ ...campos, atualizado: new Date().toISOString() }).eq('ad_id', caso.ad_id)

  const soTexto = async (erro: string) => marcar(caso.texto_anuncio
    ? { etapa: 'transcrito', transcricao: '', erro }
    : { etapa: 'sem_midia', erro })

  // 1) Mesmo criativo já passou pelo Editor de Censura? A transcrição está lá.
  const doEditor = caso.criativo ? await transcricaoDoEditor(caso.criativo) : null
  if (doEditor) { await marcar({ etapa: 'transcrito', transcricao: doEditor, erro: null }); return caso.ad_id }
  if (!caso.video_id) { await soTexto('anúncio sem vídeo'); return caso.ad_id }
  try {
    const cfg = await carregarMetaCfg()
    if (!cfg) throw new Error('sem token')
    // 2) Vídeo da biblioteca da conta (advideos entrega o arquivo; o vídeo
    //    direto pede permissão de página que o app não tem — erro #10).
    const lib = caso.conta_id ? await fetch(`${META}/act_${caso.conta_id}/advideos?${new URLSearchParams({
      fields: 'id,source', access_token: cfg.token,
      filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: [caso.video_id] }]),
    })}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null) : null
    const source: string | undefined = lib?.data?.[0]?.source
      || (await fetch(`${META}/${caso.video_id}?fields=source&access_token=${cfg.token}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null))?.source
    if (!source) {
      // 3) Sem o arquivo: analisa só o texto do anúncio.
      await soTexto('vídeo é da página (sem permissão pra baixar) — analisado só o texto do anúncio')
      return caso.ad_id
    }
    const v = { source }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), tempoMs)
    const r = await fetch(`${TRANSCRITOR_URL}/transcribe?video_url=${encodeURIComponent(v.source)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, { signal: ctrl.signal, cache: 'no-store' })
      .finally(() => clearTimeout(t))
    const j = await r.json().catch(() => null)
    if (!j || j.error) throw new Error(j?.error || 'transcritor sem resposta')
    await marcar({ etapa: 'transcrito', transcricao: String(j.texto || ''), erro: null })
  } catch (e) {
    await marcar({ tentativas: (caso.tentativas || 0) + 1, erro: e instanceof Error ? e.message : String(e) })
  }
  return caso.ad_id
}

const SISTEMA_CULPADO = `Você é o revisor de criativos da operação. Manual da operação:

${POLITICA_META}

---
TAREFA
A Meta REPROVOU o anúncio abaixo e disse o motivo. Ache no texto (transcrição do vídeo e texto do anúncio) os trechos que provavelmente causaram a reprovação, lendo como o robô da Meta lê: literal, sem entender tom (ex.: "menina" = menor de idade, "banheiro" = nudez, "testando" = cobaia).
- Copie cada trecho EXATAMENTE como está no texto, o menor possível (1 a 6 palavras).
- Só o que tem relação com o motivo da Meta ou com o manual. No máximo 8.
- bip_resolve = false quando o sentido proibido fica mesmo bipando.
Responda SÓ com JSON: {"trechos":[{"trecho":"...","politica":"...","motivo":"por que a Meta leu assim, 1 frase","gravidade":"muito_alto|alto|medio|baixo","bip_resolve":true}]}`

/** Lê os casos transcritos: reprovado → trecho culpado; aprovado → o que passou. */
export async function analisarProximos(max: number, prazo: number): Promise<number> {
  const { data } = await supabaseAdmin.from('censura_casos_meta')
    .select('ad_id, situacao, motivos, transcricao, texto_anuncio')
    .eq('etapa', 'transcrito').order('situacao', { ascending: false }).limit(max)
  if (!data?.length) return 0
  const extra = await carregarExtra()
  let feitos = 0
  for (const c of data) {
    if (Date.now() > prazo) break
    const texto = [c.transcricao, c.texto_anuncio].filter(Boolean).join('\n').trim()
    const marcar = (campos: Record<string, unknown>) => supabaseAdmin.from('censura_casos_meta').update({ ...campos, atualizado: new Date().toISOString() }).eq('ad_id', c.ad_id)
    if (!texto) { await marcar({ etapa: 'sem_midia' }); continue }
    const norm = ' ' + texto.split(/\s+/).map(normalizar).filter(Boolean).join(' ') + ' '
    const frase = (trecho: string) => {
      const i = texto.toLowerCase().indexOf(trecho.toLowerCase())
      return i < 0 ? null : texto.slice(Math.max(0, i - 80), i + trecho.length + 80).replace(/\s+/g, ' ')
    }

    if (c.situacao === 'reprovado') {
      const motivo = motivosEmTexto(c.motivos)
      const r = await chamarLLM({
        system: SISTEMA_CULPADO, json: true, maxTokens: 2000, timeoutMs: 90000,
        prompt: `Motivo da Meta:\n${motivo || '(a Meta não detalhou)'}\n\nTexto do anúncio:\n${texto.slice(0, 12000)}`,
      })
      if (!r.ok) { await marcar({ erro: r.erro || 'IA não respondeu' }); continue }
      let trechos: any[] = []
      try { const t = r.texto; trechos = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)).trechos || [] } catch { /* formato ruim */ }
      trechos = trechos.filter((t) => typeof t?.trecho === 'string' && norm.includes(' ' + normalizar(t.trecho) + ' ')).slice(0, 8)
      const ex: Exemplo[] = trechos.map((t) => ({
        origem: 'meta', projeto_id: c.ad_id, trecho: t.trecho, contexto: frase(t.trecho),
        decisao: t.bip_resolve === false ? 'contexto' : 'reprovado',
        gravidade: t.gravidade, politica: t.politica, motivo: `${t.motivo || ''}${motivo ? ` (Meta: ${motivo.split('\n')[0].slice(0, 160)})` : ''}`,
      }))
      // 'contexto' de origem meta também é reprovação: guarda as duas leituras.
      await registrarExemplos([...ex, ...ex.filter((e) => e.decisao === 'contexto').map((e) => ({ ...e, decisao: 'reprovado' as const }))])
      await marcar({ etapa: 'analisado', trechos, erro: null })
    } else {
      // Aprovado: o que a biblioteca pegaria aqui passou na Meta de verdade.
      const passou = riscosDaBiblioteca(texto, extra)
      const vistos = new Set<string>()
      const palavras = texto.split(/\s+/).filter(Boolean)
      const ex: Exemplo[] = []
      for (const r of passou) {
        const trecho = r.ids.map((i) => palavras[i]).join(' ')
        const k = normalizar(trecho)
        if (!k || vistos.has(k)) continue
        vistos.add(k)
        ex.push({ origem: 'meta', projeto_id: c.ad_id, trecho, contexto: frase(trecho), decisao: 'aprovado', categoria: r.categoria })
      }
      await registrarExemplos(ex)
      await marcar({ etapa: 'analisado', trechos: ex.map((e) => ({ trecho: e.trecho, categoria: e.categoria })), erro: null })
    }
    feitos++
  }
  return feitos
}
