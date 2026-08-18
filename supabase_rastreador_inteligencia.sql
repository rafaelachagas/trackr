-- =====================================================================
--  INTELIGÊNCIA DO RASTREADOR + ALERTAS + GERADOR DE COPY
--  Rode tudo de uma vez no SQL editor do Supabase. É idempotente
--  (todos usam "if not exists"), então rodar 2x não quebra nada.
--  NÃO altera nenhuma tabela de gastos/vendas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Metadados novos na biblioteca: nicho, oferta e URL de página-alvo
--    (nicho/oferta alimentam o swipe file e o radar de concorrentes;
--     landing_url é a página de vendas que vamos versionar)
-- ---------------------------------------------------------------------
alter table rastreador_bibliotecas add column if not exists nicho text;
alter table rastreador_bibliotecas add column if not exists oferta text;
alter table rastreador_bibliotecas add column if not exists landing_url text;

-- ---------------------------------------------------------------------
-- 2) Histórico por criativo (a espinha dorsal da inteligência)
--    Uma linha por (biblioteca, ad_archive_id). Guarda quando apareceu,
--    quando saiu, pico de variações, ângulo de copy etc. Mesmo depois
--    do concorrente remover o anúncio da Meta, ele fica salvo aqui.
-- ---------------------------------------------------------------------
create table if not exists rastreador_criativos_hist (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  biblioteca_id uuid not null references rastreador_bibliotecas(id) on delete cascade,
  ad_archive_id text not null,

  -- Últimos metadados conhecidos do criativo
  page_name text,
  headline text,
  body text,
  cta_text text,
  link_url text,
  media_type text,
  video_url text,
  image_url text,
  snapshot_url text,
  start_date text,            -- data que a Meta diz que o anúncio começou

  -- Linha do tempo observada por nós
  primeiro_visto timestamptz not null default now(),
  ultimo_visto  timestamptz not null default now(),
  removido_em   timestamptz,          -- quando percebemos que sumiu
  status text not null default 'ativo',   -- 'ativo' | 'removido'

  -- Variações / escala
  copias int not null default 1,      -- variações ativas na última leitura
  pico_copias int not null default 1, -- maior nº de variações simultâneas já visto

  -- Derivados (recalculados a cada fold)
  dias_no_ar int not null default 0,
  classificacao text,                 -- em_teste | reprovado | mediano | bom | espetacular

  -- Enriquecimento por IA (opcional)
  angulo text,                        -- dor | prova_social | urgencia | ...
  angulo_resumo text,                 -- frase curta explicando o gancho
  transcricao_hash text,              -- pra saber se já classificamos esta transcrição

  atualizado_em timestamptz not null default now(),
  unique (biblioteca_id, ad_archive_id)
);
create index if not exists idx_crihist_bib on rastreador_criativos_hist (biblioteca_id, status);
create index if not exists idx_crihist_org on rastreador_criativos_hist (org_id, status);

-- ---------------------------------------------------------------------
-- 3) Versionamento da página de vendas/checkout do concorrente
--    Cada captura guarda um hash do conteúdo; quando muda, nasce uma
--    nova versão e marcamos o que parece ter mudado (preço/bônus/oferta).
-- ---------------------------------------------------------------------
create table if not exists rastreador_paginas_hist (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  biblioteca_id uuid not null references rastreador_bibliotecas(id) on delete cascade,
  url text not null,
  titulo text,
  conteudo_hash text not null,        -- hash do texto normalizado
  texto text,                         -- texto extraído (para diff/consulta)
  precos jsonb,                       -- preços detectados (ex.: ["R$ 97","12x 9,70"])
  resumo_mudanca text,                -- o que mudou vs a versão anterior
  capturado_em timestamptz not null default now()
);
create index if not exists idx_paghist_bib on rastreador_paginas_hist (biblioteca_id, capturado_em desc);

-- ---------------------------------------------------------------------
-- 4) Radar de novos concorrentes por nicho
--    termos = o que buscar; achados = páginas encontradas que ainda
--    não estão na sua lista de tracking.
-- ---------------------------------------------------------------------
create table if not exists rastreador_radar_termos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  termo text not null,                -- palavra/nicho a buscar na Meta Ad Library
  pais text not null default 'BR',
  ativo boolean not null default true,
  ultima_busca timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists rastreador_radar_achados (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  termo_id uuid references rastreador_radar_termos(id) on delete cascade,
  page_id text not null,
  page_name text,
  amostra_texto text,                 -- headline/body de amostra
  qtd_anuncios int not null default 0,
  status text not null default 'novo', -- novo | ignorado | adicionado
  achado_em timestamptz not null default now(),
  unique (org_id, page_id)
);
create index if not exists idx_radar_status on rastreador_radar_achados (org_id, status, achado_em desc);

-- ---------------------------------------------------------------------
-- 5) Gerador de variações de copy (histórico do que a IA gerou)
-- ---------------------------------------------------------------------
create table if not exists rastreador_copy_ger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  biblioteca_id uuid references rastreador_bibliotecas(id) on delete set null,
  ad_archive_id text,                 -- criativo-fonte (opcional)
  fonte_texto text not null,          -- transcrição/base usada
  nicho text,
  oferta text,
  instrucoes text,                    -- pedido extra do usuário
  resultado jsonb,                    -- ângulos/variações gerados
  modelo text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_copyger_org on rastreador_copy_ger (org_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 6) Log de alertas enviados (fadiga de criativo, anomalia de gasto,
--    criativo do concorrente removido). Evita alertar a mesma coisa 2x.
-- ---------------------------------------------------------------------
create table if not exists alertas_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  tipo text not null,                 -- fadiga | anomalia_gasto | concorrente_removido | concorrente_novo
  chave text not null,                -- identificador único do evento (ex.: ad_id+data)
  titulo text,
  mensagem text,
  severidade text default 'info',     -- info | atencao | critico
  enviado_whatsapp boolean not null default false,
  visto boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (org_id, tipo, chave)
);
create index if not exists idx_alertas_org on alertas_log (org_id, criado_em desc);
create index if not exists idx_alertas_visto on alertas_log (org_id, visto, criado_em desc);
