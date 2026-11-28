import { NextRequest, NextResponse } from 'next/server'
import { RAIZ_CENSURA, MetaProjeto, idValido, bucket, lerJsonStorage } from '@/lib/censura-projetos'
import { BUCKET_CRIATIVOS } from '@/lib/criativos'
import { Edicao, Segmento, ganhoVoz, dbParaGanho } from '@/lib/censura'
import { AreaBorrao, ConfigBorrao, BORRAO_PADRAO, RAIZ_SONS, areaValida, janelasBorrao, janelasDaArea, ehMomento, tirarJanelas, intervalosValidos } from '@/lib/censura-borrao'
import { TRANSCRITOR_URL, TRANSCRITOR_APIKEY } from '@/lib/transcritor'

// Exportação do Editor de Censura. O ffmpeg roda na VPS (rota /censor_render
// em vps-transcritor/app.py): baixa o vídeo do Storage, aplica o áudio de
// cada trecho e o borrão na legenda queimada, e sobe o resultado de volta.
// POST {projId, segs, areas, borrao} → {job}
// GET  ?p=&job=                      → {status, url?, erro?}
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EMBUTIDOS = new Set(['bip', 'bip_grave', 'ruido', 'vento', 'radio'])
const saida = (id: string) => `${RAIZ_CENSURA}/${id}/exportado.mp4`

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const id = String(b.projId || '')
    if (!idValido(id)) return NextResponse.json({ error: 'projeto inválido' }, { status: 400 })
    const meta = await lerJsonStorage<MetaProjeto>(`${RAIZ_CENSURA}/${id}/meta.json`)
    if (!meta) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 })

    const segs: Segmento[] = (Array.isArray(b.segs) ? b.segs : [])
      .filter((s: Segmento) => Number.isFinite(s?.ini) && Number.isFinite(s?.fim) && s.fim > s.ini && s.ed)
      .slice(0, 2000)
      .map((s: Segmento) => ({ ids: [], ini: s.ini, fim: s.fim, ed: s.ed as Edicao }))
    const areas: AreaBorrao[] = (Array.isArray(b.areas) ? b.areas : []).filter(areaValida).slice(0, 60)
    const cfg: ConfigBorrao = { ...BORRAO_PADRAO, ...(b.borrao || {}) }

    // O ganho e o efeito saem daqui já resolvidos: a VPS não precisa saber de dB.
    const trechos = segs.map((s) => {
      const sfx = s.ed.sfx
      const arquivo = sfx.startsWith('arq:') ? `${RAIZ_SONS}/${sfx.slice(4)}` : null
      return {
        ini: +s.ini.toFixed(3), fim: +s.fim.toFixed(3),
        voz: +ganhoVoz(s.ed).toFixed(4),
        sfx: sfx === 'nenhum' ? null : arquivo ? 'arquivo' : EMBUTIDOS.has(sfx) ? sfx : null,
        arquivo,
        sfx_ganho: +dbParaGanho(s.ed.sfxDb).toFixed(4),
      }
    })

    // Janelas que o usuário soltou na linha do tempo viraram borrões de momento.
    const dasPalavras = areas.some((a) => !ehMomento(a)) ? tirarJanelas(janelasBorrao(segs, cfg), intervalosValidos(b.legendaFora)) : []
    const corpo = {
      bucket: BUCKET_CRIATIVOS,
      input_path: meta.video,
      output_path: saida(id),
      trechos,
      // Cada área leva as próprias janelas: a da legenda segue as palavras
      // censuradas; a de momento, o intervalo que o usuário marcou.
      areas: areas
        .map((a) => ({ x: a.x, y: a.y, w: a.w, h: a.h, rot: a.rot || 0, janelas: janelasDaArea(a, dasPalavras) }))
        .filter((a) => a.janelas.length),
      // Raio = forca × 0,6% da largura do vídeo (o mesmo da prévia).
      raio_rel: cfg.forca * 0.006,
      janelas: dasPalavras,
    }
    const r = await fetch(`${TRANSCRITOR_URL}/censor_render?key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    })
    const j = await r.json().catch(() => null)
    if (!j?.job_id) return NextResponse.json({ error: j?.error || `O servidor de vídeo não respondeu (${r.status}).` }, { status: 502 })
    return NextResponse.json({ job: j.job_id })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('p') || ''
  const job = req.nextUrl.searchParams.get('job') || ''
  if (!idValido(id) || !job) return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 })
  try {
    const r = await fetch(`${TRANSCRITOR_URL}/censor_status?job=${encodeURIComponent(job)}&key=${encodeURIComponent(TRANSCRITOR_APIKEY)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
    const j = await r.json().catch(() => null)
    if (!j) return NextResponse.json({ status: 'rodando' }) // VPS ocupada: tenta na próxima
    if (j.status === 'pronto') {
      const meta = await lerJsonStorage<MetaProjeto>(`${RAIZ_CENSURA}/${id}/meta.json`)
      const base = (meta?.nome || 'video').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'video'
      const { data } = await bucket().createSignedUrl(saida(id), 86400, { download: `${base}-censurado.mp4` })
      if (!data?.signedUrl) return NextResponse.json({ status: 'erro', erro: 'O vídeo foi gerado mas não achei o arquivo.' })
      return NextResponse.json({ status: 'pronto', url: data.signedUrl })
    }
    if (j.status === 'erro' || j.error) return NextResponse.json({ status: 'erro', erro: j.erro || j.error })
    return NextResponse.json({ status: 'rodando' })
  } catch {
    return NextResponse.json({ status: 'rodando' })
  }
}
