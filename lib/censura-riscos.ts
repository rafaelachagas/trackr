// Riscos de política da Meta no Editor de Censura. Três fontes viram o MESMO
// formato (Risco), e o editor trata todas igual:
//   - biblioteca: listas por política, tiradas da skill revisor-criativos-meta
//     (Parte C). Roda na hora, sem IA.
//   - lista do usuário: a caixa de red flags de sempre (vale como "alto").
//   - IA: lê a transcrição inteira com a política (lib/censura-politica.ts) e
//     pega o que depende de contexto ("ela te paga 250, 300, 500").
// Alto e muito alto já entram censurados; médio e baixo só ficam destacados.
// Puro — roda no navegador e no servidor.

import { Token, normalizar, lerRedFlags, acharRedFlags } from './censura'

export type Gravidade = 'muito_alto' | 'alto' | 'medio' | 'baixo'
export const GRAVIDADES: Gravidade[] = ['muito_alto', 'alto', 'medio', 'baixo']
export const NOME_GRAVIDADE: Record<Gravidade, string> = { muito_alto: 'Muito alto', alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }
export const censuraSozinho = (g: Gravidade) => g === 'muito_alto' || g === 'alto'
/** Entra censurado sem o usuário mexer: alto/muito alto e o bip resolve. */
export const autoCensura = (r: Risco) => censuraSozinho(r.gravidade) && r.bipResolve !== false

export interface Risco {
  ids: number[]
  gravidade: Gravidade
  categoria: string
  /** Seção da política da Meta. */
  politica: string
  motivo: string
  /** Troca sugerida (mantendo o sentido permitido). */
  troca?: string
  /** false = mesmo com o bip, a frase continua passando a ideia proibida. */
  bipResolve?: boolean
  fonte: 'biblioteca' | 'lista' | 'ia' | 'manual'
}

export interface Categoria {
  id: string
  nome: string
  politica: string
  gravidade: Gravidade
  motivo: string
  /** Mesmo formato da caixa de red flags: um por linha, * = prefixo. */
  termos: string
  /** Bipar não tira o sentido ("[bip] de todos, não precisa [bip]"): fica
   *  destacado pra regravar em vez de entrar censurado. */
  regravar?: boolean
}

