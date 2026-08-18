import { redirect } from 'next/navigation'

// A Gestão de Produtos foi movida pra dentro de Configurações (junto do ROAS e do
// Framework). Mantemos a rota como redirect pra não quebrar links antigos.
export default function ProdutosPage() {
  redirect('/configuracoes')
}
