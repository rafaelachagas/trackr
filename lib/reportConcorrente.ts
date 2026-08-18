// Renderizador do report.html de inteligência do concorrente.
// Puro (sem I/O, sem React) — dá pra usar no cliente pra baixar o arquivo.
// Estilo dark "INTEL · Espionar Concorrente".

export interface InsightExec { label: string; texto: string }
export interface CriativoReport {
  ad: string            // "001"
  id: string
  titulo: string
  cta: string | null
  rodando: number | null   // dias no ar
  formato: string
  ativos: number
  image_url?: string | null
}
export interface PadraoCopy { nome: string; freq: string; descricao: string; exemplos: string[] }
export interface RecomendacaoTatica { titulo: string; texto: string; prioridade: 'alta' | 'media' | 'baixa' }

export interface RelatorioConcorrente {
  nome: string
  slug: string
  data: string          // dd/mm/yyyy
  totalAnalisados: number
  limite: number
  resumoExecutivo: InsightExec[]
  criativos: CriativoReport[]
  padroes: PadraoCopy[]
  recomendacoes: RecomendacaoTatica[]
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const PRIO_LABEL: Record<string, string> = { alta: 'PRIORIDADE ALTA', media: 'PRIORIDADE MÉDIA', baixa: 'PRIORIDADE BAIXA' }
const PRIO_COR: Record<string, string> = { alta: '#c97a4a', media: '#8891a8', baixa: '#5b6472' }

export function renderRelatorioHTML(r: RelatorioConcorrente): string {
  const inicial = (r.nome || '?').trim().slice(0, 1).toUpperCase()

  const execCards = r.resumoExecutivo.map((it) => `
    <div class="card ins">
      <div class="ins-badge">${esc(it.label.slice(0, 1).toUpperCase())}</div>
      <div>
        <div class="mono muted xs mb6">${esc(it.label.toUpperCase())}</div>
        <p>${esc(it.texto)}</p>
      </div>
    </div>`).join('')

  const criCards = r.criativos.map((c) => `
    <div class="card cri">
      <div class="thumb">${c.image_url ? `<img src="${esc(c.image_url)}" referrerpolicy="no-referrer" alt=""/>` : `<span class="mono muted">VÍDEO</span>`}<span class="thumb-tag mono">${esc(c.formato.toUpperCase())}</span></div>
      <div class="mono muted xs mt12">AD · ${esc(c.ad)} · ${esc(c.id)}</div>
      <div class="cri-title">${esc(c.titulo)}</div>
      ${c.cta ? `<div class="cta mono">${esc(c.cta)} →</div>` : ''}
      <div class="cri-stats">
        <div><div class="mono muted xs">RODANDO</div><div class="big">${c.rodando ?? '—'}${c.rodando != null ? '<span class="d">d</span>' : ''}</div></div>
        <div><div class="mono muted xs">FORMATO</div><div class="big sm">${esc(c.formato)}</div></div>
        <div><div class="mono muted xs">ATIVOS</div><div class="big">${c.ativos}</div></div>
      </div>
    </div>`).join('')

  const padCards = r.padroes.map((p, i) => `
    <div class="card pad">
      <div class="pad-head"><h4>${esc(p.nome)}</h4><span class="mono muted xs">${esc(p.freq)}</span></div>
      <p class="muted">${esc(p.descricao)}</p>
      ${p.exemplos.slice(0, 3).map((ex) => `<div class="quote mono">${esc(ex)}</div>`).join('')}
    </div>`).join('')

  const recCards = r.recomendacoes.map((rec, i) => `
    <div class="card rec">
      <div class="rec-num mono">${String(i + 1).padStart(2, '0')}</div>
      <div class="rec-body"><h4>${esc(rec.titulo)}</h4><p class="muted">${esc(rec.texto)}</p></div>
      <div class="prio mono" style="color:${PRIO_COR[rec.prioridade] || '#8891a8'};border-color:${PRIO_COR[rec.prioridade] || '#8891a8'}44">${esc(PRIO_LABEL[rec.prioridade] || 'PRIORIDADE')}</div>
    </div>`).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Relatório · ${esc(r.nome)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { --bg:#0a0d0f; --card:#11161a; --card2:#0e1316; --bd:rgba(255,255,255,0.07); --fg:#e8ecef; --muted:#7c858c; --accent:#e8ecef; }
  body { background:var(--bg); color:var(--fg); font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .mono { font-family:'JetBrains Mono','SFMono-Regular',ui-monospace,Menlo,Consolas,monospace; letter-spacing:0.08em; }
  .muted { color:var(--muted); }
  .xs { font-size:11px; } .mb6{margin-bottom:6px;} .mt12{margin-top:12px;}
  .wrap { max-width:1280px; margin:0 auto; padding:40px 32px 80px; }
  .hero { background:linear-gradient(180deg,var(--card) 0%,var(--card2) 100%); border:1px solid var(--bd); border-radius:24px; padding:48px 44px; }
  .hero-top { display:flex; justify-content:space-between; align-items:center; font-size:12px; }
  .dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#37d67a; margin-right:8px; vertical-align:middle; }
  .tag { display:inline-block; border:1px solid var(--bd); border-radius:8px; padding:8px 16px; font-size:12px; margin:32px 0 20px; }
  h1 { font-size:clamp(44px,7vw,92px); font-weight:800; letter-spacing:-0.03em; line-height:0.95; }
  .sub { color:var(--muted); max-width:640px; margin-top:20px; font-size:16px; }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:40px; }
  .stat { border:1px solid var(--bd); border-radius:14px; padding:20px 22px; background:rgba(255,255,255,0.01); }
  .stat .big { font-size:26px; font-weight:700; margin-top:10px; }
  section { margin-top:72px; }
  .sec-head { display:flex; align-items:baseline; gap:20px; border-bottom:1px solid var(--bd); padding-bottom:20px; margin-bottom:32px; }
  .sec-head .n { color:var(--muted); font-size:13px; }
  .sec-head h2 { font-size:34px; font-weight:700; letter-spacing:-0.02em; }
  .sec-head .r { margin-left:auto; color:var(--muted); font-size:12px; }
  .grid2 { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
  .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .card { background:var(--card); border:1px solid var(--bd); border-radius:16px; padding:24px; }
  .ins { display:flex; gap:16px; }
  .ins-badge { width:34px; height:34px; border-radius:9px; border:1px solid var(--bd); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; flex-shrink:0; }
  .cri .thumb { position:relative; aspect-ratio:1; border-radius:12px; overflow:hidden; background:#000; display:flex; align-items:center; justify-content:center; }
  .cri .thumb img { width:100%; height:100%; object-fit:cover; }
  .thumb-tag { position:absolute; bottom:8px; left:8px; font-size:10px; background:rgba(0,0,0,0.7); padding:3px 7px; border-radius:5px; }
  .cri-title { font-weight:700; font-size:16px; margin-top:8px; }
  .cta { display:inline-block; border:1px solid var(--bd); border-radius:8px; padding:8px 16px; font-size:12px; margin-top:14px; }
  .cri-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:20px; padding-top:18px; border-top:1px solid var(--bd); }
  .cri-stats .big { font-size:22px; font-weight:700; margin-top:4px; } .cri-stats .big.sm{font-size:15px;} .cri-stats .d{font-size:13px;color:var(--muted);}
  .pad-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .pad-head h4 { font-size:17px; font-weight:700; } .pad p { margin:14px 0 16px; }
  .quote { background:rgba(255,255,255,0.02); border-left:2px solid var(--bd); border-radius:6px; padding:12px 14px; font-size:12.5px; margin-top:8px; color:#c3cace; }
  .rec { display:flex; align-items:center; gap:24px; margin-bottom:16px; }
  .rec-num { font-size:30px; font-weight:700; color:#8891a8; flex-shrink:0; width:44px; }
  .rec-body { flex:1; } .rec-body h4 { font-size:18px; font-weight:700; margin-bottom:6px; }
  .prio { border:1px solid; border-radius:8px; padding:8px 14px; font-size:11px; flex-shrink:0; white-space:nowrap; }
  footer { margin-top:72px; padding-top:32px; border-top:1px solid var(--bd); display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--muted); }
  .foot-brand { display:flex; align-items:center; gap:12px; }
  .foot-badge { width:34px; height:34px; border-radius:9px; border:1px solid var(--bd); display:flex; align-items:center; justify-content:center; font-weight:800; }
  @media (max-width:820px){ .stats,.grid2,.grid3{grid-template-columns:1fr;} .rec{flex-wrap:wrap;gap:12px;} h1{font-size:52px;} .wrap{padding:24px 16px 60px;} .hero{padding:32px 24px;} }
</style></head><body>
<div class="wrap">
  <div class="hero">
    <div class="hero-top mono"><span class="muted"><span class="dot"></span>INTEL · ESPIONAR CONCORRENTE</span><span class="muted">RELATÓRIO · V1.0</span></div>
    <div class="tag mono">INTELIGÊNCIA COMPETITIVA</div>
    <h1>${esc(r.nome)}</h1>
    <p class="sub">Varredura da Biblioteca de Anúncios da Meta. ${r.totalAnalisados} criativo(s) analisados, padrões de copy decodificados, recomendações táticas geradas. Use isso pra acelerar — não pra copiar.</p>
    <div class="stats">
      <div class="stat"><div class="mono muted xs">SLUG</div><div class="big mono">${esc(r.slug)}</div></div>
      <div class="stat"><div class="mono muted xs">CRIATIVOS ANALISADOS</div><div class="big">${r.totalAnalisados}</div></div>
      <div class="stat"><div class="mono muted xs">LIMITE</div><div class="big">${r.limite}</div></div>
      <div class="stat"><div class="mono muted xs">DATA DA VARREDURA</div><div class="big mono">${esc(r.data)}</div></div>
    </div>
  </div>

  ${r.resumoExecutivo.length ? `<section>
    <div class="sec-head"><span class="n mono">01</span><h2>Resumo executivo</h2><span class="r mono">${r.resumoExecutivo.length} insights estratégicos</span></div>
    <div class="grid2">${execCards}</div>
  </section>` : ''}

  ${r.criativos.length ? `<section>
    <div class="sec-head"><span class="n mono">02</span><h2>Criativos analisados</h2><span class="r mono">${r.criativos.length} anúncio(s)</span></div>
    <div class="grid3">${criCards}</div>
  </section>` : ''}

  ${r.padroes.length ? `<section>
    <div class="sec-head"><span class="n mono">03</span><h2>Padrões criativos</h2><span class="r mono">${r.padroes.length} estruturas recorrentes</span></div>
    <div class="grid3">${padCards}</div>
  </section>` : ''}

  ${r.recomendacoes.length ? `<section>
    <div class="sec-head"><span class="n mono">04</span><h2>Recomendações táticas</h2><span class="r mono">${r.recomendacoes.length} testes pra rodar</span></div>
    <div>${recCards}</div>
  </section>` : ''}

  <footer>
    <div class="foot-brand"><div class="foot-badge">T</div><div><div style="color:var(--fg);font-weight:700">powered by The Track</div><div class="mono xs">INTEL · ESPIONAR CONCORRENTE</div></div></div>
    <div class="mono" style="text-align:right"><div>RELATÓRIO GERADO · ${esc(r.data)}</div><div>FONTE · FACEBOOK AD LIBRARY</div></div>
  </footer>
</div></body></html>`
}

// Dispara o download do report.html no navegador.
export function baixarRelatorioHTML(r: RelatorioConcorrente) {
  const html = renderRelatorioHTML(r)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const slug = (r.slug || 'concorrente').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  a.href = url
  a.download = `report-${slug}-${r.data.replace(/\//g, '-')}.html`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
