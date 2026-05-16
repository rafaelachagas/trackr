import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { subDays, format } from 'date-fns'

const VTURB_API_BASE = 'https://api.vturb.com.br/v1'
const DELAY_ENTRE_REQUESTS = 600 // ms entre requisições (respeitar rate limit)

export async function GET(request: NextRequest) {
  try {
    const { data: config } = await supabaseAdmin
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'vturb_api_key')
      .single()

    if (!config?.valor) {
      return NextResponse.json({ error: 'VTurb API Key não configurada' }, { status: 400 })
    }

    const apiKey = config.valor
    const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams
    const dias = parseInt(searchParams.get('dias') ?? '7')

    const dataFim = format(new Date(), 'yyyy-MM-dd')
    const dataInicio = format(subDays(new Date(), dias), 'yyyy-MM-dd')

    // Registrar sync
    const { data: syncLog } = await supabaseAdmin
      .from('sync_logs')
      .insert({ tipo: 'vturb', status: 'em_andamento', mensagem: 'Sincronizando conversões VTurb' })
      .select()
      .single()

    // 1. Buscar lista de vídeos
    const videos = await buscarVideos(apiKey)
    if (!videos || videos.length === 0) {
      await atualizarSyncLog(syncLog?.id, 'erro', 'Nenhum vídeo encontrado no VTurb')
      return NextResponse.json({ error: 'Nenhum vídeo encontrado' }, { status: 404 })
    }

    // Salvar/atualizar VSLs
    for (const video of videos) {
      await supabaseAdmin.from('vsls').upsert(
        {
          vturb_video_id: video.id,
          nome: video.name ?? video.title ?? video.id,
          status: 'ativo',
        },
        { onConflict: 'vturb_video_id' }
      )
    }

    // 2. Para cada vídeo, buscar conversões
    let totalConversoes = 0

    for (const video of videos) {
      await sleep(DELAY_ENTRE_REQUESTS)

      const conversoes = await buscarConversoesPorVideo(apiKey, video.id, dataInicio, dataFim)

      if (conversoes && conversoes.length > 0) {
        const registros = conversoes.map((c: Record<string, unknown>) => ({
          vturb_video_id: video.id,
          vsl_nome: video.name ?? video.title ?? video.id,
          conversion_key: c.conversion_key ?? c.key ?? c.sck,
          data: c.date ?? c.created_at,
          valor_centavos: c.value_cents ?? c.amount ?? null,
        }))

        await supabaseAdmin
          .from('vturb_conversions')
          .upsert(registros, { onConflict: 'conversion_key,vturb_video_id' })

        // Atualizar VSL nas vendas correspondentes
        for (const reg of registros) {
          if (reg.conversion_key) {
            await supabaseAdmin
              .from('vendas')
              .update({ vsl: reg.vsl_nome })
              .eq('sck', reg.conversion_key)
              .is('vsl', null)
          }
        }

        totalConversoes += registros.length
      }
    }

    // Atualizar última sync
    await supabaseAdmin
      .from('configuracoes')
      .update({ valor: new Date().toISOString() })
      .eq('chave', 'vturb_ultima_sync')

    await atualizarSyncLog(
      syncLog?.id,
      'sucesso',
      `${totalConversoes} conversões sincronizadas de ${videos.length} vídeos`,
      totalConversoes
    )

    return NextResponse.json({
      success: true,
      videos: videos.length,
      conversoes: totalConversoes,
    })
  } catch (error) {
    console.error('[VTurb] Erro na sincronização:', error)
    return NextResponse.json({ error: 'Erro interno na sincronização VTurb' }, { status: 500 })
  }
}

async function buscarVideos(apiKey: string): Promise<Array<Record<string, string>> | null> {
  try {
    const response = await fetch(`${VTURB_API_BASE}/videos`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('[VTurb] Erro ao buscar vídeos:', response.status)
      return null
    }

    const data = await response.json()
    return data?.data ?? data?.videos ?? data ?? []
  } catch (error) {
    console.error('[VTurb] Erro ao buscar vídeos:', error)
    return null
  }
}

async function buscarConversoesPorVideo(
  apiKey: string,
  videoId: string,
  dataInicio: string,
  dataFim: string
): Promise<Array<Record<string, unknown>> | null> {
  try {
    const params = new URLSearchParams({
      start_date: dataInicio,
      end_date: dataFim,
      limit: '1000',
    })

    const response = await fetch(
      `${VTURB_API_BASE}/analytics/videos/${videoId}/conversions?${params}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status !== 404) {
        console.error(`[VTurb] Erro ao buscar conversões do vídeo ${videoId}:`, response.status)
      }
      return null
    }

    const data = await response.json()
    return data?.data ?? data?.conversions ?? data ?? []
  } catch (error) {
    console.error(`[VTurb] Erro ao buscar conversões do vídeo ${videoId}:`, error)
    return null
  }
}

async function atualizarSyncLog(
  id: string | undefined,
  status: string,
  mensagem: string,
  registros = 0
) {
  if (!id) return
  await supabaseAdmin
    .from('sync_logs')
    .update({ status, mensagem, registros_processados: registros })
    .eq('id', id)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
