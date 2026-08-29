import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { coletarVariacoes, listarVariacoes } from '@/lib/vigia-pagina'

// Variações da página em teste A/B — renderiza a página do concorrente em N
// sessões novas (Chromium da VPS), tira PRINT de cada variante e ACUMULA no
// tempo (o split rotaciona por tempo; um burst só pega a variante do momento).
// GET ?bib=<id> roda uma coleta e devolve a galeria acumulada.
// GET ?bib=<id>&so_listar=1 só lê o que já foi acumulado (sem render).
// maxDuration alto por causa do render de várias sessões.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  try {
    const bib = req.nextUrl.searchParams.get('bib')
    const soListar = req.nextUrl.searchParams.get('so_listar') === '1'
    if (!bib) return NextResponse.json({ success: false, error: 'bib obrigatório', variacoes: [] }, { status: 200 })

    if (soListar) {
      return NextResponse.json({ success: true, variacoes: await listarVariacoes(bib), novas: 0 })
    }

    const { data } = await supabaseAdmin.from('rastreador_bibliotecas').select('org_id, landing_url').eq('id', bib).maybeSingle()
    const url = data?.landing_url || ''
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ success: false, error: 'Sem URL de página cadastrada ainda.', variacoes: await listarVariacoes(bib), novas: 0 }, { status: 200 })
    }
    // 30 sessões: o A/B rotaciona por tempo, então quanto mais sessões (espaçadas
    // pelo tempo de processamento), mais variantes a rodada pega.
    const { variacoes, novas, debug } = await coletarVariacoes(data!.org_id, bib, url, new Date().toISOString(), 30)
    return NextResponse.json({ success: true, variacoes, novas, debug })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, variacoes: [], novas: 0 }, { status: 200 })
  }
}
