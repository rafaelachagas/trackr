import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data: vsls, error } = await supabaseAdmin
    .from('vsls')
    .select('*')
    .order('nome')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(vsls ?? [])
}
