// Borrão da legenda que JÁ VEM queimada no vídeo (Editor de Censura).
// O usuário marca um ou mais retângulos onde a legenda aparece; enquanto uma
// palavra censurada estiver na tela, esse retângulo fica borrado. A legenda
// queimada costuma surgir um pouco antes da fala e ficar um pouco depois —
// por isso as folgas "antes" e "depois".
//
// A prévia (CSS backdrop-filter) e a exportação (ffmpeg na VPS) usam as
// mesmas janelas de tempo e a mesma força proporcional à largura do vídeo.

import type { Segmento } from './censura'

/** Pasta (bucket criativos) da biblioteca de efeitos sonoros. Edição com
 *  sfx 'arq:<nome>' usa o arquivo `${RAIZ_SONS}/<nome>`. */
export const RAIZ_SONS = 'censura-sfx'

/** Retângulo em fração do quadro (0–1), independente da resolução.
 *  Sem ini/fim: borra na hora das palavras censuradas (legenda fixa).
 *  Com ini/fim: "borrão de momento" — borra só nesse intervalo, pra texto
 *  que o editor do vídeo colocou solto (ex.: "rendas extras" trocando de fonte). */
export interface AreaBorrao { x: number; y: number; w: number; h: number; ini?: number; fim?: number }

export const ehMomento = (a: AreaBorrao) => typeof a.ini === 'number' && typeof a.fim === 'number'

/** Janelas de uma área: as dela, se for de momento, ou as das palavras censuradas. */
export const janelasDaArea = (a: AreaBorrao, dasPalavras: [number, number][]): [number, number][] =>
  ehMomento(a) ? (a.fim! > a.ini! ? [[a.ini!, a.fim!]] : []) : dasPalavras

export interface ConfigBorrao {
  /** 1–10. Raio do borrão = forca × 0,6% da largura do vídeo. */
  forca: number
  /** Segundos antes da palavra em que o borrão já começa. */
  antes: number
  /** Segundos depois da palavra em que o borrão continua. */
  depois: number
}

export const BORRAO_PADRAO: ConfigBorrao = { forca: 6, antes: 0.4, depois: 0.4 }

/** Raio do borrão em pixels pra um vídeo (ou prévia) desta largura. */
export const raioBorrao = (forca: number, largura: number) => Math.max(2, Math.round(forca * 0.006 * largura))

/** Janelas [ini, fim] em que a área fica borrada, já com folga e juntando as que se encostam. */
export function janelasBorrao(segs: Segmento[], cfg: ConfigBorrao, duracao = Infinity): [number, number][] {
  const js = segs
    .map((s) => [Math.max(0, s.ini - cfg.antes), Math.min(duracao, s.fim + cfg.depois)] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const j of js) {
    const u = out[out.length - 1]
    // Intervalo curto entre duas janelas vira uma só: borrão piscando
    // chama mais atenção que borrão parado.
    if (u && j[0] - u[1] < 0.25) u[1] = Math.max(u[1], j[1])
    else out.push([j[0], j[1]])
  }
  return out
}

/** Tira as janelas da legenda que o usuário soltou (viraram borrão de momento editável). */
export function tirarJanelas(janelas: [number, number][], fora: [number, number][] | undefined): [number, number][] {
  if (!fora?.length) return janelas
  return janelas.filter(([a, z]) => !fora.some(([fa, fz]) => a < fz && fa < z))
}

/** Lista de intervalos [ini, fim] vinda do cliente, já validada. */
export function intervalosValidos(v: unknown): [number, number][] {
  return (Array.isArray(v) ? v : [])
    .filter((x): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number' && Number.isFinite(n)) && x[1] > x[0])
    .slice(0, 500)
}

export function areaValida(a: unknown): a is AreaBorrao {
  const r = a as AreaBorrao
  if (!r || ![r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && n >= 0 && n <= 1) || r.w <= 0.01 || r.h <= 0.01) return false
  if (r.ini == null && r.fim == null) return true
  return typeof r.ini === 'number' && typeof r.fim === 'number' && Number.isFinite(r.ini) && Number.isFinite(r.fim) && r.ini >= 0 && r.fim > r.ini
}
