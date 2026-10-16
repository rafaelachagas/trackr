# Dublagem — beta

Áudio em português entra, o mesmo conteúdo sai em outro idioma **na voz da pessoa**.

Rode `dublagem_beta.ipynb` no Google Colab com GPU T4. É o único jeito prático
hoje: o XTTS v2 na CPU leva minutos por frase.

## Pipeline

```
áudio .mp3/.ogg
   ↓  faster-whisper large-v3        transcreve (pt, com VAD)
texto em português
   ↓  Gemini                         adapta — não traduz
texto no idioma alvo
   ↓  XTTS v2 + áudio de referência  sintetiza clonando a voz
dublado.wav
```

## Por que "adapta" e não "traduz"

Copy de anúncio traduzida ao pé da letra fica correta e morta. Gancho, gíria e
prova social não atravessam idioma. O passo do Gemini recebe o contexto da
oferta e reescreve pra soar nativo, mantendo intenção, ordem das ideias e
duração de fala.

## Decisões que o notebook toma e por quê

**Quebra o texto em frases antes de sintetizar.** O XTTS tem limite por
geração; mandando 50 segundos de uma vez ele corta no meio sem avisar.

**120ms de silêncio entre as frases.** Emendadas no seco, a fala sai apressada.

**A chave do Gemini é pedida escondida, a cada sessão.** Nada de chave gravada
dentro do arquivo.

## Limites conhecidos

- **Licença.** O modelo XTTS v2 é CPML, **não comercial**. Isto é avaliação.
  Pra produção, trocar por OpenVoice v2 (MIT) ou equivalente.
- **Sotaque.** O clone preserva o timbre, não troca o sotaque: sai ela falando
  inglês com sotaque brasileiro.
- **Duração muda.** Inglês costuma sair 10–20% mais curto que português. Se for
  usar no Gerador de Criativos, monte de novo com o áudio novo em vez de
  encaixar no projeto antigo.
- **Sem sincronia labial.** Só áudio. Se tiver rosto falando em quadro, a boca
  não bate.
