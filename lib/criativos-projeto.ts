// Projeto de criativo: o JSON que a montagem automática grava, o editor
// altera e a VPS renderiza. Nada aqui toca em servidor — são os tipos e as
// contas que a prévia do navegador precisa fazer IGUAL à VPS
// (vps-transcritor/app.py: _legenda_ass e _corta_broll). Mudou lá, muda aqui.

export const PASTA_PROJETOS = 'projetos'

export type Palavra = { t: string; ini: number; fim: number; enfase?: boolean; oculta?: boolean }
export type Zoom = 'nenhum' | 'in' | 'out'
export type Transicao = 'corte' | 'fade' | 'flash'
export type Trecho = {
  id: string
  caminho: string
  ini: number        // onde começa na linha do tempo (s)
  origem: number     // de que ponto do clipe original ele começa (s)
  zoom?: Zoom
  transicao?: Transicao
}
export type EstiloLegenda = 'palavra' | 'destaque' | 'bloco'
export type Legenda = {
  estilo: EstiloLegenda
  cor?: string
  destaque?: string
  tamanho?: number
  posicao?: number
  caixa?: boolean
  maiusculas?: boolean
  animacao?: 'pop' | 'nenhuma'
  tipo_destaque?: 'cor' | 'fundo'
  por_linha?: number
}
export type Corte = { ini: number; fim: number }
export type Projeto = {
  versao: number
  criado_em: number
  largura: number
  altura: number
  duracao: number
  locucao_path: string
  fonte_path: string | null
  roteiro?: string
  legenda: Legenda
  palavras: Palavra[]
  trechos: Trecho[]
  cortes: Corte[]
  saida_path?: string
}

export const ZOOM_FORCA = 0.12
export const TRANSICAO_DUR = 0.18

/** Legenda com todos os campos preenchidos, com os mesmos padrões da VPS. */
export function legendaCompleta(l: Legenda): Required<Legenda> {
  const palavra = l.estilo === 'palavra'
  return {
    estilo: l.estilo || 'palavra',
    cor: l.cor || '#FFFFFF',
    destaque: l.destaque || '#B8FF00',
    tamanho: l.tamanho ?? 1,
    posicao: l.posicao ?? (palavra ? 0.5 : 0.75),
    caixa: l.caixa ?? false,
    maiusculas: l.maiusculas ?? palavra,
    animacao: l.animacao || 'pop',
    tipo_destaque: l.tipo_destaque || 'cor',
    por_linha: l.por_linha ?? (l.estilo === 'destaque' ? 4 : 6),
  }
}

/** Corpo da letra como fração da altura do vídeo. */
export function corpoRelativo(l: Required<Legenda>) {
  return (l.estilo === 'palavra' ? 0.085 : 0.05) * l.tamanho
}

export function fimTrecho(p: Projeto, i: number) {
  return i + 1 < p.trechos.length ? p.trechos[i + 1].ini : p.duracao
}

export function trechoEm(p: Projeto, t: number) {
  let idx = 0
  for (let i = 0; i < p.trechos.length; i++) if (p.trechos[i].ini <= t) idx = i
  return idx
}

export function corteEm(p: Projeto, t: number) {
  return p.cortes.find((c) => t >= c.ini && t < c.fim) || null
}

export type PalavraNaTela = { texto: string; ativa: boolean; enfase: boolean; desde: number }

function fimDe(lista: Palavra[], i: number) {
  const p = lista[i]
  let fim = Math.max(p.fim, p.ini + 0.12)
  const prox = lista[i + 1]
  if (prox && prox.ini - fim >= 0 && prox.ini - fim < 0.5) fim = prox.ini
  return fim
}

/** O que a legenda mostra no instante t — mesma regra do _legenda_ass. */
export function legendaEm(p: Projeto, t: number): PalavraNaTela[] | null {
  const l = legendaCompleta(p.legenda)
  const vis = p.palavras.filter((w) => !w.oculta && w.t.trim())
  const txt = (w: Palavra) => (l.maiusculas ? w.t.trim().toUpperCase() : w.t.trim())

  if (l.estilo === 'palavra') {
    for (let i = 0; i < vis.length; i++) {
      if (t >= vis[i].ini && t < fimDe(vis, i)) {
        return [{ texto: txt(vis[i]), ativa: false, enfase: !!vis[i].enfase, desde: vis[i].ini }]
      }
    }
    return null
  }
  for (let g = 0; g < vis.length; g += l.por_linha) {
    const grupo = vis.slice(g, g + l.por_linha)
    if (l.estilo === 'bloco') {
      const fim = Math.max(grupo[grupo.length - 1].fim, grupo[0].ini + 0.4)
      if (t >= grupo[0].ini && t < fim) {
        return grupo.map((w) => ({ texto: txt(w), ativa: false, enfase: !!w.enfase, desde: grupo[0].ini }))
      }
      continue
    }
    for (let k = 0; k < grupo.length; k++) {
      if (t >= grupo[k].ini && t < fimDe(grupo, k)) {
        return grupo.map((w, j) => ({ texto: txt(w), ativa: j === k, enfase: !!w.enfase, desde: grupo[k].ini }))
      }
    }
  }
  return null
}

/** Escala do "pop": 80% → 108% em 80ms → 100% em 150ms (o \t do ASS). */
export function escalaPop(desde: number, t: number, de = 0.8, pico = 1.08) {
  const ms = (t - desde) * 1000
  if (ms < 0) return 1
  if (ms < 80) return de + (pico - de) * (ms / 80)
  if (ms < 150) return pico + (1 - pico) * ((ms - 80) / 70)
  return 1
}
