import { NextResponse } from 'next/server'
import { inscrever, desinscrever, lerInscricoes, enviarPush, pushConfigurado } from '@/lib/push'

// Inscrição do aparelho pra notificação push (o app instalado na tela de início).
//   GET    → está configurado? quantos aparelhos?
//   POST   → inscreve este aparelho  { subscription, aparelho }
//   PUT    → manda uma notificação de teste
//   DELETE → tira este aparelho      { endpoint }
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  if (!pushConfigurado()) return NextResponse.json({ configurado: false, aparelhos: 0 })
  const inscricoes = await lerInscricoes()
  return NextResponse.json({
    configurado: true,
    aparelhos: inscricoes.length,
    endpoints: inscricoes.map((i) => ({ endpoint: i.endpoint, aparelho: i.aparelho, criada_em: i.criada_em })),
  })
}

export async function POST(req: Request) {
  try {
    const { subscription, aparelho } = await req.json()
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'inscrição inválida' }, { status: 400 })
    }
    const total = await inscrever({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      aparelho: typeof aparelho === 'string' ? aparelho.slice(0, 120) : undefined,
    })
    return NextResponse.json({ ok: true, aparelhos: total })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function PUT() {
  const n = await enviarPush({
    titulo: 'The Track',
    mensagem: 'Notificação de teste — se você está lendo isso, está funcionando.',
    url: '/overview',
    tag: 'teste',
  })
  return NextResponse.json({ ok: true, enviados: n })
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json().catch(() => ({}))
  if (!endpoint) return NextResponse.json({ error: 'endpoint ausente' }, { status: 400 })
  await desinscrever(endpoint)
  return NextResponse.json({ ok: true })
}
