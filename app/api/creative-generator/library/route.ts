import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BUCKET_CRIATIVOS, RAIZ_BROLL, MARCADOR, nomeSeguro } from '@/lib/criativos'


// Biblioteca de b-rolls: pastas por tema (broll/dinheiro, broll/celular...).
// A etiqueta usada no roteiro é o NOME DA PASTA — por isso ela é o que o
// usuário vê e escolhe, não um id.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function listar(prefixo: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_CRIATIVOS)
    .list(prefixo, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw new Error(error.message)
  return data || []
}

export async function GET(req: Request) {
  try {
    const pasta = new URL(req.url).searchParams.get('pasta')
    if (pasta) {
      const p = nomeSeguro(pasta)
      const itens = (await listar(`${RAIZ_BROLL}/${p}`)).filter((i) => i.name !== MARCADOR && i.id)
      const caminhos = itens.map((i) => `${RAIZ_BROLL}/${p}/${i.name}`)
      // URLs assinadas pro navegador mostrar a prévia sem baixar o arquivo
      // inteiro — o player pede só o pedaço que precisa.
      const { data: assinadas } = caminhos.length
        ? await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).createSignedUrls(caminhos, 3600)
        : { data: [] as any[] }
      const urlDe = new Map((assinadas || []).map((a: any) => [a.path, a.signedUrl]))
      return NextResponse.json({
        arquivos: itens.map((i, k) => ({
          nome: i.name,
          caminho: caminhos[k],
          tamanho: (i.metadata as any)?.size ?? 0,
          criadoEm: i.created_at,
          url: urlDe.get(caminhos[k]) || null,
        })),
      })
    }
    // Sem pasta: as pastas com a contagem, e a lista achatada de clipes — o
    // roteiro referencia clipe por nome ("$broll-dinheiro"), então o editor
    // precisa saber quais nomes existem pra avisar quando não existir.
    const pastas = (await listar(RAIZ_BROLL)).filter((i) => !i.id)
    const clipes: { nome: string; pasta: string; caminho: string }[] = []
    const comContagem = await Promise.all(
      pastas.map(async (p) => {
        const itens = (await listar(`${RAIZ_BROLL}/${p.name}`))
          .filter((i) => i.name !== MARCADOR && i.id)
        for (const i of itens) {
          clipes.push({
            // Sem extensão: é assim que se escreve no roteiro.
            nome: i.name.replace(/\.[^.]+$/, ''),
            pasta: p.name,
            caminho: `${RAIZ_BROLL}/${p.name}/${i.name}`,
          })
        }
        return { nome: p.name, clipes: itens.length }
      }),
    )
    return NextResponse.json({ pastas: comContagem, clipes })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { pasta } = await req.json()
    const nome = nomeSeguro(pasta)
    if (!nome) return NextResponse.json({ error: 'nome de pasta inválido' }, { status: 400 })
    const { error } = await supabaseAdmin.storage
      .from(BUCKET_CRIATIVOS)
      .upload(`${RAIZ_BROLL}/${nome}/${MARCADOR}`, new Blob(['']), { upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, pasta: nome })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

// Renomear = mover no Storage. O nome é o identificador usado no roteiro
// ("$broll-um"), então renomear aqui muda a referência — por isso a resposta
// devolve o nome novo, pra tela avisar o usuário.
export async function PATCH(req: Request) {
  try {
    const { caminho, novoNome } = await req.json()
    if (!caminho?.startsWith(`${RAIZ_BROLL}/`)) {
      return NextResponse.json({ error: 'caminho inválido' }, { status: 400 })
    }
    const extensao = caminho.match(/\.[^./]+$/)?.[0] || ''
    const base = nomeSeguro(String(novoNome || '').replace(/\.[^./]+$/, ''), 80)
    if (!base) return NextResponse.json({ error: 'nome inválido' }, { status: 400 })

    const destino = `${caminho.split('/').slice(0, -1).join('/')}/${base}${extensao}`
    if (destino === caminho) return NextResponse.json({ ok: true, caminho, nome: base + extensao })

    const { error } = await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).move(caminho, destino)
    if (error) {
      const dup = /exist/i.test(error.message)
      return NextResponse.json(
        { error: dup ? 'já existe um clipe com esse nome nessa pasta' : error.message },
        { status: 400 })
    }
    return NextResponse.json({ ok: true, caminho: destino, nome: base + extensao })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { caminho, pasta } = await req.json()
    if (caminho) {
      const { error } = await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).remove([caminho])
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    if (pasta) {
      // Apagar pasta = apagar tudo que está sob o prefixo, marcador incluso.
      const nome = nomeSeguro(pasta)
      const itens = await listar(`${RAIZ_BROLL}/${nome}`)
      const alvos = itens.map((i) => `${RAIZ_BROLL}/${nome}/${i.name}`)
      if (alvos.length) await supabaseAdmin.storage.from(BUCKET_CRIATIVOS).remove(alvos)
      return NextResponse.json({ ok: true, removidos: alvos.length })
    }
    return NextResponse.json({ error: 'informe caminho ou pasta' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: `${e}` }, { status: 500 })
  }
}
