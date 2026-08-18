// Classificação front/upsell centralizada.
// Regra (quando há produtos FRONT cadastrados): um produto é FRONT só se o nome
// COMEÇA com um produto front cadastrado — assim "Profissão do Futuro (Acesso
// Anual)" é front, mas "Formação Profissão do Futuro" NÃO (começa com "Formação").
// Todo o resto é upsell. Sem isso, o painel jogava todo produto novo em "front".
// Sem nenhum produto front cadastrado, cai na heurística antiga por palavra-chave.
export function classificarTipo(
  produtoNome: string | null | undefined,
  mapeamentos: { nome_produto: string; tipo: string }[] | null | undefined
): 'front' | 'upsell' {
  const nome = (produtoNome ?? '').toLowerCase().trim()
  const maps = mapeamentos ?? []
  const fronts = maps.filter((m) => m.tipo === 'front').map((m) => m.nome_produto.toLowerCase().trim()).filter(Boolean)

  if (fronts.length > 0) {
    return fronts.some((f) => nome.startsWith(f)) ? 'front' : 'upsell'
  }

  // Fallback (nenhum front cadastrado): palavra-chave — só o que é claramente bump/upsell.
  const upsellKw = ['upsell', 'order bump', 'bump', 'plataforma de marcas', 'plataforma']
  return upsellKw.some((k) => nome.includes(k)) ? 'upsell' : 'front'
}
