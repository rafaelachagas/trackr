'use client'

import { useState, useEffect } from 'react'
import { Save, Settings2, Sliders } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AcaoOtimizacao } from '@/types'

type RegraFramework = {
  p7: boolean
  p3: boolean
  p1: boolean
  acao: AcaoOtimizacao
}

const REGRAS_PADRAO: RegraFramework[] = [
  { p7: true,  p3: true,  p1: true,  acao: '+20% orçamento' },
  { p7: true,  p3: true,  p1: false, acao: 'Manter' },
  { p7: true,  p3: false, p1: true,  acao: '+20% orçamento' },
  { p7: true,  p3: false, p1: false, acao: '-20% ou pausar' },
  { p7: false, p3: true,  p1: true,  acao: '+20% orçamento' },
  { p7: false, p3: true,  p1: false, acao: 'Manter' },
  { p7: false, p3: false, p1: true,  acao: 'Manter' },
  { p7: false, p3: false, p1: false, acao: 'Pausar' },
]

const ACOES: AcaoOtimizacao[] = ['+20% orçamento', 'Manter', '-20% ou pausar', 'Pausar']

const COR_ACAO: Record<AcaoOtimizacao, string> = {
  '+20% orçamento': 'text-emerald-400',
  'Manter': 'text-yellow-400',
  '-20% ou pausar': 'text-orange-400',
  'Pausar': 'text-red-400',
}

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [roasMinimo, setRoasMinimo] = useState('2.0')
  const [regras, setRegras] = useState<RegraFramework[]>(REGRAS_PADRAO)

  useEffect(() => {
    carregarConfiguracoes()
  }, [])

  async function carregarConfiguracoes() {
    setLoading(true)
    try {
      const { data: configs } = await supabase.from('configuracoes').select('*')
      if (configs) {
        configs.forEach(c => {
          if (c.chave === 'roas_minimo') setRoasMinimo(c.valor || '2.0')
          if (c.chave === 'framework_regras') {
            try { setRegras(JSON.parse(c.valor)) } catch {}
          }
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function salvarConfiguracoes() {
    setSaving(true)
    try {
      const updates = [
        { chave: 'roas_minimo', valor: roasMinimo },
        { chave: 'framework_regras', valor: JSON.stringify(regras) },
      ]
      for (const item of updates) {
        await supabase.from('configuracoes').upsert(
          { chave: item.chave, valor: item.valor, updated_at: new Date().toISOString() },
          { onConflict: 'chave' }
        )
      }
      alert('Configurações salvas com sucesso!')
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar =/')
    } finally {
      setSaving(false)
    }
  }

  function atualizarAcaoRegra(index: number, acao: AcaoOtimizacao) {
    setRegras(prev => prev.map((r, i) => i === index ? { ...r, acao } : r))
  }

  function resetarRegras() {
    setRegras(REGRAS_PADRAO)
  }

  return (
    <div className="max-w-5xl mx-auto text-foreground pb-12 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Configurações
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Critérios de decisão do painel. As fontes de dados (Meta e Hotmart) ficam em <span className="text-foreground font-medium">Fontes de dados</span>.
          </p>
        </div>
        <button
          onClick={salvarConfiguracoes}
          disabled={loading || saving}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold transition shadow-lg shadow-primary/20 disabled:opacity-50 whitespace-nowrap"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">

        {/* CRITÉRIO DE ROAS */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center border border-primary/30">
              <Sliders className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Critério de ROAS</h2>
              <p className="text-xs text-muted-foreground">Ponto de equilíbrio usado nas análises</p>
            </div>
          </div>

          <div className="max-w-xs">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Meta de ROAS Mínimo (breakeven)</label>
            <input
              type="number" step="0.1"
              value={roasMinimo}
              onChange={e => setRoasMinimo(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition"
            />
            <p className="text-[10px] text-muted-foreground mt-1">ROAS abaixo deste valor é considerado negativo nas análises do framework. A cotação do dólar e a classificação front/upsell são automáticas.</p>
          </div>
        </div>

        {/* FRAMEWORK DE DECISÃO */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center border border-violet-500/30">
                <Settings2 className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Framework de Decisão</h2>
                <p className="text-xs text-muted-foreground">Qual ação tomar para cada combinação de ROAS (7d / 3d / 1d)</p>
              </div>
            </div>
            <button
              onClick={resetarRegras}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 bg-accent hover:bg-accent/70 rounded-lg border border-border transition whitespace-nowrap self-start sm:self-auto"
            >
              Resetar padrão
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">ROAS 7 dias</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">ROAS 3 dias</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">ROAS 1 dia</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {regras.map((regra, i) => (
                  <tr key={i} className="group hover:bg-accent/30 transition-colors">
                    {([regra.p7, regra.p3, regra.p1]).map((positivo, j) => (
                      <td key={j} className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${positivo ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/15 text-red-400 border border-red-500/25'}`}>
                          {positivo ? '✓ Positivo' : '✗ Negativo'}
                        </span>
                      </td>
                    ))}
                    <td className="py-3">
                      <select
                        value={regra.acao}
                        onChange={e => atualizarAcaoRegra(i, e.target.value as AcaoOtimizacao)}
                        className={`bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:border-violet-500 transition cursor-pointer ${COR_ACAO[regra.acao]}`}
                      >
                        {ACOES.map(a => (
                          <option key={a} value={a} className="text-foreground bg-card">{a}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground mt-4">
            Cada linha é uma combinação de ROAS positivo/negativo nos últimos 7, 3 e 1 dia. A ação definida aqui aparece como selo em cada criativo na aba <span className="text-foreground font-medium">Analisar Criativos</span>.
          </p>
        </div>

      </div>
    </div>
  )
}
