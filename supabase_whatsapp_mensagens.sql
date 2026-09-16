-- ============================================================
-- MENSAGENS DE GRUPO PRO RESUMO DO WHATSAPP (set/2026)
-- ------------------------------------------------------------
-- Tabela NOVA — não altera nenhuma tabela existente.
-- Só grava mensagens de grupos com /start-resumo ligado, e o próprio cron
-- apaga o que tiver mais de 3 dias. Acesso só pelo servidor (service role).
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.whatsapp_mensagens (
  id bigserial primary key,
  grupo text not null,          -- jid do grupo (...@g.us)
  autor text,                   -- nome de exibição de quem mandou
  tipo text not null default 'texto',   -- texto | audio | midia
  texto text not null,
  enviada_em timestamptz not null default now()
);

create index if not exists whatsapp_mensagens_grupo_data_idx
  on public.whatsapp_mensagens (grupo, enviada_em);

-- Sem policy: nenhum usuário do app lê direto, só o servidor (service role).
alter table public.whatsapp_mensagens enable row level security;
