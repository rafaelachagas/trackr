import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const HOTMART_TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'

export async function GET() {
  const steps: string[] = []

  try {
    steps.push('1. Buscando credenciais no banco...')
    const { data: configs, error: dbError } = await supabaseAdmin
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['hotmart_basic'])

    if (dbError) {
      return NextResponse.json({ steps, error: `DB error: ${dbError.message}` })
    }

    const basicToken = configs?.find((c) => c.chave === 'hotmart_basic')?.valor
    if (!basicToken) {
      return NextResponse.json({ steps, error: 'hotmart_basic não encontrado no banco' })
    }

    steps.push(`2. Token encontrado (${basicToken.length} chars, começa com: ${basicToken.slice(0, 10)}...)`)

    steps.push('3. Tentando autenticar na Hotmart (timeout 10s)...')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)

    let res: Response
    try {
      res = await fetch(`${HOTMART_TOKEN_URL}?grant_type=client_credentials`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    steps.push(`4. Resposta recebida: HTTP ${res.status}`)
    const body = await res.text()
    steps.push(`5. Body (primeiros 300 chars): ${body.slice(0, 300)}`)

    if (!res.ok) {
      return NextResponse.json({ steps, error: `Auth falhou: ${res.status}` })
    }

    const data = JSON.parse(body)
    steps.push(`6. Access token obtido! (${data.access_token?.slice(0, 20)}...)`)

    return NextResponse.json({ steps, success: true })
  } catch (e: any) {
    steps.push(`ERRO: ${e.name}: ${e.message}`)
    return NextResponse.json({ steps, error: e.message })
  }
}
