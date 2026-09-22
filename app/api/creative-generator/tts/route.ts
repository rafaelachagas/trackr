import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, RAIZ_LOCUCAO } from '@/lib/criativos'

// Locução por API (ElevenLabs). Recebe o roteiro, gera o MP3 e devolve o
// caminho no Storage — o mesmo formato do upload de locução, pra montagem não
// saber a diferença.
//
// Atenção: o plano Pro do ElevenLabs dá caracteres de API, mas NÃO libera voz
// clonada por API. Só as vozes que a conta consegue listar funcionam aqui.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const EL = 'https://api.elevenlabs.io/v1'
const MODELO = 'eleven_multilingual_v2'
// Teto de segurança: caractere no ElevenLabs é dinheiro, e roteiro de criativo
// não passa perto disso.
const MAX_CARACTERES = 5000

/** Tira as marcações de b-roll — a voz não pode ler "[broll: dinheiro]". */
export function textoParaVoz(roteiro: string): string {
  return String(roteiro || '')
    .replace(/\[broll:[^\]]*\]/gi, ' ')
    .replace(/\$[\w-]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function lerConfig(chave: string): Promise<string> {
  const { data } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', chave).maybeSingle()
  return data?.valor?.toString().trim() || ''
}

export async function POST(req: Request) {
  try {
    const { texto, vozId } = await req.json().catch(() => ({}))
    const fala = textoParaVoz(texto)
    if (!fala) return NextResponse.json({ error: 'sem texto pra gerar a voz' }, { status: 400 })
    if (fala.length > MAX_CARACTERES) {
      return NextResponse.json({ error: `roteiro longo demais (${fala.length} caracteres, máx. ${MAX_CARACTERES})` }, { status: 400 })
    }

    const key = await lerConfig('elevenlabs_api_key') || process.env.ELEVENLABS_API_KEY || ''
    if (!key) return NextResponse.json({ error: 'chave do ElevenLabs não configurada' }, { status: 400 })
    const voz = String(vozId || '').trim() || await lerConfig('elevenlabs_voz_id')
    if (!voz) return NextResponse.json({ error: 'nenhuma voz escolhida' }, { status: 400 })

    const r = await fetch(`${EL}/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text: fala, model_id: MODELO }),
      signal: AbortSignal.timeout(110_000),
    })
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '')
      // 401 = chave; 403 costuma ser voz que o plano não libera por API.
      return NextResponse.json({
        error: `ElevenLabs recusou (${r.status})${detalhe ? `: ${detalhe.slice(0, 300)}` : ''}`,
      }, { status: 502 })
    }

    const bytes = Buffer.from(await r.arrayBuffer())
    if (bytes.length < 1000) return NextResponse.json({ error: 'o ElevenLabs devolveu um áudio vazio' }, { status: 502 })

    const caminho = `${RAIZ_LOCUCAO}/${randomUUID()}.mp3`
    const { error } = await supabaseAdmin.storage.from(BUCKET_CRIATIVOS)
      .upload(caminho, bytes, { contentType: 'audio/mpeg', upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ caminho, caracteres: fala.length, bytes: bytes.length })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
