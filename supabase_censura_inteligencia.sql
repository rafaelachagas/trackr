-- Inteligência do Editor de Censura (rodar uma vez no SQL Editor do Supabase).
-- Ver lib/censura-inteligencia.ts.

-- 1) Exemplos: cada decisão sua no editor e cada reprovação real da Meta.
--    A IA recebe os parecidos na hora de analisar um vídeo novo.
create table if not exists censura_exemplos (
  id uuid primary key default gen_random_uuid(),
  criado timestamptz not null default now(),
  origem text not null default 'editor',   -- editor | meta
  projeto_id text not null default '',      -- projeto do editor ou ad_id da Meta
  trecho text not null,                     -- normalizado ("comecar hoje")
  contexto text,                            -- frase em volta
  decisao text not null,                    -- risco | contexto | nao_risco | censurou | liberou | reprovado | aprovado
  gravidade text,
  categoria text,
  politica text,
  motivo text,                              -- observação sua / motivo da Meta
  fonte_risco text,                         -- quem tinha marcado antes: ia | biblioteca | lista
  unique (origem, projeto_id, trecho, decisao)
);
create index if not exists idx_censura_exemplos_criado on censura_exemplos (criado desc);

-- 2) Anúncios das suas contas: reprovados (com o motivo da Meta) e aprovados.
create table if not exists censura_casos_meta (
  ad_id text primary key,
  conta text,
  conta_id text,
  nome text,
  criativo text,                 -- adNN, quando dá pra extrair do nome
  situacao text not null,        -- reprovado | aprovado
  motivos jsonb,                 -- ad_review_feedback da Meta
  video_id text,
  texto_anuncio text,            -- texto principal/título do anúncio
  transcricao text,
  etapa text not null default 'novo',   -- novo | transcrito | analisado | sem_midia | erro
  erro text,
  tentativas int not null default 0,
  trechos jsonb,                 -- o que a IA apontou como culpado (reprovado)
  visto_em timestamptz not null default now(),
  atualizado timestamptz not null default now()
);
create index if not exists idx_censura_casos_etapa on censura_casos_meta (etapa, situacao);

-- 3) Propostas do revisor semanal (você aprova pelo WhatsApp ou pela página).
create table if not exists censura_propostas (
  id uuid primary key default gen_random_uuid(),
  numero serial,
  criado timestamptz not null default now(),
  tipo text not null,            -- adicionar_termo | remover_termo | gravidade | politica_mudou
  dados jsonb not null,
  resumo text not null,
  motivo text,
  status text not null default 'pendente',  -- pendente | aprovada | recusada
  decidido_em timestamptz
);
create index if not exists idx_censura_propostas_status on censura_propostas (status, numero);

-- 4) Placar: a inteligência contra casos com resultado conhecido.
create table if not exists censura_placar (
  id uuid primary key default gen_random_uuid(),
  criado timestamptz not null default now(),
  motivo text,                   -- manual | revisor
  status text not null default 'rodando',   -- rodando | pronto
  casos jsonb not null,          -- [{ad_id, real}]
  resultados jsonb not null default '[]',   -- [{ad_id, real, previsto, trechos}]
  acertos int not null default 0,
  total int not null default 0,
  terminado timestamptz
);
