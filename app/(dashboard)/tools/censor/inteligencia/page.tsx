'use client'

// Inteligência do Editor de Censura — onde a análise aprende (ver
// lib/censura-inteligencia.ts). Visual provisório: vai ser refeito junto com o
// resto da plataforma.

import { useCallback, useEffect, useState, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Brain, Check, X, Loader2, RefreshCw, Trophy, ShieldAlert, MessageSquare, FileText, Sparkles } from 'lucide-react'
import { BIBLIOTECA } from '@/lib/censura-riscos'

interface Painel {
  faltaSql?: boolean
  error?: string
  porDecisao: Record<string, number>
  total: number
  sugestoes: { trecho: string; risco: number; falso: number; motivo?: string }[]
  falsos: { trecho: string; risco: number; falso: number }[]
  observacoes: { trecho: string; motivo: string; politica?: string; gravidade?: string; contexto?: string; criado: string }[]
  contagem: { reprovados: number; aprovados: number; analisados: number; naFila: number; semMidia: number }
  politicas: [string, number][]
  reprovados: { ad_id: string; nome: string; conta: string; etapa: string; erro?: string; motivo: string; trechos: { trecho: string; motivo?: string; gravidade?: string }[] }[]
  propostas: { id: string; numero: number; tipo: string; resumo: string; motivo?: string; status: string; criado: string }[]
  placares: { id: string; criado: string; motivo: string; status: string; acertos: number; total: number; casos: unknown[]; resultados: { ad_id: string; nome?: string; real: string; previsto: string; trechos: string[] }[] }[]
}

