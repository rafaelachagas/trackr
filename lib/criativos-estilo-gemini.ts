// Importador do style_config.json — a análise que o Gemini faz de um criativo
// de referência, convertida nos controles que o montador entende.
//
// Regra de leitura: o Gemini ENXERGA bem aparência (cor, posição, peso, se tem
// sombra) e ESTIMA mal tempo, porque ele amostra cerca de 1 quadro por segundo.
// Por isso o ritmo de corte entra como ponto de partida, e o que ele não souber
// dizer fica como estava — nunca com um palpite silencioso por cima.

export type EstiloImportado = {
  zoom: 'nenhum' | 'in' | 'out' | 'punch' | 'alternado'
  zoom_forca: number
  transicao: 'corte' | 'fade' | 'flash'
  legenda_estilo: 'palavra' | 'destaque' | 'bloco'
  legenda_destaque: string
  legenda_cor: string
  legenda_posicao: number
  por_linha: number
  ritmo_min: number
  ritmo_max: number
  musica_volume: number | null
}

export type ResultadoImport = {
  estilo: Partial<EstiloImportado>
  aplicado: string[]
  ignorado: string[]
  avisos: string[]
}

const COR = /^#?[0-9a-fA-F]{6}$/
const corOk = (v: unknown) => (typeof v === 'string' && COR.test(v.trim())
  ? (v.trim().startsWith('#') ? v.trim() : '#' + v.trim()).toUpperCase() : null)

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function lerEstiloGemini(bruto: string): ResultadoImport {
  const r: ResultadoImport = { estilo: {}, aplicado: [], ignorado: [], avisos: [] }
  let j: Record<string, unknown>
  try {
    // O modelo às vezes devolve o JSON cercado de crase.
    const limpo = bruto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    j = JSON.parse(limpo)
  } catch {
    r.avisos.push('Não consegui ler o JSON — confira se ele está completo.')
    return r
  }

  const leg = (j.legenda || {}) as Record<string, unknown>
  const cortes = (j.cortes || {}) as Record<string, unknown>
  const audio = (j.audio || {}) as Record<string, unknown>
  const broll = (j.broll || {}) as Record<string, unknown>

  // --- legenda: a parte em que o Gemini é confiável ---
  const dest = corOk(leg.palavras_destaque_cor_hex)
  if (dest) { r.estilo.legenda_destaque = dest; r.aplicado.push(`cor do destaque ${dest}`) }
  const cor = corOk(leg.cor_padrao_hex)
  if (cor) { r.estilo.legenda_cor = cor; r.aplicado.push(`cor do texto ${cor}`) }

  const porTela = num(leg.palavras_por_tela_max)
  if (porTela) {
    if (porTela <= 1) { r.estilo.legenda_estilo = 'palavra'; r.aplicado.push('legenda palavra a palavra') }
    else {
      r.estilo.legenda_estilo = 'destaque'
      r.estilo.por_linha = Math.min(10, Math.max(2, Math.round(porTela)))
      r.aplicado.push(`frase com destaque, ${r.estilo.por_linha} palavras por tela`)
    }
  }
  const pos = String(leg.posicao_vertical || '').toLowerCase()
  if (pos.includes('centro')) { r.estilo.legenda_posicao = 0.5; r.aplicado.push('legenda no centro') }
  else if (pos.includes('base')) { r.estilo.legenda_posicao = 0.78; r.aplicado.push('legenda na base') }
  else if (pos.includes('topo')) { r.estilo.legenda_posicao = 0.2; r.aplicado.push('legenda no topo') }

  // --- cortes: ponto de partida, não medição ---
  if (leg.animacao_entrada === 'pop') r.aplicado.push('entrada da legenda: estala')

  const freq = num(cortes.frequencia_media_segundos)
  if (freq && freq > 0.3) {
    r.estilo.ritmo_min = +(freq * 0.8).toFixed(1)
    r.estilo.ritmo_max = +(freq * 1.2).toFixed(1)
    r.aplicado.push(`troca de b-roll a cada ${r.estilo.ritmo_min}s–${r.estilo.ritmo_max}s`)
    r.avisos.push(
      'O ritmo de corte é a parte que o Gemini mais erra: ele vê cerca de 1 quadro por segundo, '
      + 'então corte rápido passa batido. Trate como ponto de partida.',
    )
  }
  const tipo = String(cortes.tipo_predominante || '').toLowerCase()
  if (tipo.includes('crossfade')) { r.estilo.transicao = 'fade'; r.aplicado.push('entrada em fade') }
  else if (tipo) { r.estilo.transicao = 'corte'; r.aplicado.push('corte seco') }

  if (cortes.usa_punch_in === true) {
    r.estilo.zoom = 'punch'
    r.estilo.zoom_forca = 0.1
    r.aplicado.push('zoom com soco no corte')
  } else if (cortes.usa_punch_in === false) {
    r.estilo.zoom = 'nenhum'
    r.aplicado.push('sem zoom')
  }

  // --- trilha: dB vira o volume linear que o montador usa ---
  const db = num(audio.volume_trilha_relativo_db)
  if (db !== null && db < 0) {
    r.estilo.musica_volume = Math.min(0.6, Math.max(0.01, Math.pow(10, db / 20)))
    r.aplicado.push(`volume da trilha ${db} dB (${Math.round(r.estilo.musica_volume * 100)}%)`)
  }

  // --- o que o montador ainda não sabe fazer ---
  const sfx = Array.isArray(audio.sfx) ? audio.sfx.length : 0
  if (sfx) r.ignorado.push(`${sfx} efeito(s) sonoro(s) — ainda não há camada de SFX`)
  const stk = Array.isArray(j.stickers_e_graficos) ? j.stickers_e_graficos.length : 0
  if (stk) r.ignorado.push(`${stk} figurinha(s)/gráfico(s) — ainda não há camada de figurinha`)
  if (audio.voz_comprimida === true) r.ignorado.push('compressão da voz')
  if (leg.tem_sombra === true || leg.tem_outline === true) {
    r.ignorado.push('sombra/contorno exatos da legenda — o padrão já tem contorno preto')
  }
  const fonte = String(leg.fonte_aproximada || '')
  if (fonte && /sans-?serif|desconhecid|n\/a/i.test(fonte)) {
    r.avisos.push(`A fonte veio como "${fonte}", que não diz nada. Escolha uma pesada no catálogo — é o que mais muda a cara do vídeo.`)
  } else if (fonte) {
    r.avisos.push(`Fonte sugerida: "${fonte}". Procure por ela no catálogo de fontes.`)
  }

  const blocos = Array.isArray(j.estrutura_narrativa) ? j.estrutura_narrativa as Record<string, unknown>[] : []
  const total = num((j.metadados as Record<string, unknown>)?.duracao_total_segundos)
  if (blocos.length >= 2) {
    for (let i = 1; i < blocos.length; i++) {
      const antes = num(blocos[i - 1].fim_segundos)
      const agora = num(blocos[i].inicio_segundos)
      if (antes !== null && agora !== null && agora - antes > 2) {
        r.avisos.push(
          `A estrutura tem um buraco de ${Math.round(agora - antes)}s (entre ${antes}s e ${agora}s). `
          + 'Sinal de que o modelo não assistiu esse pedaço com atenção.',
        )
        break
      }
    }
  }
  const mediaClip = num(broll.duracao_media_clip_segundos)
  if (mediaClip && freq && Math.abs(mediaClip - freq) < 0.01 && Number.isInteger(freq * 2)) {
    r.avisos.push('Ritmo de corte e duração média de clipe vieram com o mesmo valor redondo — provavelmente estimativa, não medição.')
  }

  if (!r.aplicado.length) r.avisos.push('O JSON foi lido, mas nenhum campo conhecido veio preenchido.')
  return r
}
