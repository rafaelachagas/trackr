# Gerador e editor de criativos — guia pra replicar em outro projeto

Como montar, do zero, um sistema que **gera vídeo de anúncio automaticamente** a
partir de um roteiro + locução, e depois deixa **editar o resultado** numa
timeline no navegador.

Feito no The Track (set/2026). Stack: Next.js (App Router) + Supabase Storage na
frente, e um serviço **Python/Flask com FFmpeg e Whisper numa VPS** atrás.
Entregue pro Claude Code junto com este documento.

---

## 1. Visão geral

```
Navegador (Next.js)                VPS (Flask + FFmpeg + Whisper)
  roteiro + locução  ──POST /assemble──▶  transcreve, planeja, corta, renderiza
  polling de status  ──GET  /assemble_status──▶ rodando | pronto | erro
  editor da timeline ──POST /assemble (com "projeto")──▶ re-renderiza obedecendo
        ▲                                        │
        └──────── Supabase Storage ◀─────────────┘
                  (b-rolls, fontes, locução, saída, projetos)
```

**Por que um serviço separado:** FFmpeg e Whisper levam minutos e consomem CPU;
função serverless corta no tempo e não guarda arquivo. A VPS segura o processo,
o site só orquestra.

**A ideia central:** a montagem automática não produz só um MP4 — ela grava um
**projeto** (JSON) com todas as decisões que tomou. O editor abre esse JSON,
deixa mudar, e manda renderizar de novo. Sem isso, editar significaria refazer
tudo.

## 2. Storage (Supabase), um bucket só

```
broll/<pasta>/<arquivo>.mp4     b-rolls organizados por pasta/tema
fontes/<Familia-800>.ttf        fontes da legenda (o servidor de vídeo baixa)
locucao/<uuid>.mp3              locução (upload ou gerada por TTS)
saida/<uuid>.mp4                vídeo renderizado
projetos/<uuid>.json            o projeto que o editor abre
```

Pasta vazia não existe no Storage: crie um arquivo-marcador (`.pasta`) ao criar
pasta, senão ela some até o primeiro upload.

## 3. O serviço da VPS

**Docker:** `python:3.11-slim` + `apt install ffmpeg fontconfig`.
`fontconfig` é necessário: o ASS chama a fonte pelo **nome interno** dela, e
quem lê isso de um `.ttf` é o `fc-scan`.

**Servidor:** gunicorn com **1 worker e 8 threads** (`--timeout 900`), pra
continuar respondendo status enquanto uma renderização longa roda em thread de
fundo. Em VPS compartilhada, ponha `mem_limit` no compose.

**Bibliotecas:** `faster-whisper` (modelo `small`, `compute_type=int8` em CPU),
`flask`, `requests`.

### Endpoints

| Rota | O que faz |
|---|---|
| `POST /assemble` | Recebe o trabalho, devolve `job_id` na hora (202) e renderiza em thread |
| `GET /assemble_status?job=` | `rodando` / `pronto` / `erro` |
| `POST /transcribe` | Transcreve uma URL de áudio (usado pra copy e pra locução) |

O corpo do `/assemble` tem dois modos:

- **Automático:** `roteiro`, `locucao_path`, `clipes` (nome → caminho),
  `pastas` (pasta → lista de caminhos), `largura`, `altura`, `fonte_path`,
  `estilo`, `template`, `output_path`, `projeto_path`.
- **Obedecendo o editor:** `projeto` (o JSON inteiro) + `output_path`.

### O pipeline automático, em ordem

1. **Baixa a locução** e mede a duração.
   ⚠️ Use `ffprobe -show_entries format=duration` **sem** `-select_streams v:0`
   — MP3 não tem stream de vídeo e a duração volta vazia.
2. **Transcreve com timestamps por palavra** (`word_timestamps=True`,
   `vad_filter=False`). Essas palavras servem pra **dois** fins: legenda e
   ancoragem das marcações.
3. **Lê as marcações do roteiro** e transforma em trechos com início e fim:
   - `$nome-do-clipe` → fixa um arquivo específico;
   - `[broll: pasta x3]` → sorteia 3 clipes daquela pasta, sem repetir enquanto
     houver clipe novo (repetir b-roll é o que mais denuncia montagem automática).
   - **Como ancorar no tempo:** conte quantas **palavras** vêm antes da marcação
     no roteiro e pegue o tempo dessa mesma posição na transcrição. Casar por
     texto quebra quando o Whisper troca uma palavra; por posição, aguenta.
4. **Escolhe o pedaço de cada clipe.** Sem julgar conteúdo, dá pra medir com
   FFmpeg: **nitidez** (convolução de realce + `signalstats` YAVG) e
   **movimento** (`signalstats` YDIF). Pontue algumas janelas e fique com a
   melhor — nitidez pesando o dobro (clipe tremido estraga; clipe parado só fica
   sem graça). Descarte as pontas do clipe.
