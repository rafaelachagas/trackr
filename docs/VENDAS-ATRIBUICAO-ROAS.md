# Vendas, atribuição e ROAS — como funciona e o que NUNCA misturar

Leia isto antes de mexer em qualquer coisa que toque `vendas`, `gastos`, o
webhook da Hotmart, a sync da Meta, ou o join do performance-v2. Escrito depois
de uma sessão de correção de bugs reais em produção (19-20/08/2026) — cada
regra aqui existe porque algo já quebrou por causa dela.

## A regra de ouro

**Gasto (Meta) e Venda (Hotmart) são dois mundos separados que só se
encontram na hora de LER, nunca na hora de ESCREVER.**

- Código que sincroniza gasto da Meta (`app/api/meta/sync`, `app/api/meta/ad-metrics`,
  `app/api/meta/gastos-mensais`, `app/api/meta/refresh-token`) só pode fazer
  `INSERT`/`UPDATE`/`UPSERT` na tabela `gastos`. Pode fazer `SELECT` em
  `vendas` (é assim que o performance-v2 junta os dois), mas **nunca**
  `INSERT`/`UPDATE`/`DELETE` nela.
- Código que processa venda da Hotmart (webhook, `lib/reconciliar-sck.ts`,
  `app/api/hotmart/sync`) só escreve em `vendas`. Nunca escreve em `gastos`.
- O "encontro" dos dois mundos é só a CHAVE (`lib/meta-chave.ts`), calculada
  em memória a partir do que já está salvo — nunca grava nada cruzado.

Se uma tarefa parecer pedir para "ajustar o gasto baseado na venda" ou
vice-versa, é sinal de que a tarefa está no lugar errado. Pare e pergunte.

## Pipeline de uma venda, do zero ao ROAS

1. **Webhook** (`app/api/webhooks/hotmart/route.ts`) recebe o evento da Hotmart.
   - `sck` vem de `purchase.tracking.source_sck`. Às vezes vem vazio —
     principalmente em eventos de ciclo de vida (PROTEST/REFUNDED/CHARGEBACK)
     que chegam sem tracking, e ocasionalmente na aprovação inicial também.
   - Se vier vazio: primeiro tenta preservar o sck que já estava salvo pra
     aquela transação (evita apagar um sck bom com um evento tardio sem
     tracking — bug real, corrigido no commit `905a24e`). Se ainda não tiver
     nada salvo, busca **na hora**, síncrono, direto na API da Hotmart pra
     aquela transação específica (`buscarSckUnico` em `lib/reconciliar-sck.ts`).
     Isso existe porque o cron horário de reconciliação (passo 2) chega tarde
     demais pra decisão de ROAS 1d/3d/7d — o criativo já pode ter sido pausado
     com base num número errado antes do cron rodar.
   - `valor` (bruto) vem de `original_offer_price.value` — a Hotmart já
     converte esse campo pra BRL quando a compra foi em moeda estrangeira.
   - `valor_liquido` (comissão do produtor) vem de `data.commissions`, e
     **NÃO** vem convertido — se a venda foi em USD/EUR/GBP, o número ali é
     bruto na moeda original. O fix: calcula a taxa de câmbio implícita da
     própria transação (`original_offer_price.value / price.value`) e aplica
     em cima da comissão antes de salvar. Sem isso, uma venda de US$122
     (R$631,80 reais) entrava no banco como R$108,94 líquido.
   - Upsell herda `sck`/`criativo`/`fase`/`campanha` do front pelo e-mail,
     numa janela de **30 dias** (compradores às vezes levam dias pra comprar
     o upsell — 48h era curto demais e deixava receita real sem atribuição).

2. **Cron de reconciliação** (`app/api/hotmart/reconciliar-sck`, roda de hora
   em hora — `vercel.json`) é o **backup**, não a fonte principal. Repassa a
   API da Hotmart procurando `sck IS NULL` nas últimas 72h e preenche o que
   achar. Também religa upsells órfãos (mesma janela de 30 dias). Se esse cron
   parar de disparar sozinho (aconteceu em produção — motivo nunca totalmente
   confirmado), o sistema ainda funciona porque o passo 1 já resolve a maioria
   dos casos em tempo real; o cron só cobre o que sobra.

