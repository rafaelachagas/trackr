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
  /** true quando o usuário corrigiu o texto do Whisper. */
  corrigida?: boolean
  /** Removida pelo usuário (palavra duplicada/inventada). O tempo dela passa
   *  pra palavra anterior. Fica no array pra os ids não mudarem. */
  removida?: boolean
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

/** Parágrafos pro painel de leitura: quebra em pausa longa, ou em fim de
 *  frase depois de um bloco razoável. */
export function emParagrafos(tokens: Token[]): Linha[] {
  const ps: Linha[] = []
  let atual: Token[] = []
  const fecha = () => {
    if (atual.length) ps.push({ tokens: atual, start: atual[0].start_time, end: atual[atual.length - 1].end_time })
    atual = []
  }
  for (const t of tokens) {
    const ant = atual[atual.length - 1]
    if (ant && (t.start_time - ant.end_time > 1.1 || (atual.length >= 28 && /[.?!…]$/.test(ant.word)) || atual.length >= 60)) fecha()
    atual.push(t)
  }
  fecha()
  return ps
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

/** Abaixo disso o Whisper ficou em dúvida — vale o olho humano. */
export const LIMIAR_DUVIDA = 0.5

/** Lista de red flags: uma por linha (ou vírgula). "ganh*" casa por prefixo;
 *  "renda extra" casa a sequência de palavras. Sempre sem acento/maiúscula. */
export function lerRedFlags(texto: string): string[][] {
  return texto.split(/[\n,;]/).map((l) => l.trim().split(/\s+/).map((p) => {
    const estrela = p.endsWith('*')
    const n = normalizar(estrela ? p.slice(0, -1) : p)
    return n ? n + (estrela ? '*' : '') : ''
  }).filter(Boolean)).filter((f) => f.length)
}

function casa(padrao: string, palavra: string): boolean {
  return padrao.endsWith('*') ? palavra.startsWith(padrao.slice(0, -1)) : padrao === palavra
}

/** Ocorrências da lista nos tokens: cada uma vira {flag, ids}. */
export function acharRedFlags(tokens: Token[], flags: string[][]): { flag: string; ids: number[] }[] {
  const norm = tokens.map((t) => normalizar(t.word))
  const achados: { flag: string; ids: number[] }[] = []
  for (let i = 0; i < tokens.length; i++) {
    for (const f of flags) {
      if (i + f.length > tokens.length) continue
      if (f.every((p, k) => casa(p, norm[i + k]))) {
        achados.push({ flag: f.join(' '), ids: f.map((_, k) => tokens[i + k].id) })
        break
      }
    }
  }
  return achados
}

// ---------------- Áudio ----------------

/** Efeitos embutidos são SINTETIZADOS (não são arquivos): tocam em qualquer
 *  duração e o ffmpeg consegue gerar os mesmos na exportação. Arquivo enviado
 *  pelo usuário vira `arq:<nome>`. */
export const SFX_EMBUTIDOS = [
  { id: 'nenhum', nome: 'Nenhum' },
  { id: 'bip', nome: 'Bip' },
  { id: 'bip_grave', nome: 'Bip grave' },
  { id: 'ruido', nome: 'Chiado' },
  { id: 'vento', nome: 'Vento' },
  { id: 'radio', nome: 'Rádio' },
] as const

export interface Edicao {
  /** Volume da voz no trecho, de -60 (mudo) a +6 dB. */
  db: number
  /** 'nenhum', id embutido, ou 'arq:<nome>'. */
  sfx: string
  /** Volume do efeito, dB. */
  sfxDb: number
  /** substituir = voz some e só o efeito toca; sobrepor = voz no volume acima + efeito. */
  modo: 'substituir' | 'sobrepor'
}

export const EDICAO_PADRAO: Edicao = { db: -60, sfx: 'bip', sfxDb: -8, modo: 'substituir' }

export const dbParaGanho = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20))

/** Ganho da voz dentro do trecho editado. */
export function ganhoVoz(ed: Edicao): number {
  return ed.sfx !== 'nenhum' && ed.modo === 'substituir' ? 0 : dbParaGanho(ed.db)
}

