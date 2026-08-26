-- Análise de Funil — rodar no SQL Editor do Supabase.
-- 1) Coluna de Initiate Checkout no gastos (o sync da Meta passa a preencher;
--    o "Sincronizar 90 dias" refaz o histórico com ela).
alter table gastos add column if not exists checkouts integer default 0;

-- 2) Cadastro de funis: nome + o que compõe o funil (produto front, orderbumps,
--    upsells como listas de nomes de produto iguais aos de vendas.produto),
--    VSL vinculada (vsls.id) e filtro opcional de campanhas (campaign_name).
create table if not exists funis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  nome text not null,
  produto_front text not null,
  orderbumps jsonb not null default '[]'::jsonb,
  upsells jsonb not null default '[]'::jsonb,
  vsl_id uuid,
  campanhas jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Observações por dia do funil (a coluna "Observações Gerais" da planilha).
create table if not exists funil_observacoes (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references funis(id) on delete cascade,
  data date not null,
  texto text not null default '',
  updated_at timestamptz not null default now(),
  unique (funil_id, data)
);
