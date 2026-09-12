import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

// Assina um upload direto do NAVEGADOR pro Supabase Storage. O arquivo não passa
// pelo Vercel (limite de 4,5MB no corpo) nem pela VPS por HTTP (mixed content):
// vai direto pro Storage por HTTPS com esta URL assinada, curta.
// `kind`: 'in' = criativo a camuflar · 'cta' = imagem de sobreposição ·
// 'bg' = áudio de fundo da máscara de voz · 'sfx' = som do efeito.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const BUCKET = 'camuflagem'

export async function POST(req: Request) {
  try {
    const { name, kind } = await req.json().catch(() => ({ name: '', kind: 'in' }))
    const safe = String(name || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(-64)
    const pasta = kind === 'cta' ? 'cta' : kind === 'bg' ? 'bg' : kind === 'sfx' ? 'sfx' : 'in'
    const inputPath = `${pasta}/${randomUUID()}-${safe}`
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(inputPath)
    if (error || !data) return NextResponse.json({ error: error?.message || 'falha ao assinar upload' }, { status: 500 })
    return NextResponse.json({ path: data.path, token: data.token, inputPath })
  } catch (e) {
    return NextResponse.json({ error: `erro: ${e}` }, { status: 500 })
  }
}
