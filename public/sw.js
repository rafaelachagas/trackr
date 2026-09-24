// Service worker do The Track — só o necessário pra notificação push.
// NÃO faz cache de página: painel com número errado por causa de cache é pior
// que painel lento.

self.addEventListener('install', (e) => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let dados = {}
  try { dados = event.data ? event.data.json() : {} } catch { dados = { titulo: event.data && event.data.text() } }
  const titulo = dados.titulo || 'The Track'
  const opcoes = {
    body: dados.mensagem || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: dados.tag || undefined,       // mesma tag = substitui, não empilha
    data: { url: dados.url || '/overview' },
    vibrate: [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(titulo, opcoes))
})

// Tocar na notificação: reaproveita a janela aberta do app; senão abre nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = (event.notification.data && event.notification.data.url) || '/overview'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ('focus' in j) { j.navigate(destino); return j.focus() }
      }
      return self.clients.openWindow(destino)
    })
  )
})
