// Versão client-safe da checagem de super-admin — só decide se MOSTRA o link
// "Painel Admin" no menu. A proteção de verdade é no servidor (lib/admin.ts,
// checado de novo em /admin e nas rotas /api/admin/*), então não tem problema
// esse allowlist estar visível no bundle do cliente.
const SUPER_ADMINS = ['isaiaszuchi@gmail.com']

export function pareceSuperAdmin(email: string | null | undefined): boolean {
  return !!email && SUPER_ADMINS.includes(email.trim().toLowerCase())
}