3. **`lib/meta-chave.ts`** define a CHAVE que junta gasto × venda:
   `código do anúncio (ex: ad51) | FASE0N | flags (bmsub/bmus/v2)`.
   - O código vem de `extrairCriativo()` (regex `^(ad\d+)`) — sempre o
     código curto, nunca o slug completo.
   - A fase (FASE01/02/03) já distingue os "3 níveis" de escala do anúncio
     (ex: FASE01 = escala, FASE02 = Pré Escala) — isso vem do nome da
     campanha na Meta / do primeiro segmento do sck, não é um bug, é assim
     que a Rafaela nomeia as campanhas.
   - **Importação manual (Lançamento)** guarda `criativo` como o SLUG
     completo (ex: `ad51-como-receber-presentes-de-marcas-e-dinheiro-pre-escala`),
     não o código curto — por isso NUNCA aparece no performance-v2, que
     filtra `transaction_id NOT LIKE 'manual_%'` de propósito. Se um dia
     quiserem unificar manual + automático numa mesma visão, isso precisa ser
     tratado explicitamente (normalizar o criativo do import), não é
     automático hoje.

4. **`app/api/performance-v2/route.ts`** junta `gastos` (por `ad_id IS NOT NULL`)
   com `vendas` (por `criativo IS NOT NULL`, sem manuais) pela chave acima,
   calcula ROAS 7d/3d/1d (dias FECHADOS, terminando ontem) e "tempo real"
   (hoje, dia correndo — mesma fonte de dados, só filtro de data diferente;
   não precisa de fix separado se a fonte já está certa).

5. **`app/api/performance-v2/snapshot`** (novo, cron diário às 00:10 SP —
   ver `vercel.json`) congela o resultado de CADA DIA FECHADO na tabela
   `performance_criativo_snapshot` (SQL: `supabase_snapshot_criativo.sql`).
   Isso é INSERT-only por `(data, chave)` — nunca sobrescreve um dia já
   gravado. É a prova histórica do que o painel mostrou naquele dia, mesmo
   que `vendas`/`gastos` sejam editados ou percam dado depois.

## "Prova real" — como qualquer pessoa audita sem confiar cegamente

Na tabela do Analisar Criativos: clicar na Receita (7d) abre a lista de cada
venda (transaction_id, e-mail, status, líquido) que compõe aquele número —
com `*` quando o sck foi herdado por e-mail (upsell) em vez de vindo nativo da
Hotmart. Clicar no ROAS 7d/3d/1d abre o dia a dia. Isso já existia antes desta
sessão (`components/dashboard/TabelaCriativosV2.tsx`) — não precisa reinventar.

## Bugs conhecidos, NÃO corrigidos (ficaram de fora de propósito)

- **JPY/PYG (Yen, Guarani)**: em pelo menos 2 compradores (4 transações,
  22/07/2026, criativo ad11), a própria Hotmart não converteu nem o `valor`
  bruto pra BRL — ficou o número cru da moeda estrangeira (ex: R$9.074 pra
  uma venda de ¥9.074). A lógica de câmbio do webhook (item 1) não resolve
  isso porque ela assume que `original_offer_price` já está em BRL. Precisa
  de taxa de câmbio real da data pra corrigir com segurança — não estimado.
- **Import manual não normalizado**: ver item 3 acima.

## Antes de mexer em qualquer coisa deste pipeline

1. Rode `npx tsc --noEmit -p .` antes de dar commit.
2. Nunca teste o webhook com um `transaction_id` real — use um fake. (Uma sessão
   anterior corrompeu temporariamente uma venda real de um cliente ao testar
   com um ID reciclado; foi revertido, mas não repita.)
3. Se for mexer em `valor`/`valor_liquido`: sempre pense em moeda. A Hotmart
   NÃO converte tudo de forma consistente — ver seção de bugs conhecidos.
4. Se for mexer em `criativo`/`sck`/`fase`: teste contra a chave do
   `lib/meta-chave.ts`, não invente uma normalização nova.
