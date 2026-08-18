-- Rastreador de Anúncios: bibliotecas acompanhadas + snapshots ao longo do tempo.
-- Rode uma vez no SQL Editor do Supabase.

create table if not exists rastreador_bibliotecas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  page_id       text not null,
  page_name     text,
  link          text,
  freq_dias     int,                       -- null = sem agendamento; 3/5/7/14 = auto-pull
  ativo         boolean not null default true,
  ultima_puxada timestamptz,
  created_at    timestamptz not null default now(),
  unique (org_id, page_id)
);

create table if not exists rastreador_snapshots (
  id            uuid primary key default gen_random_uuid(),
  biblioteca_id uuid not null references rastreador_bibliotecas(id) on delete cascade,
  puxado_em     timestamptz not null default now(),
  total         int not null default 0,
  duplicacoes   int not null default 0,
  idade_media   numeric,
  criativos     jsonb                       -- payload completo do scrape naquele momento
);

create index if not exists idx_rastreador_snap_bib on rastreador_snapshots (biblioteca_id, puxado_em desc);
