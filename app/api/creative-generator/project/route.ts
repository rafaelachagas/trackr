import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'
import { BUCKET_CRIATIVOS, RAIZ_BROLL, RAIZ_FONTES, MARCADOR } from '@/lib/criativos'
import { PASTA_PROJETOS, type Projeto } from '@/lib/criativos-projeto'

// Projeto do editor: o JSON que a montagem grava em projetos/<id>.json.
//   GET            lista os projetos recentes
//   GET ?id=       abre um projeto com tudo que o editor precisa assinado
//   PUT            salva as edições
//   POST           salva e manda renderizar de novo
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const ID_OK = /^[0-9a-f-]{36}$/
const storage = () => supabaseAdmin.storage.from(BUCKET_CRIATIVOS)
const caminhoDe = (id: string) => `${PASTA_PROJETOS}/${id}.json`

async function assinar(caminhos: string[], segundos = 6 * 3600) {
  const mapa: Record<string, string> = {}
  const unicos = [...new Set(caminhos.filter(Boolean))]
  if (!unicos.length) return mapa
  const { data } = await storage().createSignedUrls(unicos, segundos)
  for (const d of data || []) if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl
  return mapa
}

async function lerProjeto(id: string): Promise<Projeto | null> {
  const { data } = await storage().download(caminhoDe(id))
  if (!data) return null
  try { return JSON.parse(await data.text()) } catch { return null }
}

function validar(p: any): p is Projeto {
  return p && typeof p === 'object'
    && typeof p.locucao_path === 'string'
    && Array.isArray(p.trechos) && Array.isArray(p.palavras)
    && Number(p.duracao) > 0 && Number(p.largura) > 0 && Number(p.altura) > 0
}

async function salvar(id: string, p: Projeto) {
  const bytes = Buffer.from(JSON.stringify(p))
  const { error } = await storage().upload(caminhoDe(id), bytes, {
    contentType: 'application/json', upsert: true,
  })
  if (error) throw new Error(error.message)
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')

  if (!id) {
    const { data } = await storage().list(PASTA_PROJETOS, {
      limit: 30, sortBy: { column: 'updated_at', order: 'desc' },
    })
    return NextResponse.json({
      projetos: (data || []).filter((f) => f.id && f.name.endsWith('.json')).map((f) => ({
        id: f.name.replace(/\.json$/, ''),
        atualizado: f.updated_at,
      })),
    })
  }

  if (!ID_OK.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const projeto = await lerProjeto(id)
  if (!projeto) return NextResponse.json({ error: 'projeto não encontrado' }, { status: 404 })

  // Biblioteca inteira pro "trocar b-roll", e as fontes instaladas pra prévia.
  const { data: pastasRaw } = await storage().list(RAIZ_BROLL, { limit: 1000 })
  const biblioteca: { nome: string; pasta: string; caminho: string }[] = []
  for (const p of (pastasRaw || []).filter((x) => !x.id)) {
    const { data: itens } = await storage().list(`${RAIZ_BROLL}/${p.name}`, { limit: 1000 })
    for (const i of (itens || []).filter((x) => x.id && x.name !== MARCADOR)) {
      biblioteca.push({
        nome: i.name.replace(/\.[^.]+$/, ''), pasta: p.name, caminho: `${RAIZ_BROLL}/${p.name}/${i.name}`,
      })
    }
  }
  const { data: fontesRaw } = await storage().list(RAIZ_FONTES, { limit: 500 })
  const fontes = (fontesRaw || []).filter((f) => f.id).map((f) => ({
    nome: f.name, caminho: `${RAIZ_FONTES}/${f.name}`,
  }))

  const urls = await assinar([
    projeto.locucao_path,
    projeto.fonte_path || '',
    ...projeto.trechos.map((t) => t.caminho),
    ...biblioteca.map((b) => b.caminho),
    ...fontes.map((f) => f.caminho),
  ])
  let videoUrl: string | null = null
  let downloadUrl: string | null = null
  if (projeto.saida_path) {
    const a = await storage().createSignedUrl(projeto.saida_path, 3600)
    const b = await storage().createSignedUrl(projeto.saida_path, 3600, { download: 'criativo.mp4' })
    videoUrl = a.data?.signedUrl || null
    downloadUrl = b.data?.signedUrl || null
  }

  return NextResponse.json({ projeto, urls, biblioteca, fontes, videoUrl, downloadUrl })
}

export async function PUT(req: Request) {
  const { id, projeto } = await req.json().catch(() => ({}))
  if (!ID_OK.test(id || '') || !validar(projeto)) {
    return NextResponse.json({ error: 'projeto inválido' }, { status: 400 })
  }
  try {
    await salvar(id, projeto)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { id, projeto } = await req.json().catch(() => ({}))
  if (!ID_OK.test(id || '') || !validar(projeto)) {
    return NextResponse.json({ error: 'projeto inválido' }, { status: 400 })
  }
  if (!TRANSCRITOR_URL || !TRANSCRITOR_APIKEY) {
    return NextResponse.json({ error: 'servidor de vídeo não configurado' }, { status: 500 })
  }
  const outputPath = `saida/${randomUUID()}.mp4`
  try {
    await salvar(id, projeto)
    const resp = await fetch(`${TRANSCRITOR_URL}/assemble?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bucket: BUCKET_CRIATIVOS,
        output_path: outputPath,
        projeto,
        projeto_path: caminhoDe(id),
      }),
    })
    const j = await resp.json().catch(() => ({} as any))
    if (!resp.ok || !j?.job_id) {
      return NextResponse.json({ error: j?.error || 'falha ao iniciar a renderização' }, { status: 502 })
    }
    return NextResponse.json({ jobId: j.job_id, outputPath })
  } catch {
    return NextResponse.json(
      { error: 'o servidor de vídeo não respondeu — a VPS pode estar fora do ar' }, { status: 503 },
    )
  }
}
