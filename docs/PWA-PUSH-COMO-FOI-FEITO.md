# App instalável (PWA) com notificação push no iPhone — como foi feito

Guia pra repetir em outro app **Next.js (App Router)**. Resultado: o site vira um
ícone na tela de início do iPhone, abre em tela cheia sem barra do Safari e
recebe notificação push com som, mesmo com o app fechado.

Feito no The Track em set/2026. Stack: Next.js 16 (App Router), Supabase,
deploy na Vercel.

## O que dá e o que não dá

- **Dá:** ícone próprio, tela cheia, push na tela bloqueada com som e vibração,
  tocar na notificação abre numa tela específica do app.
- **Não dá:** som personalizado (é o som padrão do sistema); tirar a linha
  "from <nome do site>" que o iOS acrescenta; aparecer na App Store.
- **Exigência do iOS:** push só funciona com o app **adicionado à tela de
  início**. Em aba do Safari, não chega. (Android/Chrome não tem essa regra.)
- **Precisa de HTTPS.** Em `localhost` funciona pra testar; em rede local, não.

---

## 1. Dependência e chaves VAPID

```bash
npm i web-push
npm i -D @types/web-push
```

As chaves VAPID identificam o seu servidor pro serviço de push do navegador.
Gere UMA vez e guarde:

```bash
node -e "const k=require('web-push').generateVAPIDKeys();console.log(k)"
```

Variáveis de ambiente (na Vercel e no `.env.local`):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>   # vai pro navegador, pode ser pública
VAPID_PRIVATE_KEY=<privateKey>             # NUNCA no cliente
VAPID_SUBJECT=mailto:contato@seudominio.com
```

## 2. Ícones

O iOS não aceita ícone transparente — gere PNG com fundo sólido. Com `sharp`,
a partir do SVG da marca:

```js
const sharp = require('sharp')
const svg = (size) => `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 64 64'>
  <rect width='64' height='64' fill='#0b1114'/>
  <!-- logo aqui, centralizado com ~78% do quadro -->
</svg>`

for (const [nome, size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]]) {
  await sharp(Buffer.from(svg(size))).png().toFile('public/' + nome)
}
```

Gere também um `badge-96.png` (silhueta branca em fundo transparente) — é o
ícone pequeno que aparece na notificação em alguns sistemas.

## 3. Manifesto — `app/manifest.ts`

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Meu App',
    short_name: 'Meu App',
    description: '...',
    start_url: '/overview',          // a tela que abre ao tocar no ícone
    display: 'standalone',           // <- sem barra do navegador
    orientation: 'portrait',
    background_color: '#0b1114',
    theme_color: '#0b1114',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

## 4. `app/layout.tsx`

```ts
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Meu App',
  manifest: '/manifest.webmanifest',
  applicationName: 'Meu App',
  // appleWebApp é o que faz o iPhone abrir em tela cheia
  appleWebApp: { capable: true, title: 'Meu App', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0b1114',
  viewportFit: 'cover',   // ocupa a tela toda, inclusive atrás do notch
  width: 'device-width',
  initialScale: 1,
}
```

## 5. Service worker — `public/sw.js`

Só push. **Não faça cache de página** num app de dados: número velho em cache é
pior que app lento.

```js
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let dados = {}
  try { dados = event.data ? event.data.json() : {} } catch { dados = {} }
  event.waitUntil(self.registration.showNotification(dados.titulo || 'Meu App', {
    body: dados.mensagem || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: dados.tag || undefined,      // mesma tag substitui em vez de empilhar
    data: { url: dados.url || '/' },
    vibrate: [80, 40, 80],
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) if ('focus' in j) { j.navigate(destino); return j.focus() }
      return self.clients.openWindow(destino)
    })
  )
})
```

## 6. Servidor — guardar inscrições e enviar

Cada aparelho gera uma "inscrição" (endpoint + 2 chaves). Guarde onde for
conveniente — no The Track ficou num JSON numa tabela de configurações, porque
são poucos aparelhos; com muitos usuários, use uma tabela própria
(`user_id, endpoint, p256dh, auth`).

```ts
import webpush from 'web-push'

