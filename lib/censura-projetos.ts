// Projetos do Editor de Censura no Storage (bucket criativos), sem tabela:
//   censura/<id>/video.<ext>    o vídeo original (fica — é dele que sai a exportação)
//   censura/<id>/projeto.json   transcrição + correções + marcas + edições
//   censura/<id>/meta.json      resumo pequeno pra lista não baixar tudo
// Só servidor (usa a service role).

import { supabaseAdmin } from './supabase'
import { BUCKET_CRIATIVOS } from './criativos'

export const RAIZ_CENSURA = 'censura'

export interface MetaProjeto {
  id: string
  nome: string
  tamanho: number
  video: string
  criado: string
  atualizado: string
  palavras: number
  censuradas: number
}

export const idValido = (id: string) => /^[\w-]{6,60}$/.test(id)

export const bucket = () => supabaseAdmin.storage.from(BUCKET_CRIATIVOS)

export async function lerJsonStorage<T>(caminho: string): Promise<T | null> {
  const { data, error } = await bucket().download(caminho)
  if (error || !data) return null
  try { return JSON.parse(await data.text()) as T } catch { return null }
}

export async function gravarJsonStorage(caminho: string, valor: unknown) {
  const corpo = new Blob([JSON.stringify(valor)], { type: 'application/json' })
  const { error } = await bucket().upload(caminho, corpo, { upsert: true, contentType: 'application/json', cacheControl: '0' })
  if (error) throw new Error(error.message)
}
