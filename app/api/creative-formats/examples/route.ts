import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, VIDEO_OK, nomeSeguro } from '@/lib/criativos'

// Vídeos de exemplo de cada formato de criativo. Um formato é uma ideia
// abstrata até você ver três anúncios que a usaram — por isso o exemplo é
// vídeo de verdade, guardado no Storage, e não um link que some.
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
    if (!limpo || !VIDEO_OK.test(limpo)) {
      return NextResponse.json({ error: 'use .mp4, .mov, .webm ou .m4v' }, { status: 400 })
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
    return NextResponse.json({ path: data.path, token: data.token, caminho })
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