const dataBR = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function InteligenciaCensura() {
  const [p, setP] = useState<Painel | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [politica, setPolitica] = useState('')
  const [catSug, setCatSug] = useState<Record<string, string>>({})
  const [progresso, setProgresso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const j = await fetch('/api/censura/inteligencia', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    setP(j)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function acao(nome: string, corpo: Record<string, unknown>, ok?: (j: any) => string) {
    setOcupado(nome); setAviso(null)
    try {
      const j = await fetch('/api/censura/inteligencia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }).then((r) => r.json())
      if (j.error) throw new Error(j.error)
      if (ok) setAviso(ok(j))
      await carregar()
      return j
    } catch (e) { setAviso(`❌ ${e instanceof Error ? e.message : e}`) } finally { setOcupado(null) }
  }

  async function rodarPlacar() {
    const j = await acao('placar', { acao: 'placar_iniciar' })
    if (!j?.id) return
    setOcupado('placar')
    try {
      for (let i = 0; i < 30; i++) {
        const r = await fetch('/api/censura/inteligencia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'placar_passo', id: j.id }) }).then((x) => x.json())
        if (r.error) throw new Error(r.error)
        setProgresso(`${r.feitos}/${r.total} casos`)
        if (r.status !== 'rodando') break
      }
    } catch (e) { setAviso(`❌ ${e instanceof Error ? e.message : e}`) }
    setOcupado(null); setProgresso(null); carregar()
  }

  if (!p) return <div className="p-8 text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
  if (p.faltaSql) return (
    <div className="max-w-2xl mx-auto p-8 space-y-3">
      <Voltar />
      <h1 className="text-xl font-bold">Falta criar as tabelas</h1>
      <p className="text-sm text-muted-foreground">Rode o arquivo <code>supabase_censura_inteligencia.sql</code> no SQL Editor do Supabase e recarregue esta página.</p>
    </div>
  )
  if (p.error) return <div className="p-8 text-sm text-rose-300">{p.error}</div>

  const pendentes = p.propostas.filter((x) => x.status === 'pendente')
  const decididas = p.propostas.filter((x) => x.status !== 'pendente').slice(0, 12)
  const ultimo = p.placares.find((x) => x.status === 'pronto')
  const anterior = p.placares.filter((x) => x.status === 'pronto')[1]
  const ed = (k: string) => p.porDecisao[`editor:${k}`] || 0

  return (
    <div className="max-w-[1200px] mx-auto py-2 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Voltar />
        <h1 className="text-lg font-bold inline-flex items-center gap-2"><Brain className="w-5 h-5 text-primary" /> Inteligência da Censura</h1>
        <button onClick={carregar} className="ml-auto h-8 px-3 rounded-lg border border-border text-xs inline-flex items-center gap-1.5 hover:bg-white/5"><RefreshCw className="w-3.5 h-3.5" /> Atualizar</button>
      </div>
      {aviso && <p className="text-xs rounded-lg border border-border px-3 py-2">{aviso}</p>}

      <div className="grid sm:grid-cols-3 gap-3">
        <Numero titulo="Aprendeu com você" valor={p.total ? String(Object.entries(p.porDecisao).filter(([k]) => k.startsWith('editor:')).reduce((a, [, v]) => a + v, 0)) : '0'}
          sub={`${ed('risco') + ed('contexto') + ed('censurou')} riscos · ${ed('nao_risco') + ed('liberou')} alarmes falsos · ${p.observacoes.length} observações`} />
        <Numero titulo="Anúncios da Meta" valor={`${p.contagem.reprovados} reprovados`}
          sub={`${p.contagem.aprovados} aprovados · ${p.contagem.analisados} analisados · ${p.contagem.naFila} na fila`} />
        <Numero titulo="Placar" valor={ultimo ? `${ultimo.acertos}/${ultimo.total}` : '—'}
          sub={ultimo ? `${Math.round(100 * ultimo.acertos / Math.max(1, ultimo.total))}% de acerto${anterior ? ` · antes ${anterior.acertos}/${anterior.total}` : ''}` : 'Ainda não rodou'} />
      </div>

      <Bloco titulo={`Propostas do revisor${pendentes.length ? ` · ${pendentes.length} ${pendentes.length === 1 ? 'pendente' : 'pendentes'}` : ''}`} icone={<Sparkles className="w-4 h-4" />}
        extra={<>
          {pendentes.length > 1 && <Botao onClick={() => acao('dec', { acao: 'decidir', numeros: 'tudo', aprovar: true }, (j) => `✅ ${j.feitas} aprovadas.`)} carregando={ocupado === 'dec'}>Aprovar tudo</Botao>}
          <Botao onClick={() => acao('gerar', { acao: 'gerar' }, (j) => j.propostas ? `🧠 ${j.propostas} propostas novas.` : '🧠 O revisor não achou nada com evidência suficiente.')} carregando={ocupado === 'gerar'}>Rodar revisor agora</Botao>
        </>}>
        <p className="text-[11px] text-muted-foreground mb-2">Toda segunda às 9h o revisor lê a semana e manda as propostas no seu WhatsApp. Responda “aprovar 1 3”, “aprovar tudo” ou “recusar 2”. Nada muda sem você aprovar.</p>
        {pendentes.length ? pendentes.map((x) => (
          <div key={x.id} className="flex items-start gap-3 py-2 border-t border-border">
            <span className="text-xs font-bold text-primary w-6">{x.numero}.</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{x.resumo}</p>
              {x.motivo && <p className="text-[11px] text-muted-foreground">{x.motivo}</p>}
            </div>
            <button onClick={() => acao('dec', { acao: 'decidir', numeros: [x.numero], aprovar: true })} className="h-7 px-2 rounded-md bg-emerald-500/15 text-emerald-300 text-xs inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Aprovar</button>
            <button onClick={() => acao('dec', { acao: 'decidir', numeros: [x.numero], aprovar: false })} className="h-7 px-2 rounded-md bg-white/5 text-muted-foreground text-xs inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Recusar</button>
          </div>
        )) : <p className="text-xs text-muted-foreground">Nenhuma proposta pendente.</p>}
        {decididas.length > 0 && (
          <details className="mt-2"><summary className="text-[11px] text-muted-foreground cursor-pointer">Histórico</summary>
            {decididas.map((x) => <p key={x.id} className="text-[11px] text-muted-foreground py-0.5">{x.status === 'aprovada' ? '✅' : '❌'} {x.numero}. {x.resumo} · {dataBR(x.criado)}</p>)}
          </details>
        )}
      </Bloco>

      <Bloco titulo="Placar" icone={<Trophy className="w-4 h-4" />}
        extra={<Botao onClick={rodarPlacar} carregando={ocupado === 'placar'}>{progresso || 'Rodar placar agora'}</Botao>}>
        <p className="text-[11px] text-muted-foreground mb-2">Pega até 20 anúncios reprovados e 20 aprovados pela Meta e pergunta pra inteligência atual se cada um seria reprovado. Roda sozinho toda vez que você aprova propostas. Leva uns minutos.</p>
        {p.placares.length ? p.placares.map((x) => (
          <div key={x.id} className="text-xs py-1 border-t border-border flex gap-3">
            <span className="text-muted-foreground w-28">{dataBR(x.criado)}</span>
            <b>{x.status === 'pronto' ? `${x.acertos}/${x.total}` : `rodando ${x.resultados.length}/${x.casos.length}`}</b>
            <span className="text-muted-foreground">{x.motivo}</span>
          </div>
        )) : <p className="text-xs text-muted-foreground">Ainda não rodou. Precisa de anúncios da Meta analisados (o robô faz sozinho a cada 30 min).</p>}
        {ultimo && ultimo.resultados.some((r) => r.previsto !== r.real && r.previsto !== 'erro') && (
          <details className="mt-2"><summary className="text-[11px] text-muted-foreground cursor-pointer">Onde errou no último</summary>
            {ultimo.resultados.filter((r) => r.previsto !== r.real && r.previsto !== 'erro').map((r) => (
              <p key={r.ad_id} className="text-[11px] py-0.5">{r.real === 'reprovado' ? '🔴 Meta reprovou, a IA deixou passar' : '🟡 Meta aprovou, a IA barraria'}: <b>{r.nome}</b>{r.trechos.length ? ` · ${r.trechos.map((t) => `“${t}”`).join(', ')}` : ''}</p>
            ))}
          </details>
        )}
      </Bloco>

      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Sugestões pra biblioteca" icone={<Sparkles className="w-4 h-4" />}>
          <p className="text-[11px] text-muted-foreground mb-2">Trechos que você (ou a Meta) marcou 3+ vezes e que a biblioteca ainda não pega.</p>
          {p.sugestoes.length ? p.sugestoes.map((s) => (
            <div key={s.trecho} className="flex items-center gap-2 py-1.5 border-t border-border">
              <div className="flex-1 min-w-0"><p className="text-sm">“{s.trecho}” <span className="text-[11px] text-muted-foreground">· {s.risco}x</span></p>{s.motivo && <p className="text-[11px] text-muted-foreground truncate">{s.motivo}</p>}</div>
              <select value={catSug[s.trecho] || ''} onChange={(e) => setCatSug({ ...catSug, [s.trecho]: e.target.value })} className="h-7 rounded-md bg-background border border-border text-[11px] px-1">
                <option value="">Categoria…</option>
                {BIBLIOTECA.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <button disabled={!catSug[s.trecho]} onClick={() => acao('add', { acao: 'adicionar_termo', categoria: catSug[s.trecho], termo: s.trecho }, () => `✅ “${s.trecho}” entrou na biblioteca.`)} className="h-7 px-2 rounded-md bg-primary text-white text-xs disabled:opacity-40">Adicionar</button>
            </div>
          )) : <p className="text-xs text-muted-foreground">Nada ainda. Aparece conforme você usa o editor.</p>}
          {p.falsos.length > 0 && <>
            <p className="text-[11px] font-semibold mt-3 mb-1">Alarmes falsos (você liberou 3+ vezes)</p>
            {p.falsos.map((s) => (
              <div key={s.trecho} className="flex items-center gap-2 py-1 border-t border-border">
                <p className="text-sm flex-1">“{s.trecho}” <span className="text-[11px] text-muted-foreground">· liberado {s.falso}x</span></p>
                <button onClick={() => acao('rem', { acao: 'remover_termo', termo: s.trecho }, () => `✅ “${s.trecho}” saiu da biblioteca.`)} className="h-7 px-2 rounded-md bg-white/5 text-xs">Tirar da biblioteca</button>
              </div>
            ))}
          </>}
        </Bloco>

        <Bloco titulo="Suas observações" icone={<MessageSquare className="w-4 h-4" />}>
          <p className="text-[11px] text-muted-foreground mb-2">O que você ensinou pelo botão direito → “Marcar com observação”. A IA recebe isso em toda análise.</p>
          {p.observacoes.length ? p.observacoes.map((o, i) => (
            <div key={i} className="py-1.5 border-t border-border">
              <p className="text-sm">“{o.trecho}” {o.politica && <span className="text-[11px] text-muted-foreground">· {o.politica}</span>}</p>
              <p className="text-[11px] text-muted-foreground">{o.motivo}</p>
            </div>
          )) : <p className="text-xs text-muted-foreground">Nenhuma ainda.</p>}
        </Bloco>
      </div>

      <Bloco titulo="Reprovações reais da Meta" icone={<ShieldAlert className="w-4 h-4" />}
        extra={<Botao onClick={() => acao('meta', { acao: 'buscar_meta' }, (j) => `🔎 ${j.contas} contas · ${j.novos} anúncios novos na fila.`)} carregando={ocupado === 'meta'}>Buscar agora</Botao>}>
        <p className="text-[11px] text-muted-foreground mb-2">A cada 30 min o robô pega os reprovados das suas contas, transcreve o vídeo e acha o trecho culpado lendo o motivo da Meta. Os aprovados mostram o que passa.</p>
        {p.politicas.length > 0 && <p className="text-[11px] mb-2"><b>Mais reprovaram:</b> {p.politicas.map(([n, q]) => `${n} (${q})`).join(' · ')}</p>}
        {p.reprovados.length ? p.reprovados.map((c) => (
          <div key={c.ad_id} className="py-2 border-t border-border">
            <p className="text-sm font-semibold">{c.nome} <span className="text-[11px] font-normal text-muted-foreground">· {c.conta} · {c.etapa === 'analisado' ? 'analisado' : c.etapa === 'sem_midia' ? 'sem vídeo/texto' : 'na fila'}</span></p>
            {c.motivo && <p className="text-[11px] text-rose-200/80 whitespace-pre-line">{c.motivo.slice(0, 300)}</p>}
            {c.trechos.length > 0 && <p className="text-[11px] mt-0.5">Culpados: {c.trechos.map((t) => `“${t.trecho}”`).join(', ')}</p>}
            {c.erro && c.etapa !== 'analisado' && <p className="text-[10px] text-muted-foreground">({c.erro})</p>}
          </div>
        )) : <p className="text-xs text-muted-foreground">Nenhum reprovado encontrado ainda.</p>}
      </Bloco>

      <Bloco titulo="Atualizar política" icone={<FileText className="w-4 h-4" />}
        extra={<Botao onClick={() => acao('pol', { acao: 'politica', texto: politica }, (j) => { setPolitica(''); return `🧠 ${j.propostas} propostas geradas a partir da política.` })} carregando={ocupado === 'pol'}>Gerar propostas</Botao>}>
        <p className="text-[11px] text-muted-foreground mb-2">A Meta proíbe robô lendo as páginas de política, então quando sair uma regra nova, cole o texto aqui. O revisor compara com a biblioteca e propõe as mudanças.</p>
        <textarea value={politica} onChange={(e) => setPolitica(e.target.value)} rows={5} placeholder="Cole aqui o texto da política da Meta…"
          className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border outline-none focus:border-primary/60 resize-y" />
      </Bloco>
    </div>
  )
}

function Voltar() {
  return <Link href="/tools/censor" className="h-8 px-3 rounded-lg border border-border text-xs inline-flex items-center gap-1.5 hover:bg-white/5"><ArrowLeft className="w-3.5 h-3.5" /> Editor</Link>
}

function Numero({ titulo, valor, sub }: { titulo: string; valor: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{titulo}</p>
      <p className="text-2xl font-bold mt-1">{valor}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  )
}

function Bloco({ titulo, icone, extra, children }: { titulo: string; icone: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-primary">{icone}</span>
        <h2 className="text-sm font-bold">{titulo}</h2>
        <div className="ml-auto flex gap-2">{extra}</div>
      </div>
      {children}
    </section>
  )
}

function Botao({ onClick, carregando, children }: { onClick: () => void; carregando?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={carregando} className="h-8 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
      {carregando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{children}
    </button>
  )
}