function configurar() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

export async function enviarPush(msg: { titulo: string; mensagem: string; url?: string; tag?: string }) {
  const inscricoes = await lerInscricoes()
  if (!inscricoes.length) return 0
  configurar()
  const payload = JSON.stringify(msg)
  const mortas: string[] = []
  let ok = 0
  await Promise.all(inscricoes.map(async (i) => {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: i.keys }, payload, { TTL: 3600 })
      ok++
    } catch (e: any) {
      // 404/410 = desinstalou ou revogou: limpe da lista
      if (e?.statusCode === 404 || e?.statusCode === 410) mortas.push(i.endpoint)
      else console.error('[push]', e?.statusCode, e?.body)
    }
  }))
  if (mortas.length) await removerInscricoes(mortas)
  return ok
}
```

Rota `app/api/push/route.ts`: `POST` grava a inscrição, `DELETE` remove por
endpoint, `PUT` manda uma notificação de teste, `GET` diz quantos aparelhos
estão inscritos.

## 7. Cliente — botão "Ligar notificações"

Pontos que quebram se errar:

- `Notification.requestPermission()` **precisa vir de um clique**. No iOS,
  chamar no carregamento da página é ignorado.
- A chave pública vai em **Uint8Array**, não string.
- Detecte se está instalado: `window.matchMedia('(display-mode: standalone)').matches
  || navigator.standalone === true`. Se for iPhone e não estiver instalado,
  mostre o passo a passo (Compartilhar → Adicionar à Tela de Início) em vez de
  deixar o usuário tomar erro.

```ts
function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function ligar() {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  if (await Notification.requestPermission() !== 'granted') throw new Error('permissão negada')
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,   // obrigatório: toda push tem que virar notificação visível
    applicationServerKey: chaveParaBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })
  await fetch('/api/push', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), aparelho: navigator.userAgent }),
  })
}
```

## 8. Onde disparar

Ligue no evento que já existe no app (no The Track foi a função que registra
alerta, que antes só mandava WhatsApp). Regra prática: o push **nunca** pode
derrubar o fluxo principal — dispare sem `await` e com `.catch()`.

---

## As duas armadilhas que custaram tempo

**1. Middleware de autenticação bloqueando os arquivos do PWA.**
O app tinha middleware protegendo tudo. O iPhone busca `apple-touch-icon.png` e
`manifest.webmanifest` **sem sessão** → levavam redirect 307 pro login → o app
instalou com **ícone branco**. Exclua os estáticos do matcher:

```ts
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|webmanifest)$).*)',
  ],
}
```

Depois de corrigir, confira com `curl -I` que cada arquivo volta **200** e não 307.
Atenção ao cache da CDN: teste com `-H 'Cache-Control: no-cache'`.

**2. `viewportFit: 'cover'` joga o conteúdo por baixo do relógio.**
Em tela cheia, a barra do topo sobe atrás do notch. Reserve a faixa no header:

```tsx
style={{
  paddingTop: 'env(safe-area-inset-top)',
  height: 'calc(3.5rem + env(safe-area-inset-top))',
}}
```

No navegador o valor é 0, então nada muda fora do app instalado. Se houver barra
fixa embaixo, use `env(safe-area-inset-bottom)` do mesmo jeito.

## Teste no iPhone (a ordem importa)

1. Abrir o site no Safari **e fazer login** (instalar da tela de login salva o
   atalho apontando pra lá).
2. Compartilhar → Adicionar à Tela de Início → conferir se o ícone aparece
   colorido no preview (branco = arquivo bloqueado, ver armadilha 1).
3. Abrir **pelo ícone** (não pelo Safari).
4. Ligar as notificações e aceitar a permissão.
5. Enviar teste → deve chegar com som, mesmo com o app fechado.

## Detalhe de texto

O iOS acrescenta "from <nome do app>" abaixo do título, e isso não some. Então
não repita o nome do app no título: em vez de `titulo: 'Meu App'`, use
`titulo: 'Venda nova · R$ 497'`.
