'use client'

import { useEffect, useMemo, useState } from 'react'
import { ListTodo, Plus, Loader2, X, Pencil, Trash2, Check } from 'lucide-react'
import { listarAfazeres, adicionarAfazer, atualizarAfazer, alternarAfazer, removerAfazer, type Afazer, type SecaoAfazer, type PrioridadeAfazer } from '@/app/actions/afazeres'

const SECOES: { key: SecaoAfazer; num: string; titulo: string; intro: string; prioPadrao: PrioridadeAfazer }[] = [
  { key: 'urgente', num: 'I', titulo: 'Urgente — esta semana', intro: 'O que trava outras coisas se não sair. Se o dia render pouco, é aqui que ele deve render.', prioPadrao: 'alta' },
  { key: 'andamento', num: 'II', titulo: 'Em andamento', intro: 'Já começou e precisa de continuidade. O risco aqui é ficar parado no meio.', prioPadrao: 'media' },
  { key: 'planejado', num: 'III', titulo: 'Planejado — próximas semanas', intro: 'Definido, mas ainda não é hora. Fica visível para não virar surpresa.', prioPadrao: 'baixa' },
  { key: 'rotina', num: 'IV', titulo: 'Rotina e manutenção', intro: 'O que se repete. Não é progresso, mas é o que impede retrabalho.', prioPadrao: 'rotina' },
]
const PRIOS: Record<PrioridadeAfazer, { label: string; tone: string; tag: string }> = {
  alta: { label: 'Alta', tone: 'var(--crit, #f87171)', tag: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
  media: { label: 'Média', tone: 'var(--warn, #fbbf24)', tag: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  baixa: { label: 'Baixa', tone: 'var(--primary, #3b82f6)', tag: 'text-blue-300 border-blue-500/30 bg-blue-500/10' },
  rotina: { label: 'Rotina', tone: 'transparent', tag: 'text-muted-foreground border-border bg-white/5' },
}
const PRIO_TONE = (p: PrioridadeAfazer) => p === 'alta' ? '#f87171' : p === 'media' ? '#fbbf24' : p === 'baixa' ? '#3b82f6' : 'transparent'

type FormState = { id?: string; titulo: string; descricao: string; secao: SecaoAfazer; prioridade: PrioridadeAfazer; prazo: string }
const FORM_VAZIO: FormState = { titulo: '', descricao: '', secao: 'urgente', prioridade: 'alta', prazo: '' }

export default function AfazeresPage() {
  const [itens, setItens] = useState<Afazer[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { (async () => { const r = await listarAfazeres(); if (r.success) setItens(r.data); setLoading(false) })() }, [])

  const total = itens.length
  const feitos = useMemo(() => itens.filter((i) => i.feito).length, [itens])
  const pct = total ? Math.round((feitos / total) * 100) : 0
  const nota = feitos === 0 ? 'Nada concluído ainda. Comece pelo que está marcado como alta prioridade.'
    : feitos === total ? 'Tudo concluído. Bom trabalho — hora de repopular a lista.'
      : `${pct}% concluído. Restam ${total - feitos} afazer${total - feitos > 1 ? 'es' : ''}.`

  async function toggle(id: string) {
    setItens((xs) => xs.map((x) => x.id === id ? { ...x, feito: !x.feito } : x)) // otimista
    const r = await alternarAfazer(id); if (r.success) setItens(r.data)
  }
  async function remover(id: string) {
    if (!confirm('Remover este afazer?')) return
    const r = await removerAfazer(id); if (r.success) setItens(r.data)
  }
  async function salvarForm() {
    if (!form || !form.titulo.trim() || salvando) return
    setSalvando(true)
    const r = form.id
      ? await atualizarAfazer(form.id, { titulo: form.titulo, descricao: form.descricao, secao: form.secao, prioridade: form.prioridade, prazo: form.prazo })
      : await adicionarAfazer({ titulo: form.titulo, descricao: form.descricao, secao: form.secao, prioridade: form.prioridade, prazo: form.prazo })
    setSalvando(false)
    if (r.success && r.data) { setItens(r.data); setForm(null) }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2 px-4 sm:px-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-primary" /> Afazeres <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">BETA</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Lista viva dos afazeres em aberto — organizada por frente e prioridade. Fica salva pra toda a conta.</p>
        </div>
        <button onClick={() => setForm({ ...FORM_VAZIO })} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:opacity-90 transition">
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </div>

      {/* tracker de progresso */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Progresso geral</span>
          <span className="text-2xl font-bold text-primary tabular-nums">{feitos} / {total}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#3b82f6,#22d3ee)' }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{nota}</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
      ) : total === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <ListTodo className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Nenhum afazer ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em <b>Adicionar</b> pra criar o primeiro — escolha a frente e a prioridade.</p>
        </div>
      ) : (
        SECOES.map((sec) => {
          const lista = itens.filter((i) => i.secao === sec.key)
          if (!lista.length) return null
          return (
            <section key={sec.key} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold tracking-[0.26em] text-primary">{sec.num}</span>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{sec.titulo}</h2>
                <span className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted-foreground/60 tabular-nums">{lista.filter((i) => i.feito).length}/{lista.length}</span>
              </div>
              <p className="text-xs text-muted-foreground/80 -mt-1">{sec.intro}</p>
              <ul className="space-y-2">
                {lista.map((it) => (
                  <li key={it.id} className={`group relative flex gap-3.5 items-start rounded-xl border border-border bg-card p-4 overflow-hidden transition hover:border-primary/30 ${it.feito ? 'opacity-50' : ''}`}>
                    <span className="absolute left-0 top-0 bottom-0 w-0.5" style={{ background: PRIO_TONE(it.prioridade) }} />
                    <button onClick={() => toggle(it.id)} aria-label={it.feito ? 'Desmarcar' : 'Concluir'}
                      className={`mt-0.5 shrink-0 w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition ${it.feito ? 'bg-primary border-primary text-white' : 'border-white/25 hover:border-primary bg-black/20'}`}>
                      {it.feito && <Check className="w-3 h-3" strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[15px] leading-snug text-foreground ${it.feito ? 'line-through decoration-muted-foreground' : ''}`}>{it.titulo}</p>
                      {it.descricao && <p className="text-[13px] text-muted-foreground/80 mt-1 leading-relaxed">{it.descricao}</p>}
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PRIOS[it.prioridade].tag}`}>{PRIOS[it.prioridade].label}</span>
                        {it.prazo && <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border text-blue-300 border-blue-500/30 bg-blue-500/10">{it.prazo}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => setForm({ id: it.id, titulo: it.titulo, descricao: it.descricao || '', secao: it.secao, prioridade: it.prioridade, prazo: it.prazo || '' })}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remover(it.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-300 hover:bg-white/5"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">{form.id ? 'Editar afazer' : 'Novo afazer'}</h3>
              <button onClick={() => setForm(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <input autoFocus value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) salvarForm() }}
              placeholder="O que precisa ser feito?" className="w-full px-3 py-2.5 rounded-lg bg-black/30 border border-border text-foreground text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 outline-none" />
            <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2}
              placeholder="Contexto (opcional) — por que importa e o que conta como concluído." className="w-full px-3 py-2.5 rounded-lg bg-black/30 border border-border text-foreground text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 outline-none resize-none" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">Frente
                <select value={form.secao} onChange={(e) => { const secao = e.target.value as SecaoAfazer; const p = SECOES.find((s) => s.key === secao)!.prioPadrao; setForm({ ...form, secao, prioridade: form.id ? form.prioridade : p }) }}
                  className="mt-1 w-full px-2.5 py-2 rounded-lg bg-black/30 border border-border text-foreground text-sm outline-none focus:border-primary/50">
                  {SECOES.map((s) => <option key={s.key} value={s.key}>{s.num}. {s.titulo.split(' — ')[0].split(' e ')[0]}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-muted-foreground">Prioridade
                <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value as PrioridadeAfazer })}
                  className="mt-1 w-full px-2.5 py-2 rounded-lg bg-black/30 border border-border text-foreground text-sm outline-none focus:border-primary/50">
                  {(Object.keys(PRIOS) as PrioridadeAfazer[]).map((p) => <option key={p} value={p}>{PRIOS[p].label}</option>)}
                </select>
              </label>
            </div>
            <input value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })}
              placeholder="Prazo (opcional) — ex.: Até sexta" className="w-full px-3 py-2.5 rounded-lg bg-black/30 border border-border text-foreground text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 outline-none" />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setForm(null)} className="px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-white/5">Cancelar</button>
              <button onClick={salvarForm} disabled={!form.titulo.trim() || salvando} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {form.id ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
