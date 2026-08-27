// Renderizador do relatório HTML da Análise de Funil — arquivo standalone
// baixado no navegador, mesmo estilo dark do report do rastreador
// (lib/reportConcorrente.ts). Puro: sem I/O, sem React.

export interface RelatorioFunil {
  nome: string
  periodo: string            // "01/08/2026 – 27/08/2026"
  fonte: string              // "Tudo" | "Tráfego pago" | "Orgânico"
  data: string               // dd/mm/yyyy (geração)
  cards: { label: string; valor: string; sub?: string }[]
  etapas: { label: string; valor: string; sub?: string }[]
  orderbumps: { nome: string; qtd: number; fat: string; conversao: string }[]
  upsells: { nome: string; qtd: number; fat: string; conversao: string }[]
  iaHtml: string | null      // já sanitizado (h3/p/ul/li/b) pela action
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderRelatorioFunilHTML(r: RelatorioFunil): string {
  const cards = r.cards.map((c) => `
      <div class="stat"><div class="mono muted xs">${esc(c.label.toUpperCase())}</div><div class="big">${esc(c.valor)}</div>${c.sub ? `<div class="mono muted xs" style="margin-top:6px">${esc(c.sub)}</div>` : ''}</div>`).join('')

  const etapas = r.etapas.map((e) => `
      <div class="card etapa"><div class="mono muted xs">${esc(e.label.toUpperCase())}</div><div class="etapa-v">${esc(e.valor)}</div>${e.sub ? `<div class="mono muted xs">${esc(e.sub)}</div>` : ''}</div>`).join('')

  const prodRows = (itens: RelatorioFunil['orderbumps']) => itens.map((o) => `
      <div class="prod"><span class="prod-nome">${esc(o.nome)}</span><span class="mono muted">${o.qtd} venda(s)</span><span class="mono muted">${esc(o.conversao)}</span><b>${esc(o.fat)}</b></div>`).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Relatório de Funil · ${esc(r.nome)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { --bg:#0a0d0f; --card:#11161a; --card2:#0e1316; --bd:rgba(255,255,255,0.07); --fg:#e8ecef; --muted:#7c858c; --accent:#00aeef; }
  body { background:var(--bg); color:var(--fg); font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased; }
  .mono { font-family:'JetBrains Mono','SFMono-Regular',ui-monospace,Menlo,Consolas,monospace; letter-spacing:0.08em; }
  .muted { color:var(--muted); } .xs { font-size:11px; }
  .wrap { max-width:1180px; margin:0 auto; padding:40px 32px 80px; }
  .hero { background:linear-gradient(180deg,var(--card) 0%,var(--card2) 100%); border:1px solid var(--bd); border-radius:24px; padding:48px 44px; }
  .hero-top { display:flex; justify-content:space-between; align-items:center; font-size:12px; }
  .dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#37d67a; margin-right:8px; vertical-align:middle; }
  .tag { display:inline-block; border:1px solid var(--bd); border-radius:8px; padding:8px 16px; font-size:12px; margin:32px 0 20px; }
  h1 { font-size:clamp(36px,6vw,72px); font-weight:800; letter-spacing:-0.03em; line-height:0.98; }
  .sub { color:var(--muted); max-width:680px; margin-top:18px; font-size:15px; }
  .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:40px; }
  .stat { border:1px solid var(--bd); border-radius:14px; padding:20px 22px; background:rgba(255,255,255,0.01); }
  .stat .big { font-size:24px; font-weight:700; margin-top:8px; }
  section { margin-top:64px; }
  .sec-head { display:flex; align-items:baseline; gap:20px; border-bottom:1px solid var(--bd); padding-bottom:18px; margin-bottom:28px; }
  .sec-head .n { color:var(--muted); font-size:13px; }
  .sec-head h2 { font-size:30px; font-weight:700; letter-spacing:-0.02em; }
  .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
  .card { background:var(--card); border:1px solid var(--bd); border-radius:16px; padding:20px; }
  .etapa-v { font-size:22px; font-weight:800; margin:6px 0 4px; }
  .ia { background:var(--card); border:1px solid var(--bd); border-radius:16px; padding:32px 36px; }
  .ia h3 { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.14em; color:var(--accent); margin:28px 0 10px; }
  .ia h3:first-child { margin-top:0; }
  .ia p { margin-bottom:12px; color:#c9d1d6; }
  .ia ul { margin:0 0 14px 22px; } .ia li { margin-bottom:10px; color:#c9d1d6; }
  .ia b, .ia strong { color:var(--fg); }
  .prod { display:flex; align-items:center; gap:20px; padding:14px 0; border-bottom:1px solid var(--bd); font-size:14px; }
  .prod:last-child { border-bottom:0; }
  .prod-nome { flex:1; font-weight:600; }
  footer { margin-top:72px; padding-top:32px; border-top:1px solid var(--bd); display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--muted); }
  .foot-brand { display:flex; align-items:center; gap:12px; }
  .foot-badge { width:34px; height:34px; border-radius:9px; border:1px solid var(--bd); display:flex; align-items:center; justify-content:center; font-weight:800; }
  @media (max-width:820px){ .stats{grid-template-columns:1fr 1fr;} .grid4{grid-template-columns:1fr 1fr;} h1{font-size:44px;} .wrap{padding:24px 16px 60px;} .hero{padding:32px 24px;} .ia{padding:24px 20px;} }
  @media print { body{background:#fff;color:#111;} :root{--card:#fff;--card2:#fff;--bd:#ddd;--fg:#111;--muted:#666;} .hero{background:#fff;} }
</style></head><body>
<div class="wrap">
  <div class="hero">
    <div class="hero-top mono"><span class="muted"><span class="dot"></span>ANÁLISE DE FUNIL · THE TRACK</span><span class="muted">FONTE · ${esc(r.fonte.toUpperCase())}</span></div>
    <div class="tag mono">${esc(r.periodo)}</div>
    <h1>${esc(r.nome)}</h1>
    <p class="sub">Raio-x completo do funil no período — tráfego (Meta), vídeo (VTurb), checkout e vendas (Hotmart) numa esteira só, com diagnóstico e projeções da IA.</p>
    <div class="stats">${cards}</div>
  </div>

  <section>
    <div class="sec-head"><span class="n mono">01</span><h2>Etapas do funil</h2></div>
    <div class="grid4">${etapas}</div>
  </section>

  ${r.iaHtml ? `<section>
    <div class="sec-head"><span class="n mono">02</span><h2>Diagnóstico da IA</h2></div>
    <div class="ia">${r.iaHtml}</div>
  </section>` : ''}

  ${r.orderbumps.length ? `<section>
    <div class="sec-head"><span class="n mono">03</span><h2>Orderbumps</h2></div>
    <div class="card">${prodRows(r.orderbumps)}</div>
  </section>` : ''}

  ${r.upsells.length ? `<section>
    <div class="sec-head"><span class="n mono">${r.orderbumps.length ? '04' : '03'}</span><h2>Upsells</h2></div>
    <div class="card">${prodRows(r.upsells)}</div>
  </section>` : ''}

  <footer>
    <div class="foot-brand"><div class="foot-badge">T</div><div><div style="color:var(--fg);font-weight:700">powered by The Track</div><div class="mono xs">ANÁLISE DE FUNIL</div></div></div>
    <div class="mono" style="text-align:right"><div>RELATÓRIO GERADO · ${esc(r.data)}</div><div>META × VTURB × HOTMART</div></div>
  </footer>
</div></body></html>`
}

// Dispara o download do relatorio-funil.html no navegador.
export function baixarRelatorioFunilHTML(r: RelatorioFunil) {
  const html = renderRelatorioFunilHTML(r)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const slug = r.nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  a.href = url
  a.download = `relatorio-funil-${slug}-${r.data.replace(/\//g, '-')}.html`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
