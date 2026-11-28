import type { AreaBorrao } from './censura-borrao'

// Leitura (OCR) do texto escrito no vídeo inteiro, feita uma vez na VPS
// (/censor_ocr) e salva em censura/<id>/ocr.json. A busca roda aqui no
// navegador, na hora: acha onde e quando um texto aparece na tela.

/** [texto lido, x1, y1, x2, y2] — coordenadas de 0 a 1. */
export type Deteccao = [string, number, number, number, number]
export interface LeituraVideo { fps: number; quadros: number; itens: { t: number; d: Deteccao[] }[] }

export const normTxt = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

function distancia(a: string, b: string) {
  const v = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let ant = v[0]; v[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = v[j]
      v[j] = Math.min(v[j] + 1, v[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1))
      ant = tmp
    }
  }
  return v[b.length]
}
const parecido = (a: string, b: string) => (a.length && b.length ? 1 - distancia(a, b) / Math.max(a.length, b.length) : 0)

/** A palavra (normalizada) aparece nessa detecção? Tolera erro de leitura em fonte estilizada. */
function temPalavra(det: string, p: string) {
  if (det.includes(p)) return true
  if (p.length >= 4 && parecido(det, p) >= 0.75) return true
  // Detecção com várias palavras juntas ("rendasextras"): compara pedaços do tamanho da palavra.
  if (det.length > p.length && p.length >= 4) {
    for (let i = 0; i + p.length <= det.length; i++) if (parecido(det.slice(i, i + p.length), p) >= 0.8) return true
  }
  return false
}

/**
 * Todos os trechos em que `texto` aparece escrito no vídeo, já como borrões de momento.
 * Palavras com menos de 3 letras não contam sozinhas (achariam "de" em todo canto).
 */
export function acharTexto(leitura: LeituraVideo, texto: string, duracao: number): AreaBorrao[] {
  const palavras = texto.split(/\s+/).map(normTxt).filter((p) => p.length >= 3)
  if (!palavras.length) return []
  const precisa = palavras.length === 1 ? 1 : Math.ceil(palavras.length * 0.5)
  const passo = 1 / (leitura.fps || 3)

  const achados: { t: number; x1: number; y1: number; x2: number; y2: number }[] = []
  for (const q of leitura.itens) {
    const dets = q.d.map((d) => ({ n: normTxt(d[0]), d }))
    const usadas = new Set<Deteccao>()
    let cobertas = 0
    for (const p of palavras) {
      const hit = dets.filter((x) => temPalavra(x.n, p))
      if (hit.length) { cobertas++; hit.forEach((x) => usadas.add(x.d)) }
    }
    if (cobertas < precisa || !usadas.size) continue
    const us = [...usadas]
    achados.push({
      t: q.t,
      x1: Math.min(...us.map((d) => d[1])), y1: Math.min(...us.map((d) => d[2])),
      x2: Math.max(...us.map((d) => d[3])), y2: Math.max(...us.map((d) => d[4])),
    })
  }

  // Quadros seguidos viram um trecho; um quadro perdido no meio não quebra.
  const trechos: (typeof achados)[] = []
  for (const a of achados) {
    const ult = trechos[trechos.length - 1]
    if (ult && a.t - ult[ult.length - 1].t <= passo * 2.5) ult.push(a)
    else trechos.push([a])
  }
  const r2 = (n: number) => +n.toFixed(4)
  return trechos.map((tr) => {
    let x1 = Math.min(...tr.map((a) => a.x1)), y1 = Math.min(...tr.map((a) => a.y1))
    let x2 = Math.max(...tr.map((a) => a.x2)), y2 = Math.max(...tr.map((a) => a.y2))
    const fx = (x2 - x1) * 0.06 + 0.01, fy = (y2 - y1) * 0.15 + 0.008
    x1 = Math.max(0, x1 - fx); y1 = Math.max(0, y1 - fy); x2 = Math.min(1, x2 + fx); y2 = Math.min(1, y2 + fy)
    const ini = Math.max(0, tr[0].t - passo * 0.5 - 0.1)
    const fim = Math.min(duracao || Infinity, tr[tr.length - 1].t + passo * 0.5 + 0.1)
    return { x: r2(x1), y: r2(y1), w: r2(x2 - x1), h: r2(y2 - y1), ini: +ini.toFixed(2), fim: +fim.toFixed(2) }
  })
}

/** Já existe um borrão de momento cobrindo praticamente o mesmo lugar e tempo? */
export function jaCoberto(nova: AreaBorrao, areas: AreaBorrao[]) {
  return areas.some((a) => {
    if (typeof a.ini !== 'number' || typeof a.fim !== 'number') return false
    const tempo = Math.min(a.fim, nova.fim!) - Math.max(a.ini, nova.ini!)
    if (tempo <= 0) return false
    const ix = Math.max(0, Math.min(a.x + a.w, nova.x + nova.w) - Math.max(a.x, nova.x))
    const iy = Math.max(0, Math.min(a.y + a.h, nova.y + nova.h) - Math.max(a.y, nova.y))
    return ix * iy >= 0.5 * Math.min(a.w * a.h, nova.w * nova.h)
  })
}
