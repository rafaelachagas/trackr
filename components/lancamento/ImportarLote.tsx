'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Upload, X, Sparkles, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react'
import { getProdutosMapeamento, importarLancamentosEmLote } from '@/app/actions/lancamento'
import { listarCriativosParaImport } from '@/app/actions/criativos'

const hoje = format(new Date(), 'yyyy-MM-dd')

type Criativo = { nome: string; campaign_name: string; status: string }
type Produto = { nome_produto: string; tipo: string }

type LinhaPreview = {
  id: number
  raw: string          // linha original (nome cru colado)
  token: string        // pedaço após a última "|"
  criativoNome: string // criativo casado/escolhido
  campanha: string
  reconhecido: boolean
  vendaFront: string
  vendaUpsell: string
  gasto: string
}

type Resumo = { vendasInseridas: number; gastosInseridos: number; ignorados: number; erros: string[] }

// "1.003,45" -> 1003.45 ; "263,03" -> 263.03 ; "5738,63" -> 5738.63
function parseBR(s: string): number {
  const cleaned = s.replace(/[^\d.,-]/g, '').trim()
  if (!cleaned) return NaN
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
}

function extrairNumero(line: string): number {
  const m = line.match(/-?\d[\d.]*(?:,\d+)?/)
  return m ? parseBR(m[0]) : NaN
}

function isLinhaNumero(line: string): boolean {
  return /^-?\d[\d.]*(?:,\d+)?$/.test(line.trim())
}

function casar(token: string, criativos: Criativo[]): Criativo | null {
  const low = token.toLowerCase()
  return (
    criativos.find(c => c.nome === token) ||
    criativos.find(c => c.nome.toLowerCase() === low) ||
    criativos.find(c => low.endsWith(c.nome.toLowerCase()) || c.nome.toLowerCase().endsWith(low)) ||
    null
  )
}

function numToInput(n: number): string {
  return isNaN(n) ? '' : String(n)
}