export function fmtDb(db: number): string {
  return db <= -60 ? 'mudo' : `${db > 0 ? '+' : ''}${db} dB`
}

/** Folga nas pontas: o tempo do Whisper tem ~0,1s de erro, e cortar colado
 *  na palavra deixa escapar o começo/fim da sílaba. */
export const FOLGA = 0.03
/** Palavra que o Whisper devolveu com duração ~0 ganha pelo menos isto. */
export const DURACAO_MIN = 0.14

export interface Segmento { ids: number[]; ini: number; fim: number; ed: Edicao }

/** Junta palavras censuradas vizinhas com a mesma edição num trecho só —
 *  senão "renda extra" daria dois bips colados. */
export function montarSegmentos(
  tokens: Token[], censuradas: Set<number>, edicoes: Record<number, Edicao>, padrao: Edicao,
): Segmento[] {
  const ids = [...censuradas].filter((id) => tokens[id]).sort((a, b) => a - b)
  const segs: Segmento[] = []
  for (const id of ids) {
    const t = tokens[id]
    const ed = edicoes[id] ?? padrao
    let ini = t.start_time - FOLGA, fim = t.end_time + FOLGA
    if (fim - ini < DURACAO_MIN) { const meio = (t.start_time + t.end_time) / 2; ini = meio - DURACAO_MIN / 2; fim = meio + DURACAO_MIN / 2 }
    ini = Math.max(0, ini)
    const ult = segs[segs.length - 1]
    if (ult && ult.ids[ult.ids.length - 1] === id - 1 && ini - ult.fim < 0.25 && JSON.stringify(ult.ed) === JSON.stringify(ed)) {
      ult.ids.push(id); ult.fim = Math.max(ult.fim, fim)
    } else segs.push({ ids: [id], ini, fim, ed })
  }
  return segs
}

// ---------------- Edição do texto ----------------

/** Insere palavras que o Whisper engoliu, antes ou depois de `ref`. Se há
 *  silêncio entre as vizinhas, as novas ocupam ele; senão dividem o tempo da
 *  própria `ref` (o Whisper costuma colar duas palavras numa). Os ids são o
 *  índice no array, então tudo depois do ponto de inserção anda `n` casas —
 *  `mapa` traduz id antigo → novo pra marcas/edições acompanharem. */
export function inserirPalavras(tokens: Token[], ref: number, lado: 'antes' | 'depois', palavras: string[]) {
  const n = palavras.length
  const ts = tokens.map((t) => ({ ...t }))
  const vivoDe = (i: number, passo: number) => { let j = i + passo; while (j >= 0 && j < ts.length && ts[j].removida) j += passo; return j >= 0 && j < ts.length ? ts[j] : null }
  const r = ts[ref]
  let ini: number, fim: number
  if (lado === 'depois') {
    const prox = vivoDe(ref, 1)
    ini = r.end_time; fim = prox ? prox.start_time : r.end_time + 0.3 * n
    if (fim - ini < 0.08) { const meio = (r.start_time + r.end_time) / 2; ini = meio; fim = r.end_time; r.end_time = meio }
  } else {
    const ant = vivoDe(ref, -1)
    fim = r.start_time; ini = ant ? ant.end_time : Math.max(0, r.start_time - 0.3 * n)
    if (fim - ini < 0.08) { const meio = (r.start_time + r.end_time) / 2; ini = r.start_time; fim = meio; r.start_time = meio }
  }
  const pos = lado === 'depois' ? ref + 1 : ref
  const passo = (fim - ini) / n
  const novas: Token[] = palavras.map((w, k) => ({
    id: 0, word: w, start_time: ini + passo * k, end_time: ini + passo * (k + 1), confidence: 1, corrigida: true,
  }))
  const final = [...ts.slice(0, pos), ...novas, ...ts.slice(pos)].map((t, id) => ({ ...t, id }))
  const mapa = (id: number) => (id >= pos ? id + n : id)
  return { tokens: final, mapa, novos: novas.map((_, k) => pos + k) }
}
