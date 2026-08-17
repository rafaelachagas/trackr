import { redirect } from 'next/navigation'

// A "Central de Decisões" foi fundida dentro de Analisar Criativos: cada criativo
// mostra o selo de ação (Escalar/Manter/Reduzir/Pausar) da matriz do Framework,
// com filtro por decisão. Mantemos esta rota como redirect pra não quebrar links.
export default function FrameworkPage() {
  redirect('/ad-analysis')
}
