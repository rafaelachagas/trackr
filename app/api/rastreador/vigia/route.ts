import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { capturarPaginaCore, urlDominante } from '@/lib/vigia-pagina'
import { registrarAlerta } from '@/lib/alertas'
import { broadcastAlerta } from '@/lib/whatsapp-send'

// Vigia de páginas 24/7 — roda de hora em hora (vercel.json) e, pra cada
// concorrente rastreado com landing_url cadastrada:
//   1. Recaptura a página de vendas e versiona se mudou (headline, vídeo,
//      preços, design/estrutura) → alerta no painel + WhatsApp.
//   2. Compara a URL de destino dominante dos anúncios entre os dois últimos
//      snapshots → se trocaram de página/funil, alerta também.
// Só leitura nas páginas dos concorrentes; escrita apenas nas tabelas do
// rastreador. Se nada mudou, não grava nem alerta nada.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const key = request.nextUrl.searchParams.get('key')
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { data: bibs, error } = await supabaseAdmin
    .from('rastreador_bibliotecas')
    .select('id, org_id, page_id, page_name, nome_custom, landing_url')
    .eq('ativo', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados: any[] = []
  for (const b of bibs ?? []) {
    const nome = b.nome_custom?.trim() || b.page_name?.trim() || `Página ${b.page_id}`
    const r: any = { biblioteca: nome }

    // ---- 1) Página de vendas: recaptura + diff ----
    if (b.landing_url) {
      try {
        const cap = await capturarPaginaCore(b.org_id, b.id)
        r.pagina = cap.success ? (cap.mudou ? 'mudou' : 'igual') : `erro: ${cap.error}`
        if (cap.success && cap.mudou && cap.resumo && cap.resumo !== 'Primeira captura da página.') {
          const { novo } = await registrarAlerta({
            orgId: b.org_id,
            tipo: 'pagina_mudou',
            chave: `${b.id}:${cap.hash}`,
            titulo: `${nome} mudou a página de vendas`,
            mensagem: cap.resumo,
            severidade: 'atencao',
            enviarWhats: false,
          }).catch(() => ({ novo: false }))
          if (novo) {
            await broadcastAlerta(
              `🎥 *${nome} mudou a página de vendas*\n\n${cap.resumo}\n\n${cap.url}\n\nAs versões (antes/depois) estão no Rastreador → Inteligência.`
            ).catch(() => {})
          }
        }
      } catch (e: any) {
        r.pagina = `erro: ${e.message}`
      }
    } else {
      r.pagina = 'sem landing_url'
    }

    // ---- 2) URL de destino dominante dos anúncios (trocaram de funil?) ----
    try {
      const { data: snaps } = await supabaseAdmin
        .from('rastreador_snapshots').select('criativos, puxado_em')
        .eq('biblioteca_id', b.id).order('puxado_em', { ascending: false }).limit(2)
      if (snaps && snaps.length === 2) {
        const atual = urlDominante((snaps[0] as any).criativos ?? [])
        const anterior = urlDominante((snaps[1] as any).criativos ?? [])
        r.urlAnuncios = atual
        if (atual && anterior && atual !== anterior) {
          const { novo } = await registrarAlerta({
            orgId: b.org_id,
            tipo: 'pagina_url',
            chave: `${b.id}:${atual}`,
            titulo: `${nome} trocou a URL de destino dos anúncios`,
            mensagem: `Antes: ${anterior} · Agora: ${atual}`,
            severidade: 'atencao',
            enviarWhats: false,
          }).catch(() => ({ novo: false }))
          if (novo) {
            await broadcastAlerta(
              `🔀 *${nome} trocou a URL de destino dos anúncios*\n\nAntes: ${anterior}\nAgora: ${atual}\n\nPode ser página nova, funil novo ou teste A/B.`
            ).catch(() => {})
          }
        }
      }
    } catch { /* snapshot indisponível não derruba a rodada */ }

    resultados.push(r)
  }

  return NextResponse.json({ ok: true, processadas: resultados.length, resultados })
}
