'use client'

import { useRef, useState } from 'react'
import { AudioLines, Loader2, UploadCloud, Download, RotateCcw, Film } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Camuflagem de áudio: sobe um .mp4, ajusta os efeitos nos sliders e baixa o
// arquivo com o áudio reprocessado (vídeo intacto). O upload vai DIRETO pro
// Supabase Storage (HTTPS, sem passar pelo Vercel); a VPS baixa de lá, roda o
// ffmpeg e sobe o resultado; aqui a gente baixa o final.

type Efeito = {
  chave: keyof typeof PADRAO
  label: string
  min: number
  max: number
  step: number
  sufixo?: string
  desc: string
}

const PADRAO = {
  pitch_steps: 2.5,
  time_stretch: 0.97,
  noise_volume: 0.0,
  eq_gain_db: -6,
  reverb_wet: 0.0,
}

const EFEITOS: Efeito[] = [
  { chave: 'pitch_steps', label: 'Pitch', min: -6, max: 6, step: 0.1, sufixo: ' semitons', desc: 'Sobe ou desce o tom da voz' },
  { chave: 'time_stretch', label: 'Velocidade', min: 0.85, max: 1.15, step: 0.01, sufixo: '×', desc: 'Acelera ou desacelera o áudio' },
  { chave: 'noise_volume', label: 'Ruído de fundo', min: 0, max: 0.3, step: 0.01, desc: 'Chiado branco por cima do áudio' },
  { chave: 'eq_gain_db', label: 'EQ médias (1–4kHz)', min: -12, max: 12, step: 1, sufixo: ' dB', desc: 'Realça ou corta a faixa da voz' },
  { chave: 'reverb_wet', label: 'Eco / reverb', min: 0, max: 0.4, step: 0.01, desc: 'Cauda de eco no áudio' },
]

export default function AudioCamouflagePage() {
  const [file, setFile] = useState<File | null>(null)
  const [valores, setValores] = useState({ ...PADRAO })
  const [rodando, setRodando] = useState(false)
  const [fase, setFase] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function escolher(f: File | null) {
    setErro(null); setDownload(null)
    if (!f) return
    if (!/\.mp4$/i.test(f.name) && f.type !== 'video/mp4') { setErro('Envie um arquivo .mp4.'); return }
    setFile(f)
  }

  function setVal(chave: keyof typeof PADRAO, v: number) {
    setValores((s) => ({ ...s, [chave]: v }))
    setDownload(null)
  }

  async function processar() {
    if (!file || rodando) return
    setRodando(true); setErro(null); setDownload(null)
    try {
      setFase('Enviando vídeo...')
      const sign = await fetch('/api/audio-camouflage/sign-upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name }),
      }).then((r) => r.json())
      if (sign.error) throw new Error(sign.error)

      const up = await supabase.storage.from('camuflagem').uploadToSignedUrl(sign.path, sign.token, file, { contentType: 'video/mp4' })
      if (up.error) throw new Error('falha ao enviar o vídeo: ' + up.error.message)

      setFase('Processando áudio no servidor...')
      const proc = await fetch('/api/audio-camouflage', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inputPath: sign.inputPath, originalName: file.name, params: valores }),
      }).then((r) => r.json())
      if (proc.error) throw new Error(proc.error)

      setDownload({ url: proc.url, name: proc.downloadName })
      // dispara o download automaticamente
      const a = document.createElement('a')
      a.href = proc.url; a.download = proc.downloadName
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e: any) {
      setErro(e.message || 'Falha no processamento.')
    } finally {
      setRodando(false); setFase(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 py-2">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          <AudioLines className="w-6 h-6 text-primary" /> Camuflagem de Áudio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Suba um <b>.mp4</b>, ajuste os efeitos e baixe o vídeo com o áudio reprocessado — a imagem fica intacta.</p>
      </div>

      {/* Drop zone */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0] || null) }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${arrastando ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
        >
          <input ref={inputRef} type="file" accept="video/mp4,.mp4" className="hidden"
            onChange={(e) => escolher(e.target.files?.[0] || null)} />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-foreground">
              <Film className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold truncate max-w-[70%]">{file.name}</span>
              <span className="text-xs text-muted-foreground">· {(file.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <UploadCloud className="w-7 h-7 mx-auto mb-1.5 text-primary/70" />
              <p className="text-sm font-medium text-foreground/90">Arraste o .mp4 aqui ou clique pra escolher</p>
            </div>
          )}
        </div>

        {/* Sliders */}
        <div className="space-y-4 pt-1">
          {EFEITOS.map((ef) => {
            const v = valores[ef.chave]
            const casas = ef.step < 1 ? (ef.step <= 0.01 ? 2 : 1) : 0
            return (
              <div key={ef.chave}>
                <div className="flex items-baseline justify-between mb-1">
                  <label className="text-sm font-semibold text-foreground">{ef.label}
                    <span className="text-xs text-muted-foreground font-normal"> · {ef.desc}</span>
                  </label>
                  <span className="text-sm font-bold text-primary tabular-nums">{v.toFixed(casas)}{ef.sufixo || ''}</span>
                </div>
                <input type="range" min={ef.min} max={ef.max} step={ef.step} value={v}
                  onChange={(e) => setVal(ef.chave, parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer" />
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={processar} disabled={!file || rodando}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-primary text-white hover:opacity-90 disabled:opacity-50 transition">
            {rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <AudioLines className="w-4 h-4" />}
            {rodando ? (fase || 'Processando...') : 'Processar'}
          </button>
          <button onClick={() => setValores({ ...PADRAO })} disabled={rodando}
            title="Voltar aos valores padrão"
            className="px-3 py-3 rounded-xl text-sm font-semibold border border-border text-foreground/90 hover:bg-white/5 disabled:opacity-50 inline-flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {fase && <p className="text-xs text-primary/90 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {fase}</p>}
        {erro && <p className="text-xs text-rose-300/90">{erro}</p>}

        {download && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-emerald-300/90 font-medium">Pronto! O download começou.</p>
            <a href={download.url} download={download.name}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:opacity-90 inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Baixar de novo
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
