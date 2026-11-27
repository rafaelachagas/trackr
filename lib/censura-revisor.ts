// Fase 3 da inteligência do Editor de Censura: o revisor semanal.
//
// Junta o que aconteceu (suas decisões no editor, reprovações/aprovações
// reais da Meta, anúncios de concorrentes há semanas no ar) e propõe mudanças
// na biblioteca. NADA entra sozinho: vira censura_propostas 'pendente' e o
// dono aprova pelo WhatsApp ("aprovar 1 3", "aprovar tudo", "recusar 2") ou
// pela página /tools/censor/inteligencia.
//
// Políticas novas da Meta: o Transparency Center proíbe coleta automática
// (robots.txt), então não tem robô lá. O dono cola o texto em
// "Atualizar política" e o revisor transforma em propostas (politicaColada).

import { supabaseAdmin } from '@/lib/supabase'
import { chamarLLM } from '@/lib/llm'
import { normalizar } from '@/lib/censura'
import { POLITICA_META } from '@/lib/censura-politica'
import { GRAVIDADES, Gravidade, aplicarExtra, BibliotecaExtra } from '@/lib/censura-riscos'
import { carregarExtra, salvarExtra, riscosDaBiblioteca } from '@/lib/censura-inteligencia'
import { motivosEmTexto } from '@/lib/censura-meta'
import { enviarTexto } from '@/lib/whatsapp-grupos'
import { DONO_SAUDE } from '@/lib/whatsapp-saude'
import { iniciarPlacar } from '@/lib/censura-placar'

export type TipoProposta = 'adicionar_termo' | 'remover_termo' | 'gravidade' | 'politica_mudou'

export interface Proposta {
  id: string
  numero: number
  criado: string
  tipo: TipoProposta
  dados: { categoria?: string; termo?: string; gravidade?: Gravidade; texto?: string }
  resumo: string
  motivo: string | null
  status: 'pendente' | 'aprovada' | 'recusada'
}

const DIAS = 7

const SISTEMA = `Você é o revisor-chefe dos criativos da operação. Manual:

${POLITICA_META}

---
TAREFA
Você cuida de uma BIBLIOTECA de termos que o editor marca sozinho nos vídeos. Com base nas evidências da semana, proponha ajustes. Critérios:
- adicionar_termo: o revisor humano marcou/censurou o mesmo trecho mais de uma vez, ou a Meta reprovou por ele, e ele não está na biblioteca.
- remover_termo: o termo da biblioteca virou alarme falso (o revisor liberou/disse "não é risco" várias vezes, ou ele aparece em anúncios aprovados e em concorrentes que rodam há semanas) e não tem reprovação real contra.
- gravidade: a categoria inteira está mais (ou menos) perigosa do que a gravidade atual indica.
- Termo em minúsculas, sem acento, como na biblioteca. * no fim = prefixo (ex.: fatur*).
- Só proponha com evidência concreta, citando os números. Máximo 10. Sem evidência, devolva lista vazia.
Responda SÓ com JSON: {"propostas":[{"tipo":"adicionar_termo|remover_termo|gravidade","categoria":"<id da categoria>","termo":"...","gravidade":"muito_alto|alto|medio|baixo","resumo":"frase curta do que muda","motivo":"evidência, com números"}]}`

