'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { chamarLLM, llmDisponivel, modeloSelecionado } from '@/lib/llm'

async function resolveOrgId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabaseAdmin
        .from('organization_members').select('org_id').eq('user_id', user.id).limit(1).single()
      if (data?.org_id) return data.org_id
    }
  } catch {}
  const { data: org } = await supabaseAdmin
    .from('organizations').select('id').order('created_at', { ascending: true }).limit(1).single()
  return org?.id ?? null
}

export interface VSL {
  id: string
  nome: string
  vturb_player_id: string
  vturb_player_name: string | null
  video_duration: number | null
  landing_url: string | null
  campanhas: string[]           // ids de campanha; [] = todas
  ativo: boolean
  created_at: string
}

export interface CampanhaMeta { id: string; nome: string }

export async function listarVSLs() {
  try {
    const { data, error } = await supabaseAdmin
      .from('vsls').select('*').order('created_at', { ascending: false })
    if (error) throw error
    const vsls = (data ?? []).map((v: any) => ({
      ...v,
      campanhas: Array.isArray(v.campanhas) ? v.campanhas : [],
    })) as VSL[]
    return { success: true, data: vsls }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as VSL[] }
  }
}

export async function salvarVSL(input: {
  id?: string
  nome: string
  vturb_player_id: string
  vturb_player_name?: string | null
  video_duration?: number | null
  landing_url?: string | null
  campanhas: string[]
}) {
  try {
    const org_id = await resolveOrgId()
    if (!org_id) return { success: false, error: 'Organização não encontrada.' }
    if (!input.nome?.trim()) return { success: false, error: 'Dê um nome ao VSL.' }
    if (!input.vturb_player_id) return { success: false, error: 'Escolha o player da VTurb.' }

    const row = {
      org_id,
      nome: input.nome.trim(),
      vturb_player_id: input.vturb_player_id,
      vturb_player_name: input.vturb_player_name ?? null,
      video_duration: input.video_duration ?? null,
      landing_url: input.landing_url?.trim() || null,
      campanhas: input.campanhas ?? [],
      ativo: true,
    }
    const { error } = input.id
      ? await supabaseAdmin.from('vsls').update(row).eq('id', input.id)
      : await supabaseAdmin.from('vsls').upsert(row, { onConflict: 'org_id,vturb_player_id' })
    if (error) throw error
    revalidatePath('/data-sources/vturb')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function removerVSL(id: string) {
  try {
    const { error } = await supabaseAdmin.from('vsls').delete().eq('id', id)
    if (error) throw error
    revalidatePath('/data-sources/vturb')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// Lista as campanhas da Meta (distintas) a partir dos gastos já sincronizados,
// pra o usuário mapear no cadastro de VSL. Pagina pra não cortar em 1000.
export async function listarCampanhasMeta() {
  try {
    const mapa = new Map<string, string>()
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabaseAdmin
        .from('gastos')
        .select('campaign_id, campaign_name')
        .not('campaign_id', 'is', null)
        .range(off, off + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const g of data) {
        const id = String((g as any).campaign_id ?? '').trim()
        if (id && !mapa.has(id)) mapa.set(id, String((g as any).campaign_name ?? id))
      }
      if (data.length < 1000) break
    }
    const campanhas = [...mapa.entries()].map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
    return { success: true, data: campanhas as CampanhaMeta[] }
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as CampanhaMeta[] }
  }
}

// Insight do Simulador "e se?" (Análise de VSL) — traduz os números projetados
// em texto, usando o provider/modelo configurado em Configurações → IA (hoje
// Gemini). Chamado só quando o usuário pede ("Gerar com IA"), não a cada
// arraste de slider — evita custo/latência desnecessários.
export async function gerarInsightSimuladorVsl(input: {
  vslNome: string
  playRateReal: number; playRateSim: number
  retencaoReal: number; retencaoSim: number
  conversaoReal: number; conversaoSim: number
  conversoesReal: number; conversoesSim: number
  receitaReal: number; receitaSim: number
  roasReal: number | null; roasSim: number | null
  gasto: number | null
}): Promise<{ success: boolean; texto?: string; error?: string; modelo?: string }> {
  if (!(await llmDisponivel())) {
    return { success: false, error: 'IA não configurada — escolha um modelo e cole a chave em Configurações → IA.' }
  }
  const fmtBRL = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`
  const prompt = `Você é um analista de performance de VSL (video sales letter) de infoproduto. O usuário está simulando "e se?" no VSL "${input.vslNome}": ele moveu sliders de Play Rate, Retenção ao Pitch e Taxa de Conversão pra ver o impacto projetado, mantendo fixos o ticket médio e o gasto com anúncios reais do período.

Dados reais do período vs. simulado:
- Play Rate: ${fmtPct(input.playRateReal)} → ${fmtPct(input.playRateSim)}
- Retenção ao Pitch: ${fmtPct(input.retencaoReal)} → ${fmtPct(input.retencaoSim)}
- Taxa de Conversão (por play): ${fmtPct(input.conversaoReal)} → ${fmtPct(input.conversaoSim)}
- Conversões: ${Math.round(input.conversoesReal)} → ${Math.round(input.conversoesSim)}
- Receita: ${fmtBRL(input.receitaReal)} → ${fmtBRL(input.receitaSim)}
${input.roasReal != null && input.roasSim != null ? `- ROAS: ${input.roasReal.toFixed(2)}x → ${input.roasSim.toFixed(2)}x` : ''}
${input.gasto != null ? `- Gasto com anúncios no período (fixo): ${fmtBRL(input.gasto)}` : ''}

Escreva 2-3 frases curtas, em português do Brasil, direto ao ponto, para uma pessoa não-técnica (dona do infoproduto): traduza a diferença em impacto prático (quanto muda em vendas e faturamento), e se fizer sentido, um comentário breve sobre qual dessas 3 métricas parece o alavanque mais realista de mexer primeiro. Não repita os números brutos que já estão na tela — foque na interpretação. Sem markdown, sem listas, texto corrido.`

  const r = await chamarLLM({ prompt, maxTokens: 400, temperatura: 0.6 })
  if (!r.ok) return { success: false, error: r.erro || 'Falha ao chamar a IA.' }
  return { success: true, texto: r.texto, modelo: await modeloSelecionado() }
}
