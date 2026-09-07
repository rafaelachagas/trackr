'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Loader2, QrCode, RefreshCw, Smartphone, CheckCircle2, AlertTriangle } from 'lucide-react'

type Estado = 'open' | 'connecting' | 'close' | 'desconhecido' | null

const card: React.CSSProperties = { backgroundColor: '#13181a', border: '1px solid rgba(255,255,255,0.05)' }

const BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: 'Conectado', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  connecting: { label: 'Conectando…', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  close: { label: 'Desconectado', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
  desconhecido: { label: 'Desconhecido', cls: 'text-muted-foreground bg-white/5 border-border' },
}

export default function ConexaoWhatsapp() {
  const [estado, setEstado] = useState<Estado>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [pairing, setPairing] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qrRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function buscarStatus(): Promise<Estado> {
    try {
      const j = await fetch('/api/whatsapp/conexao', { cache: 'no-store' }).then((r) => r.json())
      const st = (j.state ?? 'desconhecido') as Estado
      setEstado(st)
      return st
    } catch { setEstado('desconhecido'); return 'desconhecido' }
  }

  async function gerarQr() {
    setCarregando(true); setErro(null); setQr(null); setPairing(null)
    try {
      const j = await fetch('/api/whatsapp/conexao', { method: 'POST' }).then((r) => r.json())
      if (j.state === 'open') { setEstado('open'); pararTimers(); return }
      if (j.error) { setErro(j.error); return }
      setQr(j.base64 || null); setPairing(j.pairingCode || null)
      setEstado('connecting')
      iniciarTimers()
    } catch (e: any) { setErro(e.message) } finally { setCarregando(false) }
  }

  function pararTimers() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (qrRef.current) { clearInterval(qrRef.current); qrRef.current = null }
  }
  function iniciarTimers() {
    pararTimers()
    // Verifica o status a cada 3s; ao conectar, encerra e limpa o QR.
    pollRef.current = setInterval(async () => {
      const st = await buscarStatus()
      if (st === 'open') { pararTimers(); setQr(null); setPairing(null) }
    }, 3000)
    // O QR do WhatsApp expira rápido — renova a cada 30s enquanto não conecta.
    qrRef.current = setInterval(() => { gerarQr() }, 30000)
  }

  useEffect(() => { buscarStatus(); return () => pararTimers() }, [])

  const b = BADGE[estado ?? 'desconhecido'] || BADGE.desconhecido

  return (
    <div className="rounded-2xl p-5" style={card}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-bold flex items-center gap-2"><Smartphone className="w-4 h-4 text-primary" /> Conexão do WhatsApp</h2>
        <div className="flex items-center gap-2">
          {estado === null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            : <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${b.cls}`}>{b.label}</span>}
          <button onClick={() => buscarStatus()} title="Atualizar status" className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Instância <b>thetrack</b>. Se o bot parar de responder (<code>/criativos</code>, relatórios), a sessão caiu — gere um QR e reconecte.</p>

      {estado === 'open' && !qr && (
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="w-5 h-5" /> Tudo certo — o bot está conectado e respondendo.</div>
      )}

      {estado !== 'open' && (
        <div className="mt-4">
          {!qr && (
            <button onClick={gerarQr} disabled={carregando}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:opacity-90 disabled:opacity-50">
              {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Gerar QR pra reconectar
            </button>
          )}

          {qr && (
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR de conexão do WhatsApp" className="w-52 h-52 rounded-xl bg-white p-2 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">Como reconectar:</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>No celular, abra o <b>WhatsApp</b>.</li>
                  <li>Vá em <b>Configurações → Aparelhos conectados</b>.</li>
                  <li>Toque em <b>Conectar um aparelho</b> e aponte pro QR.</li>
                </ol>
                {pairing && <p className="text-xs">Ou use o código de pareamento: <b className="text-foreground tracking-widest">{pairing}</b></p>}
                <p className="text-[11px] text-muted-foreground/70 inline-flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> O QR renova sozinho a cada 30s. Assim que conectar, isto some.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {erro && <div className="mt-3 text-xs text-rose-300 inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {erro}</div>}
    </div>
  )
}
