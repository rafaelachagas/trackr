'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, FileText, Copy, Check, Download, Sparkles } from 'lucide-react'
import { baixarTxt, baixarMd, baixarPdf, baixarDocx } from '@/lib/exportDoc'

// Aba 1 do Rastreador de Conteúdos: transcrição rápida por URL. Cola um link de
// TikTok / Instagram / YouTube (ou vídeo direto) e transcreve. O trabalho pesado
// é da VPS (yt-dlp extrai o áudio + Whisper transcreve), pela rota assíncrona.

export default function TranscreverPage() {
  const [url, setUrl] = useState('')
  const [igCookie, setIgCookie] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [rodando, setRodando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const timerRef = useRef<any>(null)

  const ehInstagram = /instagram\.com/i.test(url)

  useEffect(() => () => clearInterval(timerRef.current), [])

  async function transcrever() {
    const u = url.trim()
    if (!u || rodando) return
    setRodando(true); setErro(null); setTexto(''); setStatus('Enviando pra VPS...'); setSegundos(0)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    try {
      const ini = await fetch('/api/rastreador/transcrever-async', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: u, ig_cookie: ehInstagram ? igCookie.trim() : '' }),
      }).then((r) => r.json())
      if (!ini?.job_id) throw new Error(ini?.error || 'Não consegui iniciar a transcrição.')
      // Poll do resultado.
      for (;;) {
        await new Promise((res) => setTimeout(res, 3000))
        const j = await fetch(`/api/rastreador/transcrever-async?id=${ini.job_id}`, { cache: 'no-store' }).then((r) => r.json())
        if (j?.status === 'ok') { setTexto(j.texto || '(vazio)'); setStatus(null); break }
        if (j?.status === 'erro') throw new Error(j.erro || 'Falha na transcrição.')
        setStatus(j?.status === 'rodando' ? 'Transcrevendo o áudio...' : j?.status === 'fila' ? 'Na fila (baixando o vídeo)...' : 'Processando...')
      }
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setRodando(false); clearInterval(timerRef.current)
    }
  }

  function copiar() {
    navigator.clipboard.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) })
  }

  const nome = `transcricao-${new Date().toISOString().slice(0, 10)}`
  const palavras = texto ? texto.trim().split(/\s+/).length : 0

  return (
    <div className="max-w-3xl mx-auto space-y-5 py-2">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" /> Transcrição rápida
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Cole um link de <b>TikTok</b>, <b>Instagram</b>, <b>YouTube</b> ou vídeo direto — a IA transcreve o áudio na hora.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && transcrever()}
            placeholder="https://www.tiktok.com/@perfil/video/..."
            className="flex-1 px-4 py-3 rounded-xl text-sm bg-background border border-border text-foreground focus:border-primary/50 outline-none"
          />
          <button onClick={transcrever} disabled={rodando || !url.trim()}
            className="px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap">
            {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {rodando ? 'Transcrevendo...' : 'Transcrever'}
          </button>
        </div>

        {ehInstagram && (
          <div>
            <input
              value={igCookie} onChange={(e) => setIgCookie(e.target.value)}
              placeholder="Cookie sessionid do Instagram (só pra conteúdo do Insta)"
              className="w-full px-4 py-2.5 rounded-xl text-xs font-mono bg-background border border-border text-foreground focus:border-primary/50 outline-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">O Instagram exige login. Cole o <b>sessionid</b> de uma conta logada (dá pra pegar no navegador). TikTok e YouTube não precisam.</p>
          </div>
        )}

        {status && <p className="text-xs text-primary/90 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {status} {segundos > 0 && `· ${Math.floor(segundos / 60)}m ${segundos % 60}s`}</p>}
        {erro && <p className="text-xs text-rose-300/90">{erro}</p>}
      </div>

      {texto && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-sm font-bold text-foreground">Transcrição <span className="text-muted-foreground font-normal">· {palavras} palavras</span></p>
            <div className="flex items-center gap-1.5">
              <button onClick={copiar} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1">
                {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
              {([['txt', () => baixarTxt(nome, texto)], ['md', () => baixarMd(nome, 'Transcrição', texto)], ['pdf', () => baixarPdf(nome, 'Transcrição', texto)], ['docx', () => baixarDocx(nome, 'Transcrição', texto)]] as [string, () => void][]).map(([ext, fn]) => (
                <button key={ext} onClick={fn} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground/90 hover:bg-white/5 inline-flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> {ext}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{texto}</p>
        </div>
      )}
    </div>
  )
}
