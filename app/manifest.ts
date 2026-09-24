import type { MetadataRoute } from 'next'

// Manifesto do PWA: é o que faz o "Adicionar à Tela de Início" virar um app de
// verdade (ícone próprio, tela cheia, sem barra do Safari) e o que o iOS exige
// pra liberar notificação push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Track',
    short_name: 'The Track',
    description: 'Painel de tráfego pago: vendas, gastos, ROAS e criativos.',
    start_url: '/overview',
    display: 'standalone',
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
