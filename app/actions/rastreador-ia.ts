'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { chamarLLM, extrairJSON, hashTexto, llmDisponivel, modeloSelecionado } from '@/lib/llm'
import { ANGULOS } from '@/lib/rastreador-intel'

async function resolveOrgId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  return data?.id ?? null
}

const IDS_ANGULO: string[] = ANGULOS.map((a) => a.id).filter((a) => a !== 'indefinido')

// -------------------------------------------------------------------
// 1) Clusterização de ganchos por ângulo de copy (IA)
//    Lê o histórico de criativos + transcrições e classifica cada um
//    num ângulo (dor, prova social, urgência, oferta...). Salva no
//    próprio rastreador_criativos_hist. Reprocessa só o que mudou.
// -------------------------------------------------------------------
export async function clusterizarBiblioteca(bibliotecaId: string) {
  try {
    if (!(await llmDisponivel())) return { success: false, error: 'IA não configurada — escolha um modelo e cole a chave em Inteligência → IA.', classificados: 0 }

    // Criativos do histórico.
    const { data: hist } = await supabaseAdmin
      .from('rastreador_criativos_hist')
      .select('ad_archive_id, headline, body, angulo, transcricao_hash')
      .eq('biblioteca_id', bibliotecaId).limit(500)
    if (!hist || hist.length === 0) return { success: true, classificados: 0 }

    // Transcrições em cache pra esses anúncios.
    const ids = hist.map((h) => h.ad_archive_id)
    const trans: Record<string, string> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin
        .from('rastreador_transcricoes').select('ad_archive_id, texto').in('ad_archive_id', ids.slice(i, i + 200))
      for (const r of data ?? []) if (r.ad_archive_id && r.texto) trans[r.ad_archive_id] = r.texto
    }

    // Monta itens a classificar (só os que ainda não têm ângulo ou cujo texto mudou).
    const itens: { id: string; texto: string; hash: string }[] = []
    for (const h of hist) {
      const texto = (trans[h.ad_archive_id] || [h.headline, h.body].filter(Boolean).join(' — ') || '').trim()
      if (!texto) continue
      const hash = hashTexto(texto)
      if (h.angulo && h.angulo !== 'indefinido' && h.transcricao_hash === hash) continue
      itens.push({ id: h.ad_archive_id, texto: texto.slice(0, 1200), hash })
    }
    if (itens.length === 0) return { success: true, classificados: 0, jaClassificados: hist.length }

    // Uma chamada só, em lote.
    const lista = itens.map((it, i) => `[${i}] ${it.texto}`).join('\n\n')
    const system = `Você é um estrategista de copy de resposta direta. Classifique cada anúncio no ÂNGULO DE COPY dominante. Ângulos válidos (use exatamente estes ids): ${IDS_ANGULO.join(', ')}. Responda SÓ com um array JSON [{"i": number, "angulo": "id", "resumo": "frase curta (máx 12 palavras) do gancho"}], sem texto fora do JSON.`
    const prompt = `Anúncios:\n\n${lista}`
    const r = await chamarLLM({ system, prompt, maxTokens: 2000, temperatura: 0.2 })
    if (!r.ok) return { success: false, error: r.erro, classificados: 0 }

    const arr = extrairJSON<{ i: number; angulo: string; resumo?: string }[]>(r.texto)
    if (!Array.isArray(arr)) return { success: false, error: 'Resposta da IA não veio como JSON.', classificados: 0, _raw: r.texto.slice(0, 300) }

    let classificados = 0
    for (const item of arr) {
      const it = itens[item.i]
      if (!it) continue
      const angulo = IDS_ANGULO.includes(item.angulo) ? item.angulo : 'indefinido'
      const { error } = await supabaseAdmin
        .from('rastreador_criativos_hist')
        .update({ angulo, angulo_resumo: item.resumo?.slice(0, 160) ?? null, transcricao_hash: it.hash })
        .eq('biblioteca_id', bibliotecaId).eq('ad_archive_id', it.id)
      if (!error) classificados++
    }
    return { success: true, classificados }
  } catch (e: any) {
    return { success: false, error: e.message, classificados: 0 }
  }
}

