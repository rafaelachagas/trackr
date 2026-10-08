// Leitor do roteiro em blocos — o jeito que se escreve a decupagem à mão:
//
//   [BROLL3]
//   Context: você vai pegar o segundo 0:04 e rapidamente passa pra outra cena
//   Não precisa gastar nada,
//
// O "Context:" é prosa, não comando: a gente só pesca os tempos dele e repete
// de volta o que entendeu, pra você conferir. O resto da prosa é instrução pra
// humano e não vira nada — dizer "mais ou menos" ou "metade da frase" não tem
// como virar número sem chutar, e chute silencioso é o que estraga montagem.

export type CenaRoteiro = {
  cena: number
  clipe: string          // "broll3"
  de?: number            // segundo dentro do clipe
  ate?: number
  copy: string           // o que é falado durante a cena
  contexto?: string
  avisos: string[]
}

export type LeituraRoteiro = {
  cenas: CenaRoteiro[]
  roteiro: string        // o texto com as marcações, pronto pro montador
  avisos: string[]
}

const RE_BLOCO = /^\s*\[\s*b-?roll\s*(\d+)\s*\]\s*$/i
const RE_CONTEXTO = /^\s*context(?:o)?\s*:\s*(.*)$/i
const RE_COPY = /^\s*(?:texto\s*copy|copy|texto|fala)\s*:\s*(.*)$/i
// 0:04, 01:02, 2:01:30 — hora opcional. Número solto NÃO conta como tempo:
// "1 segundo" de duração viraria início de cena por engano.
const RE_TEMPO = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g

function paraSegundos(txt: string): number {
  return txt.split(':').reduce((total, parte) => total * 60 + Number(parte), 0)
}

/** Formata segundos de volta em M:SS, pra devolver o que foi entendido. */
export function comoTempo(s: number): string {
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

/** Palavras comparáveis: sem pontuação, sem acento, minúsculas. */
function palavras(texto: string): string[] {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^\w\s]/g, ' ')
    .split(/\s+/).filter(Boolean)
}

export function lerRoteiroEmBlocos(bruto: string): LeituraRoteiro {
  const linhas = (bruto || '').split(/\r?\n/)
  const cenas: CenaRoteiro[] = []
  const avisos: string[] = []
  let atual: CenaRoteiro | null = null

  const fechar = () => {
    if (atual && atual.copy.trim()) cenas.push(atual)
    else if (atual) atual.avisos.push('bloco sem fala')
    atual = null
  }

  for (const linha of linhas) {
    const bloco = RE_BLOCO.exec(linha)
    if (bloco) {
      fechar()
      atual = { cena: cenas.length + 1, clipe: `broll${bloco[1]}`, copy: '', avisos: [] }
      continue
    }
    if (!atual) {
      if (linha.trim()) avisos.push(`Texto fora de qualquer bloco, ignorado: "${linha.trim().slice(0, 50)}"`)
      continue
    }
    const ctx = RE_CONTEXTO.exec(linha)
    if (ctx) {
      atual.contexto = (atual.contexto ? atual.contexto + ' ' : '') + ctx[1].trim()
      continue
    }
    const copy = RE_COPY.exec(linha)
    atual.copy = (atual.copy ? atual.copy + ' ' : '') + (copy ? copy[1] : linha).trim()
  }
  fechar()

  // Tempos do contexto, depois que o bloco inteiro foi lido.
  for (const c of cenas) {
    if (!c.contexto) continue
    const achados = [...c.contexto.matchAll(RE_TEMPO)].map((m) => paraSegundos(m[1]))
    // Só os tempos DIFERENTES contam: um contexto que repete "0:04" ao
    // explicar a mesma cena daria uma janela de duração zero.
    const distintos = [...new Set(achados)].sort((a, b) => a - b)
    if (distintos.length >= 2) {
      c.de = distintos[0]
      c.ate = distintos[1]
      if (achados.length > 2) {
        c.avisos.push(`o contexto cita ${achados.length} tempos — usei ${comoTempo(c.de)} e ${comoTempo(c.ate)}`)
      }
    } else if (distintos.length === 1) {
      c.de = distintos[0]
    }
    if (/mais ou menos|aproximad|por volta|mais\s+ou\s+menos/i.test(c.contexto)) {
      c.avisos.push('o contexto diz "mais ou menos" — o tempo entrou como exato, confira no editor')
    }
    if (/metade|meio da frase|parte da frase/i.test(c.contexto)) {
      c.avisos.push('"metade da frase" não vira número: a duração vem da fala, ajuste na linha do tempo')
    }
    if (!achados.length) {
      c.avisos.push('nenhum tempo reconhecido no contexto — vai usar o clipe desde o começo')
    }
  }

  // --- o roteiro com as marcações ---
  // Quando um bloco repete a fala do anterior e acrescenta (o editor marcando
  // que a cena troca no meio da frase), as palavras repetidas NÃO podem entrar
  // duas vezes: a locução só diz uma vez, e tudo depois sairia deslocado.
  const partes: string[] = []
  let anteriores: string[] = []
  for (const c of cenas) {
    const marca = c.de != null
      ? `$${c.clipe}@${comoTempo(c.de)}${c.ate != null ? `-${comoTempo(c.ate)}` : ''}`
      : `$${c.clipe}`
    const atuais = palavras(c.copy)
    let novo = c.copy
    if (anteriores.length && atuais.length > anteriores.length
        && anteriores.every((w, i) => atuais[i] === w)) {
      // Acha onde o texto novo começa, contando palavras no original.
      const cru = c.copy.trim().split(/\s+/)
      novo = cru.slice(anteriores.length).join(' ')
      c.avisos.push(`repete a fala da cena anterior — contei só as ${cru.length - anteriores.length} palavra(s) novas`)
    }
    partes.push(`${marca} ${novo}`.trim())
    anteriores = atuais
  }

  if (!cenas.length) avisos.push('Nenhum bloco [BROLL1] encontrado.')
  return { cenas, roteiro: partes.join('\n'), avisos }
}
