import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Overlay do "modo seleção": marca cada vídeo/player da página com um botão
// "Escolher este vídeo"; o clique manda a escolha de volta pra aba do The
// Track (window.opener.postMessage) e o painel resolve/baixa/transcreve.
const SELECIONAR_JS = `
<script>
(function(){
  function acharCandidatos(){
    var out = []
    // players VTurb: o script carrega de scripts.converteai.net/<conta>/players/<id>/player.js
    var scriptsVturb = Array.prototype.slice.call(document.querySelectorAll('script[src*="converteai.net"][src*="players"]'))
      .map(function(s){ return s.getAttribute('src') }).filter(Boolean)
    // containers do player (id vid_XXXX / vid-XXXX) — casa com o script pelo id
    var conts = Array.prototype.slice.call(document.querySelectorAll('[id^="vid_"],[id^="vid-"],vturb-smartplayer'))
    conts.forEach(function(el){
      var pid = (el.id || '').replace(/^vid[-_]/, '')
      var src = scriptsVturb.find(function(s){ return pid && s.indexOf(pid) >= 0 }) || scriptsVturb[0]
      if (src) out.push({ el: el, tipo: 'vturb', valor: src.indexOf('player.js') >= 0 ? src : (src.replace(/\\/$/, '') + '/player.js') })
    })
    // <video> com src direto
    Array.prototype.slice.call(document.querySelectorAll('video')).forEach(function(v){
      var src = v.currentSrc || v.src || (v.querySelector('source') && v.querySelector('source').src)
      if (src && /^https?:/.test(src)) out.push({ el: v, tipo: 'url', valor: src })
    })
    // iframes youtube/vimeo (não dá pra baixar, mas dá pra avisar)
    return out
  }
  function montar(){
    var faixa = document.createElement('div')
    faixa.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#2E90FA;color:#fff;font:600 14px/1.4 sans-serif;padding:10px 16px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.4)'
    faixa.textContent = 'MODO SELEÇÃO — clique no botão em cima do vídeo que você quer usar. Feche a aba pra cancelar.'
    document.body.appendChild(faixa)
    var cands = acharCandidatos()
    if (!cands.length) { faixa.textContent = 'MODO SELEÇÃO — não achei nenhum player de vídeo nesta versão da página.'; faixa.style.background = '#e11d48'; return }
    cands.forEach(function(c, i){
      var r = c.el.getBoundingClientRect()
      var btn = document.createElement('button')
      btn.textContent = '▶ Escolher este vídeo' + (cands.length > 1 ? ' (' + (i + 1) + ')' : '')
      btn.style.cssText = 'position:absolute;z-index:2147483647;background:#2E90FA;color:#fff;border:0;border-radius:10px;padding:10px 16px;font:700 13px sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.5)'
      btn.style.top = (window.scrollY + r.top + Math.max(10, r.height / 2 - 18)) + 'px'
      btn.style.left = (window.scrollX + r.left + Math.max(10, r.width / 2 - 90)) + 'px'
      btn.onclick = function(ev){
        ev.preventDefault(); ev.stopPropagation()
        if (window.opener) window.opener.postMessage({ theTrackVsl: { tipo: c.tipo, valor: c.valor } }, '*')
        faixa.textContent = '✅ Vídeo escolhido! Volte pra aba do The Track.'
        faixa.style.background = '#059669'
      }
      document.body.appendChild(btn)
    })
  }
  if (document.readyState === 'complete') setTimeout(montar, 800)
  else window.addEventListener('load', function(){ setTimeout(montar, 800) })
})()
</` + `script>`

// Serve o HTML bruto de uma versão salva da página do concorrente,
// pra abrir renderizado numa nova aba (snapshot do dia da captura).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('rastreador_paginas_hist').select('html, titulo').eq('id', id).maybeSingle()
  if (error || !data?.html) {
    return new NextResponse('Snapshot não encontrado (ou capturado antes desta funcionalidade).', {
      status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  let html = data.html as string
  if (req.nextUrl.searchParams.get('selecionar') === '1') {
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${SELECIONAR_JS}</body>`) : html + SELECIONAR_JS
  }
  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Não indexar e não deixar a página quebrar o app.
      'x-robots-tag': 'noindex',
      'content-security-policy': "sandbox allow-scripts allow-same-origin allow-popups;",
    },
  })
}
