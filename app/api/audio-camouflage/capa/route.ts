import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase'
import { getLLMConfig } from '@/lib/llm'
import { BUCKET } from '../sign-upload/route'

// Gera a capa "white": uma imagem de abertura neutra pro criativo, a partir do
// nicho. A CENA vem do Gemini (modelo de imagem); o TEXTO — headline e botão —
// é desenhado aqui com sharp. Modelo de imagem escreve texto torto e com erro
// de acento; composto localmente sai nítido e igual ao que o usuário digitou.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODELO = 'gemini-3.1-flash-image'

const FORMATOS = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
} as const
type Formato = keyof typeof FORMATOS

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Quebra o texto em linhas por contagem de caracteres — sem medir a fonte de
// verdade, mas suficiente pra headline curta, que é o caso de uso.
function linhas(txt: string, max: number, limite: number): string[] {
  const out: string[] = []
  let atual = ''
  for (const p of txt.split(/\s+/).filter(Boolean)) {
    if (!atual) atual = p
    else if ((atual + ' ' + p).length <= max) atual += ' ' + p
    else { out.push(atual); atual = p }
    if (out.length >= limite) break
  }
  if (atual && out.length < limite) out.push(atual)
  return out
}

export async function POST(req: Request) {
  try {
    const { nicho, cta, formato, headline } = (await req.json()) as {
      nicho?: string; cta?: string; formato?: Formato; headline?: string
    }
    if (!nicho?.trim()) return NextResponse.json({ error: 'descreva o nicho/oferta' }, { status: 400 })

    const { geminiKey } = await getLLMConfig()
    if (!geminiKey) {
      return NextResponse.json({ error: 'chave do Gemini não configurada (Configurações › IA)' }, { status: 400 })
    }

    const fmt: Formato = formato && formato in FORMATOS ? formato : '9:16'
    const { w, h } = FORMATOS[fmt]

    // A cena é deliberadamente comum: é isso que faz a capa passar por
    // conteúdo orgânico em vez de anúncio.
    const prompt =
      `Fotografia realista de celular, vertical, luz natural, sem nenhum texto, ` +
      `letra, logotipo ou marca d'água na imagem. Cena cotidiana e discreta ` +
      `relacionada a: ${nicho.trim()}. Pessoa comum ou objetos do dia a dia, ` +
      `ambiente simples e real (casa, mesa, rua), cores naturais, nada de ` +
      `estúdio, nada de montagem, nada que pareça propaganda.`

    const r = await fetch(`${GEMINI}/${MODELO}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: fmt } },
      }),
    })
    const j = await r.json().catch(() => ({} as any))
    if (j?.error) return NextResponse.json({ error: `Gemini: ${j.error.message}` }, { status: 502 })

    const parte = (j?.candidates?.[0]?.content?.parts || []).find((p: any) => p?.inlineData?.data)
    if (!parte) return NextResponse.json({ error: 'o Gemini não devolveu imagem' }, { status: 502 })
    const base = Buffer.from(parte.inlineData.data, 'base64')

    // --- texto por cima (headline em cima, botão embaixo) ---
    const hl = linhas((headline || '').trim(), fmt === '16:9' ? 44 : 26, 3)
    const botao = (cta || '').trim()
    const fonte = Math.round(w * (fmt === '16:9' ? 0.055 : 0.082))
    const capH = Math.round(fonte * 1.22)
    const bw = Math.round(w * 0.66)
    const bh = Math.round(w * 0.115)
    const by = h - Math.round(h * (fmt === '16:9' ? 0.16 : 0.13)) - bh

    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.62"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="base" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#000" stop-opacity="0.66"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${hl.length ? `<rect width="${w}" height="${Math.round(h * 0.33)}" fill="url(#topo)"/>` : ''}
  ${botao ? `<rect y="${h - Math.round(h * 0.3)}" width="${w}" height="${Math.round(h * 0.3)}" fill="url(#base)"/>` : ''}
  ${hl.map((l, i) => `<text x="${w / 2}" y="${Math.round(h * 0.11) + i * capH}" fill="#fff"
      font-family="Arial, Helvetica, sans-serif" font-size="${fonte}" font-weight="800"
      text-anchor="middle" stroke="#000" stroke-width="${Math.round(fonte * 0.06)}"
      paint-order="stroke">${esc(l)}</text>`).join('\n  ')}
  ${botao ? `<rect x="${(w - bw) / 2}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="#ffffff"/>
  <text x="${w / 2}" y="${by + bh * 0.66}" fill="#111" font-family="Arial, Helvetica, sans-serif"
      font-size="${Math.round(bh * 0.42)}" font-weight="700" text-anchor="middle">${esc(botao)}</text>` : ''}
</svg>`

    const png = await sharp(base)
      .resize(w, h, { fit: 'cover' })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer()

    const path = `cta/${randomUUID()}-capa.png`
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, png, { contentType: 'image/png' })
    if (error) return NextResponse.json({ error: `falha ao salvar: ${error.message}` }, { status: 500 })

    return NextResponse.json({ ctaPath: path, dataUrl: `data:image/png;base64,${png.toString('base64')}` })
  } catch (e) {
    return NextResponse.json({ error: `erro: ${e}` }, { status: 500 })
  }
}
