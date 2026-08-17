import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 30

/**
 * Renova (estende) o token da Meta ANTES de vencer — igual a Utmify faz.
 * O OAuth pega um token de ~60 dias e não renovava, então vencia e o gasto
 * parava. Este cron re-troca o token longo por outro longo (fb_exchange_token),
 * mantendo-o vivo indefinidamente enquanto o usuário não revogar o app.
 *
 * Protege o token vitalício (System User): se o token atual não expira
 * (expires_at = 0 no debug_token), NÃO mexe — não faz sentido "renovar" e
 * poderia trocar por um de escopo diferente.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return NextResponse.json({ error: 'META_APP_ID/META_APP_SECRET ausentes' }, { status: 500 })

  const { data: row } = await supabaseAdmin
    .from('configuracoes').select('valor').eq('chave', 'meta_access_token').maybeSingle()
  const atual = row?.valor
  if (!atual) return NextResponse.json({ skipped: 'sem token salvo' })

  const appToken = `${appId}|${appSecret}`
  try {
    // 1) Diagnostica o token atual: se não expira (vitalício), não faz nada.
    const dbg = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(atual)}&access_token=${appToken}`).then((r) => r.json())
    const info = dbg?.data ?? {}
    if (info.is_valid === false) {
      return NextResponse.json({ ok: false, motivo: 'token atual já inválido — precisa reconectar', erro: info.error?.message ?? null })
    }
    if (info.expires_at === 0) {
      return NextResponse.json({ ok: true, skipped: 'token vitalício (não expira) — nada a renovar' })
    }

    // 2) Renova: re-troca o token longo por outro longo.
    const res = await fetch(`https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(atual)}`).then((r) => r.json())
    if (res.error) return NextResponse.json({ ok: false, error: res.error.message }, { status: 200 })
    const novo = res.access_token
    if (!novo) return NextResponse.json({ ok: false, error: 'resposta sem access_token' })

    await supabaseAdmin.from('configuracoes').upsert(
      { chave: 'meta_access_token', valor: novo, updated_at: new Date().toISOString() },
      { onConflict: 'chave' }
    )

    const diasAntes = info.expires_at ? Math.round((info.expires_at * 1000 - Date.now()) / 86400000) : null
    return NextResponse.json({ ok: true, renovado: true, expirava_em_dias: diasAntes, expires_in: res.expires_in ?? null })
  } catch (err) {
    console.error('[meta/refresh-token]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
