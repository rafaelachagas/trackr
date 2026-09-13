// Biblioteca do Gerador de Criativos: b-rolls e fontes vivem no Storage, não
// no banco. O "caminho" faz o papel de pasta (broll/<pasta>/<arquivo>), então
// criar pasta é criar um marcador e listar pasta é listar por prefixo — sem
// tabela pra manter em sincronia com os arquivos.
export const BUCKET_CRIATIVOS = 'criativos'
export const RAIZ_BROLL = 'broll'
export const RAIZ_FONTES = 'fontes'

// Arquivo-marcador: o Storage não guarda pasta vazia. Sem isto, uma pasta
// recém-criada sumiria até o primeiro upload.
export const MARCADOR = '.pasta'

export const VIDEO_OK = /\.(mp4|mov|webm|m4v)$/i
export const FONTE_OK = /\.(ttf|otf|woff2?)$/i

/** Nome de pasta/arquivo seguro pra usar como caminho no Storage. */
export function nomeSeguro(s: string, max = 60): string {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, max)
}