5. **Corta cada trecho** no formato de saída: `scale` + `crop` central, `fps=30`,
   **sem áudio** (b-roll costuma vir com som do celular).
6. **Emenda** tudo com o demuxer `concat` (`-c copy`).
7. **Escreve a legenda** em `.ass` e renderiza junto com a locução:
   `-vf ass=leg.ass:fontsdir=<pasta>` e `-shortest`.

### A legenda (ASS)

Três estilos, o mesmo tempo por palavra:
- **palavra:** uma por vez, grande, no centro;
- **destaque:** a frase fica, a palavra falada muda de cor (uma linha por palavra);
- **bloco:** duas linhas na base, trocando a cada frase.

Detalhes que valem tempo:
- Use `{\an5\pos(x,y)}` pra posicionar; assim a altura vira um parâmetro.
- "Pop" na entrada: `{\fscx80\fscy80\t(0,80,\fscx108\fscy108)\t(80,150,\fscx100\fscy100)}`.
- Segure a palavra até a próxima começar, se o respiro for curto — senão a
  legenda pisca entre uma palavra e outra.
- Caixa de fundo é `BorderStyle: 3`; contorno normal é `BorderStyle: 1`.
- Cor em ASS é **&HBBGGRR** (invertida em relação ao HTML).
- **Em Python, escreva as tags ASS em raw string.** `"{\fad(40,40)}"` vira um
  caractere de form feed e a legenda sai errada sem erro nenhum. Use `r"..."`.

### Templates de edição

Um dicionário no servidor define o "jeito" do vídeo, em vez de valores fixos:

```python
TEMPLATES = {
  "ugc_cru":       {"zoom":"nenhum","transicao":"corte","intervalo_broll":(2.0,3.5),
                    "legenda_estilo":"palavra","legenda_destaque":"#FFFF00"},
  "produzido":     {"zoom":"in","transicao":"fade","intervalo_broll":(3.0,5.0),
                    "legenda_estilo":"destaque","legenda_destaque":"#FF4500"},
  "vsl_agressivo": {"zoom":"in","transicao":"flash","intervalo_broll":(1.5,2.5),
                    "legenda_estilo":"bloco","legenda_destaque":"#FFFFFF"},
}
```

`intervalo_broll` vira ritmo: num trecho longo com `[broll: pasta]`, calcule
quantos clipes cabem nesse intervalo. **O primeiro trecho entra sempre em corte
seco**, mesmo em template com fade/flash — transição no segundo zero come o hook.

### Zoom e transição por trecho

```python
# zoom lento ao longo do trecho (in/out), ~12%
scale=w=trunc(W*(1+0.12*min(1\,max(0\,t/DUR)))/2)*2:h=...:eval=frame,crop=W:H
# entrada
fade=t=in:st=0:d=0.18:color=black   # ou color=white pro "flash"
```

## 4. O projeto (o JSON que liga as duas pontas)

```jsonc
{
  "versao": 1, "largura": 1080, "altura": 1920, "duracao": 47.3,
  "locucao_path": "locucao/<uuid>.mp3",
  "fonte_path": "fontes/Montserrat-800.ttf",
  "template": "ugc_cru",
  "legenda": { "estilo": "palavra", "cor": "#FFFFFF", "destaque": "#B8FF00",
               "tamanho": 1, "posicao": 0.5, "caixa": false, "maiusculas": true,
               "animacao": "pop", "tipo_destaque": "cor", "por_linha": 4 },
  "palavras": [ { "t": "você", "ini": 0.62, "fim": 0.83, "enfase": false, "oculta": false } ],
  "trechos":  [ { "id": "t0", "caminho": "broll/dinheiro/nota.mp4",
                  "ini": 0.0, "origem": 1.6, "zoom": "in", "transicao": "corte" } ],
  "cortes":   [ { "ini": 12.4, "fim": 13.9 } ],
  "saida_path": "saida/<uuid>.mp4"
}
```

Duas decisões que simplificam muito:

- **A duração de cada trecho sai do início do próximo** (e o último vai até o
  fim). Assim nunca sobra buraco nem sobreposição quando o usuário arrasta a
  borda na timeline.
- **`cortes` é aplicado no fim, sobre o vídeo já montado**, com
  `select=not(between(t\,a\,b)),setpts=N/FRAME_RATE/TB` e o `aselect`
  equivalente no áudio. Imagem, voz e legenda saem juntas e nada dessincroniza.

## 5. As rotas do Next

