import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Serve o HTML bruto de uma versão salva da página do concorrente,
// pra abrir renderizado numa nova aba (snapshot do dia da captura).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('rastreador_paginas_hist').select('html, titulo').eq('id', id).maybeSingle()
  if (error || !data?.html) {
    return new NextResponse('Snapshot não encontrado (ou capturado antes desta funcionalidade).', {
      status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  return new NextResponse(data.html as string, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Não indexar e não deixar a página quebrar o app.
      'x-robots-tag': 'noindex',
      'content-security-policy': "sandbox allow-scripts allow-same-origin;",
    },
  })
}
