'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, Loader2, RefreshCw } from 'lucide-react'

// Cartão de Configurações: gera a URL do conector MCP pra colar no Claude
// (Configurações → Conectores → Adicionar conector personalizado).
export default function ConectorClaude() {
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch('/api/config/mcp-token', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setToken(j.token ?? null))
      .catch(() => setErro('Não consegui carregar o token'))
      .finally(() => setCarregando(false))
  }, [])

  const url = token ? `${window.location.origin}/api/mcp/${token}` : ''

  async function gerar() {
    if (token && !confirm('Gerar uma URL nova desconecta o Claude que usa a URL atual. Continuar?')) return
    setGerando(true); setErro('')
    try {
      const j = await fetch('/api/config/mcp-token', { method: 'POST' }).then((r) => r.json())
      if (j.error) throw new Error(j.error)
      setToken(j.token)
    } catch (e: any) {
      setErro(e.message ?? 'Falha ao gerar')
    } finally {
      setGerando(false)
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (carregando) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />

  return (
    <div className="space-y-4">
      {token ? (
        <div className="flex gap-2">
          <input readOnly value={url} className="flex-1 min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground" />
          <button onClick={copiar} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      ) : null}

      <button onClick={gerar} disabled={gerando} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent/40 disabled:opacity-50">
        {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {token ? 'Gerar nova URL' : 'Gerar URL do conector'}
      </button>

      {erro && <p className="text-xs text-red-400">{erro}</p>}

      <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
        <li>No Claude, abra <span className="text-foreground font-medium">Configurações → Conectores → Adicionar conector personalizado</span>.</li>
        <li>Dê o nome <span className="text-foreground font-medium">The Track</span> e cole a URL acima.</li>
        <li>Numa conversa, ative o conector e pergunte, por exemplo: “qual foi meu ROAS nos últimos 7 dias?”.</li>
      </ol>
      <p className="text-[11px] text-muted-foreground">
        Quem tiver essa URL consegue ler seus números. Não compartilhe; se vazar, gere uma nova.
      </p>
    </div>
  )
}
