import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const appId = process.env.META_APP_ID
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!appId || !baseUrl) {
    return new Response('META_APP_ID e NEXT_PUBLIC_APP_URL não configurados no .env', { status: 500 })
  }

  const redirectUri = `${baseUrl}/api/auth/meta/callback`

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'ads_read,ads_management',
    response_type: 'code',
  })

  return redirect(`https://www.facebook.com/dialog/oauth?${params}`)
}
