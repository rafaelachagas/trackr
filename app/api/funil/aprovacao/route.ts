import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// % de aprovação de pagamento do funil — via API sales/history da Hotmart
// (o webhook NÃO recebe cartão recusado; a API recebe: recusa vira transação
// CANCELLED com payment.type CREDIT_CARD). Só LEITURA na Hotmart, nada é salvo.
//
// Cartão:  aprovadas ÷ (aprovadas + canceladas/recusadas)
// PIX:     pagas ÷ (pagas + expiradas)  [gerado → pago]
// Boleto:  idem PIX.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TOKEN_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token'
const SALES_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

// Famílias de pagamento (payment.type da Hotmart → grupo exibido).
function familia(tipo: string | undefined): 'cartao' | 'pix' | 'boleto' | 'outros' {
  switch (tipo) {
    case 'CREDIT_CARD': case 'APPLE_PAY': case 'GOOGLE_PAY': case 'SAMSUNG_PAY': return 'cartao'
    case 'PIX': return 'pix'
    case 'BILLET': return 'boleto'
    default: return 'outros'
  }
}

interface Contagem { aprovadas: number; falhas: number }

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const funilId = sp.get('funil_id')
    const dInicio = sp.get('d_inicio')
    const dFim = sp.get('d_fim')
    if (!funilId || !dInicio || !dFim) return NextResponse.json({ error: 'parâmetros obrigatórios' }, { status: 400 })

    const { data: funil } = await supabaseAdmin.from('funis').select('produto_front, orderbumps, upsells').eq('id', funilId).maybeSingle()
    if (!funil) return NextResponse.json({ error: 'Funil não encontrado' }, { status: 404 })
    const produtos = new Set<string>([
      funil.produto_front,
      ...(Array.isArray(funil.orderbumps) ? funil.orderbumps : []),
      ...(Array.isArray(funil.upsells) ? funil.upsells : []),
    ])

    const { data: cfg } = await supabaseAdmin.from('configuracoes').select('valor').eq('chave', 'hotmart_basic').maybeSingle()
    if (!cfg?.valor) return NextResponse.json({ error: 'API da Hotmart não configurada' }, { status: 400 })

    const tk = await fetch(`${TOKEN_URL}?grant_type=client_credentials`, {
      method: 'POST',
      headers: { Authorization: `Basic ${cfg.valor}`, 'Content-Type': 'application/json', ...BROWSER_HEADERS },
    }).then((r) => r.json())
    const token = tk.access_token
    if (!token) return NextResponse.json({ error: 'Falha ao autenticar na Hotmart' }, { status: 502 })

    // Bordas do dia em SP (UTC-3) em epoch ms.
    const start = Date.parse(`${dInicio}T00:00:00-03:00`)
    const end = Date.parse(`${dFim}T23:59:59.999-03:00`)

    const grupos: Record<'cartao' | 'pix' | 'boleto', Contagem> = {
      cartao: { aprovadas: 0, falhas: 0 }, pix: { aprovadas: 0, falhas: 0 }, boleto: { aprovadas: 0, falhas: 0 },
    }

    // APPROVED/COMPLETE alimentam o numerador; CANCELLED (recusa de cartão) e
    // EXPIRED (pix/boleto não pago) o denominador de falhas.
    const consultas: { status: string; destino: 'aprovadas' | 'falhas' }[] = [
      { status: 'APPROVED', destino: 'aprovadas' },
      { status: 'COMPLETE', destino: 'aprovadas' },
      { status: 'CANCELLED', destino: 'falhas' },
      { status: 'EXPIRED', destino: 'falhas' },
    ]

    // Mesmo padrão da reconciliação de SCK (que já roda na Vercel sem tomar
    // bloqueio): max_results=100 e retry em 429/5xx — o WAF da Hotmart às
    // vezes recusa a 1ª tentativa vinda de IP de datacenter.
    const erros: string[] = []
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
    async function fetchPagina(url: string): Promise<Response | null> {
      for (let tent = 0; tent < 4; tent++) {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...BROWSER_HEADERS } })
        if (r.ok) return r
        if (r.status !== 429 && r.status < 500) {
          const body = await r.text().catch(() => '')
          erros.push(`${r.status}${body ? ': ' + body.slice(0, 120) : ''}`)
          return null
        }
        await sleep(800 * (tent + 1))
        if (tent === 3) erros.push(`${r.status} (após retries)`)
      }
      return null
    }

    for (const { status, destino } of consultas) {
      let pageToken: string | null = null
      for (let page = 0; page < 120; page++) {
        const p = new URLSearchParams({
          start_date: String(start), end_date: String(end),
          transaction_status: status, max_results: '100',
        })
        if (pageToken) p.set('page_token', pageToken)
        const r = await fetchPagina(`${SALES_URL}?${p}`)
        if (!r) break
        const j = await r.json()
        for (const it of j.items ?? []) {
          const nomeProduto = it.product?.name
          if (nomeProduto && !produtos.has(nomeProduto)) continue
          const fam = familia(it.purchase?.payment?.type)
          if (fam === 'outros') continue
          grupos[fam][destino] += 1
        }
        pageToken = j.page_info?.next_page_token ?? null
        if (!pageToken) break
      }
    }

    // Se TUDO falhou (nenhuma transação vista e houve erro upstream), devolve
    // erro em vez de zeros — zeros silenciosos parecem "0% de aprovação".
    const nadaVisto = Object.values(grupos).every((g) => g.aprovadas + g.falhas === 0)
    if (nadaVisto && erros.length) {
      return NextResponse.json({ error: `Hotmart recusou a consulta (${erros[0]})` }, { status: 502 })
    }

    const taxa = (c: Contagem) => (c.aprovadas + c.falhas > 0 ? (c.aprovadas / (c.aprovadas + c.falhas)) * 100 : null)
    return NextResponse.json({
      cartao: { ...grupos.cartao, taxa: taxa(grupos.cartao) },
      pix: { ...grupos.pix, taxa: taxa(grupos.pix) },
      boleto: { ...grupos.boleto, taxa: taxa(grupos.boleto) },
    })
  } catch (e: any) {
    console.error('[funil/aprovacao]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
