import { NextRequest, NextResponse } from 'next/server'
import { nomeSeguro } from '@/lib/criativos'
import { RAIZ_CENSURA, MetaProjeto, bucket, lerJsonStorage, gravarJsonStorage } from '@/lib/censura-projetos'

// GET  → lista os projetos (mais recente primeiro)
// POST {nome, tamanho} → cria o projeto e assina o envio do vídeo
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EXT_OK = ['.mp4', '.mov', '.webm']

export async function GET() {
  try {
    const { data, error } = await bucket().list(RAIZ_CENSURA, { limit: 200 })
    if (error) throw new Error(error.message)
    const pastas = (data || []).filter((d) => !d.id).map((d) => d.name)
    const metas = await Promise.all(pastas.map((p) => lerJsonStorage<MetaProjeto>(`${RAIZ_CENSURA}/${p}/meta.json`)))
    const lista = metas.filter((m): m is MetaProjeto => !!m).sort((a, b) => b.atualizado.localeCompare(a.atualizado))
    return NextResponse.json({ projetos: lista })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nome, tamanho } = await req.json()
    const limpo = nomeSeguro(nome || '', 80)
    const ponto = limpo.lastIndexOf('.')
    let ext = ponto > 0 ? limpo.slice(ponto).toLowerCase() : ''
    if (ext === '.m4v') ext = '.mp4'
    if (!EXT_OK.includes(ext)) return NextResponse.json({ error: 'use mp4, mov ou webm' }, { status: 400 })

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const video = `${RAIZ_CENSURA}/${id}/video${ext}`
    const agora = new Date().toISOString()
    const meta: MetaProjeto = { id, nome: String(nome).slice(0, 200), tamanho: Number(tamanho) || 0, video, criado: agora, atualizado: agora, palavras: 0, censuradas: 0 }
    await gravarJsonStorage(`${RAIZ_CENSURA}/${id}/meta.json`, meta)

    const { data, error } = await bucket().createSignedUploadUrl(video, { upsert: true })
    if (error || !data) throw new Error(error?.message || 'falha ao assinar o envio')
    return NextResponse.json({ id, caminho: video, signedUrl: data.signedUrl })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
