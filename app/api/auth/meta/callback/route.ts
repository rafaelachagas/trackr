import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function htmlResponse(script: string) {
  return new NextResponse(`<!DOCTYPE html><html><body><script>${script}</script></body></html>`, {
    headers: { 'Content-Type': 'text/html' },
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return htmlResponse(
      `window.opener?.postMessage({type:'meta_auth_error',error:${JSON.stringify(error ?? 'Cancelado')}},window.location.origin);window.close()`
    )
  }

  const appId = process.env.META_APP_ID!
  const appSecret = process.env.META_APP_SECRET!
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!
  const redirectUri = `${baseUrl}/api/auth/meta/callback`

  try {
    // Troca o code por um token de curta duração
    const tokenRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    )
    const tokenJson = await tokenRes.json()

    if (tokenJson.error) {
      return htmlResponse(
        `window.opener?.postMessage({type:'meta_auth_error',error:${JSON.stringify(tokenJson.error.message)}},window.location.origin);window.close()`
      )
    }

    const shortToken: string = tokenJson.access_token

    // Troca pelo token de longa duração (60 dias)
    const longRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    )
    const longJson = await longRes.json()
    const accessToken: string = longJson.access_token ?? shortToken

    // Busca as contas de anúncio disponíveis
    const accountsRes = await fetch(
      `https://graph.facebook.com/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${accessToken}`
    )
    const accountsJson = await accountsRes.json()
    const accounts: { id: string; name: string; account_status: number }[] = accountsJson.data ?? []

    // Salva o token no banco
    await supabaseAdmin.from('configuracoes').upsert(
      { chave: 'meta_access_token', valor: accessToken, updated_at: new Date().toISOString() },
      { onConflict: 'chave' }
    )

    // Se só tem uma conta, salva automaticamente
    if (accounts.length === 1) {
      const accountId = accounts[0].id.replace('act_', '')
      await supabaseAdmin.from('configuracoes').upsert(
        { chave: 'meta_ad_account_id', valor: accountId, updated_at: new Date().toISOString() },
        { onConflict: 'chave' }
      )
    }

    return htmlResponse(
      `window.opener?.postMessage({type:'meta_auth_success',accounts:${JSON.stringify(accounts)}},window.location.origin);window.close()`
    )
  } catch (err) {
    return htmlResponse(
      `window.opener?.postMessage({type:'meta_auth_error',error:'Erro interno no servidor'},window.location.origin);window.close()`
    )
  }
}
