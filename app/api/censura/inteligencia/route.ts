import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizar } from '@/lib/censura'
import { aplicarExtra, BIBLIOTECA } from '@/lib/censura-riscos'
import { carregarExtra, salvarExtra } from '@/lib/censura-inteligencia'
import { motivosEmTexto, descobrir } from '@/lib/censura-meta'
import { decidir, gerarPropostas, politicaColada, avisarNoWhatsApp } from '@/lib/censura-revisor'
import { iniciarPlacar, passoPlacar } from '@/lib/censura-placar'

// Página /tools/censor/inteligencia: tudo que faz a análise melhorar.
// GET → painel · POST { acao, ... } → ações (ver switch).
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SINAL_RISCO = new Set(['risco', 'contexto', 'censurou', 'reprovado'])
const SINAL_FALSO = new Set(['nao_risco', 'liberou'])

export async function GET() {
  try {
    const extra = await carregarExtra()
    const bib = aplicarExtra(extra)
    const termosBib = new Set(bib.flatMap((c) => c.termos.split('\n').map((t) => t.trim())))

    const [{ data: ex, error: e1 }, { data: casos, error: e2 }, { data: props }, { data: placares }] = await Promise.all([
      supabaseAdmin.from('censura_exemplos').select('origem, trecho, decisao, gravidade, politica, motivo, contexto, categoria, criado').order('criado', { ascending: false }).limit(5000),
      supabaseAdmin.from('censura_casos_meta').select('ad_id, nome, conta, situacao, etapa, motivos, trechos, erro, atualizado').order('atualizado', { ascending: false }).limit(1000),
      supabaseAdmin.from('censura_propostas').select('*').order('numero', { ascending: false }).limit(60),
      supabaseAdmin.from('censura_placar').select('id, criado, motivo, status, acertos, total, casos, resultados, terminado').order('criado', { ascending: false }).limit(12),
    ])
    const faltaSql = [e1, e2].find((e) => e && /does not exist|schema cache/i.test(e.message))
    if (faltaSql) return NextResponse.json({ faltaSql: true })

    const exemplos = ex ?? []
    const porDecisao: Record<string, number> = {}
    for (const e of exemplos) { const k = `${e.origem}:${e.decisao}`; porDecisao[k] = (porDecisao[k] || 0) + 1 }

    // Sugestões: marcado 3+ vezes como risco e fora da biblioteca.
    const agg = new Map<string, { risco: number; falso: number; motivo?: string }>()
    for (const e of exemplos) {
      const a = agg.get(e.trecho) || { risco: 0, falso: 0 }
      if (SINAL_RISCO.has(e.decisao)) a.risco++
      if (SINAL_FALSO.has(e.decisao)) a.falso++
      if (!a.motivo && e.motivo) a.motivo = e.motivo
      agg.set(e.trecho, a)
    }
    const sugestoes = [...agg].filter(([t, a]) => a.risco >= 3 && a.risco > a.falso * 2 && !termosBib.has(t))
      .sort((a, b) => b[1].risco - a[1].risco).slice(0, 30).map(([trecho, a]) => ({ trecho, ...a }))
    // Alarmes falsos: termo da biblioteca liberado 3+ vezes.
    const falsos = [...agg].filter(([t, a]) => a.falso >= 3 && a.falso > a.risco && termosBib.has(t))
      .sort((a, b) => b[1].falso - a[1].falso).slice(0, 30).map(([trecho, a]) => ({ trecho, ...a }))

    const observacoes = exemplos.filter((e) => e.origem === 'editor' && e.motivo).slice(0, 40)

    const lista = casos ?? []
    const contagem = {
      reprovados: lista.filter((c) => c.situacao === 'reprovado').length,
      aprovados: lista.filter((c) => c.situacao === 'aprovado').length,
      analisados: lista.filter((c) => c.etapa === 'analisado').length,
      naFila: lista.filter((c) => c.etapa === 'novo' || c.etapa === 'transcrito').length,
      semMidia: lista.filter((c) => c.etapa === 'sem_midia').length,
    }
    // Políticas que mais reprovaram (nome = antes do ":").
    const politicas = new Map<string, number>()
    for (const c of lista.filter((x) => x.situacao === 'reprovado')) {
      for (const l of motivosEmTexto(c.motivos).split('\n').filter(Boolean)) {
        const nome = l.split(':')[0].trim().slice(0, 80)
        politicas.set(nome, (politicas.get(nome) || 0) + 1)
      }
    }
    const reprovados = lista.filter((c) => c.situacao === 'reprovado').slice(0, 40).map((c) => ({
      ad_id: c.ad_id, nome: c.nome, conta: c.conta, etapa: c.etapa, erro: c.erro, atualizado: c.atualizado,
      motivo: motivosEmTexto(c.motivos), trechos: (c.trechos as any[]) || [],
    }))

    return NextResponse.json({
      porDecisao, total: exemplos.length, sugestoes, falsos, observacoes,
      contagem, politicas: [...politicas].sort((a, b) => b[1] - a[1]).slice(0, 12), reprovados,
      propostas: props ?? [], placares: placares ?? [],
      categorias: bib.map((c) => ({ id: c.id, nome: c.nome, gravidade: c.gravidade, termos: c.termos.split('\n').length })),
      mudancas: extra,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const ini = Date.now()
  try {
    const b = await req.json()
    switch (b?.acao) {
      case 'decidir': {
        const r = await decidir(b.numeros === 'tudo' ? 'tudo' : (b.numeros as number[]), !!b.aprovar)
        return NextResponse.json({ ok: true, feitas: r.feitas.length })
      }
      case 'gerar': {
        const ps = await gerarPropostas()
        if (b.whatsapp) await avisarNoWhatsApp(ps)
        return NextResponse.json({ ok: true, propostas: ps.length })
      }
      case 'politica': {
        const texto = String(b.texto || '').trim()
        if (texto.length < 40) return NextResponse.json({ error: 'Cole o texto da política (pelo menos um parágrafo).' }, { status: 400 })
        const ps = await politicaColada(texto)
        return NextResponse.json({ ok: true, propostas: ps.length })
      }
      case 'adicionar_termo': {
        const cat = BIBLIOTECA.find((c) => c.id === b.categoria)
        const termo = normalizar(String(b.termo || ''))
        if (!cat || !termo) return NextResponse.json({ error: 'categoria ou termo inválido' }, { status: 400 })
        const extra = await carregarExtra()
        extra.termos = { ...(extra.termos || {}), [cat.id]: [...new Set([...(extra.termos?.[cat.id] || []), termo])] }
        extra.removidos = { ...(extra.removidos || {}), [cat.id]: (extra.removidos?.[cat.id] || []).filter((t) => t !== termo) }
        await salvarExtra(extra)
        return NextResponse.json({ ok: true })
      }
      case 'remover_termo': {
        const cat = BIBLIOTECA.find((c) => c.id === b.categoria) || aplicarExtra(await carregarExtra()).find((c) => c.termos.split('\n').includes(String(b.termo)))
        const termo = String(b.termo || '').trim()
        if (!cat || !termo) return NextResponse.json({ error: 'categoria ou termo inválido' }, { status: 400 })
        const extra = await carregarExtra()
        extra.removidos = { ...(extra.removidos || {}), [cat.id]: [...new Set([...(extra.removidos?.[cat.id] || []), termo])] }
        extra.termos = { ...(extra.termos || {}), [cat.id]: (extra.termos?.[cat.id] || []).filter((t) => t !== termo) }
        await salvarExtra(extra)
        return NextResponse.json({ ok: true })
      }
      case 'buscar_meta': {
        return NextResponse.json({ ok: true, ...(await descobrir()) })
      }
      case 'placar_iniciar': {
        const p = await iniciarPlacar('manual')
        return NextResponse.json({ ok: true, id: p.id })
      }
      case 'placar_passo': {
        const p = await passoPlacar(String(b.id), ini + 250_000)
        return NextResponse.json({ ok: true, status: p?.status, feitos: p?.resultados?.length ?? 0, total: p?.casos?.length ?? 0, acertos: p?.acertos ?? 0 })
      }
      default:
        return NextResponse.json({ error: 'ação desconhecida' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
