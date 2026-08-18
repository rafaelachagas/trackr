// Classificação front/upsell centralizada.
// Regra (quando há produtos FRONT cadastrados): um produto é FRONT só se o nome
// COMEÇA com um produto front cadastrado — assim "Profissão do Futuro (Acesso
// Anual)" é front, mas "Formação Profissão do Futuro" NÃO (começa com "Formação").
// Todo o resto é upsell. Sem isso, o painel jogava todo produto novo em "front".
// Sem nenhum produto front cadastrado, cai na heurística antiga por palavra-chave.
export type TipoVenda = 'front' | 'upsell' | 'outro'

export function classificarTipo(
  produtoNome: string | null | undefined,
  mapeamentos: { nome_produto: string; tipo: string }[] | null | undefined
): TipoVenda {
  const nome = (produtoNome ?? '').toLowerCase().trim()
  const maps = mapeamentos ?? []
  const fronts = maps.filter((m) => m.tipo === 'front').map((m) => m.nome_produto.toLowerCase().trim()).filter(Boolean)
  const upsells = maps.filter((m) => m.tipo === 'upsell').map((m) => m.nome_produto.toLowerCase().trim()).filter(Boolean)

  if (fronts.length > 0 || upsells.length > 0) {
    // Front e Upsell são SÓ os produtos cadastrados (match por "começa com" pra
    // "Profissão do Futuro (Acesso Anual)" casar, mas "Formação Profissão do
    // Futuro" não). Todo o resto é "outro" — nem front nem upsell.
    if (fronts.some((f) => nome.startsWith(f))) return 'front'
    if (upsells.some((u) => nome.startsWith(u))) return 'upsell'
    return 'outro'
  }

  // Fallback (nada cadastrado): palavra-chave — só o que é claramente bump/upsell.
  const upsellKw = ['upsell', 'order bump', 'bump', 'plataforma de marcas', 'plataforma']
  return upsellKw.some((k) => nome.includes(k)) ? 'upsell' : 'front'
}
