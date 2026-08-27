'use client'

// Análise de Funil — visão de planilha do funil inteiro: cadastro de funis
// (front + orderbumps + upsells + VSL + campanhas), cards de resumo, etapas
// do funil (Meta × VTurb × vendas), tabela diária com observações editáveis
// e relatório IA apontando gargalos e projeções.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Filter, Plus, Pencil, Trash2, Loader2, Sparkles, X, ChevronDown } from 'lucide-react'
import { useDashboard } from '@/context/DashboardContext'
import SeletorPeriodoVturb, { rangeDoPreset, type RangePeriodo } from '@/components/ui/SeletorPeriodoVturb'
import {
  listarFunis, salvarFunil, excluirFunil, opcoesFormFunil, salvarObservacaoFunil,
  gerarRelatorioFunilIA, type Funil,
} from '@/app/actions/funil'
import { listarVSLs, type VSL } from '@/app/actions/vsl'
import type { DiaFunil } from '@/app/api/funil/diario/route'

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number | null) => (n == null || !isFinite(n) ? '—' : `${n.toFixed(2).replace('.', ',')}%`)
const num = (n: number) => n.toLocaleString('pt-BR')
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null)

export default function FunilPage() {
  const { isPrivate } = useDashboard()
  const [funis, setFunis] = useState<Funil[]>([])
  const [precisaSql, setPrecisaSql] = useState(false)
  const [funilId, setFunilId] = useState<string | null>(null)
  const [range, setRange] = useState<RangePeriodo>(() => rangeDoPreset('Últimos 7 dias'))
  const [fonte, setFonte] = useState<'tudo' | 'pago' | 'organico'>('tudo')
  const [dias, setDias] = useState<DiaFunil[]>([])
  const [checkoutsOk, setCheckoutsOk] = useState(true)
  const [obsOk, setObsOk] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [vturb, setVturb] = useState<any>(null)
  const [aprovacao, setAprovacao] = useState<any>(null)
  const [aprovacaoCarregando, setAprovacaoCarregando] = useState(false)
  const [aprovacaoErro, setAprovacaoErro] = useState<string | null>(null)
  const [formAberto, setFormAberto] = useState<null | Funil | 'novo'>(null)
  const [iaTexto, setIaTexto] = useState<string | null>(null)
  const [iaErro, setIaErro] = useState<string | null>(null)
  const [iaCarregando, setIaCarregando] = useState(false)

  const funil = funis.find((f) => f.id === funilId) ?? null

  const carregarFunis = useCallback(async () => {
    const r = await listarFunis()
    setPrecisaSql(!!r.precisaSql)
    setFunis(r.data)
    setFunilId((atual) => atual && r.data.some((f) => f.id === atual) ? atual : (r.data[0]?.id ?? null))
  }, [])
  useEffect(() => { carregarFunis() }, [carregarFunis])

  useEffect(() => {
    if (!funilId) { setDias([]); setCarregando(false); return }
    setCarregando(true)
    setIaTexto(null); setIaErro(null)
    fetch(`/api/funil/diario?funil_id=${funilId}&d_inicio=${range.ini}&d_fim=${range.fim}&fonte=${fonte}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setDias([]); return }
        setDias(j.dias ?? [])
        setCheckoutsOk(j.checkoutsDisponivel !== false)
        setObsOk(j.obsDisponivel !== false)
      })
      .catch(() => setDias([]))
      .finally(() => setCarregando(false))
  }, [funilId, range.ini, range.fim, fonte])

  // % de aprovação de pagamento — via API da Hotmart (o webhook não recebe
  // cartão recusado; a API lista as transações CANCELLED/EXPIRED).
  useEffect(() => {
    setAprovacao(null); setAprovacaoErro(null)
    if (!funilId) return
    setAprovacaoCarregando(true)
    fetch(`/api/funil/aprovacao?funil_id=${funilId}&d_inicio=${range.ini}&d_fim=${range.fim}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (j.error) setAprovacaoErro(j.error); else setAprovacao(j) })
      .catch(() => setAprovacaoErro('Falha ao consultar a Hotmart.'))
      .finally(() => setAprovacaoCarregando(false))
  }, [funilId, range.ini, range.fim])

  // VTurb da VSL vinculada (uma chamada pro período inteiro).
  useEffect(() => {
    setVturb(null)
    if (!funil?.vsl_id) return
    fetch(`/api/vturb/vsl-stats?vsl_id=${funil.vsl_id}&d_inicio=${range.ini}&d_fim=${range.fim}`, { cache: 'no-store' })
      .then((r) => r.json()).then((j) => { if (!j.error) setVturb(j) }).catch(() => {})
  }, [funil?.vsl_id, range.ini, range.fim])

  const tot = useMemo(() => {
    const t = {
      investimento: 0, imposto: 0, impressoes: 0, cliques: 0, lpViews: 0, checkouts: 0,
      vendasFront: 0, fatFront: 0, fatFunil: 0, vendasTotais: 0,
      reembolsos: 0, reembolsoValor: 0, pixAprovados: 0, pixExpirados: 0,
      obQtd: 0, obFat: 0, upQtd: 0, upFat: 0,
      porOrderbump: {} as Record<string, { qtd: number; fat: number }>,
      porUpsell: {} as Record<string, { qtd: number; fat: number }>,
    }
    for (const d of dias) {
      t.investimento += d.investimento; t.imposto += d.imposto ?? 0; t.impressoes += d.impressoes; t.cliques += d.cliques
      t.lpViews += d.lpViews; t.checkouts += d.checkouts
      t.vendasFront += d.vendasFront; t.fatFront += d.fatFront; t.fatFunil += d.fatFunil; t.vendasTotais += d.vendasTotais
      t.reembolsos += d.reembolsos; t.reembolsoValor += d.reembolsoValor
      t.pixAprovados += d.pixAprovados ?? 0; t.pixExpirados += d.pixExpirados ?? 0
      for (const [nome, o] of Object.entries(d.orderbumps)) {
        const p = t.porOrderbump[nome] ?? (t.porOrderbump[nome] = { qtd: 0, fat: 0 })
        p.qtd += o.qtd; p.fat += o.fat; t.obQtd += o.qtd; t.obFat += o.fat
      }
      for (const [nome, u] of Object.entries(d.upsells)) {
        const p = t.porUpsell[nome] ?? (t.porUpsell[nome] = { qtd: 0, fat: 0 })
        p.qtd += u.qtd; p.fat += u.fat; t.upQtd += u.qtd; t.upFat += u.fat
      }
    }
    return t
  }, [dias])

  const derivados = useMemo(() => {
    const vt = vturb?.vturb, r = vturb?.real
    const audiencia = vt?.audienciaPitch ?? null
    return {
      cpa: div(tot.investimento, tot.vendasFront),
      roi: div(tot.fatFunil, tot.investimento),
      // Mesma fórmula do Lucro da Visão Geral: faturamento − gasto − imposto.
      lucro: tot.fatFunil - tot.investimento - tot.imposto,
      aov: div(tot.fatFunil, tot.vendasTotais),
      ctr: tot.impressoes > 0 ? (tot.cliques / tot.impressoes) * 100 : null,
      cpm: tot.impressoes > 0 ? (tot.investimento / tot.impressoes) * 1000 : null,
      cpc: div(tot.investimento, tot.cliques),
      custoLp: div(tot.investimento, tot.lpViews),
      custoIc: div(tot.investimento, tot.checkouts),
      taxaCarregamento: tot.cliques > 0 ? (tot.lpViews / tot.cliques) * 100 : null,
      passagemCheckout: tot.lpViews > 0 ? (tot.checkouts / tot.lpViews) * 100 : null,
      checkoutVenda: tot.checkouts > 0 ? (tot.vendasFront / tot.checkouts) * 100 : null,
      taxaReembolso: tot.vendasTotais + tot.reembolsos > 0 ? (tot.reembolsos / (tot.vendasTotais + tot.reembolsos)) * 100 : null,
      proporcaoFrontFunil: tot.fatFunil > 0 ? (tot.fatFront / tot.fatFunil) * 100 : null,
      playRate: r?.playRateReal ?? vt?.playRateVturb ?? null,
      retencaoPitch: vt?.retencaoPitch ?? null,
      audienciaPitch: audiencia,
      pitchCheckout: audiencia && audiencia > 0 ? (tot.checkouts / audiencia) * 100 : null,
      pitchVenda: audiencia && audiencia > 0 ? (tot.vendasFront / audiencia) * 100 : null,
    }
  }, [tot, vturb])

  async function gerarIA() {
    if (!funil) return
    setIaCarregando(true); setIaErro(null)
    const r = await gerarRelatorioFunilIA({
      funilNome: funil.nome,
      periodo: `${range.ini} a ${range.fim}`,
      investimento: tot.investimento, faturamentoFront: tot.fatFront, faturamentoFunil: tot.fatFunil,
      vendasFront: tot.vendasFront, vendasTotais: tot.vendasTotais,
      cpa: derivados.cpa, roi: derivados.roi, lucro: derivados.lucro, aov: derivados.aov,
      impressoes: tot.impressoes, cliques: tot.cliques, lpViews: tot.lpViews, checkouts: tot.checkouts,
      ctr: derivados.ctr, cpm: derivados.cpm, custoPorLp: derivados.custoLp, custoPorCheckout: derivados.custoIc,
      taxaCarregamento: derivados.taxaCarregamento, passagemCheckout: derivados.passagemCheckout, checkoutVenda: derivados.checkoutVenda,
      reembolsos: tot.reembolsos, taxaReembolso: derivados.taxaReembolso,
      orderbumps: Object.entries(tot.porOrderbump).map(([nome, o]) => ({ nome, qtd: o.qtd, faturamento: o.fat, conversao: div(o.qtd * 100, tot.vendasFront) })),
      upsells: Object.entries(tot.porUpsell).map(([nome, u]) => ({ nome, qtd: u.qtd, faturamento: u.fat, conversao: div(u.qtd * 100, tot.vendasFront) })),
      vturb: funil.vsl_id ? {
        playRate: derivados.playRate, retencaoPitch: derivados.retencaoPitch, audienciaPitch: derivados.audienciaPitch,
        pitchCheckout: derivados.pitchCheckout, pitchVenda: derivados.pitchVenda,
      } : null,
    })
    setIaCarregando(false)
    if (r.success) setIaTexto(r.texto ?? null); else setIaErro(r.error ?? 'Falha ao gerar.')
  }

  const priv = (s: string) => (isPrivate ? '••••' : s)
  const privCls = isPrivate ? 'blur-sm select-none' : ''

  // ---------- Estados vazios ----------
  if (precisaSql) {
    return (
      <Casca>
        <div className="rounded-2xl bg-card border border-border p-8 text-center max-w-xl mx-auto mt-10">
          <p className="text-sm font-semibold text-foreground mb-2">Falta rodar o SQL</p>
          <p className="text-xs text-muted-foreground leading-relaxed">A Análise de Funil precisa das tabelas novas. Abre o <b>SQL Editor do Supabase</b>, cola o conteúdo do arquivo <code className="text-primary">supabase_funil.sql</code> (na raiz do projeto) e roda. Depois volta aqui e recarrega a página.</p>
        </div>
      </Casca>
    )
  }

  return (
    <Casca>
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Análise de Funil</h1>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {funis.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <select value={funilId ?? ''} onChange={(e) => setFunilId(e.target.value)}
                  className="h-11 pl-4 pr-9 rounded-xl border border-border bg-card text-[15px] font-medium text-foreground appearance-none cursor-pointer">
                  {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
              {funil && (
                <>
                  <button onClick={() => setFormAberto(funil)} title="Editar funil" className="h-11 w-11 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><Pencil className="w-4 h-4" /></button>
                  <button onClick={async () => { if (confirm(`Excluir o funil "${funil.nome}"? (não apaga nenhuma venda/gasto)`)) { await excluirFunil(funil.id); carregarFunis() } }} title="Excluir funil" className="h-11 w-11 rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-rose-400 hover:bg-white/5 transition"><Trash2 className="w-4 h-4" /></button>
                </>
              )}
            </div>
          )}
          <button onClick={() => setFormAberto('novo')} className="h-11 px-4 rounded-xl bg-primary text-white text-[15px] font-semibold flex items-center gap-2 hover:opacity-90 transition"><Plus className="w-4 h-4" /> Novo funil</button>
          {funis.length > 0 && (
            <div className="flex items-center h-11 rounded-xl border border-border bg-card p-1 gap-0.5" title="Filtra as VENDAS pela origem (atribuição sck last-click). O tráfego/gasto da Meta continua o mesmo.">
              {([['tudo', 'Tudo'], ['pago', 'Tráfego pago'], ['organico', 'Orgânico']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setFonte(k)}
                  className={`h-full px-3 rounded-lg text-[13px] font-semibold transition ${fonte === k ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {funis.length > 0 && <SeletorPeriodoVturb range={range} onChange={setRange} />}
        </div>
      </div>

      {funis.length === 0 && !carregando && (
        <div className="rounded-2xl bg-card border border-border p-10 text-center max-w-xl mx-auto mt-6">
          <Filter className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1.5">Nenhum funil cadastrado</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">Crie o primeiro funil escolhendo o produto front, os orderbumps, o upsell e a VSL — a página cruza Meta × VTurb × vendas e monta a planilha diária sozinha.</p>
          <button onClick={() => setFormAberto('novo')} className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 transition"><Plus className="w-4 h-4" /> Criar funil</button>
        </div>
      )}

      {funil && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <CardResumo label="Investimento" valor={priv(brl(tot.investimento))} cls={privCls} cor="text-rose-400" />
            <CardResumo label="Fat. Total do Funil" valor={priv(brl(tot.fatFunil))} cls={privCls} cor="text-emerald-400" sub={`front ${pct(derivados.proporcaoFrontFunil)}`} />
            <CardResumo label="Lucro" valor={priv(brl(derivados.lucro))} cls={privCls} cor={derivados.lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'} sub={tot.imposto > 0 ? `já desconta imposto` : undefined} />
            <CardResumo label="ROI" valor={isPrivate ? '••' : derivados.roi == null ? '—' : `${derivados.roi.toFixed(2).replace('.', ',')}x`} cls={privCls} />
            <CardResumo label="CPA do Funil" valor={priv(derivados.cpa != null ? brl(derivados.cpa) : '—')} cls={privCls} />
            <CardResumo label="AOV" valor={priv(derivados.aov != null ? brl(derivados.aov) : '—')} cls={privCls} sub={`${num(tot.vendasTotais)} vendas`} />
          </div>

          {/* Etapas do funil */}
          <div className="rounded-2xl bg-card border border-border p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Etapas do funil</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <Etapa label="Impressões" valor={num(tot.impressoes)} sub={`CPM ${derivados.cpm != null ? (isPrivate ? '••' : brl(derivados.cpm)) : '—'}`} />
              <Etapa label="Cliques" valor={num(tot.cliques)} sub={`CTR ${pct(derivados.ctr)}`} />
              <Etapa label="LP Views" valor={num(tot.lpViews)} sub={`carreg. ${pct(derivados.taxaCarregamento)}`} />
              {funil.vsl_id && <Etapa label="Play Rate" valor={pct(derivados.playRate)} sub={`ret. pitch ${pct(derivados.retencaoPitch)}`} />}
              {funil.vsl_id && <Etapa label="Audiência Pitch" valor={derivados.audienciaPitch != null ? num(Math.round(derivados.audienciaPitch)) : '—'} sub={`pitch→IC ${pct(derivados.pitchCheckout)}`} />}
              <Etapa label="Checkouts" valor={checkoutsOk ? num(tot.checkouts) : '—'} sub={checkoutsOk ? `passagem ${pct(derivados.passagemCheckout)}` : 'rode o SQL + sync'} />
              <Etapa label="Vendas Front" valor={isPrivate ? '••' : num(tot.vendasFront)} sub={`IC→venda ${pct(derivados.checkoutVenda)}`} />
              <Etapa label="Reembolsos" valor={isPrivate ? '••' : num(tot.reembolsos)} sub={`taxa ${pct(derivados.taxaReembolso)}`} />
              <Etapa
                label="Aprovação Cartão"
                valor={aprovacaoCarregando ? '...' : pct(aprovacao?.cartao?.taxa ?? null)}
                sub={aprovacaoErro ? aprovacaoErro : aprovacao?.cartao ? `${num(aprovacao.cartao.aprovadas)} aprovadas · ${num(aprovacao.cartao.falhas)} recusadas` : 'via API Hotmart'}
              />
              <Etapa
                label="Aprovação PIX"
                valor={aprovacaoCarregando ? '...' : pct(aprovacao?.pix?.taxa ?? null)}
                sub={aprovacaoErro ? aprovacaoErro : aprovacao?.pix ? `${num(aprovacao.pix.aprovadas)} pagos · ${num(aprovacao.pix.falhas)} expirados` : 'gerado → pago'}
              />
            </div>
          </div>

          {/* Orderbumps e upsells */}
          {(Object.keys(tot.porOrderbump).length > 0 || Object.keys(tot.porUpsell).length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.keys(tot.porOrderbump).length > 0 && (
                <TabelaProdutos titulo="Orderbumps" itens={tot.porOrderbump} base={tot.vendasFront} isPrivate={isPrivate} />
              )}
              {Object.keys(tot.porUpsell).length > 0 && (
                <TabelaProdutos titulo="Upsells" itens={tot.porUpsell} base={tot.vendasFront} isPrivate={isPrivate} />
              )}
            </div>
          )}

          {/* Relatório IA */}
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Relatório IA</p>
              <button onClick={gerarIA} disabled={iaCarregando || carregando}
                className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50">
                {iaCarregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {iaCarregando ? 'Analisando o funil...' : iaTexto ? 'Gerar de novo' : 'Gerar relatório'}
              </button>
            </div>
            {iaErro && <p className="mt-3 text-xs text-rose-400">{iaErro}</p>}
            {iaTexto && (
              <div className={`mt-4 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap ${privCls}`}>{isPrivate ? 'Desative "esconder resultados" pra ver o relatório.' : iaTexto}</div>
            )}
            {!iaTexto && !iaErro && !iaCarregando && (
              <p className="mt-3 text-xs text-muted-foreground">A IA analisa as etapas do período, aponta o maior gargalo e projeta quanto de faturamento cada melhoria traria.</p>
            )}
          </div>

          {/* Tabela diária */}
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            {carregando ? (
              <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[1700px]">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-background/60">
                      <th className="text-left px-4 py-3 sticky left-0 bg-card z-10">Data</th>
                      <th className="text-left px-3 py-3">Dia</th>
                      <ThR>Investimento</ThR><ThR>Vendas Front</ThR><ThR>Fat. Front</ThR><ThR>Fat. Funil</ThR>
                      <ThR>Vendas Totais</ThR><ThR>CPA</ThR><ThR>ROI</ThR><ThR>Lucro</ThR><ThR>AOV</ThR>
                      <ThR>OB qtd</ThR><ThR>OB fat.</ThR><ThR>Upsell qtd</ThR><ThR>Upsell fat.</ThR>
                      <ThR>Reemb.</ThR>
                      <ThR>Impressões</ThR><ThR>Cliques</ThR><ThR>LP Views</ThR><ThR>Checkouts</ThR>
                      <ThR>CPM</ThR><ThR>CTR</ThR><ThR>CPC</ThR><ThR>Custo/LP</ThR><ThR>Custo/IC</ThR>
                      <ThR>Carreg.</ThR><ThR>LP→IC</ThR><ThR>IC→Venda</ThR>
                      <th className="text-left px-4 py-3 min-w-[220px]">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <LinhaDia dia={null} tot={tot} isPrivate={isPrivate} checkoutsOk={checkoutsOk} obsOk={obsOk} funilId={funil.id} />
                    {[...dias].reverse().map((d) => (
                      <LinhaDia key={d.data} dia={d} tot={null} isPrivate={isPrivate} checkoutsOk={checkoutsOk} obsOk={obsOk} funilId={funil.id} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {formAberto && (
        <FormFunil
          inicial={formAberto === 'novo' ? null : formAberto}
          onFechar={() => setFormAberto(null)}
          onSalvo={() => { setFormAberto(null); carregarFunis() }}
        />
      )}
    </Casca>
  )
}

function Casca({ children }: { children: React.ReactNode }) {
  return <div className="pt-9 pb-12 space-y-5 max-w-[1400px] mx-auto w-full text-foreground px-4 sm:px-6 lg:px-8">{children}</div>
}

function CardResumo({ label, valor, sub, cor, cls }: { label: string; valor: string; sub?: string; cor?: string; cls?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
      <p className={`text-xl font-black tabular-nums ${cor ?? 'text-foreground'} ${cls ?? ''}`}>{valor}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{sub}</p>}
    </div>
  )
}

function Etapa({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-background/60 border border-white/5 p-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-base font-bold tabular-nums text-foreground">{valor}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function TabelaProdutos({ titulo, itens, base, isPrivate }: { titulo: string; itens: Record<string, { qtd: number; fat: number }>; base: number; isPrivate: boolean }) {
  const cls = isPrivate ? 'blur-sm select-none' : ''
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{titulo}</p>
      <div className="space-y-2.5">
        {Object.entries(itens).map(([nome, o]) => (
          <div key={nome} className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-foreground truncate" title={nome}>{nome}</span>
            <div className="flex items-center gap-4 shrink-0 tabular-nums">
              <span className={`text-muted-foreground ${cls}`}>{isPrivate ? '••' : o.qtd} venda{o.qtd !== 1 ? 's' : ''}</span>
              <span className="text-muted-foreground">{pct(base > 0 ? (o.qtd / base) * 100 : null)}</span>
              <span className={`font-bold text-foreground w-24 text-right ${cls}`}>{isPrivate ? 'R$ ••••' : brl(o.fat)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ThR({ children }: { children: React.ReactNode }) {
  return <th className="text-right px-3 py-3 whitespace-nowrap">{children}</th>
}

function LinhaDia({ dia, tot, isPrivate, checkoutsOk, obsOk, funilId }: {
  dia: DiaFunil | null
  tot: any
  isPrivate: boolean
  checkoutsOk: boolean
  obsOk: boolean
  funilId: string
}) {
  const ehTotal = dia == null
  const d = ehTotal
    ? { ...tot, vendasFront: tot.vendasFront, orderbumps: {}, upsells: {}, obs: '' }
    : dia
  const obQtd = ehTotal ? tot.obQtd : Object.values(dia!.orderbumps).reduce((a: number, o: any) => a + o.qtd, 0)
  const obFat = ehTotal ? tot.obFat : Object.values(dia!.orderbumps).reduce((a: number, o: any) => a + o.fat, 0)
  const upQtd = ehTotal ? tot.upQtd : Object.values(dia!.upsells).reduce((a: number, o: any) => a + o.qtd, 0)
  const upFat = ehTotal ? tot.upFat : Object.values(dia!.upsells).reduce((a: number, o: any) => a + o.fat, 0)

  const cpa = div(d.investimento, d.vendasFront)
  const roi = div(d.fatFunil, d.investimento)
  const lucro = d.fatFunil - d.investimento - (d.imposto ?? 0)
  const aov = div(d.fatFunil, d.vendasTotais)
  const cpm = d.impressoes > 0 ? (d.investimento / d.impressoes) * 1000 : null
  const ctr = d.impressoes > 0 ? (d.cliques / d.impressoes) * 100 : null
  const cpc = div(d.investimento, d.cliques)
  const custoLp = div(d.investimento, d.lpViews)
  const custoIc = div(d.investimento, d.checkouts)
  const carreg = d.cliques > 0 ? (d.lpViews / d.cliques) * 100 : null
  const lpIc = d.lpViews > 0 ? (d.checkouts / d.lpViews) * 100 : null
  const icVenda = d.checkouts > 0 ? (d.vendasFront / d.checkouts) * 100 : null

  const cls = isPrivate ? 'blur-sm select-none' : ''
  const dinheiro = (n: number) => (isPrivate ? 'R$ ••' : brl(n))
  const qtd = (n: number) => (isPrivate ? '••' : num(n))

  const [obs, setObs] = useState(ehTotal ? '' : dia!.obs)
  useEffect(() => { if (!ehTotal) setObs(dia!.obs) }, [ehTotal, dia])

  const dataLabel = ehTotal ? 'TOTAL DO PERÍODO' : dia!.data.split('-').reverse().join('/')
  const diaSemana = ehTotal ? '' : DIAS_SEMANA[new Date(`${dia!.data}T12:00:00`).getDay()]

  return (
    <tr className={`border-t border-border ${ehTotal ? 'bg-primary/10 font-bold' : 'hover:bg-accent/20'}`}>
      <td className={`px-4 py-2.5 whitespace-nowrap sticky left-0 z-10 ${ehTotal ? 'bg-[color-mix(in_srgb,var(--card),var(--primary)_10%)] text-primary font-black' : 'bg-card font-semibold'}`}>{dataLabel}</td>
      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{diaSemana}</td>
      <TdR cls={cls} destaque="text-rose-400">{dinheiro(d.investimento)}</TdR>
      <TdR cls={cls}>{qtd(d.vendasFront)}</TdR>
      <TdR cls={cls}>{dinheiro(d.fatFront)}</TdR>
      <TdR cls={cls} destaque="text-emerald-400">{dinheiro(d.fatFunil)}</TdR>
      <TdR cls={cls}>{qtd(d.vendasTotais)}</TdR>
      <TdR cls={cls}>{cpa != null ? dinheiro(cpa) : '—'}</TdR>
      <TdR cls={cls}>{isPrivate ? '••' : roi != null ? `${roi.toFixed(2).replace('.', ',')}x` : '—'}</TdR>
      <TdR cls={cls} destaque={lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{dinheiro(lucro)}</TdR>
      <TdR cls={cls}>{aov != null ? dinheiro(aov) : '—'}</TdR>
      <TdR cls={cls}>{qtd(obQtd)}</TdR>
      <TdR cls={cls}>{dinheiro(obFat)}</TdR>
      <TdR cls={cls}>{qtd(upQtd)}</TdR>
      <TdR cls={cls}>{dinheiro(upFat)}</TdR>
      <TdR cls={cls} destaque={d.reembolsos > 0 ? 'text-rose-400' : undefined}>{qtd(d.reembolsos)}</TdR>
      <TdR>{num(d.impressoes)}</TdR>
      <TdR>{num(d.cliques)}</TdR>
      <TdR>{num(d.lpViews)}</TdR>
      <TdR>{checkoutsOk ? num(d.checkouts) : '—'}</TdR>
      <TdR cls={cls}>{cpm != null ? dinheiro(cpm) : '—'}</TdR>
      <TdR>{pct(ctr)}</TdR>
      <TdR cls={cls}>{cpc != null ? dinheiro(cpc) : '—'}</TdR>
      <TdR cls={cls}>{custoLp != null ? dinheiro(custoLp) : '—'}</TdR>
      <TdR cls={cls}>{custoIc != null ? dinheiro(custoIc) : '—'}</TdR>
      <TdR>{pct(carreg)}</TdR>
      <TdR>{pct(lpIc)}</TdR>
      <TdR>{pct(icVenda)}</TdR>
      <td className="px-4 py-2.5">
        {ehTotal ? (
          <span className="text-[10px] uppercase tracking-widest text-primary">Observações</span>
        ) : obsOk ? (
          <input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => { if (obs !== dia!.obs) { dia!.obs = obs; salvarObservacaoFunil(funilId, dia!.data, obs) } }}
            placeholder="anotar..."
            className="w-full min-w-[200px] bg-transparent border border-transparent hover:border-border focus:border-primary rounded-lg px-2 py-1 text-xs text-foreground outline-none transition"
          />
        ) : (
          <span className="text-[10px] text-muted-foreground/50">rode o SQL</span>
        )}
      </td>
    </tr>
  )
}

function TdR({ children, cls, destaque }: { children: React.ReactNode; cls?: string; destaque?: string }) {
  return <td className={`text-right px-3 py-2.5 tabular-nums whitespace-nowrap ${destaque ?? ''} ${cls ?? ''}`}>{children}</td>
}

// ---------- Formulário de funil ----------
function FormFunil({ inicial, onFechar, onSalvo }: { inicial: Funil | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [produtoFront, setProdutoFront] = useState(inicial?.produto_front ?? '')
  const [orderbumps, setOrderbumps] = useState<string[]>(inicial?.orderbumps ?? [])
  const [upsells, setUpsells] = useState<string[]>(inicial?.upsells ?? [])
  const [vslId, setVslId] = useState<string>(inicial?.vsl_id ?? '')
  const [campanhas, setCampanhas] = useState<string[]>(inicial?.campanhas ?? [])
  const [produtos, setProdutos] = useState<string[]>([])
  const [campanhasOpts, setCampanhasOpts] = useState<string[]>([])
  const [vsls, setVsls] = useState<VSL[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([opcoesFormFunil(), listarVSLs()]).then(([opts, v]) => {
      setProdutos(opts.produtos); setCampanhasOpts(opts.campanhas); setVsls(v.data)
      setCarregando(false)
    })
  }, [])

  function toggle(lista: string[], set: (v: string[]) => void, item: string) {
    set(lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item])
  }

  async function salvar() {
    setSalvando(true); setErro(null)
    const r = await salvarFunil({ id: inicial?.id, nome, produto_front: produtoFront, orderbumps, upsells, vsl_id: vslId || null, campanhas })
    setSalvando(false)
    if (r.success) onSalvo(); else setErro(r.error ?? 'Falha ao salvar.')
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-lg text-sm bg-background/60 border border-border text-foreground outline-none focus:border-primary transition'
  const label = 'block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onFechar}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">{inicial ? 'Editar funil' : 'Novo funil'}</h3>
          <button onClick={onFechar} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition"><X className="w-4 h-4" /></button>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={label}>Nome do funil</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Mãe da Rafa — VSL principal" className={inputCls} />
            </div>
            <div>
              <label className={label}>Produto front</label>
              <select value={produtoFront} onChange={(e) => setProdutoFront(e.target.value)} className={inputCls}>
                <option value="">Escolha...</option>
                {produtos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <SeletorMulti titulo="Orderbumps" opcoes={produtos.filter((p) => p !== produtoFront && !upsells.includes(p))} selecionados={orderbumps} onToggle={(p) => toggle(orderbumps, setOrderbumps, p)} />
            <SeletorMulti titulo="Upsells" opcoes={produtos.filter((p) => p !== produtoFront && !orderbumps.includes(p))} selecionados={upsells} onToggle={(p) => toggle(upsells, setUpsells, p)} />
            <div>
              <label className={label}>VSL vinculada (VTurb) — opcional</label>
              <select value={vslId} onChange={(e) => setVslId(e.target.value)} className={inputCls}>
                <option value="">Nenhuma</option>
                {vsls.map((v) => <option key={v.id} value={v.id}>{v.vturb_player_name || v.nome}</option>)}
              </select>
            </div>
            <SeletorMulti titulo="Campanhas (opcional — vazio = todas)" opcoes={campanhasOpts} selecionados={campanhas} onToggle={(c) => toggle(campanhas, setCampanhas, c)} />

            {erro && <p className="text-xs text-rose-400">{erro}</p>}
            <button onClick={salvar} disabled={salvando || !nome.trim() || !produtoFront}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50">
              {salvando && <Loader2 className="w-4 h-4 animate-spin" />} {inicial ? 'Salvar alterações' : 'Criar funil'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SeletorMulti({ titulo, opcoes, selecionados, onToggle }: { titulo: string; opcoes: string[]; selecionados: string[]; onToggle: (item: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{titulo}</label>
      {opcoes.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">Nenhuma opção disponível.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
          {opcoes.map((o) => {
            const on = selecionados.includes(o)
            return (
              <button key={o} onClick={() => onToggle(o)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${on ? 'bg-primary/15 text-primary border-primary/40' : 'bg-background/60 text-muted-foreground border-border hover:text-foreground'}`}>
                {o}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
