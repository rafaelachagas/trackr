import { NextRequest, NextResponse } from 'next/server'
import { reconciliarSck } from '@/lib/reconciliar-sck'

export const maxDuration = 60

async function handle(req: NextRequest) {
  // Se CRON_SECRET estiver setado, exige o header (Vercel Cron manda automaticamente).
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Janela: últimos `dias` dias (default 3). Cobre atrasos de reconciliação.
  const dias = Number(req.nextUrl.searchParams.get('dias') ?? '3')
  const startDate = Date.now() - dias * 24 * 60 * 60 * 1000

  try {
    const res = await reconciliarSck({ startDate, maxPages: 60 })
    return NextResponse.json({ success: true, dias, ...res })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
