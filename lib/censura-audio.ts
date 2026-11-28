// Prévia das edições de áudio do Editor de Censura, ao vivo, sem reprocessar
// o arquivo: o <video> passa por um GainNode (volume da voz) e os efeitos
// tocam num segundo caminho direto pra saída. Só roda no navegador.
//
// A exportação (ffmpeg na VPS) refaz o mesmo com os mesmos parâmetros — por
// isso os efeitos embutidos são sintetizados, e não arquivos.

import { Edicao, Segmento, dbParaGanho, ganhoVoz, EDICAO_PADRAO } from './censura'

interface Tocando { stop: () => void; arquivo?: boolean }

export class MotorPrevia {
  readonly video: HTMLVideoElement
  private ctx: AudioContext
  private voz: GainNode
  private alvoVoz = 1
  private segAtual: string | null = null
  private sfx: Tocando | null = null
  /** Efeitos de arquivo que seguem tocando depois que o trecho acabou. */
  private soltos: Tocando[] = []
  private ruidoBranco: AudioBuffer
  private ruidoMarrom: AudioBuffer

  constructor(video: HTMLVideoElement) {
    this.video = video
    this.ctx = new AudioContext()
    const src = this.ctx.createMediaElementSource(video)
    this.voz = this.ctx.createGain()
    src.connect(this.voz).connect(this.ctx.destination)
    this.ruidoBranco = this.ruido(false)
    this.ruidoMarrom = this.ruido(true)
  }

  retomar() { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}) }

  fechar() { this.pararSfx(); this.ctx.close().catch(() => {}) }

  /** Chamado a cada quadro. `ligada` = prévia ativa (desligada = áudio original, pra comparar). */
  tick(segs: Segmento[], ligada: boolean, custom: Map<string, AudioBuffer>) {
    const v = this.video
    if (v.paused || v.seeking) {
      this.pararSfx(); this.soltos.forEach((x) => x.stop()); this.soltos = []; this.segAtual = null; this.setVoz(1)
      return
    }
    // 15ms à frente: compensa o atraso entre o quadro e a saída de som.
    const t = v.currentTime + 0.015
    const seg = ligada ? segs.find((s) => t >= s.ini && t < s.fim) : undefined
    this.setVoz(seg ? ganhoVoz(seg.ed) : 1)
    const chave = seg ? `${seg.ini}|${seg.fim}|${JSON.stringify(seg.ed)}` : null
    if (chave !== this.segAtual) {
      // Som de arquivo (aplauso, clique…) toca até o fim mesmo se o próximo
      // trecho começar; os sintetizados (bip, chiado) acabam com o trecho.
      if (this.sfx?.arquivo) { this.soltos = [...this.soltos.slice(-4), this.sfx]; this.sfx = null }
      this.pararSfx()
      this.segAtual = chave
      if (seg && seg.ed.sfx !== 'nenhum') this.sfx = this.tocar(seg.ed, seg.fim - v.currentTime, v.currentTime - seg.ini, custom)
    }
  }

  private amostraAtual: Tocando | null = null
  /** Toca só o efeito (pra ouvir antes de escolher), independente do vídeo. */
  amostra(sfx: string, sfxDb: number, custom: Map<string, AudioBuffer>) {
    this.retomar()
    this.amostraAtual?.stop()
    this.amostraAtual = sfx === 'nenhum' ? null : this.tocar({ ...EDICAO_PADRAO, sfx, sfxDb }, 1.2, 0, custom)
  }

  private setVoz(g: number) {
    if (g === this.alvoVoz) return
    this.alvoVoz = g
    // constante de 12ms ≈ fade de ~50ms: sem estalo na borda do corte.
    this.voz.gain.setTargetAtTime(g, this.ctx.currentTime, 0.012)
  }

  private pararSfx() { this.sfx?.stop(); this.sfx = null }

  private ruido(marrom: boolean): AudioBuffer {
    const n = this.ctx.sampleRate * 2
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate)
    const d = b.getChannelData(0)
    let ult = 0
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1
      if (marrom) { ult = (ult + 0.02 * w) / 1.02; d[i] = ult * 3.5 } else d[i] = w * 0.5
    }
    return b
  }

  private tocar(ed: Edicao, dur: number, offset: number, custom: Map<string, AudioBuffer>): Tocando | null {
    const ctx = this.ctx, agora = ctx.currentTime
    let fonte: AudioScheduledSourceNode
    let entrada: AudioNode
    let duracao = Math.max(0.03, dur)

    const ruido = (buf: AudioBuffer, filtro?: (f: BiquadFilterNode) => void, reforco = 1) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true
      let n: AudioNode = s
      if (filtro) { const f = ctx.createBiquadFilter(); filtro(f); n.connect(f); n = f }
      if (reforco !== 1) { const g = ctx.createGain(); g.gain.value = reforco; n.connect(g); n = g }
      fonte = s; entrada = n
    }

    switch (ed.sfx) {
      case 'bip': case 'bip_grave': {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = ed.sfx === 'bip' ? 1000 : 500
        const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g)
        fonte = o; entrada = g; break
      }
      case 'ruido': ruido(this.ruidoBranco, (f) => { f.type = 'lowpass'; f.frequency.value = 7000 }); break
      case 'vento': ruido(this.ruidoMarrom, (f) => { f.type = 'lowpass'; f.frequency.value = 500 }, 1.6); break
      case 'radio': ruido(this.ruidoBranco, (f) => { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.5 }, 2.5); break
      default: {
        // Som enviado pelo usuário toca inteiro a partir da palavra (um
        // "cha-ching" cortado no fim da palavra perde a graça).
        const buf = custom.get(ed.sfx)
        if (!buf || offset >= buf.duration) return null
        const s = ctx.createBufferSource(); s.buffer = buf
        fonte = s; entrada = s
        duracao = buf.duration - offset
      }
    }

    const vol = dbParaGanho(ed.sfxDb)
    const env = ctx.createGain()
    const fim = agora + duracao
    const fade = Math.min(0.015, duracao / 3)
    env.gain.setValueAtTime(0, agora)
    env.gain.linearRampToValueAtTime(vol, agora + fade)
    env.gain.setValueAtTime(vol, fim - fade)
    env.gain.linearRampToValueAtTime(0, fim)
    entrada!.connect(env).connect(ctx.destination)
    const f = fonte!
    if (f instanceof AudioBufferSourceNode && !f.loop) f.start(agora, offset); else f.start(agora)
    f.stop(fim + 0.02)
    return {
      arquivo: !['bip', 'bip_grave', 'ruido', 'vento', 'radio'].includes(ed.sfx),
      stop: () => {
        try {
          const t = ctx.currentTime
          env.gain.cancelScheduledValues(t); env.gain.setTargetAtTime(0, t, 0.008); f.stop(t + 0.05)
        } catch { /* já parou */ }
      },
    }
  }
}

/** Decodifica um som enviado (mp3/wav). Usa um contexto offline pra não
 *  depender do vídeo já estar tocando. */
export async function decodificarSom(arquivo: File): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, 44100)
  return ctx.decodeAudioData(await arquivo.arrayBuffer())
}
