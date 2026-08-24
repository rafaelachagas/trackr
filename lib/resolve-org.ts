'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'

// Resolve o org_id de quem está chamando a server action — usa a organização
// de que o usuário logado É MEMBRO de verdade, e só cai para "a primeira
// organização criada" se não achar sessão/membership (branch que só existia
// pra sustentar o single-tenant de antes de existir multi-organização).
//
// Isso importa: com só 1 organização (hoje), os dois caminhos dão o mesmo
// org_id. No dia em que existir uma 2ª organização, esta função passa a
// devolver a organização certa por usuário — sem isso, todo mundo (inclusive
// o cliente novo) escreveria/leria os dados da organização mais antiga.
//
// Ainda não cobre 100% dos casos (usuário membro de 2+ organizações depende
// de qual está "ativa" no client, que não viaja pra cá) — ver
// docs/organizacoes-multi-tenant.md antes de mexer em cron/webhook.
export async function resolveOrgId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabaseAdmin
        .from('organization_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      if (data?.org_id) return data.org_id
    }
  } catch {}

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()
  return org?.id ?? null
}
