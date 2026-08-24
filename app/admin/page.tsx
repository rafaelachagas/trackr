import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { isSuperAdminEmail } from '@/lib/admin'
import AdminOrgs from '@/components/admin/AdminOrgs'

// Painel de dono (Isaías) — cross-organização, fora do (dashboard) group de
// propósito: não tem Sidebar/Topbar/DashboardProvider (que são por-organização).
// Gate por allowlist de email (lib/admin.ts), não por role de organização —
// um admin de organização (ex.: Rafaela) NÃO tem acesso aqui.
export default async function AdminPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isSuperAdminEmail(user.email)) {
    redirect('/overview')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="text-xl font-bold text-foreground tracking-tight">Painel Admin — The Track</h1>
        <p className="text-sm text-muted-foreground mt-1">Organizações (clientes), planos e convites. Visível só pra dono da plataforma.</p>
        <div className="mt-8">
          <AdminOrgs />
        </div>
      </div>
    </div>
  )
}
