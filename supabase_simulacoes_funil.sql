-- Simulações do Simulador de Funil (Ferramentas)
create table if not exists public.simulacoes_funil (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  nome text not null,
  dados jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_simulacoes_funil_org on public.simulacoes_funil (org_id, created_at desc);
