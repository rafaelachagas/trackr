import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .rpc('gastos_por_mes', { meses: 3 })

  if (error) {
    // fallback: raw query grouped in JS with high limit
    const { data: raw } = await supabaseAdmin
      .from('gastos')
      .select('data, valor_gasto')
      .gte('data', new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1).toISOString().slice(0, 10))
      .order('data', { ascending: false })
      .limit(50000)

    if (!raw) return NextResponse.json({ gastos: [] })

    const mapa: Record<string, number> = {}
    for (const g of raw) {
      const mes = (g.data as string).slice(0, 7)
      mapa[mes] = (mapa[mes] ?? 0) + (g.valor_gasto ?? 0)
    }
    const gastos = Object.entries(mapa)
      .map(([mes, total]) => ({ mes, total }))
      .sort((a, b) => b.mes.localeCompare(a.mes))
      .slice(0, 3)

    return NextResponse.json({ gastos })
  }

  return NextResponse.json({ gastos: data ?? [] })
}
