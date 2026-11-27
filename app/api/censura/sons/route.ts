import { NextRequest, NextResponse } from 'next/server'
import { nomeSeguro } from '@/lib/criativos'
import { bucket } from '@/lib/censura-projetos'
import { RAIZ_SONS } from '@/lib/censura-borrao'

// Biblioteca de efeitos sonoros do Editor de Censura — vale pra todos os
// projetos e é dela que a exportação (VPS) tira o arquivo.
// GET            → [{ nome, url }] (url assinada pra prévia no navegador)
// POST {nome}    → URL assinada pra subir o arquivo direto no Storage
// DELETE ?nome=  → apaga
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EXT_OK = ['.mp3', '.wav', '.m4a', '.ogg', '.aac']

export async function GET() {
  try {
    const { data, error } = await bucket().list(RAIZ_SONS, { limit: 500, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(error.message)
    const nomes = (data || []).filter((d) => d.id && !d.name.startsWith('.')).map((d) => d.name)
    if (!nomes.length) return NextResponse.json({ sons: [] })
    const { data: urls } = await bucket().createSignedUrls(nomes.map((n) => `${RAIZ_SONS}/${n}`), 86400)
    return NextResponse.json({ sons: nomes.map((nome, i) => ({ nome, url: urls?.[i]?.signedUrl || null })) })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nome } = await req.json()
    const limpo = nomeSeguro(String(nome || ''), 80)
    const ext = limpo.slice(limpo.lastIndexOf('.')).toLowerCase()
    if (!EXT_OK.includes(ext)) return NextResponse.json({ error: 'use mp3, wav, m4a, ogg ou aac' }, { status: 400 })
    const { data, error } = await bucket().createSignedUploadUrl(`${RAIZ_SONS}/${limpo}`, { upsert: true })
    if (error || !data) throw new Error(error?.message || 'falha ao assinar o envio')
    return NextResponse.json({ nome: limpo, signedUrl: data.signedUrl })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const nome = req.nextUrl.searchParams.get('nome') || ''
  if (!nome || nome.includes('/')) return NextResponse.json({ error: 'nome inválido' }, { status: 400 })
  const { error } = await bucket().remove([`${RAIZ_SONS}/${nome}`])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
