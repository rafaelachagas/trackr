import EditorCriativo from './EditorCriativo'

// O id vem na URL (?id=) pra o link do editor poder ser aberto de novo depois.
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  return <EditorCriativo id={id || ''} />
}
