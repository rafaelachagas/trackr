import { NextRequest, NextResponse } from 'next/server'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, AUDIO_OK, VIDEO_OK, nomeSeguro } from '@/lib/criativos'

// Transcrição de arquivo (o áudio .ogg do WhatsApp é o caso de uso que pediu
// isto). O transcritor da VPS só sabe receber URL, então o arquivo sobe pro
// Storage, vira URL assinada e segue pela MESMA fila assíncrona do link —
// nenhum código novo na VPS.
//
// POST   {nome}      → assina o envio direto do navegador
// PUT    {caminho}   → inicia o job na VPS, devolve {job_id}
// DELETE ?caminho=   → apaga o arquivo (o front chama quando o job termina)
//
// O status é consultado pelo GET de /api/rastreador/transcrever-async.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RAIZ = 'transcricao'

// Extensão que a VPS reconhece como mídia direta (MEDIA_EXT no app.py). Fora
// dessa lista ela chama o yt-dlp, que não resolve arquivo nosso. O .opus do
// WhatsApp é opus dentro de container ogg — mesmo arquivo, outro nome —, então
// guardar como .ogg é correto, não gambiarra.
const TRADUZ: Record<string, string> = { '.opus': '.ogg', '.oga': '.ogg', '.m4v': '.mp4' }
const DIRETA = ['.mp4', '.mov', '.webm', '.m4a', '.mp3', '.wav', '.aac', '.ogg']

function destino(nome: string): string | null {
  const limpo = nomeSeguro(nome, 80)
  if (!limpo || !(AUDIO_OK.test(limpo) || VIDEO_OK.test(limpo))) return null
  const ponto = limpo.lastIndexOf('.')
  const ext = limpo.slice(ponto).toLowerCase()
  const base = limpo.slice(0, ponto)
  const final = TRADUZ[ext] || ext
  if (!DIRETA.includes(final)) return null
  return `${RAIZ}/${Date.now()}-${base}${final}`
}

export async function POST(req: NextRequest) {
  try {
    const { nome } = await req.json()
    const caminho = destino(nome || '')
    if (!caminho) {
      return NextResponse.json(
        { error: 'use áudio (ogg, opus, mp3, m4a, wav) ou vídeo (mp4, mov, webm)' },
        { status: 400 })
    }
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS).createSignedUploadUrl(caminho, { upsert: true })
    if (error || !data) throw new Error(error?.message || 'falha ao assinar o envio')
    return NextResponse.json({ caminho, signedUrl: data.signedUrl, token: data.token })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { caminho } = await req.json()
    if (!String(caminho || '').startsWith(`${RAIZ}/`)) {
      return NextResponse.json({ error: 'caminho inválido' }, { status: 400 })
    }
    // 2h de validade: a fila da VPS roda um trabalho por vez, e a URL precisa
    // continuar valendo se houver VSL grande na frente.
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS).createSignedUrl(caminho, 7200)
    if (error || !data?.signedUrl) throw new Error(error?.message || 'falha ao assinar a leitura')

    const alvo = `${TRANSCRITOR_URL}/transcribe_async?video_url=${encodeURIComponent(data.signedUrl)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30000)
    const r = await fetch(alvo, { signal: ctrl.signal, cache: 'no-store' }).finally(() => clearTimeout(t))
    const j = await r.json().catch(() => null)
    if (!j?.job_id) {
      return NextResponse.json(
        { error: j?.error || 'A VPS não aceitou o trabalho.' }, { status: 502 })
    }
    return NextResponse.json({ job_id: j.job_id, caminho })
  } catch {
    return NextResponse.json(
      { error: 'Não consegui falar com o transcritor na VPS (porta 8082).' }, { status: 502 })
  }
}

// O arquivo só serve pra VPS poder baixar. Depois disso é lixo ocupando
// storage — e storage sobrando já deu dor de cabeça aqui.
export async function DELETE(req: NextRequest) {
  try {
    const caminho = req.nextUrl.searchParams.get('caminho') || ''
    if (!caminho.startsWith(`${RAIZ}/`)) {
      return NextResponse.json({ error: 'caminho inválido' }, { status: 400 })
    }
    const { error } = await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).remove([caminho])
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
