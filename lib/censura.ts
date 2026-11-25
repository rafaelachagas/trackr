// Editor de Censura — tipos e utilitários compartilhados entre as fases
// (transcrição, red flags, edição, exportação). Nada aqui toca em banco.

/** Palavra como a VPS devolve: w=texto, s/e=início/fim em segundos, p=confiança 0..1. */
export interface PalavraBruta { w: string; s: number; e: number; p: number }

export interface Token {
  id: number
  word: string
  start_time: number
  end_time: number
  confidence: number
  speaker?: string
}

export interface Linha { tokens: Token[]; start: number; end: number }

export function paraTokens(brutas: PalavraBruta[]): Token[] {
  return brutas
    .filter((b) => b.w && Number.isFinite(b.s) && Number.isFinite(b.e))
    .map((b, id) => ({ id, word: b.w, start_time: b.s, end_time: Math.max(b.e, b.s), confidence: b.p ?? 0 }))
}

/** Quebra em linhas de legenda: pausa longa, fim de frase ou linha comprida.
 *  Serve tanto pro painel quanto pra overlay em cima do vídeo. */
export function emLinhas(tokens: Token[], pausa = 0.7, maxPalavras = 9): Linha[] {
  const linhas: Linha[] = []
  let atual: Token[] = []
  const fecha = () => {
    if (atual.length) linhas.push({ tokens: atual, start: atual[0].start_time, end: atual[atual.length - 1].end_time })
    atual = []
  }
  for (const t of tokens) {
    const ant = atual[atual.length - 1]
    if (ant && (t.start_time - ant.end_time > pausa || /[.?!…]$/.test(ant.word) || atual.length >= maxPalavras)) fecha()
    atual.push(t)
  }
  fecha()
  return linhas
}

/** Busca binária: índice do token que está tocando em `t`, ou -1. */
export function tokenNoTempo(tokens: Token[], t: number): number {
  let lo = 0, hi = tokens.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (t < tokens[m].start_time) hi = m - 1
    else if (t > tokens[m].end_time) lo = m + 1
    else return m
  }
  return -1
}

/** Comparação de red flag: minúsculo, sem acento, sem pontuação nas pontas. */
export function normalizar(p: string): string {
  return p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

export function fmtTempo(seg: number): string {
  const s = Math.max(0, seg)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}