export const BIBLIOTECA: Categoria[] = [
  {
    id: 'facilidade', nome: 'Esforço mínimo', politica: 'Enriquecimento rápido', gravidade: 'alto',
    motivo: 'Minimiza o esforço — junto de dinheiro vira "enriquecimento rápido".', regravar: true,
    termos: `a mais facil
mais facil de todas
mais facil de todos
nao precisa investir
nao precisa vender
nao precisa fazer nada
sem fazer nada
sem sair de casa
dinheiro facil
dinheiro rapido
so gravou
e so gravar
basta gravar`,
  },
  {
    id: 'ganho', nome: 'Promessa de ganho', politica: 'Enriquecimento rápido / retorno garantido', gravidade: 'alto',
    motivo: 'Fala de ganho em dinheiro — o centro do padrão VOCÊ + VALOR + PRAZO + FACILIDADE.',
    termos: `ganhar dinheiro
fatur*
te paga
vai te pagar
ela te paga
eles te pagam
primeiros resultados
viver disso
viver 100
sua vida vai mudar
mudar de vida
abandonou o trabalho
largou o emprego
garantid*
funciona pra qualquer pessoa
qualquer pessoa consegue`,
  },
  {
    id: 'valores', nome: 'Valores falados', politica: 'Enriquecimento rápido / desempenho anterior', gravidade: 'alto',
    motivo: 'Valor em dinheiro falado é o maior risco — leve o número pra tela (print).',
    // "reais" sozinho não: "rendas extras reais" é adjetivo. Número + reais
    // fica com acharValores.
    termos: `em dolar
em dolares`,
  },
  {
    id: 'marcas', nome: 'Marcas de terceiros', politica: 'Isca de marcas + propriedade intelectual', gravidade: 'muito_alto',
    motivo: 'Marca real citada como quem paga/envia/contrata — isca de marcas e pode ser denunciada pela marca.',
    termos: `natura
boticario
o boticario
avon
eudora
sephora
loreal
l oreal
magalu
magazine luiza
samsung
apple
iphone
nike
adidas
amazon
shopee
shein
mercado livre
coca cola
nestle
unilever
dove
nivea
vult
ruby rose
quem disse berenice
mac
havaianas
renner
riachuelo
c&a`,
  },
  {
    id: 'celebridades', nome: 'Celebridades', politica: 'Isca de celebridades', gravidade: 'alto',
    motivo: 'Celebridade citada, mesmo como comparação.',
    termos: `anitta
virginia
virginia fonseca
neymar
ivete
xuxa
juliette
carlinhos maia
whindersson
bruna marquezine
gkay
boca rosa`,
  },
  {
    id: 'atributos', nome: 'Atributos pessoais', politica: 'Atributos pessoais', gravidade: 'alto',
    motivo: 'Afirma situação financeira, saúde ou característica sensível de quem assiste.',
    termos: `endividad*
voce que esta
voce que ganha pouco
ganha pouco
depressao
depressiva
ansiedade
desempregad*`,
  },
  {
    id: 'emprego', nome: 'Oferta de emprego', politica: 'Empregos (sem empregador e cargo)', gravidade: 'medio',
    motivo: 'Encosta em oferta de emprego sem dizer quem contrata e qual o trabalho.',
    termos: `vaga
vagas
contratando
contratam
procurando voce
marcas procurando
trabalhar de casa
trabalhar em casa
trabalho dos sonhos
home office
profissao`,
  },
  {
    id: 'brindes', nome: 'Brindes', politica: 'Brindes', gravidade: 'medio',
    motivo: '"De graça", "presente" como oferta encosta na política de brindes.',
    termos: `gratis
gratuito
gratuita
de graca
brinde*
presentes`,
  },
  {
    id: 'visado', nome: 'Termos visados', politica: 'Enriquecimento rápido (termos que aumentam o rigor)', gravidade: 'medio',
    motivo: 'Não é proibido sozinho, mas deixa o anúncio mais visado.',
    termos: `renda extra
rendas extras
fonte de renda
oportunidade
invest*
por dia
por mes
por semana
pix`,
  },
  {
    id: 'urgencia', nome: 'Urgência falsa', politica: 'Práticas enganosas', gravidade: 'medio',
    motivo: 'Urgência que não é real ("vídeo pode cair").',
    termos: `pode cair
vai sair do ar
ultimas vagas
so hoje
corre`,
  },
  {
    id: 'literal', nome: 'Leitura literal da Meta', politica: 'Exploração humana / nudez / segurança infantil', gravidade: 'alto',
    motivo: 'O robô da Meta lê a transcrição sem contexto: "menina" vira menor de idade, "banheiro" vira nudez, "testando em você" vira cobaia/exploração.',
    termos: `menina
meninas
menininha
novinha
novinhas
banheiro
no banheiro
pelada
sem roupa
testando
testar em voce
cobaia
cobaias`,
  },
  {
    id: 'plataformas', nome: 'Outras plataformas', politica: 'Propriedade intelectual', gravidade: 'baixo',
    motivo: 'Nome de plataforma/rede. Baixo, mas some com marca de terceiro.',
    termos: `tiktok
kwai
youtube
instagram
whatsapp`,
  },
]

/** Dinheiro falado que a lista não pega: "R$ 250", "250 reais", "3 mil". O
 *  Whisper escreve "R" e "$" separados, e o número sozinho não diz nada. */
function acharValores(tokens: Token[]): number[][] {
  const out: number[][] = []
  const num = (w: string) => /^\d[\d.,]*$/.test(w.replace(/[,.;:!?]+$/, ''))
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].word.trim()
    if (/^R\$?$/i.test(w) || /^R\$\d/i.test(w)) {
      const ids = [tokens[i].id]
      let j = i + 1
      if (tokens[j]?.word.trim() === '$') { ids.push(tokens[j].id); j++ }
      if (/^R\$\d/i.test(w) || (tokens[j] && num(tokens[j].word))) {
        if (tokens[j] && num(tokens[j].word)) { ids.push(tokens[j].id); j++ }
        if (tokens[j] && /^mil\b/i.test(normalizar(tokens[j].word))) { ids.push(tokens[j].id); j++ }
        out.push(ids); i = j - 1
      }
      continue
    }
    if (num(w)) {
      const prox = normalizar(tokens[i + 1]?.word || '')
      // "3 mil reais" sim; "2 mil seguidores" não.
      const depois = normalizar(tokens[i + 2]?.word || '')
      if (prox === 'reais' || prox.startsWith('dolar')) { out.push([tokens[i].id, tokens[i + 1].id]); i += 1 }
      else if (prox === 'mil' && /^(reais|dolar)/.test(depois)) { out.push([tokens[i].id, tokens[i + 1].id, tokens[i + 2].id]); i += 2 }
    }
  }
  return out
}

