import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, RAIZ_FONTES } from '@/lib/criativos'

// Fontes das legendas. Ficam no Storage e a VPS baixa na hora de renderizar —
// a imagem do container não traz fonte nenhuma, então sem isto o libass não
// desenha letra.
//
// O catálogo é o Google Fonts INTEIRO (~1.900 famílias), buscável, mas só a
// fonte escolhida é baixada. Guardar a biblioteca toda seria mais de 1 GB de
// arquivo pra usar meia dúzia.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Atalho: as que funcionam bem em legenda de criativo (peso alto, leitura em
// cima de vídeo). É o que aparece antes de o usuário buscar qualquer coisa.
export const SUGERIDAS = [
  'Montserrat', 'Poppins', 'Inter', 'Archivo Black', 'Anton', 'Bebas Neue',
  'Oswald', 'Rubik', 'Nunito', 'Fredoka', 'Luckiest Guy', 'Titan One',
]

const METADATA = 'https://fonts.google.com/metadata/fonts'
// O Google serve woff2 pra User-Agent moderno, e o libass não lê woff2. A
// mesma URL com um UA antigo responde em TTF.
const UA_TTF = 'Mozilla/4.0'

type Familia = { familia: string; categoria: string; pesos: string[] }

// O índice tem ~2 MB e não muda de hora em hora: cache em memória por 6h evita
// baixar isso a cada digitada na busca.
let cache: { em: number; lista: Familia[] } | null = null

async function indice(): Promise<Familia[]> {
  if (cache && Date.now() - cache.em < 6 * 60 * 60 * 1000) return cache.lista
  const txt = await fetch(METADATA, { signal: AbortSignal.timeout(20_000) })
    .then((r) => (r.ok ? r.text() : ''))
  // A resposta vem com um prefixo anti-JSONP que precisa sair antes do parse.
  const limpo = txt.replace(/^\)\]\}'?/, '')
  const lista: Familia[] = (JSON.parse(limpo)?.familyMetadataList || []).map((f: any) => ({
    familia: f.family,
    categoria: f.category,
    // Só pesos normais; itálico ("400i") não serve pra legenda de criativo.
    pesos: Object.keys(f.fonts || {}).filter((p) => !p.endsWith('i')),
  }))
  cache = { em: Date.now(), lista }
  return lista
}

/** Peso mais pesado disponível — legenda de criativo quer o mais gordo. */
function pesoPadrao(pesos: string[]): number {
  const n = pesos.map(Number).filter((x) => x >= 100 && x <= 900)
  return n.length ? Math.max(...n) : 400
}

function arquivoDe(familia: string, peso: number) {
  return `${familia.replace(/\s+/g, '')}-${peso}.ttf`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const categoria = searchParams.get('categoria') || ''
  const limite = Math.min(Number(searchParams.get('limite')) || 24, 60)

  const { data } = await supabaseAdmin.storage
    .from(BUCKET_CRIATIVOS).list(RAIZ_FONTES, { limit: 500 })
  const fontes = (data || []).filter((f) => f.id).map((f) => ({
    nome: f.name,
    caminho: `${RAIZ_FONTES}/${f.name}`,
    tamanho: (f.metadata as any)?.size ?? 0,
  }))

  let todas: Familia[] = []
  let erroIndice: string | undefined
  try {
    todas = await indice()
  } catch {
    erroIndice = 'não consegui carregar o catálogo do Google Fonts'
  }

  let filtradas = todas
  if (categoria) filtradas = filtradas.filter((f) => f.categoria === categoria)
  if (q) filtradas = filtradas.filter((f) => f.familia.toLowerCase().includes(q))
  else if (!categoria) {
    // Sem busca, mostra as sugeridas na ordem em que foram escolhidas.
    const mapa = new Map(filtradas.map((f) => [f.familia, f]))
    filtradas = SUGERIDAS.map((n) => mapa.get(n)).filter(Boolean) as Familia[]
  }

  const catalogo = filtradas.slice(0, limite).map((f) => {
    const peso = pesoPadrao(f.pesos)
    return {
      familia: f.familia,
      categoria: f.categoria,
      peso,
      pesos: f.pesos,
      instalada: fontes.some((x) => x.nome === arquivoDe(f.familia, peso)),
    }
  })

  return NextResponse.json({
    fontes,
    catalogo,
    total: filtradas.length,
    categorias: [...new Set(todas.map((f) => f.categoria))].sort(),
    erroIndice,
  })
}

export async function POST(req: Request) {
  try {
    const { familia, peso } = await req.json()
    // Só família que existe no índice do Google. Sem isto a rota viraria um
    // baixador de URL arbitrária rodando no servidor.
    const item = (await indice()).find((f) => f.familia === familia)
    if (!item) return NextResponse.json({ error: 'família não encontrada no Google Fonts' }, { status: 400 })
    const w = item.pesos.includes(String(peso)) ? Number(peso) : pesoPadrao(item.pesos)

    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(item.familia)}:wght@${w}`,
      { headers: { 'user-agent': UA_TTF }, signal: AbortSignal.timeout(20_000) },
    ).then((r) => (r.ok ? r.text() : ''))
    const url = css.match(/url\((https:\/\/[^)]+\.ttf)\)/)?.[1]
    if (!url) return NextResponse.json({ error: 'não achei o arquivo TTF dessa fonte' }, { status: 502 })

    const bin = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!bin.ok) return NextResponse.json({ error: `download falhou (${bin.status})` }, { status: 502 })
    const bytes = Buffer.from(await bin.arrayBuffer())

    const nome = arquivoDe(item.familia, w)
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
