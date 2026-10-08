import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, RAIZ_SFX } from '@/lib/criativos'

// Biblioteca de efeitos sonoros (whoosh, pop, cha-ching). Lista plana: são
// poucos arquivos e todos servem a qualquer criativo, então pasta só atrapalha.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS)
      .list(RAIZ_SFX, { limit: 500, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(error.message)
    const itens = (data || []).filter((i) => i.id)
    const caminhos = itens.map((i) => `${RAIZ_SFX}/${i.name}`)
    const { data: assinadas } = caminhos.length
      ? await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).createSignedUrls(caminhos, 3600)
      : { data: [] }
    const urlDe = new Map((assinadas || []).map((a) => [a.path, a.signedUrl]))
    return NextResponse.json({
      sons: itens.map((i, k) => ({
        nome: i.name.replace(/\.[^.]+$/, ''),
        caminho: caminhos[k],
        url: urlDe.get(caminhos[k]) || null,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const caminho = new URL(req.url).searchParams.get('caminho') || ''
    if (!caminho.startsWith(`${RAIZ_SFX}/`)) {
      return NextResponse.json({ error: 'caminho inválido' }, { status: 400 })
    }
    const { error } = await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).remove([caminho])
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