/** O que o revisor (e você) aprovou por cima da biblioteca fixa. Fica em
 *  configuracoes 'censura_biblioteca_extra'. */
export interface BibliotecaExtra {
  termos?: Record<string, string[]>
  removidos?: Record<string, string[]>
  gravidade?: Record<string, Gravidade>
}

export function aplicarExtra(extra?: BibliotecaExtra | null): Categoria[] {
  if (!extra) return BIBLIOTECA
  return BIBLIOTECA.map((c) => {
    const fora = new Set((extra.removidos?.[c.id] || []).map((t) => normalizar(t)))
    const linhas = c.termos.split('\n').map((l) => l.trim()).filter((l) => l && !fora.has(normalizar(l)))
    for (const t of extra.termos?.[c.id] || []) if (!linhas.includes(t) && !fora.has(normalizar(t))) linhas.push(t)
    return { ...c, termos: linhas.join('\n'), gravidade: extra.gravidade?.[c.id] || c.gravidade }
  })
}

/** Riscos que a biblioteca e a lista do usuário acham nos tokens vivos. */
export function riscosLocais(vivos: Token[], ligadas: Set<string>, listaUsuario: string, biblioteca: Categoria[] = BIBLIOTECA): Risco[] {
  const out: Risco[] = []
  for (const c of biblioteca) {
    if (!ligadas.has(c.id)) continue
    for (const o of acharRedFlags(vivos, lerRedFlags(c.termos))) {
      out.push({ ids: o.ids, gravidade: c.gravidade, categoria: c.nome, politica: c.politica, motivo: c.motivo, fonte: 'biblioteca', bipResolve: c.regravar ? false : undefined })
    }
  }
  if (ligadas.has('valores')) {
    const v = biblioteca.find((c) => c.id === 'valores')!
    for (const ids of acharValores(vivos)) out.push({ ids, gravidade: v.gravidade, categoria: v.nome, politica: v.politica, motivo: v.motivo, fonte: 'biblioteca' })
  }
  for (const o of acharRedFlags(vivos, lerRedFlags(listaUsuario))) {
    out.push({ ids: o.ids, gravidade: 'alto', categoria: 'Sua lista', politica: '—', motivo: `Está na sua lista (“${o.flag}”).`, fonte: 'lista' })
  }
  // Trechos da mesma categoria que se encostam viram um só ("a mais fácil" +
  // "mais fácil de todos" → "a mais fácil de todos").
  const juntos: Risco[] = []
  for (const r of out.sort((x, y) => x.categoria.localeCompare(y.categoria) || x.ids[0] - y.ids[0])) {
    const u = juntos[juntos.length - 1]
    if (u && u.categoria === r.categoria && r.ids[0] <= u.ids[u.ids.length - 1]) {
      u.ids = [...new Set([...u.ids, ...r.ids])].sort((x, y) => x - y)
    } else juntos.push({ ...r, ids: [...r.ids] })
  }
  return juntos
}

/** A mesma palavra pode cair em várias fontes: fica o risco mais grave. */
export function riscoPorPalavra(riscos: Risco[]): Map<number, Risco> {
  const m = new Map<number, Risco>()
  for (const r of riscos) {
    for (const id of r.ids) {
      const a = m.get(id)
      if (!a || GRAVIDADES.indexOf(r.gravidade) < GRAVIDADES.indexOf(a.gravidade) || (r.fonte === 'ia' && a.gravidade === r.gravidade)) m.set(id, r)
    }
  }
  return m
}
