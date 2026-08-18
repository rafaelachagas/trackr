-- Cadastro de VSL: amarra o player da VTurb à página e às campanhas da Meta,
-- pra cruzar Plays (VTurb) × Landing Page Views (Meta) e calcular o Play Rate Real.
-- Rode uma vez no SQL Editor do Supabase.
create table if not exists vsls (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  nome               text not null,
  vturb_player_id    text not null,
  vturb_player_name  text,
  video_duration     int,                 -- segundos (pra curva de retenção)
  landing_url        text,                -- opcional, referência
  -- Campanhas Meta que mandam tráfego pra este VSL. null/[] = TODAS as campanhas.
  campanhas          jsonb not null default '[]'::jsonb,
  ativo              boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (org_id, vturb_player_id)
);
