// Catálogo de formatos de criativo — o "molde" do vídeo, antes da copy.
//
// Formato não é ângulo nem oferta: é a FORMA de apresentar. A mesma promessa
// vira anúncio diferente em "Choquei", "Fofoca" ou "Passo a passo", e é por isso
// que trocar o formato costuma render mais que reescrever a copy.
//
// Isto é só o catálogo base. O que o usuário acrescenta (referências que ele
// salvou, anotações, se já testou) vive em `configuracoes`, por organização,
// e nunca é sobrescrito quando esta lista cresce.

export type Formato = {
  id: string
  nome: string
  resumo: string          // o que é, em uma linha
  comoFazer: string       // a estrutura prática
  bomPara: string         // em que etapa do funil costuma funcionar
}

export const FORMATOS: Formato[] = [
  { id: 'caixinha-perguntas', nome: 'Caixinha de perguntas', resumo: 'A expert responde uma pergunta "recebida" do público.', comoFazer: 'Abre com o print da caixinha do Instagram na tela, lê a pergunta em voz alta e responde olhando pra câmera. A pergunta é a objeção que você quer quebrar.', bomPara: 'Quebrar objeção específica sem parecer que está vendendo.' },
  { id: 'pov', nome: 'POV', resumo: 'O espectador é colocado dentro da cena: "POV: você acabou de...".', comoFazer: 'Texto na tela com o POV nos primeiros 2s, e a cena acontecendo como se fosse com ele. Sem narração explicativa.', bomPara: 'Topo de funil, identificação rápida.' },
  { id: 'dialogo', nome: 'Diálogo', resumo: 'Duas pessoas conversando — uma tem a dúvida, a outra a resposta.', comoFazer: 'Mesma pessoa em dois enquadramentos, ou duas de verdade. A dúvida é a objeção do público; a resposta é a sua oferta.', bomPara: 'Explicar mecanismo sem soar aula.' },
  { id: 'choquei', nome: 'Choquei', resumo: 'Formato de página de fofoca/notícia viral comentando um fato.', comoFazer: 'Arte imitando post de perfil de notícia, legenda em caixa alta, narração em tom de "você viu isso?".', bomPara: 'Curiosidade e volume de visualização.' },
  { id: 'noticia', nome: 'Notícia', resumo: 'Apresentado como reportagem de telejornal.', comoFazer: 'Abertura com vinheta ou tarja, locução em tom jornalístico, dado ou pesquisa como gancho.', bomPara: 'Autoridade e prova social impessoal.' },
  { id: 'meme', nome: 'Meme', resumo: 'Usa um meme corrente pra entregar a mensagem.', comoFazer: 'Pega o áudio ou o formato do meme da semana e encaixa a dor do público. Tem prazo de validade curto.', bomPara: 'Alcance orgânico e CPM baixo.' },
  { id: 'ugc-1a', nome: 'UGC em 1ª pessoa', resumo: '"Eu testei e aconteceu isso" — a pessoa fala da própria experiência.', comoFazer: 'Celular na mão, sem produção. Começa no meio da história, nunca com apresentação.', bomPara: 'Conversão. É o formato que mais parece conteúdo e menos anúncio.' },
  { id: 'tela-dividida', nome: 'Tela dividida', resumo: 'Duas realidades lado a lado, antes e depois ou certo e errado.', comoFazer: 'Divide a tela ao meio; esquerda é o jeito antigo, direita o seu. Sem narração nos primeiros segundos.', bomPara: 'Comparação direta com a alternativa.' },
  { id: 'fofoca', nome: 'Fofoca', resumo: 'Contado como segredo, em tom de confidência.', comoFazer: 'Câmera perto do rosto, voz baixa, "não era pra eu estar falando isso". Entrega uma informação que parece privilegiada.', bomPara: 'Retenção nos primeiros segundos.' },
  { id: 'react', nome: 'React', resumo: 'Reagindo a um conteúdo de terceiro na tela.', comoFazer: 'O conteúdo original ocupa o fundo, você aparece no canto comentando. Discorde de algo — concordar não prende.', bomPara: 'Pegar carona em assunto que já tem tração.' },
  { id: 'ugc-3a', nome: 'UGC em 3ª pessoa', resumo: 'Alguém falando de uma terceira pessoa que teve resultado.', comoFazer: '"Minha amiga fez isso e...". Tira o peso do depoimento próprio e soa menos vendido.', bomPara: 'Prova social quando você não tem o depoimento original.' },
  { id: 'esquete', nome: 'Esquete', resumo: 'Pequena encenação com começo, conflito e desfecho.', comoFazer: 'Personagem com problema, tentativa que falha, sua solução. Até 30s.', bomPara: 'Entreter e vender ao mesmo tempo; bom pra público frio.' },
  { id: 'fala-faz', nome: 'Fala e faz', resumo: 'A pessoa narra enquanto executa o que está narrando.', comoFazer: 'Cada frase tem a imagem correspondente acontecendo. É o formato que mais se apoia em b-roll literal.', bomPara: 'Demonstrar que é simples de fazer.' },
  { id: 'depoimento', nome: 'Depoimento', resumo: 'Cliente contando o resultado que teve.', comoFazer: 'Corta a parte da apresentação. Começa no resultado e volta pro problema.', bomPara: 'Fundo de funil e remarketing.' },
  { id: 'experimento-social', nome: 'Experimento social', resumo: 'Testa uma hipótese com pessoas reais na rua.', comoFazer: 'Pergunta a mesma coisa pra várias pessoas e mostra as respostas. O contraste é o conteúdo.', bomPara: 'Provar que a dor é generalizada.' },
  { id: 'tela-verde', nome: 'Tela verde', resumo: 'A pessoa na frente de um print, site ou notícia.', comoFazer: 'Recorte da pessoa sobre a imagem que ela está comentando, apontando pro que importa.', bomPara: 'Comentar prova, print de pagamento ou matéria.' },
  { id: 'palestrinha', nome: 'Palestrinha', resumo: 'Explicação curta e didática, como um trecho de aula.', comoFazer: 'Uma ideia só, com um exemplo. Quadro, papel ou gráfico simples ajudam.', bomPara: 'Público que já conhece o problema e quer entender a solução.' },
  { id: 'telepatia', nome: 'Telepatia', resumo: 'Antecipa exatamente o que o espectador está pensando.', comoFazer: '"Se você chegou até aqui, você já tentou X e não deu certo". Acerta a objeção antes dela ser dita.', bomPara: 'Retenção e quebra de objeção simultâneas.' },
  { id: 'analise', nome: 'Análise', resumo: 'Disseca um caso, número ou anúncio alheio.', comoFazer: 'Mostra o material na tela e vai apontando o porquê. Conclusão amarra na sua oferta.', bomPara: 'Autoridade técnica.' },
  { id: 'google-meet', nome: 'Google Meet', resumo: 'Simula uma chamada de vídeo gravada.', comoFazer: 'Interface de reunião, duas janelas, conversa informal. Parece bastidor vazado.', bomPara: 'Bastidor e prova de processo.' },
  { id: 'telemarketing', nome: 'Telemarketing', resumo: 'Simula uma ligação de venda, geralmente em tom de humor.', comoFazer: 'Som de ligação, a objeção vem do outro lado da linha, a resposta é a sua.', bomPara: 'Quebrar objeção de preço com leveza.' },
  { id: 'pov-meme', nome: 'POV + Meme', resumo: 'Mistura a imersão do POV com um meme corrente.', comoFazer: 'POV no texto, áudio de meme embaixo, situação exagerada.', bomPara: 'Topo de funil com custo baixo.' },
  { id: 'lofi', nome: 'LO-FI', resumo: 'Propositalmente mal produzido, parecendo gravado às pressas.', comoFazer: 'Sem iluminação, sem corte bonito, legenda simples. O "feio" é o que faz parecer real.', bomPara: 'Escapar da cegueira de anúncio; costuma ganhar de criativo caro.' },
  { id: 'corte-podcast', nome: 'Corte de podcast', resumo: 'Trecho de conversa longa, cortado no ponto alto.', comoFazer: 'Dois microfones, enquadramento de podcast, começa no meio da frase mais forte.', bomPara: 'Autoridade por associação.' },
  { id: 'top5', nome: 'Top 5 (ranking)', resumo: 'Lista numerada em contagem regressiva.', comoFazer: 'Número grande na tela, um item por corte, o melhor por último pra segurar até o fim.', bomPara: 'Retenção longa e salvamento.' },
  { id: 'conversa-carro', nome: 'Conversa no carro', resumo: 'Falando pra câmera dentro do carro.', comoFazer: 'Celular no painel, luz natural, tom de desabafo. Funciona porque parece não planejado.', bomPara: 'Opinião e desabafo; alta identificação.' },
  { id: 'dialogo-gemeos', nome: 'Diálogo de gêmeos', resumo: 'A mesma pessoa contracenando consigo mesma.', comoFazer: 'Dois enquadramentos espelhados, uma versão cética e uma convencida.', bomPara: 'Mostrar os dois lados de uma objeção.' },
  { id: 'mensagem', nome: 'Mensagem', resumo: 'A tela de uma conversa de WhatsApp ou direct.', comoFazer: 'Print animado da conversa, com áudio ou narração por cima. A conversa carrega a prova.', bomPara: 'Prova social e quebra de objeção.' },
  { id: 'passo-a-passo', nome: 'Passo a passo', resumo: 'Ensina o processo inteiro, numerado.', comoFazer: 'Passo na tela, execução no b-roll. Entrega de verdade — o gancho é "é mais simples do que parece".', bomPara: 'Gerar confiança antes da oferta.' },
  { id: 'copy-no-papel', nome: 'Copy no papel', resumo: 'O texto escrito à mão ou impresso, lido na câmera.', comoFazer: 'Folha na mão, caneta marcando as palavras-chave enquanto lê.', bomPara: 'Tirar a atenção do rosto e pôr na mensagem.' },
  { id: 'cinema', nome: 'Cinema', resumo: 'Produção alta, cor tratada, trilha, cara de trailer.', comoFazer: 'Planos abertos, movimento de câmera, letras com serifa. Exige material bom.', bomPara: 'Marca e lançamento; raramente ganha no direto.' },
  { id: 'asmr', nome: 'ASMR', resumo: 'O som é o conteúdo: toque, embalagem, escrita.', comoFazer: 'Sem música, microfone perto, imagem em close. Legenda carrega a mensagem.', bomPara: 'Produto físico e retenção silenciosa.' },
  { id: 'live', nome: 'Live', resumo: 'Simula uma transmissão ao vivo.', comoFazer: 'Interface de live, contador de pessoas, comentários subindo. Tom de "estou falando agora".', bomPara: 'Urgência e sensação de evento.' },
  { id: 'analogia', nome: 'Analogia', resumo: 'Explica o mecanismo comparando com algo do dia a dia.', comoFazer: 'Objeto na mão como metáfora. "Isso aqui é igual a...". Uma analogia só por vídeo.', bomPara: 'Produto difícil de explicar.' },
  { id: 'receita', nome: 'Receita', resumo: 'Formato de culinária aplicado a qualquer processo.', comoFazer: 'Ingredientes na bancada, modo de preparo, resultado no fim. Ritmo de vídeo de receita.', bomPara: 'Processo com etapas; alta conclusão.' },
  { id: 'tweet', nome: 'Tweet', resumo: 'Um post de rede social como gancho na tela.', comoFazer: 'Print do tweet nos primeiros segundos, depois a reação ou o desenvolvimento.', bomPara: 'Gancho de opinião polêmica.' },
  { id: 'oferta-direta', nome: 'Oferta direta', resumo: 'Vai direto ao ponto: o que é, por quanto, como comprar.', comoFazer: 'Sem rodeio, sem história. Preço e condição na tela cedo.', bomPara: 'Remarketing de quem já conhece.' },
  { id: 'story', nome: 'Story', resumo: 'Imita a estética de stories, com stickers e enquetes.', comoFazer: 'Vertical cru, figurinhas, enquete, barra de progresso falsa.', bomPara: 'Parecer conteúdo de perfil, não anúncio.' },
  { id: 'serie', nome: 'Série (dia 1, 2, 3...)', resumo: 'Episódios numerados, cada um puxando o próximo.', comoFazer: '"Dia 3 da série..." logo na abertura. Cada vídeo fecha com gancho pro seguinte.', bomPara: 'Recorrência e público que volta.' },
  { id: 'edit', nome: 'Edit', resumo: 'Montagem rápida no ritmo da música, pouco texto.', comoFazer: 'Cortes na batida, sem narração. A legenda e a música contam a história.', bomPara: 'Aspiracional e marca.' },
  { id: 'rotina', nome: 'Rotina', resumo: 'Um dia na vida, com o produto aparecendo naturalmente.', comoFazer: 'Sequência cronológica do dia. A oferta aparece como parte da rotina, não como venda.', bomPara: 'Produto de uso contínuo.' },
  { id: 'pov-depoimento', nome: 'POV + Depoimento', resumo: 'Imersão do POV com a prova de um depoimento.', comoFazer: 'Abre em POV, no meio vira relato de resultado real.', bomPara: 'Juntar identificação e prova no mesmo vídeo.' },
  { id: 'certo-errado', nome: 'Certo VS Errado', resumo: 'Mostra o jeito errado e logo o certo.', comoFazer: 'Primeiro o erro, com tarja vermelha; depois o certo, com verde. Rápido.', bomPara: 'Educar e posicionar contra o concorrente.' },
  { id: 'trivial', nome: 'Trivial', resumo: 'Pergunta ou curiosidade que o espectador tenta responder.', comoFazer: 'Pergunta na tela, pausa, resposta. A pausa é o que segura.', bomPara: 'Comentário e retenção.' },
  { id: 'the-office', nome: 'The Office', resumo: 'Olhar pra câmera em tom de documentário cômico.', comoFazer: 'Cena acontece, a pessoa olha pra câmera com cara de "está vendo isso?".', bomPara: 'Humor sobre a dor do público.' },
  { id: 'tiktok', nome: 'TikTok', resumo: 'Estética nativa do TikTok: trend, texto, corte seco.', comoFazer: 'Som em alta, texto na fonte do app, nada de produção.', bomPara: 'Volume e CPM baixo.' },
  { id: 'leia-legenda', nome: 'Leia a legenda', resumo: 'O áudio é uma coisa, a mensagem está na legenda.', comoFazer: 'Música ou som ambiente, legenda carregando o conteúdo inteiro.', bomPara: 'Quem assiste sem som — que é a maioria.' },
  { id: 'entrevista', nome: 'Entrevista', resumo: 'Alguém pergunta, a expert responde.', comoFazer: 'Perguntas em texto na tela, respostas cortadas no essencial.', bomPara: 'Autoridade com leveza.' },
  { id: 'jornal-nacional', nome: 'Jornal Nacional', resumo: 'Paródia de telejornal de horário nobre.', comoFazer: 'Bancada, tarja, locução formal, assunto tratado como notícia nacional.', bomPara: 'Humor com ar de credibilidade.' },
  { id: 'anjinho-diabinho', nome: 'Anjinho VS Diabinho', resumo: 'Os dois lados da decisão, encenados.', comoFazer: 'A mesma pessoa nos dois papéis, um empurrando pra procrastinar, outro pra agir.', bomPara: 'Decisão de compra travada.' },
]

export const FORMATOS_POR_ID = new Map(FORMATOS.map((f) => [f.id, f]))
