'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Upload, X, Sparkles, AlertTriangle, CheckCircle2, Trash2, FileSpreadsheet, RefreshCw, Zap } from 'lucide-react'
import { getProdutosMapeamento, importarLancamentosEmLote, buscarGastoMetaPorPeriodo } from '@/app/actions/lancamento'
import { listarCriativosParaImport } from '@/app/actions/criativos'
import { extrairCriativo } from '@/lib/utils'

const hoje = format(new Date(), 'yyyy-MM-dd')

type Criativo = { nome: string; campaign_name: string; status: string }
type Produto = { nome_produto: string; tipo: string }

type LinhaPreview = {
  id: number
  dia: string          // yyyy-MM-dd
  raw: string          // linha original (nome cru colado) / origem
  token: string        // pedaço após a última "|" (nome do anúncio) — usado p/ casar
  origem: string       // origem de checkout completa (mostrada nas orgânicas)
  criativoNome: string // criativo casado/escolhido
  campanha: string
  reconhecido: boolean
  organica: boolean    // sem código de anúncio (bio / vazio / pg-* / manychat)
  herdado: boolean     // upsell que herdou o sck do front pelo e-mail
  soGasto: boolean     // gastou na Meta mas não vendeu no dia (0 vendas)
  vendaFront: string
  vendaUpsell: string
  gasto: string
  gastoAuto: boolean   // gasto veio puxado da Meta
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

// remove acentos + lowercase, para casar cabeçalhos/produtos independente de acento/caixa
function normalizar(s: any): string {
  return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// acha o valor de uma coluna aceitando variações de nome/acento
function pegarCampo(row: Record<string, any>, nomes: string[]): any {
  const alvo = nomes.map(normalizar)
  for (const k of Object.keys(row)) {
    if (alvo.includes(normalizar(k))) return row[k]
  }
  return undefined
}

// SheetJS pode devolver número (célula numérica) ou string ("236,13")
function precoNum(v: any): number {
  if (typeof v === 'number') return v
  return parseBR(String(v ?? ''))
}

// "26/07/2026 23:50:14" -> "2026-07-26". Aceita Date (célula de data do SheetJS)
// e ISO. Retorna null se não der pra ler.
function parseDataVenda(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return format(v, 'yyyy-MM-dd')
  const s = String(v ?? '').trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

// Valor BRUTO em BRL (preço da oferta) — só usado como fallback quando a
// planilha não traz a coluna de valor líquido (export antigo/incompleto).
function valorBRL(row: Record<string, any>): number {
  const moeda = String(pegarCampo(row, ['Moeda', 'Currency']) ?? '').toUpperCase().trim()
  if (moeda && moeda !== 'BRL') {
    const orig = precoNum(pegarCampo(row, ['Preço Original', 'Preco Original', 'Valor Original', 'Preço Original Convertido']))
    if (!isNaN(orig) && orig > 0) return orig
  }
  return precoNum(pegarCampo(row, ['Preço da Oferta', 'Preço', 'Preco', 'Valor', 'Valor da Oferta']))
}

// Valor LÍQUIDO em BRL — o que o produtor efetivamente recebe (Hotmart já
// desconta a taxa da plataforma + comissão de coprodutor/afiliado). O export
// da Hotmart traz a coluna "Você recebe" com esse valor; ANTES o import lia
// "Preço da Oferta" (bruto) e gravava como se fosse líquido — inflava a
// receita manual em ~10-15% (a taxa do Hotmart) em relação ao automático, que
// usa a comissão real do produtor vinda da API. Cai pro bruto só se a
// planilha não tiver a coluna líquida (export antigo).
function valorLiquidoBRL(row: Record<string, any>): number {
  const liquido = precoNum(pegarCampo(row, [
    'Você recebe', 'Voce recebe', 'Você Recebe', 'Voce Recebe', 'Você recebe?', 'Voce recebe?',
    'Valor Líquido', 'Valor Liquido', 'Valor líquido', 'Comissão', 'Comissao',
  ]))
  if (!isNaN(liquido) && liquido > 0) return liquido
  return valorBRL(row)
}

const fmtDia = (dia: string) => { const [y, m, d] = dia.split('-'); return `${d}/${m}` }

const round2 = (n: number) => Math.round(n * 100) / 100
const GASTO_MIN_SO_GASTO = 1 // ignora restos de centavos de campanhas pausadas

type GastoInfo = { valor: number; adName: string; criativo: string }

// Chave de casamento gasto×venda: o NOME do criativo cadastrado quando reconhece
// o anúncio; senão o texto cru (nome do anúncio / origem). É o mesmo espaço de
// chave dos dois lados, então cada variante (escala-01, escala-02...) fica
// separada — do jeito que foi lançado.
function chaveNomeGasto(it: { adName: string }, criativos: Criativo[]): string {
  return casar(it.adName, criativos)?.nome ?? it.adName
}

// Agrega o gasto da Meta por (dia + nome do criativo cadastrado). Soma ad_names
// que casam no mesmo criativo e guarda o ad_name de maior gasto (representativo).
function agregarGastoPorNome(itens: { dia: string; adName: string; criativo: string; valor: number }[], criativos: Criativo[]): Record<string, GastoInfo> {
  const agg: Record<string, GastoInfo & { _max: number }> = {}
  for (const it of itens) {
    const nome = chaveNomeGasto(it, criativos)
    const k = `${it.dia}||${nome}`
    if (!agg[k]) agg[k] = { valor: 0, adName: it.adName, criativo: it.criativo, _max: -1 }
    agg[k].valor += it.valor
    if (it.valor > agg[k]._max) { agg[k]._max = it.valor; agg[k].adName = it.adName }
  }
  const out: Record<string, GastoInfo> = {}
  for (const k in agg) { const { _max, ...rest } = agg[k]; out[k] = rest }
  return out
}

// Reconcilia o gasto da Meta com as linhas atuais (casando por NOME do criativo):
//  - atualiza o gasto das linhas de venda cujo criativo tem gasto na Meta;
//  - ACRESCENTA linhas "só gasto" (criativo gastou na Meta mas vendeu 0 no dia).
// Usado ao processar o arquivo e ao clicar em "Sincronizar gasto da Meta".
function reconciliarGasto(linhas: LinhaPreview[], gastoAgg: Record<string, GastoInfo>, criativos: Criativo[]): LinhaPreview[] {
  const chaveDe = (l: LinhaPreview) => `${l.dia}||${l.criativoNome || l.token}`
  const usados = new Set(linhas.filter(l => !l.organica).map(chaveDe))

  const atualizadas = linhas.map(l => {
    if (l.organica) return l
    const info = gastoAgg[chaveDe(l)]
    return info ? { ...l, gasto: String(round2(info.valor)), gastoAuto: true } : l
  })

  let id = linhas.reduce((m, l) => Math.max(m, l.id), 0) + 1
  const novas: LinhaPreview[] = []
  for (const k in gastoAgg) {
    const info = gastoAgg[k]
    if (usados.has(k) || info.valor < GASTO_MIN_SO_GASTO) continue
    const dia = k.slice(0, k.indexOf('||'))
    const token = info.adName || info.criativo
    const match = casar(token, criativos)
    novas.push({
      id: id++,
      dia,
      raw: token,
      token,
      origem: token,
      criativoNome: match?.nome ?? '',
      campanha: match?.campaign_name ?? '',
      reconhecido: !!match,
      organica: false,
      herdado: false,
      soGasto: true,
      vendaFront: '',
      vendaUpsell: '',
      gasto: String(round2(info.valor)),
      gastoAuto: true,
    })
  }

  return [...atualizadas, ...novas].sort(
    (a, b) => a.dia.localeCompare(b.dia)
      || Number(a.organica) - Number(b.organica)
      || Number(a.soGasto) - Number(b.soGasto)
      || (parseFloat(b.vendaFront) || 0) + (parseFloat(b.vendaUpsell) || 0) - ((parseFloat(a.vendaFront) || 0) + (parseFloat(a.vendaUpsell) || 0)),
  )
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
  const [multiDia, setMultiDia] = useState(false)
  const [periodo, setPeriodo] = useState<{ min: string; max: string } | null>(null)
  const [descartadas, setDescartadas] = useState<{ semData: number } | null>(null)
  const [gastoAgg, setGastoAgg] = useState<Record<string, GastoInfo>>({})
  const [sincronizando, setSincronizando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)

  const inputClass = 'bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60 w-full transition-colors'

  async function abrir() {
    setOpen(true)
    setResumo(null)
    setLinhas(null)
    setTexto('')
    setData(hoje)
    setMultiDia(false)
    setPeriodo(null)
    setDescartadas(null)
    setGastoAgg({})
    const [cri, prod] = await Promise.all([listarCriativosParaImport(), getProdutosMapeamento()])
    setCriativos(cri as Criativo[])
    setProdutos(prod as Produto[])
    setProdutoFront(prod.find((p: Produto) => p.tipo === 'front')?.nome_produto ?? prod[0]?.nome_produto ?? '')
    setProdutoUpsell(prod.find((p: Produto) => p.tipo === 'upsell')?.nome_produto ?? prod[1]?.nome_produto ?? '')
  }

  function fechar() {
    setOpen(false)
  }

  // front/upsell a partir do "Nome do Produto" (via mapeamento de produtos)
  function tipoDoProduto(nome: string): string | undefined {
    const n = normalizar(nome)
    if (!n) return undefined
    const m = produtos.find(p => {
      const pn = normalizar(p.nome_produto)
      return pn && (n.includes(pn) || pn.includes(n))
    })
    return m?.tipo
  }

  function processar() {
    setResumo(null)
    setMultiDia(false)
    setPeriodo(null)
    setDescartadas(null)
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
        dia: data,
        raw,
        token,
        origem: raw,
        criativoNome: match?.nome ?? '',
        campanha: match?.campaign_name ?? '',
        reconhecido: !!match,
        organica: false,
        herdado: false,
        soGasto: false,
        vendaFront: numToInput(vendas[0]),
        vendaUpsell: numToInput(vendas[1]),
        gasto: numToInput(gasto),
        gastoAuto: false,
      })
    }

    setLinhas(out)
  }

  // Lê .xlsx/.xls/.csv multi-dia: Data de Venda | Nome do Produto | Moeda |
  // Preço da Oferta | Preço Original | Email | Origem de Checkout.
  // Agrupa por (DIA + criativo/fase), soma front/upsell, herda o criativo do
  // upsell pelo e-mail quando o upsell não marcou o sck, e puxa o gasto da Meta.
  async function processarArquivo(file: File) {
    setResumo(null)
    setLinhas(null)
    setPeriodo(null)
    setDescartadas(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      type Parsed = {
        dia: string
        email: string
        tipo: 'front' | 'upsell'
        valor: number
        origem: string
        token: string
        temAnuncio: boolean // origem tem código de anúncio (adNN)
        herdado: boolean
      }

      const parsed: Parsed[] = []
      let semData = 0
      for (const row of rows) {
        const produto = String(pegarCampo(row, ['Nome do Produto', 'Produto']) ?? '').trim()
        const origem = String(pegarCampo(row, ['Origem de Checkout', 'Origem', 'src', 'sck']) ?? '').trim()
        const valor = valorLiquidoBRL(row)
        const dia = parseDataVenda(pegarCampo(row, ['Data de Venda', 'Data da Venda', 'Data', 'Data da Transação']))
        const email = String(pegarCampo(row, ['Email', 'E-mail', 'E-Mail Comprador']) ?? '').trim().toLowerCase()
        if (isNaN(valor) || valor <= 0) continue
        if (!dia) { semData++; continue }
        const tipo = tipoDoProduto(produto) === 'upsell' ? 'upsell' : 'front'
        const token = origem.includes('|') ? origem.split('|').pop()!.trim() : origem.trim()
        parsed.push({ dia, email, tipo, valor, origem, token, temAnuncio: !!extrairCriativo(origem), herdado: false })
      }

      // Herança do upsell pelo e-mail: quando o upsell veio sem código de anúncio
      // (vazio/bio) mas o front do mesmo e-mail marcou o sck, o upsell herda esse
      // criativo — a pessoa comprou o front por anúncio e o upsell não marcou.
      const porEmail = new Map<string, Parsed[]>()
      for (const p of parsed) {
        if (!p.email) continue
        if (!porEmail.has(p.email)) porEmail.set(p.email, [])
        porEmail.get(p.email)!.push(p)
      }
      for (const p of parsed) {
        if (p.tipo !== 'upsell' || p.temAnuncio || !p.email) continue
        const irmaos = porEmail.get(p.email) ?? []
        const doador = irmaos.find(d => d.temAnuncio && d.tipo === 'front') ?? irmaos.find(d => d.temAnuncio)
        if (doador) {
          p.origem = doador.origem
          p.token = doador.token
          p.temAnuncio = true
          p.herdado = true
        }
      }

      // Agrupa: anúncios por (dia + NOME do criativo cadastrado) — cada variante
      // separada, do jeito que foi lançado. Orgânicas por (dia + origem) só pra
      // você ver quanto faturaram e remover.
      type Agg = { dia: string; matchNome: string | null; campanha: string | null; reconhecido: boolean; token: string; origem: string; front: number; upsell: number; organica: boolean; herdado: boolean }
      const mapa = new Map<string, Agg>()
      for (const p of parsed) {
        const organica = !p.temAnuncio
        const match = organica ? null : casar(p.token, criativos)
        const chaveNome = organica ? null : (match?.nome ?? p.token)
        const key = organica ? `org||${p.dia}||${p.origem || '(sem origem)'}` : `${p.dia}||${chaveNome}`
        if (!mapa.has(key)) {
          mapa.set(key, { dia: p.dia, matchNome: match?.nome ?? null, campanha: match?.campaign_name ?? null, reconhecido: !!match, token: p.token, origem: p.origem || '(sem origem)', front: 0, upsell: 0, organica, herdado: false })
        }
        const agg = mapa.get(key)!
        if (p.tipo === 'upsell') agg.upsell += p.valor
        else agg.front += p.valor
        if (p.herdado) agg.herdado = true
      }

      const grupos = [...mapa.values()]
      if (grupos.length === 0) {
        setResumo({ vendasInseridas: 0, gastosInseridos: 0, ignorados: 0, erros: ['Nenhuma linha válida encontrada. Confira as colunas "Data de Venda", "Nome do Produto", "Preço da Oferta" e "Origem de Checkout".'] })
        return
      }

      // Linhas de venda (gasto entra no reconcile logo abaixo).
      let id = 0
      const vendasLinhas: LinhaPreview[] = grupos.map(agg => ({
        id: id++,
        dia: agg.dia,
        raw: agg.token,
        token: agg.token,
        origem: agg.origem,
        criativoNome: agg.matchNome ?? '',
        campanha: agg.campanha ?? '',
        reconhecido: agg.reconhecido,
        organica: agg.organica,
        herdado: agg.herdado,
        soGasto: false,
        vendaFront: numToInput(Math.round(agg.front * 100) / 100),
        vendaUpsell: numToInput(Math.round(agg.upsell * 100) / 100),
        gasto: '',
        gastoAuto: false,
      }))

      // Puxa o gasto da Meta já sincronizado (por dia/anúncio), agrega por NOME do
      // criativo e reconcilia: preenche o gasto das vendas e ACRESCENTA os
      // criativos que gastaram mas venderam 0 no dia.
      const dias = grupos.map(g => g.dia).sort()
      const minDia = dias[0]
      const maxDia = dias[dias.length - 1]
      const { itens } = await buscarGastoMetaPorPeriodo(minDia, maxDia)
      const gAgg = agregarGastoPorNome(itens ?? [], criativos)
      setGastoAgg(gAgg)
      const out = reconciliarGasto(vendasLinhas, gAgg, criativos)

      setMultiDia(true)
      setPeriodo({ min: minDia, max: maxDia })
      setDescartadas(semData > 0 ? { semData } : null)
      setLinhas(out)
    } catch (e: any) {
      setResumo({ vendasInseridas: 0, gastosInseridos: 0, ignorados: 0, erros: ['Erro ao ler o arquivo: ' + (e?.message ?? String(e))] })
    }
  }

  // Re-sincroniza a Meta no período do arquivo e repuxa o gasto (caso os dias
  // ainda não estivessem sincronizados ou tenham mudado).
  async function sincronizarMeta() {
    if (!periodo || !linhas) return
    setSincronizando(true)
    try {
      const diasAtras = Math.min(90, Math.max(1, Math.ceil((Date.now() - new Date(`${periodo.min}T12:00:00`).getTime()) / 86400000) + 1))
      await fetch(`/api/meta/sync?dias=${diasAtras}`).catch(() => {})
      const { itens } = await buscarGastoMetaPorPeriodo(periodo.min, periodo.max)
      const gAgg = agregarGastoPorNome(itens ?? [], criativos)
      setGastoAgg(gAgg)
      setLinhas(prev => prev && reconciliarGasto(prev, gAgg, criativos))
    } finally {
      setSincronizando(false)
    }
  }

  function atualizar(id: number, patch: Partial<LinhaPreview>) {
    setLinhas(prev => prev && prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }

  function escolherCriativo(id: number, nome: string) {
    const c = criativos.find(x => x.nome === nome)
    setLinhas(prev => prev && prev.map(l => {
      if (l.id !== id) return l
      // ao escolher o criativo, puxa o gasto da Meta daquele nome/dia (se houver)
      const info = nome ? gastoAgg[`${l.dia}||${nome}`] : undefined
      return {
        ...l,
        criativoNome: nome,
        campanha: c?.campaign_name ?? '',
        reconhecido: !!c,
        ...(info ? { gasto: String(round2(info.valor)), gastoAuto: true } : {}),
      }
    }))
  }

  const adLinhas = linhas?.filter(l => !l.organica) ?? []
  const orgLinhas = linhas?.filter(l => l.organica) ?? []
  const naoReconhecidos = adLinhas.filter(l => !l.criativoNome).length
  const totFront = adLinhas.reduce((s, l) => s + (parseFloat(l.vendaFront) || 0), 0)
  const totUpsell = adLinhas.reduce((s, l) => s + (parseFloat(l.vendaUpsell) || 0), 0)
  const totGasto = adLinhas.reduce((s, l) => s + (parseFloat(l.gasto) || 0), 0)
  const totOrg = orgLinhas.reduce((s, l) => s + (parseFloat(l.vendaFront) || 0) + (parseFloat(l.vendaUpsell) || 0), 0)
  const fmtBR = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  async function importar() {
    if (!linhas) return
    setImportando(true)
    const itens = linhas
      .filter(l => l.criativoNome && !l.organica)
      .map(l => ({
        criativo: l.criativoNome,
        campanha: l.campanha || null,
        data: l.dia,
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

  const importaveis = adLinhas.filter(l => l.criativoNome).length

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
                <p className="text-xs text-muted-foreground mt-0.5">Suba a planilha (vários dias) ou cole o texto — confira antes de salvar</p>
              </div>
              <button onClick={fechar} className="text-muted-foreground hover:text-foreground transition p-1 rounded-lg hover:bg-muted/50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Config do lote */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    {multiDia ? 'Período (da planilha)' : 'Data do lote'}
                  </label>
                  {multiDia && periodo ? (
                    <div className={`${inputClass} flex items-center gap-2 text-muted-foreground`}>
                      <span className="text-foreground font-medium">{fmtDia(periodo.min)}</span>
                      <span>→</span>
                      <span className="text-foreground font-medium">{fmtDia(periodo.max)}</span>
                    </div>
                  ) : (
                    <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputClass} />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Produto front</label>
                  <select value={produtoFront} onChange={e => setProdutoFront(e.target.value)} className={inputClass}>
                    {produtos.map(p => <option key={p.nome_produto} value={p.nome_produto}>{p.nome_produto}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Produto upsell</label>
                  <select value={produtoUpsell} onChange={e => setProdutoUpsell(e.target.value)} className={inputClass}>
                    {produtos.map(p => <option key={p.nome_produto} value={p.nome_produto}>{p.nome_produto}</option>)}
                  </select>
                </div>
              </div>

              {/* Entrada */}
              {!resumo && (
                <div>
                  {/* Upload de planilha (.xlsx/.xls/.csv) */}
                  <div className="mb-4 rounded-xl border border-dashed border-border bg-muted/20 p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-card border border-border text-foreground hover:border-primary/50 transition cursor-pointer shrink-0">
                        <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                        Subir .xls / .csv
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) processarArquivo(f); e.target.value = '' }}
                        />
                      </label>
                      <p className="text-xs text-muted-foreground leading-snug flex-1 min-w-[240px]">
                        Separa por <span className="font-mono text-foreground">Data de Venda</span> e criativo, soma front/upsell (converte USD/EUR pra BRL) e <span className="text-foreground font-medium">puxa o gasto da Meta</span> por dia.
                      </p>
                    </div>
                  </div>

                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Ou cole o texto (dia único)</label>
                  <textarea
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    rows={6}
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
                      Pré-visualizar texto
                    </button>
                    {linhas && <span className="text-xs text-muted-foreground">{linhas.length} linha{linhas.length !== 1 ? 's' : ''} detectada{linhas.length !== 1 ? 's' : ''}</span>}
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
                    <button onClick={() => { setResumo(null); setLinhas(null); setTexto(''); setMultiDia(false); setPeriodo(null) }} className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition">
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
                  {/* Avisos */}
                  <div className="flex flex-wrap items-center gap-2">
                    {naoReconhecidos > 0 && (
                      <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-300">{naoReconhecidos} criativo(s) não reconhecido(s) — selecione ou será ignorado.</p>
                      </div>
                    )}
                    {orgLinhas.length > 0 && (
                      <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-xl px-3 py-2">
                        <p className="text-xs text-muted-foreground">{orgLinhas.length} linha(s) orgânica(s) (bio/sem anúncio) — R$ {fmtBR(totOrg)}. Não entram; remova as que quiser.</p>
                      </div>
                    )}
                    {descartadas?.semData ? (
                      <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-xl px-3 py-2">
                        <p className="text-xs text-muted-foreground">{descartadas.semData} linha(s) sem data — ignoradas.</p>
                      </div>
                    ) : null}
                    {multiDia && (
                      <button
                        onClick={sincronizarMeta}
                        disabled={sincronizando}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-card border border-border text-foreground hover:border-primary/50 transition disabled:opacity-50 ml-auto"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
                        {sincronizando ? 'Sincronizando Meta...' : 'Sincronizar gasto da Meta'}
                      </button>
                    )}
                  </div>

                  <div className="border border-border rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm min-w-[780px]">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/20">
                          {multiDia && <th className="text-left px-3 py-2 font-semibold w-16">Dia</th>}
                          <th className="text-left px-3 py-2 font-semibold">Criativo</th>
                          <th className="text-right px-3 py-2 font-semibold w-28">Front</th>
                          <th className="text-right px-3 py-2 font-semibold w-28">Upsell</th>
                          <th className="text-right px-3 py-2 font-semibold w-28">Gasto</th>
                          <th className="w-10 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {linhas.map(l => (
                          <tr key={l.id} className={l.organica ? 'bg-muted/20' : (l.criativoNome ? '' : 'bg-amber-500/5')}>
                            {multiDia && <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDia(l.dia)}</td>}
                            <td className="px-3 py-2">
                              {l.organica ? (
                                <div className="text-xs">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">Orgânica</span>
                                    <span className="font-mono text-muted-foreground truncate max-w-[300px]" title={l.origem}>{l.origem}</span>
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={l.criativoNome}
                                      onChange={e => escolherCriativo(l.id, e.target.value)}
                                      className={`bg-background border rounded-lg px-2 py-1.5 text-xs w-full max-w-[320px] focus:outline-none transition-colors ${l.criativoNome ? 'border-border text-foreground focus:border-primary/60' : 'border-amber-500/50 text-amber-300'}`}
                                    >
                                      <option value="">— selecione —</option>
                                      {criativos.map(c => (
                                        <option key={c.nome} value={c.nome}>{c.nome}{c.status === 'pausado' ? ' (pausado)' : ''}</option>
                                      ))}
                                    </select>
                                    {l.herdado && (
                                      <span title="Upsell correlacionado ao criativo do front pelo e-mail" className="text-[9px] font-bold uppercase tracking-wide text-violet-300 bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.5 rounded shrink-0">e-mail*</span>
                                    )}
                                    {l.soGasto && (
                                      <span title="Gastou na Meta mas não vendeu neste dia" className="text-[9px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0">0 vendas</span>
                                    )}
                                  </div>
                                  {!l.reconhecido && (
                                    <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate max-w-[320px]" title={l.token}>colado: {l.token}</p>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="0.01" min="0" value={l.vendaFront} onChange={e => atualizar(l.id, { vendaFront: e.target.value })} placeholder="0,00" className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-right w-full focus:outline-none focus:border-primary/60" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="0.01" min="0" value={l.vendaUpsell} onChange={e => atualizar(l.id, { vendaUpsell: e.target.value })} placeholder="0,00" className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-right w-full focus:outline-none focus:border-primary/60" />
                            </td>
                            <td className="px-3 py-2">
                              {l.organica ? (
                                <div className="text-right text-xs text-muted-foreground pr-2">—</div>
                              ) : (
                                <div className="relative">
                                  <input type="number" step="0.01" min="0" value={l.gasto} onChange={e => atualizar(l.id, { gasto: e.target.value, gastoAuto: false })} placeholder="0,00" className={`bg-background border rounded-lg px-2 py-1.5 text-xs text-right w-full focus:outline-none focus:border-primary/60 ${l.gastoAuto ? 'border-emerald-500/40' : 'border-border'}`} />
                                  {l.gastoAuto && (
                                    <span title="Gasto puxado da Meta" className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                                      <Zap className="w-2.5 h-2.5 text-emerald-400" />
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button onClick={() => setLinhas(prev => prev && prev.filter(x => x.id !== l.id))} className="text-muted-foreground hover:text-red-400 transition p-1 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td className="px-3 py-2.5 text-[11px] font-bold text-foreground uppercase tracking-wide" colSpan={multiDia ? 2 : 1}>Total anúncios ({adLinhas.length})</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-emerald-400">R$ {fmtBR(totFront)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-violet-400">R$ {fmtBR(totUpsell)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-foreground">R$ {fmtBR(totGasto)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <button
                    onClick={importar}
                    disabled={importando || importaveis === 0}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {importando ? 'Importando...' : `Importar ${importaveis} criativo(s)${multiDia ? ' · vários dias' : ''}`}
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
