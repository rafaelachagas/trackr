import { NextResponse } from 'next/server'
import { chamarLLM } from '@/lib/llm'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'

// Origem do roteiro. Três caminhos, mesma saída (texto marcado):
//  · 'transcrever' — puxa a fala de um vídeo (nosso ou de concorrente)
//  · 'adaptar'     — reescreve um roteiro existente pro nosso produto
//  · escrever à mão no painel não passa por aqui
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const SISTEMA = `Você escreve roteiros de anúncio em vídeo para o mercado brasileiro.

Regras que valem sempre, porque anúncio reprovado não vende nada:
- Nunca cite marca de terceiros pelo nome nem afirme o que ela faz ou paga.
- Nunca prometa valor de ganho, prazo para ganhar, nem use prova social com
  cifra ("fiz R$ 3 mil em 15 dias").
- Não use "renda garantida", "sem esforço", "dinheiro fácil".
- Fale do método, da habilidade e de quem é a pessoa — não do resultado financeiro.

Formato da saída: o roteiro em falas curtas, uma por linha, do jeito que será
locutado. Onde couber imagem de apoio, insira a marcação [broll: ETIQUETA xN]
no meio da linha, usando SOMENTE as etiquetas que forem informadas.`

export async function POST(req: Request) {
  try {
    const { acao, url, texto, produto, etiquetas } = await req.json()

    if (acao === 'transcrever') {
      if (!url) return NextResponse.json({ error: 'informe o link do vídeo' }, { status: 400 })
      if (!TRANSCRITOR_URL || !TRANSCRITOR_APIKEY) {
        return NextResponse.json({ error: 'transcritor não configurado' }, { status: 500 })
      }
      const r = await fetch(
        `${TRANSCRITOR_URL}/transcribe?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}` +
        `&video_url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(280_000) },
      ).catch(() => null)
      if (!r) return NextResponse.json({ error: 'o transcritor não respondeu — a VPS pode estar fora do ar' }, { status: 503 })
      const j = await r.json().catch(() => ({} as any))
      if (j?.error || !j?.texto) {
        return NextResponse.json({ error: j?.error || 'não consegui transcrever' }, { status: 502 })
      }
      return NextResponse.json({ texto: j.texto, duracao: j.duracao })
    }

    if (acao === 'adaptar') {
      if (!texto?.trim()) return NextResponse.json({ error: 'sem roteiro de origem' }, { status: 400 })
      const lista = Array.isArray(etiquetas) && etiquetas.length
        ? etiquetas.join(', ')
        : 'nenhuma etiqueta disponível — não use marcações [broll:]'
      const r = await chamarLLM({
        system: SISTEMA,
        prompt:
          `Roteiro de origem (transcrição de um anúncio):\n"""\n${String(texto).slice(0, 12000)}\n"""\n\n` +
          `Nosso produto/oferta: ${produto || '(não informado)'}\n\n` +
          `Etiquetas de b-roll disponíveis: ${lista}\n\n` +
          `Reescreva para o nosso produto mantendo o gancho e a estrutura que fazem ` +
          `este roteiro funcionar, mas com conteúdo nosso e dentro das regras. ` +
          `Devolva só o roteiro, sem comentários.`,
        maxTokens: 2000,
        temperatura: 0.7,
      })
      if (!r.ok) return NextResponse.json({ error: r.erro || 'a IA não respondeu' }, { status: 502 })
      return NextResponse.json({ texto: r.texto })
    }

    return NextResponse.json({ error: 'ação desconhecida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
