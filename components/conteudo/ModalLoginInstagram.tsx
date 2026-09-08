'use client'

import { useState } from 'react'
import { X, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { conectarInstagramNavegador, confirmarCodigoInstagram } from '@/app/actions/conteudo'

// Tela de "Conectar Instagram" com o visual FAMILIAR do login do Instagram,
// mas claramente identificada como The Track (não é um clone enganoso). O
// usuário digita @+senha da conta dedicada; o servidor loga por navegador e
// extrai a sessão. Senha não é guardada.
export default function ModalLoginInstagram({ onClose, onConectado }: { onClose: () => void; onConectado: () => void }) {
  const [etapa, setEtapa] = useState<'form' | 'codigo'>('form')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [tipo, setTipo] = useState<string>('2fa')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrar() {
    if (!user.trim() || !pass || carregando) return
    setCarregando(true); setErro(null)
    const r = await conectarInstagramNavegador(user, pass)
    setCarregando(false)
    if (r.success) { onConectado(); return }
    if (r.needsCode && r.token) { setToken(r.token); setTipo(r.tipo || '2fa'); setEtapa('codigo'); return }
    setErro(r.error || 'Não consegui conectar.')
  }
  async function confirmar() {
    if (!code.trim() || carregando) return
    setCarregando(true); setErro(null)
    const r = await confirmarCodigoInstagram(token, code.trim())
    setCarregando(false)
    if (r.success) { onConectado(); return }
    setErro(r.error || 'Código não confirmou.')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#fff' }} onClick={(e) => e.stopPropagation()}>
        {/* faixa The Track (deixa claro que é o nosso conector, não o Instagram) */}
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#0a0f16' }}>
          <span className="text-[11px] font-bold tracking-widest uppercase text-white/90 inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-[#60a5fa]" /> The Track · Conectar Instagram</span>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-8 py-7" style={{ color: '#262626' }}>
          <div className="text-center mb-5">
            <div style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 40, lineHeight: 1, color: '#262626' }}>Instagram</div>
          </div>

          {etapa === 'form' ? (
            <>
              <div className="space-y-2">
                <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Nome de usuário" autoComplete="off"
                  className="w-full text-sm rounded-[8px] px-3 py-2.5 outline-none" style={{ background: '#fafafa', border: '1px solid #dbdbdb' }} />
                <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="Senha" autoComplete="new-password"
                  onKeyDown={(e) => { if (e.key === 'Enter') entrar() }}
                  className="w-full text-sm rounded-[8px] px-3 py-2.5 outline-none" style={{ background: '#fafafa', border: '1px solid #dbdbdb' }} />
              </div>
              <button onClick={entrar} disabled={carregando || !user.trim() || !pass}
                className="w-full mt-3 rounded-[8px] py-2 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: '#0095F6' }}>
                {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Entrar
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] text-center mb-3" style={{ color: '#555' }}>
                O Instagram enviou um <b>código de verificação</b> ({tipo === 'checkpoint' ? 'e-mail/SMS' : 'app autenticador'}). Digite abaixo pra concluir.
              </p>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" inputMode="numeric" autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') confirmar() }}
                className="w-full text-sm rounded-[8px] px-3 py-2.5 outline-none text-center tracking-[0.3em]" style={{ background: '#fafafa', border: '1px solid #dbdbdb' }} />
              <button onClick={confirmar} disabled={carregando || !code.trim()}
                className="w-full mt-3 rounded-[8px] py-2 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: '#0095F6' }}>
                {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Confirmar
              </button>
            </>
          )}

          {erro && <p className="text-[12px] mt-3 text-center" style={{ color: '#ed4956' }}>{erro}</p>}

          <p className="text-[10.5px] mt-5 text-center leading-relaxed inline-flex items-start gap-1.5" style={{ color: '#8e8e8e' }}>
            <Lock className="w-3 h-3 mt-0.5 shrink-0" /> Use uma <b>conta dedicada</b> (não a principal). O login é feito pelo servidor do The Track pra gerar a sessão — <b>a senha não é guardada</b>.
          </p>
        </div>
      </div>
    </div>
  )
}
