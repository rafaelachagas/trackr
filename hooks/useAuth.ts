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

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data } = await supabase
          .from('organization_members')
          .select('org_id, role, organizations(id, name)')
          .eq('user_id', user.id)

        const memberships: OrgMembership[] = (data ?? []).map((m: any) => ({
          org_id: m.org_id,
          org_name: m.organizations?.name ?? '',
          role: m.role,
        }))

        setOrgs(memberships)

        // Restaura a org ativa do localStorage ou usa a primeira
        const saved = localStorage.getItem('activeOrgId')
        const found = memberships.find(m => m.org_id === saved) ?? memberships[0] ?? null
        setActiveOrgState(found)
      }

      setLoading(false)
    }

    load()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => load())
    return () => subscription.unsubscribe()
  }, [])

  function setActiveOrg(org: OrgMembership) {
    setActiveOrgState(org)
    localStorage.setItem('activeOrgId', org.org_id)
  }

  async function signOut() {
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return { user, orgs, activeOrg, setActiveOrg, loading, signOut }
}
