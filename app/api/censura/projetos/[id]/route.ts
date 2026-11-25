import { NextRequest, NextResponse } from 'next/server'
import { RAIZ_CENSURA, MetaProjeto, idValido, bucket, lerJsonStorage, gravarJsonStorage } from '@/lib/censura-projetos'

// GET    → projeto completo + URL assinada do vídeo
// PUT    {trab, resumo} → salva (o front chama sozinho a cada mudança)
// DELETE → apaga vídeo e projeto
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!idValido(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const meta = await lerJsonStorage<MetaProjeto>(`${RAIZ_CENSURA}/${id}/meta.json`)
  if (!meta) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 })
  const trab = await lerJsonStorage<unknown>(`${RAIZ_CENSURA}/${id}/projeto.json`)
  // 24h: uma sessão de edição longa não pode perder o vídeo no meio.
  const { data } = await bucket().createSignedUrl(meta.video, 86400)
  if (!data?.signedUrl) return NextResponse.json({ error: 'O vídeo deste projeto não está mais no servidor.', meta, trab }, { status: 410 })
  return NextResponse.json({ meta, trab, videoUrl: data.signedUrl })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    if (!idValido(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    const meta = await lerJsonStorage<MetaProjeto>(`${RAIZ_CENSURA}/${id}/meta.json`)
    if (!meta) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 })
    const { trab, resumo } = await req.json()
    if (!trab || !Array.isArray(trab.tokens)) return NextResponse.json({ error: 'projeto inválido' }, { status: 400 })
    await gravarJsonStorage(`${RAIZ_CENSURA}/${id}/projeto.json`, trab)
    await gravarJsonStorage(`${RAIZ_CENSURA}/${id}/meta.json`, {
      ...meta, atualizado: new Date().toISOString(),
      palavras: Number(resumo?.palavras) || 0, censuradas: Number(resumo?.censuradas) || 0,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    if (!idValido(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    const pasta = `${RAIZ_CENSURA}/${id}`
    const { data } = await bucket().list(pasta, { limit: 100 })
    const arquivos = (data || []).map((d) => `${pasta}/${d.name}`)
    if (arquivos.length) {
      const { error } = await bucket().remove(arquivos)
      if (error) throw new Error(error.message)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
