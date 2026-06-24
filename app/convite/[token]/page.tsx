import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { createSupabaseServer } from '@/lib/supabase-server'
import ConviteClient from './ConviteClient'

interface Props {
  params: { token: string }
}

export default async function ConvitePage({ params }: Props) {
  const { token } = params

  // Busca o convite (service_role, sem RLS)
  const { data: invite } = await supabaseAdmin
    .from('organization_invites')
    .select('org_id, role, expires_at, accepted_at, organizations(name)')
    .eq('token', token)
    .single()

  if (!invite) {
    return <ConviteClient status="invalid" />
  }

  if (invite.accepted_at) {
    return <ConviteClient status="used" />
  }

  if (new Date(invite.expires_at) < new Date()) {
    return <ConviteClient status="expired" />
  }

  // Verifica se usuário está logado
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  const orgName = (invite.organizations as any)?.name ?? ''

  if (!user) {
    // Não logado: mostra tela de convite com botão de login/cadastro
    return (
      <ConviteClient
        status="pending"
        token={token}
        orgName={orgName}
        role={invite.role}
        requiresLogin
      />
    )
  }

  // Já é membro?
  const { data: existing } = await supabaseAdmin
    .from('organization_members')
    .select('user_id')
    .eq('org_id', invite.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return <ConviteClient status="already_member" orgName={orgName} />
  }

  return (
    <ConviteClient
      status="pending"
      token={token}
      orgName={orgName}
      role={invite.role}
    />
  )
}
