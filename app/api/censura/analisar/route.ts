import { NextRequest, NextResponse } from 'next/server'
import { chamarLLM } from '@/lib/llm'
import { POLITICA_META } from '@/lib/censura-politica'
import { GRAVIDADES, Gravidade, Risco } from '@/lib/censura-riscos'

// Editor de Censura → "Analisar riscos". A IA lê a transcrição com a política
// da Meta (a skill do usuário) e devolve os trechos de risco apontando pros
// ids das palavras, que é o que o editor sabe censurar.
//
// POST { palavras: [{id, w}], motivos?: string } → { riscos: Risco[] }
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180

const SISTEMA = `Você é o revisor de criativos da operação. Segue o manual abaixo à risca.

${POLITICA_META}

---
TAREFA NESTA FERRAMENTA
Você recebe a transcrição de um criativo em vídeo, palavra por palavra, no formato id:palavra. O usuário vai usar o resultado num editor que marca palavras pra bipar/silenciar no áudio e esconder na legenda.

Aponte os trechos com risco de política, do mais grave pro mais leve, seguindo os princípios do manual:
- Leia o sentido, não só a palavra. Ex.: "ela te paga 250, 300, 500 pelo vídeo" é risco mesmo sem nenhuma palavra "proibida".
- Marque o MENOR trecho que carrega o risco (a marca, o valor, a expressão), não a frase inteira — é isso que vai ser bipado.
- bip_resolve = false quando, mesmo bipando esse trecho, a frase continua passando a ideia proibida (o sentido fica). Nesse caso diga na "troca" como regravar ou reescrever. Não sugira disfarce (gíria, sinônimo com o mesmo sentido) — o manual proíbe.
- gravidade: "muito_alto" | "alto" | "medio" | "baixo", pelos critérios do manual (a combinação VOCÊ + VALOR + PRAZO + FACILIDADE pesa mais).
- Não invente risco pra preencher lista. Trecho sem risco fica de fora.
- Português do Brasil, frases curtas.

Responda SÓ com JSON, sem texto fora dele:
{"riscos":[{"de":<id da primeira palavra>,"ate":<id da última palavra>,"gravidade":"...","categoria":"nome curto da política","politica":"seção da política da Meta","motivo":"por que pesa, em 1 frase","troca":"o que pôr no lugar ou como regravar","bip_resolve":true}]}`

interface Bruto { de?: unknown; ate?: unknown; gravidade?: unknown; categoria?: unknown; politica?: unknown; motivo?: unknown; troca?: unknown; bip_resolve?: unknown }

function extrairJson(texto: string): { riscos?: Bruto[] } | null {
  const ini = texto.indexOf('{'), fim = texto.lastIndexOf('}')
  if (ini < 0 || fim <= ini) return null
  try { return JSON.parse(texto.slice(ini, fim + 1)) } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    const { palavras, motivos } = await req.json() as { palavras?: { id: number; w: string }[]; motivos?: string }
    if (!Array.isArray(palavras) || !palavras.length) return NextResponse.json({ error: 'transcrição vazia' }, { status: 400 })
    if (palavras.length > 12000) return NextResponse.json({ error: 'Vídeo longo demais pra analisar de uma vez.' }, { status: 400 })

    const ordem = palavras.map((p) => p.id)
    const pos = new Map(ordem.map((id, i) => [id, i]))
    const texto = palavras.map((p) => `${p.id}:${String(p.w).replace(/\s+/g, '')}`).join(' ')
    const prompt = [
      motivos?.trim() ? `Motivos de reprovação/bloqueio que a Meta já mandou pra esta operação (dê peso extra a isso):\n${motivos.trim().slice(0, 4000)}\n` : '',
      `Transcrição:\n${texto}`,
    ].join('\n')

    const r = await chamarLLM({ system: SISTEMA, prompt, json: true, maxTokens: 8000, timeoutMs: 170000 })
    if (!r.ok) return NextResponse.json({ error: r.erro || 'A IA não respondeu.' }, { status: 502 })
    const j = extrairJson(r.texto)
    if (!j || !Array.isArray(j.riscos)) return NextResponse.json({ error: 'A IA respondeu num formato que não entendi. Tente de novo.' }, { status: 502 })

    const riscos: Risco[] = []
    for (const b of j.riscos) {
      const a = pos.get(Number(b.de)), z = pos.get(Number(b.ate ?? b.de))
      if (a == null || z == null) continue
      const [i0, i1] = a <= z ? [a, z] : [z, a]
      if (i1 - i0 > 25) continue // trecho enorme não é "o que bipar"
      const g = String(b.gravidade) as Gravidade
      riscos.push({
        ids: ordem.slice(i0, i1 + 1),
        gravidade: GRAVIDADES.includes(g) ? g : 'medio',
        categoria: String(b.categoria || 'Risco').slice(0, 60),
        politica: String(b.politica || '').slice(0, 120),
        motivo: String(b.motivo || '').slice(0, 300),
        troca: b.troca ? String(b.troca).slice(0, 300) : undefined,
        bipResolve: b.bip_resolve !== false,
        fonte: 'ia',
      })
    }
    return NextResponse.json({ riscos })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
