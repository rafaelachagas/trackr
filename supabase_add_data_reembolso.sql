-- Vendas × Criativos: "reembolsa mais rápido"
-- Guarda QUANDO o reembolso aconteceu, pra medir o tempo compra -> reembolso.
-- A Hotmart não expõe essa data no histórico (a API sales/history só diz que o
-- status é REFUNDED, sem a data), então a captura é feita pelo webhook de
-- reembolso daqui pra frente (app/api/webhooks/hotmart/route.ts).
alter table vendas add column if not exists data_reembolso timestamptz;

-- índice pra ordenar/filtrar por reembolso rápido sem varrer a tabela toda
create index if not exists idx_vendas_data_reembolso
  on vendas (data_reembolso)
  where data_reembolso is not null;