| Rota | Papel |
|---|---|
| `POST /api/creative-generator/assemble` | Resolve nomes → caminhos do Storage e chama a VPS; devolve `jobId` + `projetoId` |
| `GET  .../assemble?job&outputPath` | Status; quando pronto, devolve URL assinada + URL de download |
| `GET/PUT/POST .../project` | Abre o projeto (com tudo assinado), salva a edição, re-renderiza |
| `.../library` | Pastas e clipes; criar pasta, renomear (`move`), apagar |
| `.../sign-upload` | URL assinada de upload (b-roll, fonte, locução) |
| `.../fonts` | Catálogo do Google Fonts + baixar a escolhida pro Storage |
| `.../copy` | Transcrever vídeo do concorrente e adaptar a copy com LLM |
| `.../tts` | Gerar locução (ElevenLabs) e salvar no Storage |

Detalhes:
- **Link de download precisa de `Content-Disposition`**: gere uma segunda URL
  assinada com `{ download: 'criativo.mp4' }`, senão o navegador abre o vídeo
  numa aba em vez de baixar (o atributo `download` não vale entre domínios).
- **Fontes do Google:** peça o CSS com User-Agent antigo (`Mozilla/4.0`) pra
  receber **TTF** em vez de woff2 — libass não lê woff2. E valide a família
  contra o índice oficial, senão a rota vira um baixador de URL arbitrária.
- **Upload de b-roll mantém o nome original** (sem timestamp): é o nome que o
  roteiro usa em `$nome-do-clipe`.

## 6. O editor

Componente cliente com **prévia em tempo real que não renderiza nada**:

- Um `<audio>` com a locução é o **relógio** de tudo.
- Um `<video>` por clipe usado, todos sobrepostos; o do trecho atual fica
  visível e é posicionado em `origem + (t - ini)`; só re-sincroniza se a
  diferença passar de ~0,3s (senão trava).
- Zoom é `transform: scale()`, transição é um `<div>` preto/branco com opacidade
  caindo, legenda é HTML por cima — **com as mesmas contas do servidor**.
- Enquanto toca, se o tempo entra num corte, pula pro fim dele.

Funções da timeline: arrastar a borda entre dois b-rolls, dividir no cursor,
trocar o b-roll pela biblioteca, escolher o pedaço do clipe, zoom e transição
por trecho, editar/dar ênfase/esconder palavra da legenda, marcar trecho pra
cortar, desfazer/refazer (pilha de snapshots) e salvamento automático.

⚠️ **A duplicação é o maior risco desse desenho:** as contas da legenda existem
em Python (render) e em TypeScript (prévia). Mudou uma, tem que mudar a outra,
senão a prévia mente. Deixe isso comentado nos dois arquivos, ou faça o servidor
devolver os parâmetros calculados.

## 7. Armadilhas que custaram tempo aqui

1. **VPS travando inteira.** FFmpeg sem limite come a CPU e derruba os outros
   serviços. Rode com `nice -n 10` e `-threads 1`, e ponha `mem_limit` no
   compose. Se um filtro pesado (tipo `areverse`) rodar junto com vídeo, faça
   o áudio num passo separado — senão os pacotes de vídeo se acumulam na memória
   e o processo morre.
2. **Retorno -9 do FFmpeg é falta de memória**, não erro de comando. Traduza
   isso na mensagem de erro, ou você vai caçar bug de sintaxe à toa.
3. **Vírgula dentro de expressão de filtro** (`min(1,max(0,t))`) quebra a cadeia.
   Escape com `\,`. Aspas simples resolvem em alguns ambientes e somem em
   outros — escape é mais seguro.
4. **O vídeo saía adiantado e mais curto que o áudio:** a primeira marcação
   quase nunca está no segundo zero. Prenda um trecho de abertura cobrindo do
   0 até a primeira marcação.
5. **Fonte enviada não aparecia:** sem `fontsdir` e sem o **nome interno** da
   fonte (via `fc-scan`), o libass não desenha nada e não reclama.
6. **Prévia com legenda fininha:** `WebkitTextStroke` desenha o contorno por
   cima do preenchimento. Use `paint-order: stroke fill`, ou `text-shadow`.
7. **Um trabalho por vez.** Com trava global, o segundo pedido toma 503 e os
   trabalhos somem no restart. Se for escalar, troque por fila (Redis/Celery) —
   mas paralelismo só ajuda com CPU sobrando.

## 8. Ordem sugerida de construção

1. Storage + upload de b-roll e fonte + biblioteca com prévia.
2. Serviço da VPS com `/transcribe` e `/assemble` (só corte e concat, sem legenda).
3. Legenda ASS + fontes.
4. Marcações no roteiro (`$clipe`, `[broll: pasta xN]`) e ancoragem por palavra.
5. Gravar o **projeto** no Storage — a partir daqui o editor é possível.
6. Editor com prévia e re-render.
7. Templates, zoom e transições.
8. TTS (opcional) — atenção: plano do ElevenLabs pode dar caracteres de API mas
   **não** liberar voz clonada por API; deixe sempre a opção de subir o áudio pronto.
