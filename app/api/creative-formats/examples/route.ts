import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, VIDEO_OK, IMAGEM_OK, nomeSeguro } from '@/lib/criativos'

// Exemplos de cada formato de criativo. Um formato é uma ideia abstrata até
// você ver três anúncios que o usaram — por isso o exemplo é arquivo de
// verdade, guardado no Storage, e não um link que some.
//
// Vídeo e imagem, porque metade dos formatos não é vídeo: Tweet, Mensagem,
// Choquei e Copy no papel se explicam com um print.
//
// Caminho: formatos/<id-do-formato>/<arquivo>
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RAIZ = 'formatos'
const LIMITE = 12

function pasta(formatoId: string) {
  const id = nomeSeguro(formatoId, 60)
  return id ? `${RAIZ}/${id}` : null
}

export async function GET(req: Request) {
  try {
    const formato = new URL(req.url).searchParams.get('formato') || ''
    const p = pasta(formato)
    if (!p) return NextResponse.json({ error: 'formato inválido' }, { status: 400 })

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS)
      .list(p, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } })
    if (error) throw new Error(error.message)

    const itens = (data || []).filter((f) => f.id)
    const caminhos = itens.map((f) => `${p}/${f.name}`)
    const { data: assinadas } = caminhos.length
      ? await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).createSignedUrls(caminhos, 3600)
      : { data: [] }
    const urlDe = new Map((assinadas || []).map((a) => [a.path, a.signedUrl]))

    return NextResponse.json({
      exemplos: itens.map((f, i) => ({
        nome: f.name.replace(/\.[^.]+$/, ''),
        caminho: caminhos[i],
        url: urlDe.get(caminhos[i]) || null,
        imagem: IMAGEM_OK.test(f.name),
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

// Assina o envio direto do navegador: vídeo de exemplo tem dezenas de MB e não
// cabe no corpo de uma função da Vercel.
export async function POST(req: Request) {
  try {
    const { formato, nome } = await req.json()
    const p = pasta(formato || '')
    if (!p) return NextResponse.json({ error: 'formato inválido' }, { status: 400 })
    const limpo = nomeSeguro(nome, 80)
    if (!limpo || !(VIDEO_OK.test(limpo) || IMAGEM_OK.test(limpo))) {
      return NextResponse.json(
        { error: 'use vídeo (mp4, mov, webm) ou imagem (png, jpg, webp)' }, { status: 400 })
    }

    const { data: existentes } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS).list(p, { limit: 100 })
    if ((existentes || []).filter((f) => f.id).length >= LIMITE) {
      return NextResponse.json(
        { error: `este formato já tem ${LIMITE} exemplos — apague um antes` }, { status: 400 })
    }

    const caminho = `${p}/${Date.now()}-${limpo}`
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS).createSignedUploadUrl(caminho, { upsert: true })
    if (error || !data) throw new Error(error?.message || 'falha ao assinar')
    // signedUrl vem junto porque o envio é feito com XHR (pra ter progresso),
    // e não pelo cliente do Supabase, que não informa quanto já subiu.
    return NextResponse.json({
      path: data.path, token: data.token, caminho, signedUrl: data.signedUrl,
    })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const caminho = new URL(req.url).searchParams.get('caminho') || ''
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
