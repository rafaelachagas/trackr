'use client'

// Fila de transcrição no navegador — o transcritor da VPS roda em CPU e não
// aguenta várias transcrições simultâneas (clicar em 3 cards de uma vez fazia
// as três falharem com timeout). Aqui serializamos: uma requisição por vez,
// as demais esperam e informam a posição na fila via onStatus.

type Job = {
  videoUrl: string
  onStatus: (s: string) => void
  resolve: (r: { texto?: string; error?: string }) => void
}

const fila: Job[] = []
let rodando = false

async function processar() {
  if (rodando) return
  rodando = true
  while (fila.length > 0) {
    const job = fila.shift()!
    // Atualiza a posição de quem ficou esperando.
    fila.forEach((j, i) => j.onStatus(`Na fila (${i + 1}º)...`))
    job.onStatus('Transcrevendo...')
    try {
      const r = await fetch('/api/rastreador/transcrever', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: job.videoUrl }),
      })
      const j = await r.json().catch(() => null)
      if (!j) job.resolve({ error: 'Resposta inválida do transcritor.' })
      else if (j.error) job.resolve({ error: j.error })
      else job.resolve({ texto: j.texto || '(sem fala detectada)' })
    } catch {
      job.resolve({ error: 'Falha ao transcrever.' })
    }
  }
  rodando = false
}

export function transcreverNaFila(videoUrl: string, onStatus: (s: string) => void): Promise<{ texto?: string; error?: string }> {
  return new Promise((resolve) => {
    fila.push({ videoUrl, onStatus, resolve })
    if (rodando) onStatus(`Na fila (${fila.length}º)...`)
    processar()
  })
}
