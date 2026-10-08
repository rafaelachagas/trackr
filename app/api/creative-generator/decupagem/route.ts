import { NextResponse } from 'next/server'
import { chamarLLM, llmDisponivel, extrairJSON } from '@/lib/llm'
import { lerRoteiroEmBlocos, comoTempo, type CenaRoteiro } from '@/lib/criativos-roteiro-editor'

// Lê a decupagem em blocos COM a IA por cima.
//
// A divisão de trabalho é de propósito: o leitor determinístico manda nos
// tempos que estão escritos (0:04, 0:15 até 0:17) porque ler número não exige
// inteligência e a IA erraria de vez em quando. A IA entra só onde o texto é
// instrução em prosa — "transição de 1 segundo", "bem rápido", "corta na
// metade da frase" — que é onde ler literal não resolve.
//
// A IA nunca sobrescreve um tempo que o leitor achou. Ela pode preencher o que
// faltou e sugerir transição, movimento e ênfase, e cada sugestão vem marcada
// pra você ver de onde veio.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

type Sugestao = {
  cena: number
  de?: number
  ate?: number
  transicao?: string
  zoom?: string
  enquadramento?: number
  motivo?: string
}

const TRANSICOES = ['corte', 'fade', 'flash', 'whip', 'slide', 'zoom', 'glitch', 'dissolve']
const ZOOMS = ['nenhum', 'in', 'out', 'punch']

const SYSTEM = `Você lê a decupagem de um criativo de anúncio vertical e traduz as
instruções escritas em prosa para os controles de um montador automático.

O montador entende, por cena:
- "de" e "ate": o pedaço do clipe de b-roll a usar, em segundos
- "transicao": ${TRANSICOES.join(' | ')}
- "zoom": ${ZOOMS.join(' | ')}  ("punch" = entra ampliado e assenta, o soco do corte)
- "enquadramento": -1 a 1. Positivo sobe o que aparece no quadro (use quando o
  texto pedir pra "subir a pessoa", "levantar o enquadramento", em geral porque
  a legenda vai cobrir a parte de baixo). Negativo desce. 0 deixa centralizado.

Regras duras:
1. NUNCA invente tempo. Só preencha "de"/"ate" quando o texto disser um tempo e
   o leitor automático não tiver pego. Se o texto diz "mais ou menos", "rápido"
   ou "um pouco", isso NÃO é tempo.
2. "transição de N segundos", "passa rapidamente pra outra cena", "funde" →
   sugira dissolve, whip, slide ou zoom conforme o texto. Corte seco é o padrão
   e não precisa ser dito.
3. "bem rápido", "cena curta" NÃO vira tempo: a duração de cada cena vem da
   fala, não do clipe. Nesses casos não preencha nada e explique no motivo.
4. Se não houver instrução nenhuma na cena, devolva apenas o número dela sem
   nenhum campo. Não preencha por preencher.
5. Responda SÓ com JSON válido: {"sugestoes":[{"cena":1,"transicao":"dissolve","motivo":"..."}]}
O motivo é uma frase curta em português, citando o pedaço do texto que te levou
àquela escolha.`

export async function POST(req: Request) {
  try {
    const { texto } = await req.json()
    if (!texto?.trim()) return NextResponse.json({ error: 'sem roteiro' }, { status: 400 })

    const base = lerRoteiroEmBlocos(texto)
    if (!base.cenas.length) {
      return NextResponse.json({ ...base, ia: false, motivoIA: 'nenhuma cena encontrada' })
    }
    if (!(await llmDisponivel())) {
      return NextResponse.json({ ...base, ia: false, motivoIA: 'IA não configurada' })
    }

    // A IA recebe o que já foi entendido, pra não repetir trabalho nem brigar
    // com o que está escrito preto no branco.
    const resumo = base.cenas.map((c) => ({
      cena: c.cena,
      clipe: c.clipe,
      ja_entendido: {
        de: c.de != null ? comoTempo(c.de) : null,
        ate: c.ate != null ? comoTempo(c.ate) : null,
      },
      contexto: c.contexto || '',
      fala: c.copy,
    }))

    const r = await chamarLLM({
      system: SYSTEM,
      prompt: `Decupagem:\n${JSON.stringify(resumo, null, 1)}`,
      json: true,
      maxTokens: 1800,
      temperatura: 0,
    })
    if (!r.ok) return NextResponse.json({ ...base, ia: false, motivoIA: r.erro })

    const parsed = extrairJSON<{ sugestoes?: Sugestao[] }>(r.texto)
    if (!parsed) {
      return NextResponse.json({ ...base, ia: false, motivoIA: 'a IA não devolveu JSON válido' })
    }
    const sugestoes: Sugestao[] = Array.isArray(parsed.sugestoes) ? parsed.sugestoes : []

    // Aplica o que é legítimo, e só isso.
    const cenas: CenaRoteiro[] = base.cenas.map((c) => ({ ...c, avisos: [...c.avisos] }))
    const porCena = new Map(cenas.map((c) => [c.cena, c]))
    const extras: Record<number, { transicao?: string; zoom?: string; enquadramento?: number }> = {}
    for (const s of sugestoes) {
      const c = porCena.get(Number(s.cena))
      if (!c) continue
      const motivo = String(s.motivo || '').slice(0, 140)
      if (c.de == null && typeof s.de === 'number' && s.de >= 0) {
        c.de = s.de
        if (typeof s.ate === 'number' && s.ate > s.de) c.ate = s.ate
        c.avisos.push(`IA leu o tempo ${comoTempo(c.de)} do contexto${motivo ? ` — ${motivo}` : ''}`)
      }
      if (typeof s.transicao === 'string' && TRANSICOES.includes(s.transicao) && s.transicao !== 'corte') {
        extras[c.cena] = { ...extras[c.cena], transicao: s.transicao }
        c.avisos.push(`IA sugere entrada "${s.transicao}"${motivo ? ` — ${motivo}` : ''}`)
      }
      if (typeof s.enquadramento === 'number' && Math.abs(s.enquadramento) > 0.01) {
        const v = Math.max(-1, Math.min(1, s.enquadramento))
        extras[c.cena] = { ...extras[c.cena], enquadramento: v }
        c.avisos.push(`IA ${v > 0 ? 'sobe' : 'desce'} o enquadramento${motivo ? ` — ${motivo}` : ''}`)
      }
      if (typeof s.zoom === 'string' && ZOOMS.includes(s.zoom)) {
        extras[c.cena] = { ...extras[c.cena], zoom: s.zoom }
        c.avisos.push(`IA sugere movimento "${s.zoom}"${motivo ? ` — ${motivo}` : ''}`)
      }
    }

    // Reconstrói o roteiro com os tempos que a IA tenha preenchido.
    const roteiro = cenas.map((c, i) => {
      const marca = c.de != null
        ? `$${c.clipe}@${comoTempo(c.de)}${c.ate != null ? `-${comoTempo(c.ate)}` : ''}`
        : `$${c.clipe}`
      // A fala já veio sem a repetição tratada pelo leitor; reaproveita a linha.
      const linha = base.roteiro.split('\n')[i] || ''
      const fala = linha.replace(/^\$[\w-]+(@[^\s]+)?\s*/, '')
      return `${marca} ${fala}`.trim()
    }).join('\n')

    return NextResponse.json({
      cenas,
      roteiro,
      avisos: base.avisos,
      // Por cena, na ordem: o que o montador deve aplicar além do tempo.
      porCena: cenas.map((c) => extras[c.cena] || {}),
      ia: true,
    })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