async function evidencias(desde: string) {
  const extra = await carregarExtra()
  const bib = aplicarExtra(extra)

  const { data: ex } = await supabaseAdmin.from('censura_exemplos')
    .select('origem, trecho, decisao, categoria, motivo').gte('criado', desde).limit(3000)
  const porTrecho = new Map<string, Record<string, number>>()
  const motivoDe = new Map<string, string>()
  for (const e of ex ?? []) {
    const m = porTrecho.get(e.trecho) || {}
    const k = `${e.origem === 'meta' ? 'meta_' : ''}${e.decisao}`
    m[k] = (m[k] || 0) + 1
    porTrecho.set(e.trecho, m)
    if (e.motivo && !motivoDe.has(e.trecho)) motivoDe.set(e.trecho, e.motivo)
  }

  const { data: casos } = await supabaseAdmin.from('censura_casos_meta')
    .select('situacao, motivos, trechos').eq('etapa', 'analisado').gte('atualizado', desde).limit(200)
  const reprovados = (casos ?? []).filter((c) => c.situacao === 'reprovado')

  // Concorrentes há 3+ semanas no ar: o que a biblioteca marca neles passou na Meta.
  const passouConcorrente = new Map<string, number>()
  const { data: hist } = await supabaseAdmin.from('rastreador_criativos_hist')
    .select('ad_archive_id, headline, body').eq('status', 'ativo').gte('dias_no_ar', 21).limit(300)
  if (hist?.length) {
    const trans: Record<string, string> = {}
    const ids = hist.map((h) => h.ad_archive_id)
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin.from('rastreador_transcricoes').select('ad_archive_id, texto').in('ad_archive_id', ids.slice(i, i + 200))
      for (const r of data ?? []) if (r.texto) trans[r.ad_archive_id] = r.texto
    }
    for (const h of hist) {
      const texto = [trans[h.ad_archive_id], h.headline, h.body].filter(Boolean).join('\n')
      if (!texto) continue
      const palavras = texto.split(/\s+/).filter(Boolean)
      const vistos = new Set<string>()
      for (const r of riscosDaBiblioteca(texto, extra)) {
        const k = normalizar(r.ids.map((i) => palavras[i]).join(' '))
        if (k && !vistos.has(k)) { vistos.add(k); passouConcorrente.set(k, (passouConcorrente.get(k) || 0) + 1) }
      }
    }
  }

  const linhasTrecho = [...porTrecho].filter(([, m]) => Object.values(m).reduce((a, b) => a + b, 0) >= 2 || m.meta_reprovado)
    .slice(0, 120).map(([t, m]) => `- "${t}": ${Object.entries(m).map(([k, v]) => `${k}=${v}`).join(', ')}${motivoDe.get(t) ? ` · ${motivoDe.get(t)!.slice(0, 140)}` : ''}`)
  return {
    extra, bib,
    texto: [
      `BIBLIOTECA ATUAL (id · nome · gravidade · termos):\n${bib.map((c) => `${c.id} · ${c.nome} · ${c.gravidade} · ${c.termos.split('\n').join(', ')}`).join('\n')}`,
      `DECISÕES DOS ÚLTIMOS ${DIAS} DIAS por trecho (risco/contexto/censurou = revisor achou risco; nao_risco/liberou = alarme falso; meta_reprovado = Meta reprovou por isso; meta_aprovado = estava em anúncio aprovado):\n${linhasTrecho.join('\n') || '(nada)'}`,
      `REPROVAÇÕES REAIS DA META NA SEMANA (${reprovados.length}):\n${reprovados.slice(0, 30).map((c) => `- ${motivosEmTexto(c.motivos).split('\n')[0]?.slice(0, 160) || 'sem motivo'} → ${(c.trechos as any[] || []).map((t) => `"${t.trecho}"`).join(', ')}`).join('\n') || '(nenhuma)'}`,
      `TERMOS DA BIBLIOTECA EM ANÚNCIOS DE CONCORRENTES HÁ 3+ SEMANAS NO AR (passaram na Meta):\n${[...passouConcorrente].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, n]) => `- "${t}": ${n} anúncios`).join('\n') || '(nenhum)'}`,
    ].join('\n\n'),
  }
}

/** Valida e grava as propostas da IA; descarta repetidas e as que não mudam nada. */
async function gravarPropostas(brutas: any[], bib: ReturnType<typeof aplicarExtra>): Promise<Proposta[]> {
  const { data: pend } = await supabaseAdmin.from('censura_propostas').select('tipo, dados').eq('status', 'pendente')
  const chave = (t: string, d: any) => `${t}|${d.categoria}|${d.termo || ''}|${d.gravidade || ''}`
  const ja = new Set((pend ?? []).map((p) => chave(p.tipo, p.dados)))
  const linhas: any[] = []
  for (const b of brutas.slice(0, 10)) {
    const cat = bib.find((c) => c.id === b?.categoria)
    if (!cat) continue
    const termos = cat.termos.split('\n').map((t) => t.trim())
    const dados: Proposta['dados'] = { categoria: cat.id }
    if (b.tipo === 'adicionar_termo' || b.tipo === 'remover_termo') {
      const termo = normalizar(String(b.termo || '')).replace(/\s+/g, ' ') + (String(b.termo || '').trim().endsWith('*') ? '*' : '')
      if (!termo.replace('*', '')) continue
      if (b.tipo === 'adicionar_termo' && termos.includes(termo)) continue
      if (b.tipo === 'remover_termo' && !termos.includes(termo)) continue
      dados.termo = termo
    } else if (b.tipo === 'gravidade') {
      if (!GRAVIDADES.includes(b.gravidade) || b.gravidade === cat.gravidade) continue
      dados.gravidade = b.gravidade
    } else continue
    if (ja.has(chave(b.tipo, dados))) continue
    ja.add(chave(b.tipo, dados))
    linhas.push({ tipo: b.tipo, dados, resumo: String(b.resumo || '').slice(0, 200) || `${b.tipo} ${dados.termo || dados.gravidade} em ${cat.nome}`, motivo: String(b.motivo || '').slice(0, 500) })
  }
  if (!linhas.length) return []
  const { data, error } = await supabaseAdmin.from('censura_propostas').insert(linhas).select('*')
  if (error) throw new Error(error.message)
  return (data ?? []) as Proposta[]
}

