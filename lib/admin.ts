// Super-admin = dono do The Track (não confundir com role 'admin' de uma
// organização, que é por-cliente). Lista de emails via env (separados por
// vírgula) com fallback pro Isaías, pra não depender de rodar SQL pra dar
// acesso ao painel /admin.
const FALLBACK = ['isaiaszuchi@gmail.com']

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const lista = (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const permitidos = lista.length > 0 ? lista : FALLBACK
  return permitidos.includes(email.trim().toLowerCase())
}
