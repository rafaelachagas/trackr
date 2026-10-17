'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, FileText, Copy, Check, Download, Sparkles, Link2, Upload, Mic } from 'lucide-react'
import { baixarTxt, baixarMd, baixarPdf, baixarDocx } from '@/lib/exportDoc'

// Aba 1 do Rastreador de Conteúdos: transcrição rápida. Duas entradas pro mesmo
// motor — link de rede social (yt-dlp extrai o áudio) ou arquivo do seu
// computador (sobe pro Storage e vira URL assinada). O trabalho pesado é da
// VPS, pela rota assíncrona, nos dois casos.

type Modo = 'link' | 'arquivo'

const ACEITA = '.ogg,.opus,.oga,.mp3,.m4a,.wav,.aac,.mp4,.mov,.webm,audio/*,video/*'
// A VPS lê um trabalho por vez e tem 2h de teto; acima disso é melhor avisar
// antes de gastar o envio inteiro.
const TETO_MB = 200

export default function TranscreverPage() {
  const [modo, setModo] = useState<Modo>('link')
  const [url, setUrl] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviado, setEnviado] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [rodando, setRodando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [arrastando, setArrastando] = useState(false)
  const timerRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const ehInstagram = /instagram\.com/i.test(url)
  const pronto = modo === 'link' ? !!url.trim() : !!arquivo

  useEffect(() => () => clearInterval(timerRef.current), [])

  function escolher(f: File | null | undefined) {
    if (!f) return
    if (f.size > TETO_MB * 1024 * 1024) {
      setErro(`${(f.size / 1048576).toFixed(0)}MB é grande demais — o teto aqui é ${TETO_MB}MB.`)
      return
    }
    setErro(null); setTexto(''); setArquivo(f); setEnviado(0)
  }

  /** Sobe o arquivo pro Storage com XHR (o cliente do Supabase não informa
   *  progresso, e um .ogg de 10 min sem barra parece travado). */
  function subir(f: File): Promise<string> {
    return new Promise(async (ok, falha) => {
      const a = await fetch('/api/rastreador/transcrever-arquivo', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: f.name }),
      }).then((r) => r.json())
      if (!a?.signedUrl) return falha(new Error(a?.error || 'Não consegui preparar o envio.'))

      const xhr = new XMLHttpRequest()
      xhr.open('PUT', a.signedUrl, true)
      xhr.setRequestHeader('x-upsert', 'true')
      if (f.type) xhr.setRequestHeader('content-type', f.type)
      xhr.upload.onprogress = (e) => e.lengthComputable && setEnviado(e.loaded / e.total)
      xhr.onload = () => (xhr.status < 300 ? ok(a.caminho) : falha(new Error(`envio falhou (${xhr.status})`)))
      xhr.onerror = () => falha(new Error('envio falhou — conexão caiu'))
      xhr.send(f)
    })
  }

  async function transcrever() {
    if (!pronto || rodando) return
    setRodando(true); setErro(null); setTexto(''); setSegundos(0); setEnviado(0)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000)
    // Guardado pra apagar o arquivo do Storage quando o trabalho terminar.
    let caminho = ''
    try {
      let jobId: string
      if (modo === 'arquivo') {
        setStatus('Enviando o arquivo...')
        caminho = await subir(arquivo!)
        setStatus('Mandando pra VPS...')
        const ini = await fetch('/api/rastreador/transcrever-arquivo', {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ caminho }),
        }).then((r) => r.json())
        if (!ini?.job_id) throw new Error(ini?.error || 'Não consegui iniciar a transcrição.')
        jobId = ini.job_id
      } else {
        setStatus('Enviando pra VPS...')
        const ini = await fetch('/api/rastreador/transcrever-async', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ video_url: url.trim() }),
        }).then((r) => r.json())
        if (!ini?.job_id) throw new Error(ini?.error || 'Não consegui iniciar a transcrição.')
        jobId = ini.job_id
      }
      // Poll do resultado — a fila é a mesma pros dois modos.
      for (;;) {
        await new Promise((res) => setTimeout(res, 3000))
        const j = await fetch(`/api/rastreador/transcrever-async?id=${jobId}`, { cache: 'no-store' }).then((r) => r.json())
        if (j?.status === 'ok') { setTexto(j.texto || '(vazio)'); setStatus(null); break }
        if (j?.status === 'erro') throw new Error(j.erro || 'Falha na transcrição.')
        setStatus(j?.status === 'rodando' ? 'Transcrevendo o áudio...' : j?.status === 'fila' ? 'Na fila...' : 'Processando...')
      }
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setRodando(false); clearInterval(timerRef.current)
      // O arquivo só existia pra VPS poder baixar; deixá-lo lá é storage jogado
      // fora. Falhar aqui não é problema do usuário, então segue calado.
      if (caminho) {
        fetch(`/api/rastreador/transcrever-arquivo?caminho=${encodeURIComponent(caminho)}`,
          { method: 'DELETE' }).catch(() => {})
      }
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
        <p className="text-sm text-muted-foreground mt-1">Cole um link de <b>TikTok</b>, <b>Instagram</b> ou <b>YouTube</b>, ou envie um arquivo do seu computador — inclusive o <b>áudio do WhatsApp</b>.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="inline-flex p-1 rounded-xl bg-background border border-border">
          {([['link', 'Link', Link2], ['arquivo', 'Arquivo', Upload]] as [Modo, string, any][]).map(([m, rotulo, Icone]) => (
            <button key={m} onClick={() => { setModo(m); setErro(null) }} disabled={rodando}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition disabled:opacity-50 ${
                modo === m ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icone className="w-3.5 h-3.5" /> {rotulo}
            </button>
          ))}
        </div>

        {modo === 'link' ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && transcrever()}
              placeholder="https://www.tiktok.com/@perfil/video/..."
              className="flex-1 px-4 py-3 rounded-xl text-sm bg-background border border-border text-foreground focus:border-primary/50 outline-none"
            />
            <button onClick={transcrever} disabled={rodando || !pronto}
              className="px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 transition whitespace-nowrap">
              {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {rodando ? 'Transcrevendo...' : 'Transcrever'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input ref={inputRef} type="file" accept={ACEITA} className="hidden"
              onChange={(e) => escolher(e.target.files?.[0])} />
            <div
              onClick={() => !rodando && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); if (!rodando) escolher(e.dataTransfer.files?.[0]) }}
              className={`rounded-xl border border-dashed px-5 py-7 text-center cursor-pointer transition ${
                arrastando ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'} ${rodando ? 'pointer-events-none opacity-60' : ''}`}>
              {arquivo ? (
                <>
                  <Mic className="w-5 h-5 text-primary mx-auto mb-2" />
                  <p className="text-sm font-bold text-foreground break-all">{arquivo.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{(arquivo.size / 1048576).toFixed(1)} MB · clique pra trocar</p>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground">Arraste o arquivo aqui, ou clique pra escolher</p>
                  <p className="text-[11px] text-muted-foreground mt-1">ogg, opus, mp3, m4a, wav, mp4, mov, webm · até {TETO_MB}MB</p>
                </>
              )}
            </div>
            <button onClick={transcrever} disabled={rodando || !pronto}
              className="w-full px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 transition">
              {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {rodando ? 'Transcrevendo...' : 'Transcrever'}
            </button>
            {rodando && enviado > 0 && enviado < 1 && (
              <div className="h-1 rounded-full bg-background overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${enviado * 100}%` }} />
              </div>
            )}
          </div>
        )}

        {modo === 'link' && ehInstagram && (
          <p className="text-[11px] text-muted-foreground">Instagram usa a conta já conectada em <b>Rastreador de Conteúdos</b> — não precisa colar nada. TikTok e YouTube funcionam soltos.</p>
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
