import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, RAIZ_BROLL, RAIZ_FONTES, VIDEO_OK, FONTE_OK, nomeSeguro } from '@/lib/criativos'

// Upload direto do navegador pro Storage (b-roll costuma ter dezenas de MB e
// não cabe no corpo de uma função da Vercel).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { nome, tipo, pasta } = await req.json()
    const limpo = nomeSeguro(nome, 80)
    if (!limpo) return NextResponse.json({ error: 'nome inválido' }, { status: 400 })

    let caminho: string
    if (tipo === 'fonte') {
      if (!FONTE_OK.test(limpo)) {
        return NextResponse.json({ error: 'use .ttf, .otf ou .woff2' }, { status: 400 })
      }
      caminho = `${RAIZ_FONTES}/${limpo}`
    } else {
      if (!VIDEO_OK.test(limpo)) {
        return NextResponse.json({ error: 'use .mp4, .mov, .webm ou .m4v' }, { status: 400 })
      }
      const p = nomeSeguro(pasta)
      if (!p) return NextResponse.json({ error: 'escolha uma pasta' }, { status: 400 })
      caminho = `${RAIZ_BROLL}/${p}/${Date.now()}-${limpo}`
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS).createSignedUploadUrl(caminho)
    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'falha ao assinar' }, { status: 500 })
    }
    return NextResponse.json({ path: data.path, token: data.token, caminho })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
