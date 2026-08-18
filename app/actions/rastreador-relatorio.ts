'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { chamarLLM, extrairJSON, llmDisponivel } from '@/lib/llm'
import type { RelatorioConcorrente, CriativoReport } from '@/lib/reportConcorrente'

// Gera os DADOS do relatório de inteligência de um concorrente.
// A UI baixa o report.html a partir daqui (lib/reportConcorrente.renderRelatorioHTML).
export async function gerarRelatorioConcorrente(bibliotecaId: string, limite = 8): Promise<{ success: boolean; error?: string; data: RelatorioConcorrente | null }> {
  try {
    if (!llmDisponivel()) return { success: false, error: 'IA não configurada (falta ANTHROPIC_API_KEY).', data: null }

    const { data: bib } = await supabaseAdmin
      .from('rastreador_bibliotecas').select('page_id, page_name, nome_custom, nicho, oferta').eq('id', bibliotecaId).maybeSingle()
    if (!bib) return { success: false, error: 'Biblioteca não encontrada.', data: null }

    const nome = (bib.nome_custom?.trim() || bib.page_name?.trim() || `Página ${bib.page_id}`)
    const slug = (bib.page_name || bib.nome_custom || bib.page_id || 'concorrente').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

    // Criativos mais escalados: prioriza dias no ar e nº de variações.
    const { data: hist } = await supabaseAdmin
      .from('rastreador_criativos_hist')
      .select('ad_archive_id, headline, body, cta_text, media_type, image_url, dias_no_ar, copias, pico_copias, status, angulo, angulo_resumo')
      .eq('biblioteca_id', bibliotecaId)
    if (!hist || hist.length === 0) return { success: false, error: 'Ainda não há histórico de criativos. Puxe a biblioteca ao menos uma vez.', data: null }

    const ordenados = [...hist].sort((a, b) => {
      const sa = (a.dias_no_ar || 0) * 2 + (a.pico_copias || 1) * 3
      const sb = (b.dias_no_ar || 0) * 2 + (b.pico_copias || 1) * 3
      return sb - sa
    })
    const top = ordenados.slice(0, limite)

    // Transcrições dos tops.
    const ids = top.map((t) => t.ad_archive_id)
    const trans: Record<string, string> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin
        .from('rastreador_transcricoes').select('ad_archive_id, texto').in('ad_archive_id', ids.slice(i, i + 200))
      for (const r of data ?? []) if (r.ad_archive_id && r.texto) trans[r.ad_archive_id] = r.texto
    }

    const criativos: CriativoReport[] = top.map((c, i) => ({
      ad: String(i + 1).padStart(3, '0'),
      id: c.ad_archive_id,
      titulo: (c.headline?.trim() || c.angulo_resumo?.trim() || 'Anúncio sem título'),
      cta: c.cta_text?.trim() || 'Saiba mais',
      rodando: c.dias_no_ar ?? null,
      formato: c.media_type || 'video',
      ativos: Math.max(1, Number(c.pico_copias) || 1),
      image_url: c.image_url,
    }))

    // Monta o material pra IA opinar.
    const material = top.map((c, i) => {
      const t = trans[c.ad_archive_id]
      return `AD ${String(i + 1).padStart(3, '0')} | dias no ar: ${c.dias_no_ar ?? '?'} | variações: ${c.pico_copias ?? 1}
Headline: ${c.headline || '—'}
Corpo: ${(c.body || '—').slice(0, 300)}
CTA: ${c.cta_text || '—'}
${t ? `Transcrição: ${t.slice(0, 1500)}` : 'Transcrição: (não disponível)'}`
    }).join('\n\n---\n\n')

    const system = `Você é um analista de inteligência competitiva de marketing de resposta direta (BR). Recebe os criativos MAIS ESCALADOS de um concorrente e produz um relatório afiado e prático. Seja específico, cite trechos reais quando útil. NÃO incentive plágio — o objetivo é entender padrões e acelerar testes próprios.
Responda SÓ com JSON no formato:
{
 "resumoExecutivo": [{"label":"Ângulo dominante","texto":"..."}, {"label":"Hooks recorrentes","texto":"..."}, {"label":"CTAs mais usados","texto":"..."}, {"label":"Público-alvo aparente","texto":"..."}],
 "padroes": [{"nome":"Nome do padrão","freq":"3 / 5","descricao":"...","exemplos":["trecho curto real","outro trecho"]}],
 "recomendacoes": [{"titulo":"Ação clara","texto":"por que e como testar","prioridade":"alta|media|baixa"}]
}
Gere de 4 a 6 insights, 3 a 6 padrões e 4 a 6 recomendações.`

    const prompt = `CONCORRENTE: ${nome}
NICHO (nosso/deles): ${bib.nicho || 'não informado'}
OFERTA: ${bib.oferta || 'não informada'}

CRIATIVOS MAIS ESCALADOS:
${material}`

    const r = await chamarLLM({ system, prompt, maxTokens: 3500, temperatura: 0.5 })
    if (!r.ok) return { success: false, error: r.erro, data: null }
    const parsed = extrairJSON<{ resumoExecutivo: any[]; padroes: any[]; recomendacoes: any[] }>(r.texto)
    if (!parsed) return { success: false, error: 'A IA não retornou um relatório válido.', data: null }

    const norm = (p: any): 'alta' | 'media' | 'baixa' => {
      const s = String(p || '').toLowerCase()
      return s.startsWith('alt') ? 'alta' : s.startsWith('bai') ? 'baixa' : 'media'
    }

    const data: RelatorioConcorrente = {
      nome, slug,
      data: new Date().toLocaleDateString('pt-BR'),
      totalAnalisados: top.length,
      limite,
      resumoExecutivo: (parsed.resumoExecutivo ?? []).map((x: any) => ({ label: String(x?.label || 'Insight'), texto: String(x?.texto || '') })).filter((x: any) => x.texto),
      criativos,
      padroes: (parsed.padroes ?? []).map((x: any) => ({
        nome: String(x?.nome || 'Padrão'), freq: String(x?.freq || ''),
        descricao: String(x?.descricao || ''), exemplos: Array.isArray(x?.exemplos) ? x.exemplos.map((e: any) => String(e)).slice(0, 3) : [],
      })).filter((x: any) => x.descricao),
      recomendacoes: (parsed.recomendacoes ?? []).map((x: any) => ({
        titulo: String(x?.titulo || ''), texto: String(x?.texto || ''), prioridade: norm(x?.prioridade),
      })).filter((x: any) => x.titulo),
    }

    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e.message, data: null }
  }
}
