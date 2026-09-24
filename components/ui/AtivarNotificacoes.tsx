'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Check, Loader2, Share, AlertTriangle } from 'lucide-react'

// Liga a notificação push deste aparelho no app instalado.
//
// No iPhone só funciona com o app ADICIONADO À TELA DE INÍCIO (a Apple não
// entrega push pra site aberto no Safari) — por isso o passo a passo aparece
// quando detectamos iOS fora do modo instalado.

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function nomeDoAparelho(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Aparelho'
}

export default function AtivarNotificacoes() {
  const [suportado, setSuportado] = useState(true)
  const [instalado, setInstalado] = useState(true)
  const [ehIOS, setEhIOS] = useState(false)
  const [ligado, setLigado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aparelhos, setAparelhos] = useState(0)
  const [configurado, setConfigurado] = useState(true)

  const atualizar = useCallback(async () => {
    try {
      const j = await fetch('/api/push', { cache: 'no-store' }).then((r) => r.json())
      setConfigurado(!!j.configurado)
      setAparelhos(j.aparelhos ?? 0)
    } catch { /* silencioso: o botão continua funcionando */ }
  }, [])

  useEffect(() => {
    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/.test(ua)
    setEhIOS(ios)
    // "Instalado" = rodando pelo ícone da tela de início, não numa aba.
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true
    setInstalado(standalone)
    setSuportado('serviceWorker' in navigator && 'PushManager' in window)

    navigator.serviceWorker?.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription()
      setLigado(!!sub)
    }).catch(() => {})
    atualizar()
  }, [atualizar])

  async function ligar() {
    setOcupado(true); setErro(null); setMsg(null)
    try {
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!chave) throw new Error('as chaves de notificação não estão configuradas no servidor')

      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') {
        throw new Error(permissao === 'denied'
          ? 'você bloqueou as notificações — libere nos ajustes do aparelho e tente de novo'
          : 'permissão não concedida')
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(chave),
      })
      const j = await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), aparelho: nomeDoAparelho() }),
      }).then((r) => r.json())
      if (j.error) throw new Error(j.error)

      setLigado(true)
      setMsg('Notificações ligadas neste aparelho.')
      atualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : `${e}`)
    } finally { setOcupado(false) }
  }

  async function desligar() {
    setOcupado(true); setErro(null); setMsg(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setLigado(false)
      setMsg('Notificações desligadas neste aparelho.')
      atualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : `${e}`)
    } finally { setOcupado(false) }
  }

  async function testar() {
    setOcupado(true); setErro(null); setMsg(null)
    try {
      const j = await fetch('/api/push', { method: 'PUT' }).then((r) => r.json())
      setMsg(j.enviados > 0
        ? `Teste enviado pra ${j.enviados} aparelho(s). Deve chegar em segundos.`
        : 'Nenhum aparelho inscrito ainda.')
    } catch (e) {
      setErro(`${e}`)
    } finally { setOcupado(false) }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-primary" /> Notificações no celular
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Alertas de criativo caindo, gasto fora da curva e páginas dos concorrentes chegam como
            notificação do app. {aparelhos > 0 && `${aparelhos} aparelho(s) recebendo.`}
          </p>
        </div>
        {ligado && <span className="text-[11px] text-emerald-300 inline-flex items-center gap-1 shrink-0">
          <Check className="w-3 h-3" /> ligado aqui</span>}
      </div>

      {!configurado && (
        <p className="text-xs text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          As chaves de notificação ainda não foram configuradas no servidor.
        </p>
      )}

      {ehIOS && !instalado && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Share className="w-3.5 h-3.5 text-primary" /> No iPhone, instale o app antes
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            A Apple só entrega notificação pro app instalado. No Safari, toque em
            <b> Compartilhar</b> → <b>Adicionar à Tela de Início</b>, depois abra o The Track
            pelo ícone e volte aqui pra ligar.
          </p>
        </div>
      )}

      {!suportado && (
        <p className="text-xs text-muted-foreground">Este navegador não suporta notificações push.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={ligado ? desligar : ligar} disabled={ocupado || !suportado}
          className={`rounded-lg px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 ${
            ligado ? 'border border-border hover:bg-muted text-foreground' : 'bg-primary hover:opacity-90 text-white'
          }`}>
          {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : ligado ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          {ligado ? 'Desligar neste aparelho' : 'Ligar neste aparelho'}
        </button>
        {ligado && (
          <button onClick={testar} disabled={ocupado}
            className="rounded-lg px-3 py-2 text-xs font-bold border border-border hover:bg-muted disabled:opacity-50">
            Enviar teste
          </button>
        )}
      </div>

      {msg && <p className="text-xs text-emerald-300">{msg}</p>}
      {erro && <p className="text-xs text-rose-300 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}</p>}
    </div>
  )
}
