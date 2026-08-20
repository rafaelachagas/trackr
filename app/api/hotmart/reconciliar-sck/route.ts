import { NextRequest, NextResponse } from 'next/server'
import { reconciliarSck } from '@/lib/reconciliar-sck'

// 60s estourava silenciosamente em produção sem deixar rastro nenhum no log
// (a rota não logava nada) — não dava pra saber se o cron horário estava
// rodando e falhando, ou simplesmente não disparando. Agora loga início/fim
// e sobe o teto pra 300s (limite do plano) pra dar folga.
export const maxDuration = 300

async function handle(req: NextRequest) {
  // Se CRON_SECRET estiver setado, exige o header (Vercel Cron manda automaticamente).
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      console.error('[ReconciliarSck] Unauthorized — header não bate com CRON_SECRET')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Janela: últimos `dias` dias (default 3). Cobre atrasos de reconciliação.
  const dias = Number(req.nextUrl.searchParams.get('dias') ?? '3')
  const startDate = Date.now() - dias * 24 * 60 * 60 * 1000

  console.log('[ReconciliarSck] Iniciando, dias:', dias)
  try {
    const res = await reconciliarSck({ startDate, maxPages: 60 })
    console.log('[ReconciliarSck] Concluído:', JSON.stringify(res))
    return NextResponse.json({ success: true, dias, ...res })
  } catch (e: any) {
    console.error('[ReconciliarSck] Erro:', e.message)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
