'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'

export interface OrgMembership {
  org_id: string
  org_name: string
  role: 'admin' | 'member'
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [orgs, setOrgs] = useState<OrgMembership[]>([])
  const [activeOrg, setActiveOrgState] = useState<OrgMembership | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createSupabaseBrowser()

    async function loadOrgs(userId: string) {
      const { data } = await supabase
        .from('organization_members')
        .select('org_id, role, organizations(id, name)')
        .eq('user_id', userId)

      const memberships: OrgMembership[] = (data ?? []).map((m: any) => ({
        org_id: m.org_id,
        org_name: m.organizations?.name ?? '',
        role: m.role,
      }))

      setOrgs(memberships)

      const saved = localStorage.getItem('activeOrgId')
      const found = memberships.find(m => m.org_id === saved) ?? memberships[0] ?? null
      setActiveOrgState(found)
    }

    // onAuthStateChange é a fonte de verdade — dispara com INITIAL_SESSION na carga inicial
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        await loadOrgs(currentUser.id)
      }

      if (event === 'SIGNED_OUT') {
        setOrgs([])
        setActiveOrgState(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  function setActiveOrg(org: OrgMembership) {
    setActiveOrgState(org)
    localStorage.setItem('activeOrgId', org.org_id)
  }

  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.replace('/login')
  }

  return { user, orgs, activeOrg, setActiveOrg, loading, signOut }
}
