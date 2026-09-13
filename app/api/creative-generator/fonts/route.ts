import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, RAIZ_FONTES } from '@/lib/criativos'

// Fontes das legendas. Ficam no Storage e a VPS baixa na hora de renderizar —
// a imagem do container não traz fonte nenhuma, então sem isto o libass não
// desenha letra.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_CRIATIVOS).list(RAIZ_FONTES, { limit: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    fontes: (data || []).filter((f) => f.id).map((f) => ({
      nome: f.name,
      caminho: `${RAIZ_FONTES}/${f.name}`,
      tamanho: (f.metadata as any)?.size ?? 0,
    })),
  })
}

export async function DELETE(req: Request) {
  const { caminho } = await req.json().catch(() => ({}))
  if (!caminho?.startsWith(`${RAIZ_FONTES}/`)) {
    return NextResponse.json({ error: 'caminho inválido' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).remove([caminho])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