export async function gerarPropostas(extraContexto?: string): Promise<Proposta[]> {
  const desde = new Date(Date.now() - DIAS * 86400_000).toISOString()
  const ev = await evidencias(desde)
  const r = await chamarLLM({
    system: SISTEMA, json: true, maxTokens: 12000, timeoutMs: 170000,
    prompt: [extraContexto ? `POLÍTICA NOVA/ATUALIZADA QUE O DONO COLOU (prioridade):\n${extraContexto.slice(0, 15000)}` : '', ev.texto].filter(Boolean).join('\n\n'),
  })
  if (!r.ok) throw new Error(r.erro || 'IA não respondeu')
  let brutas: any[] = []
  try { const t = r.texto; brutas = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)).propostas || [] } catch { /* vazio */ }
  return gravarPropostas(brutas, ev.bib)
}

/** Política colada pelo dono: guarda um registro e gera propostas a partir dela. */
export async function politicaColada(texto: string): Promise<Proposta[]> {
  const props = await gerarPropostas(texto)
  await supabaseAdmin.from('censura_propostas').insert({
    tipo: 'politica_mudou', dados: { texto: texto.slice(0, 20000) }, status: 'aprovada', decidido_em: new Date().toISOString(),
    resumo: `Política colada (${texto.trim().split('\n')[0].slice(0, 80)})`, motivo: `${props.length} propostas geradas a partir dela.`,
  })
  return props
}

function aplicar(extra: BibliotecaExtra, p: Proposta): BibliotecaExtra {
  const e: BibliotecaExtra = { termos: { ...(extra.termos || {}) }, removidos: { ...(extra.removidos || {}) }, gravidade: { ...(extra.gravidade || {}) } }
  const cat = p.dados.categoria!
  if (p.tipo === 'adicionar_termo' && p.dados.termo) {
    e.termos![cat] = [...new Set([...(e.termos![cat] || []), p.dados.termo])]
    e.removidos![cat] = (e.removidos![cat] || []).filter((t) => t !== p.dados.termo)
  } else if (p.tipo === 'remover_termo' && p.dados.termo) {
    e.removidos![cat] = [...new Set([...(e.removidos![cat] || []), p.dados.termo])]
    e.termos![cat] = (e.termos![cat] || []).filter((t) => t !== p.dados.termo)
  } else if (p.tipo === 'gravidade' && p.dados.gravidade) {
    e.gravidade![cat] = p.dados.gravidade
  }
  return e
}

/** Aprova/recusa por número ("tudo" = todas as pendentes). */
export async function decidir(numeros: number[] | 'tudo', aprovar: boolean): Promise<{ feitas: Proposta[] }> {
  let q = supabaseAdmin.from('censura_propostas').select('*').eq('status', 'pendente')
  if (numeros !== 'tudo') q = q.in('numero', numeros)
  const { data } = await q.order('numero')
  const lista = (data ?? []) as Proposta[]
  if (!lista.length) return { feitas: [] }
  if (aprovar) {
    let extra = await carregarExtra()
    for (const p of lista) extra = aplicar(extra, p)
    await salvarExtra(extra)
    // A inteligência mudou: mede de novo (Fase 4). Sem casos ainda, só não roda.
    await iniciarPlacar('aprovou propostas').catch(() => null)
  }
  await supabaseAdmin.from('censura_propostas')
    .update({ status: aprovar ? 'aprovada' : 'recusada', decidido_em: new Date().toISOString() })
    .in('id', lista.map((p) => p.id))
  return { feitas: lista }
}

export function mensagemPropostas(ps: Proposta[]): string {
  if (!ps.length) return ''
  return [
    `🧠 *Revisor do Editor de Censura* — ${ps.length} ${ps.length === 1 ? 'proposta' : 'propostas'} da semana:`,
    '',
    ...ps.map((p) => `*${p.numero}.* ${p.resumo}\n   _${(p.motivo || '').slice(0, 220)}_`),
    '',
    'Responda: *aprovar 1 3* · *aprovar tudo* · *recusar 2* · *recusar tudo*',
  ].join('\n')
}

export async function avisarNoWhatsApp(ps: Proposta[]) {
  const msg = mensagemPropostas(ps)
  if (msg) await enviarTexto(DONO_SAUDE, msg).catch((e) => console.error('[censura-revisor] whatsapp', e))
}

/** "aprovar 1 3", "aprovar tudo", "recusar 2" → resposta; null = não é comando. */
export async function tratarComandoWhatsApp(texto: string): Promise<string | null> {
  const m = texto.trim().toLowerCase().match(/^(aprovar|aprova|recusar|recusa)\s+(tudo|todas|todos|[\d\s,e]+)$/)
  if (!m) return null
  const aprovar = m[1].startsWith('aprova')
  const alvo = /^(tudo|todas|todos)$/.test(m[2]) ? 'tudo' as const : (m[2].match(/\d+/g) || []).map(Number)
  if (alvo !== 'tudo' && !alvo.length) return null
  const { feitas } = await decidir(alvo, aprovar)
  if (!feitas.length) return '🧠 Não achei proposta pendente com esse número.'
  return `🧠 ${aprovar ? '✅ Aprovadas' : '❌ Recusadas'}: ${feitas.map((p) => `${p.numero}`).join(', ')}.${aprovar ? ' Já vale no editor e na IA.' : ''}`
}
