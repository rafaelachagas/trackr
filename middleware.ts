import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/cadastro', '/reset-senha', '/convite', '/p/']

// ————————————————————————————————————————————————————————————————
// /api TAMBÉM pede login (set/2026). Antes o matcher excluía /api inteiro:
// qualquer pessoa com a URL lia faturamento, criativos e disparava render na
// VPS. As exceções abaixo são só o que NÃO PODE ter sessão:
//   - webhook da Hotmart e da Evolution (quem chama é o serviço, não o navegador)
//   - páginas públicas por token (/p/afazeres) e o MCP (token na própria URL)
//   - callback de OAuth da Meta / signout
// Cron da Vercel entra pelo CRON_SECRET (ela manda no header Authorization).
// ————————————————————————————————————————————————————————————————
const API_PUBLICA_PREFIXO = ['/api/webhooks/', '/api/public/', '/api/mcp/', '/api/auth/']
const API_PUBLICA_EXATA = ['/api/whatsapp']

function apiPublica(pathname: string): boolean {
  return API_PUBLICA_EXATA.includes(pathname)
    || API_PUBLICA_PREFIXO.some((p) => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api/')

  if (isApi) {
    if (apiPublica(pathname)) return NextResponse.next()
    // Cron da Vercel (e chamadas internas do servidor): sem cookie, com segredo.
    const secret = process.env.CRON_SECRET
    if (secret && request.headers.get('authorization') === `Bearer ${secret}`) {
      return NextResponse.next()
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Atualiza a sessão (obrigatório para o @supabase/ssr funcionar)
  const { data: { user } } = await supabase.auth.getUser()

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r))

  // Não autenticado: API responde 401 (o front sabe tratar); página vai pro login.
  if (!user && isApi) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Autenticado tentando acessar login/cadastro → dashboard
  if (user && (pathname === '/login' || pathname === '/cadastro')) {
    const url = request.nextUrl.clone()
    url.pathname = '/overview'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // Arquivos estáticos ficam FORA do middleware. O iPhone busca o ícone e o
  // manifesto do PWA sem sessão: protegidos, eles voltavam como redirect pro
  // login e o app era instalado com ícone em branco.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|webmanifest)$).*)',
  ],
}
