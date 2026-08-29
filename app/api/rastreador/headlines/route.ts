import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { headlinesEmTeste } from '@/lib/vigia-pagina'

// Detecção de headlines em teste A/B — renderiza a página do concorrente em N
// sessões novas (Chromium da VPS) e lê o texto de cada headline (OCR quando é
// imagem). Fica numa rota própria (não server action) por causa do tempo: o
// render de 6 sessões pode passar do timeout curto das actions. maxDuration=300.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  try {
    const bib = req.nextUrl.searchParams.get('bib')
    const urlDireta = req.nextUrl.searchParams.get('url')
    let url = urlDireta || ''
    if (!url && bib) {
      const { data } = await supabaseAdmin.from('rastreador_bibliotecas').select('landing_url').eq('id', bib).maybeSingle()
      url = data?.landing_url || ''
    }
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ success: false, error: 'Sem URL de página cadastrada ainda.', variantes: [], sessoes: 0 }, { status: 200 })
    }
    const { variantes, sessoes, debug } = await headlinesEmTeste(url, 6)
    return NextResponse.json({ success: true, variantes, sessoes, debug })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, variantes: [], sessoes: 0 }, { status: 200 })
  }
}