export default function ImportarLote({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(hoje)
  const [criativos, setCriativos] = useState<Criativo[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [produtoFront, setProdutoFront] = useState('')
  const [produtoUpsell, setProdutoUpsell] = useState('')
  const [texto, setTexto] = useState('')
  const [linhas, setLinhas] = useState<LinhaPreview[] | null>(null)
  const [importando, setImportando] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)

  const inputClass = 'bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 w-full transition-colors'

  async function abrir() {
    setOpen(true)
    setResumo(null)
    setLinhas(null)
    setTexto('')
    setData(hoje)
    const [cri, prod] = await Promise.all([listarCriativosParaImport(), getProdutosMapeamento()])
    setCriativos(cri as Criativo[])
    setProdutos(prod as Produto[])
    setProdutoFront(prod.find((p: Produto) => p.tipo === 'front')?.nome_produto ?? prod[0]?.nome_produto ?? '')
    setProdutoUpsell(prod.find((p: Produto) => p.tipo === 'upsell')?.nome_produto ?? prod[1]?.nome_produto ?? '')
  }

  function fechar() {
    setOpen(false)
  }

  function processar() {
    setResumo(null)
    const blocos = texto.split(/^[ \t]*[-–—_=]{3,}[ \t]*$/m)
    const out: LinhaPreview[] = []
    let id = 0

    for (const bloco of blocos) {
      const lines = bloco.split('\n').map(l => l.trim()).filter(Boolean)
      if (!lines.length) continue

      const raw = lines[0]
      const vendas: number[] = []
      let gasto = NaN
      let viuGasto = false

      for (const line of lines.slice(1)) {
        if (/gasto/i.test(line)) {
          viuGasto = true
          const n = extrairNumero(line)
          if (!isNaN(n)) gasto = n
          continue
        }
        if (isLinhaNumero(line)) {
          const n = parseBR(line)
          if (isNaN(n)) continue
          if (viuGasto) { if (isNaN(gasto)) gasto = n }
          else vendas.push(n)
        }
      }

      const token = raw.includes('|') ? raw.split('|').pop()!.trim() : raw.trim()
      const match = casar(token, criativos)

      out.push({
        id: id++,
        raw,
        token,
        criativoNome: match?.nome ?? '',
        campanha: match?.campaign_name ?? '',
        reconhecido: !!match,
        vendaFront: numToInput(vendas[0]),
        vendaUpsell: numToInput(vendas[1]),
        gasto: numToInput(gasto),
      })
    }

    setLinhas(out)
  }

  function atualizar(id: number, patch: Partial<LinhaPreview>) {
    setLinhas(prev => prev && prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }

  function escolherCriativo(id: number, nome: string) {
    const c = criativos.find(x => x.nome === nome)
    atualizar(id, { criativoNome: nome, campanha: c?.campaign_name ?? '', reconhecido: !!c })
  }

  const naoReconhecidos = linhas?.filter(l => !l.criativoNome).length ?? 0

  async function importar() {
    if (!linhas) return
    setImportando(true)
    const itens = linhas
      .filter(l => l.criativoNome)
      .map(l => ({
        criativo: l.criativoNome,
        campanha: l.campanha || null,
        vendaFront: l.vendaFront ? parseFloat(l.vendaFront) : 0,
        vendaUpsell: l.vendaUpsell ? parseFloat(l.vendaUpsell) : 0,
        gasto: l.gasto ? parseFloat(l.gasto) : 0,
      }))

    const res = await importarLancamentosEmLote({ data, produtoFront, produtoUpsell, itens })
    setImportando(false)
    if (res.resumo) {
      setResumo(res.resumo)
      onImported()
    } else {
      setResumo({ vendasInseridas: 0, gastosInseridos: 0, ignorados: 0, erros: [res.error ?? 'Erro desconhecido'] })
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-card border border-border text-foreground hover:border-primary/50 transition-all"
      >
        <Upload className="w-4 h-4" />
        Importar em massa
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={fechar} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h3 className="text-base font-bold text-foreground">Importar em massa</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Cole o texto dos criativos e confira antes de salvar</p>
              </div>
              <button onClick={fechar} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Config do lote */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Data do lote</label>
                  <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">1º valor → produto (front)</label>
                  <select value={produtoFront} onChange={e => setProdutoFront(e.target.value)} className={inputClass}>
                    {produtos.map(p => <option key={p.nome_produto} value={p.nome_produto}>{p.nome_produto}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">2º valor → produto (upsell)</label>
                  <select value={produtoUpsell} onChange={e => setProdutoUpsell(e.target.value)} className={inputClass}>
                    {produtos.map(p => <option key={p.nome_produto} value={p.nome_produto}>{p.nome_produto}</option>)}
                  </select>
                </div>
              </div>

              {/* Textarea */}
              {!resumo && (
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Cole aqui</label>
                  <textarea
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    rows={8}
                    placeholder={'nome-do-criativo|cj01|ad03-entrevista-viral-pre-escala\n263,03\n534,48\nGASTO R$ 236,13\n----------------------------\n...'}
                    className={`${inputClass} font-mono text-xs leading-relaxed resize-y`}
                  />
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={processar}
                      disabled={!texto.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      Pré-visualizar
                    </button>
                    {linhas && <span className="text-xs text-muted-foreground">{linhas.length} criativo{linhas.length !== 1 ? 's' : ''} detectado{linhas.length !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
              )}

              {/* Resultado da importação */}
              {resumo && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="text-sm text-foreground">
                      <span className="font-bold text-emerald-400">{resumo.vendasInseridas}</span> venda(s) e{' '}
                      <span className="font-bold text-emerald-400">{resumo.gastosInseridos}</span> gasto(s) inserido(s).
                      {resumo.ignorados > 0 && <span className="text-muted-foreground"> {resumo.ignorados} ignorado(s) (duplicado ou sem criativo).</span>}
                    </div>
                  </div>
                  {resumo.erros.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                      {resumo.erros.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setResumo(null); setLinhas(null); setTexto('') }} className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition">
                      Nova importação
                    </button>
                    <button onClick={fechar} className="px-4 py-2 rounded-xl text-sm font-semibold bg-card border border-border text-foreground hover:border-primary/50 transition">
                      Fechar
                    </button>
                  </div>
                </div>
              )}

              {/* Preview editável */}
              {linhas && !resumo && (
                <div className="space-y-3">
                  {naoReconhecidos > 0 && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-300">
                        {naoReconhecidos} criativo(s) não reconhecido(s). Selecione o criativo certo na coluna, ou a linha será ignorada.
                      </p>
                    </div>
                  )}

                  <div className="border border-border rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/20">
                          <th className="text-left px-3 py-2 font-semibold">Criativo</th>
                          <th className="text-right px-3 py-2 font-semibold w-28">Front</th>
                          <th className="text-right px-3 py-2 font-semibold w-28">Upsell</th>
                          <th className="text-right px-3 py-2 font-semibold w-28">Gasto</th>
                          <th className="w-10 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {linhas.map(l => (
                          <tr key={l.id} className={l.criativoNome ? '' : 'bg-amber-500/5'}>
                            <td className="px-3 py-2">
                              <select
                                value={l.criativoNome}
                                onChange={e => escolherCriativo(l.id, e.target.value)}
                                className={`bg-background border rounded-lg px-2 py-1.5 text-xs w-full max-w-[340px] focus:outline-none transition-colors ${l.criativoNome ? 'border-border text-foreground focus:border-primary/60' : 'border-amber-500/50 text-amber-300'}`}
                              >
                                <option value="">— selecione —</option>
                                {criativos.map(c => (
                                  <option key={c.nome} value={c.nome}>{c.nome}{c.status === 'pausado' ? ' (pausado)' : ''}</option>
                                ))}
                              </select>
                              {!l.reconhecido && (
                                <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate max-w-[340px]" title={l.token}>colado: {l.token}</p>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="0.01" min="0" value={l.vendaFront} onChange={e => atualizar(l.id, { vendaFront: e.target.value })} placeholder="0,00" className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-right w-full focus:outline-none focus:border-primary/60" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="0.01" min="0" value={l.vendaUpsell} onChange={e => atualizar(l.id, { vendaUpsell: e.target.value })} placeholder="0,00" className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-right w-full focus:outline-none focus:border-primary/60" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="0.01" min="0" value={l.gasto} onChange={e => atualizar(l.id, { gasto: e.target.value })} placeholder="0,00" className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-right w-full focus:outline-none focus:border-primary/60" />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button onClick={() => setLinhas(prev => prev && prev.filter(x => x.id !== l.id))} className="text-muted-foreground hover:text-red-400 transition p-1 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={importar}
                    disabled={importando || linhas.filter(l => l.criativoNome).length === 0}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {importando ? 'Importando...' : `Importar ${linhas.filter(l => l.criativoNome).length} criativo(s)`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