// -------------------------------------------------------------------
// 2) Gerador de variações de copy a partir da transcrição do concorrente
//    NÃO copia — usa a estrutura como input pra gerar ângulos novos
//    adaptados ao nosso nicho/oferta.
// -------------------------------------------------------------------
export interface VariacaoCopy {
  angulo: string
  headline: string
  abertura: string   // primeiros 3-5 segundos / primeira linha
  corpo: string      // desenvolvimento do argumento
  cta: string
}

export async function gerarVariacoesCopy(params: {
  fonteTexto: string
  nicho?: string | null
  oferta?: string | null
  instrucoes?: string | null
  bibliotecaId?: string | null
  adArchiveId?: string | null
  quantidade?: number
}) {
  try {
    if (!(await llmDisponivel())) return { success: false, error: 'IA não configurada — escolha um modelo e cole a chave em Inteligência → IA.', data: null }
    const fonte = (params.fonteTexto || '').trim()
    if (fonte.length < 20) return { success: false, error: 'Texto-fonte muito curto pra gerar variações.', data: null }

    const qtd = Math.min(6, Math.max(2, params.quantidade ?? 3))
    const nicho = params.nicho?.trim() || 'não informado'
    const oferta = params.oferta?.trim() || 'não informada'

    const system = `Você é um copywriter de resposta direta (VSL/anúncio) especialista em português do Brasil.
Recebe a TRANSCRIÇÃO de um anúncio de CONCORRENTE apenas como referência de ESTRUTURA e ÂNGULO.
REGRAS: (1) NÃO copie frases, ganchos ou expressões do concorrente — reescreva do zero. (2) Adapte ao NOSSO nicho e oferta. (3) Gere ${qtd} variações com ÂNGULOS diferentes entre si. (4) Cada variação com: angulo (um id entre ${IDS_ANGULO.join(', ')}), headline, abertura (gancho dos primeiros segundos), corpo (argumento), cta. (5) Português brasileiro, tom de resposta direta, sem promessas ilegais/saúde milagrosa.
Responda SÓ com JSON: {"variacoes":[{"angulo","headline","abertura","corpo","cta"}]}.`

    const prompt = `NOSSO NICHO: ${nicho}
NOSSA OFERTA: ${oferta}
INSTRUÇÕES EXTRAS: ${params.instrucoes?.trim() || 'nenhuma'}

TRANSCRIÇÃO DO CONCORRENTE (referência de estrutura, NÃO copiar):
"""
${fonte.slice(0, 4000)}
"""`

    const r = await chamarLLM({ system, prompt, maxTokens: 3000, temperatura: 0.85 })
    if (!r.ok) return { success: false, error: r.erro, data: null }
    const parsed = extrairJSON<{ variacoes: VariacaoCopy[] }>(r.texto)
    const variacoes = parsed?.variacoes
    if (!Array.isArray(variacoes) || variacoes.length === 0) {
      return { success: false, error: 'A IA não retornou variações válidas.', data: null, _raw: r.texto.slice(0, 400) }
    }

    // Persiste o histórico da geração.
    const orgId = await resolveOrgId()
    if (orgId) {
      const modelo = await modeloSelecionado()
      await supabaseAdmin.from('rastreador_copy_ger').insert({
        org_id: orgId,
        biblioteca_id: params.bibliotecaId ?? null,
        ad_archive_id: params.adArchiveId ?? null,
        fonte_texto: fonte.slice(0, 6000),
        nicho: params.nicho ?? null, oferta: params.oferta ?? null,
        instrucoes: params.instrucoes ?? null,
        resultado: variacoes, modelo,
      }).select('id').maybeSingle()
    }

    return { success: true, data: { variacoes } }
  } catch (e: any) {
    return { success: false, error: e.message, data: null }
  }
}

export async function listarGeracoesCopy(limite = 20) {
  try {
    const { data, error } = await supabaseAdmin
      .from('rastreador_copy_ger')
      .select('id, biblioteca_id, ad_archive_id, nicho, oferta, resultado, criado_em')
      .order('criado_em', { ascending: false }).limit(limite)
    if (error) throw error
    return { success: true, data: data ?? [] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] }
  }
}
