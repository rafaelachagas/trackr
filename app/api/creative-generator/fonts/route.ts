import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, RAIZ_FONTES } from '@/lib/criativos'

// Fontes das legendas. Ficam no Storage e a VPS baixa na hora de renderizar —
// a imagem do container não traz fonte nenhuma, então sem isto o libass não
// desenha letra.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Catálogo: famílias que funcionam bem em legenda de criativo — peso alto,
// boa leitura em cima de vídeo e acentuação completa pro português.
export const CATALOGO = [
  { familia: 'Montserrat', peso: 800 },
  { familia: 'Poppins', peso: 800 },
  { familia: 'Inter', peso: 900 },
  { familia: 'Archivo Black', peso: 400 },
  { familia: 'Anton', peso: 400 },
  { familia: 'Bebas Neue', peso: 400 },
  { familia: 'Oswald', peso: 700 },
  { familia: 'Rubik', peso: 800 },
  { familia: 'Nunito', peso: 900 },
  { familia: 'Fredoka', peso: 700 },
  { familia: 'Luckiest Guy', peso: 400 },
  { familia: 'Titan One', peso: 400 },
]


export async function GET() {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_CRIATIVOS).list(RAIZ_FONTES, { limit: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const fontes = (data || []).filter((f) => f.id).map((f) => ({
    nome: f.name,
    caminho: `${RAIZ_FONTES}/${f.name}`,
    tamanho: (f.metadata as any)?.size ?? 0,
  }))
  return NextResponse.json({
    fontes,
    catalogo: CATALOGO.map((c) => ({
      ...c,
      // Já instalada? O nome do arquivo é derivado da família e do peso.
      instalada: fontes.some((f) => f.nome === `${c.familia.replace(/\s+/g, '')}-${c.peso}.ttf`),
    })),
  })
}

// O Google entrega woff2 pra navegador moderno, e o libass não lê woff2. Com
// um User-Agent antigo a mesma URL devolve TTF — é o formato que a renderização
// precisa, então é ele que a gente pede.
const UA_TTF = 'Mozilla/4.0'

export async function POST(req: Request) {
  try {
    const { familia, peso } = await req.json()
    const item = CATALOGO.find((c) => c.familia === familia)
    if (!item) return NextResponse.json({ error: 'fonte fora do catálogo' }, { status: 400 })
    const w = Number(peso) || item.peso

    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(item.familia)}:wght@${w}`,
      { headers: { 'user-agent': UA_TTF }, signal: AbortSignal.timeout(20_000) },
    ).then((r) => (r.ok ? r.text() : ''))
    const url = css.match(/url\((https:\/\/[^)]+\.ttf)\)/)?.[1]
    if (!url) return NextResponse.json({ error: 'não achei o arquivo TTF dessa fonte' }, { status: 502 })

    const bin = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!bin.ok) return NextResponse.json({ error: `download falhou (${bin.status})` }, { status: 502 })
    const bytes = Buffer.from(await bin.arrayBuffer())

    const nome = `${item.familia.replace(/\s+/g, '')}-${w}.ttf`
    const { error } = await supabaseAdmin.storage.from(BUCKET_CRIATIVOS)
      .upload(`${RAIZ_FONTES}/${nome}`, bytes, { contentType: 'font/ttf', upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, nome, bytes: bytes.length })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
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
