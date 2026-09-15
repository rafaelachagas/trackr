-- ============================================================
-- GASTOS POR ANÚNCIO (set/2026)
-- ------------------------------------------------------------
-- A trava única antiga era (data, ad_name). O mesmo nome de anúncio roda em
-- campanhas diferentes ao mesmo tempo (ex: ad111 em "AD111 | AD112 | AD113" e
-- em "AD111 | AD112"), então o sync somava as duas campanhas numa linha só.
-- A trava passa a ser (data, ad_id): uma linha por anúncio de verdade.
--
-- Seguro rodar antes ou depois do deploy: o sync tenta gravar por anúncio e,
-- se esta trava ainda não existir, grava do jeito antigo.
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- ============================================================

do $$
declare
  r record;
begin
  -- Constraint UNIQUE exatamente em (data, ad_name)
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.gastos'::regclass
      and c.contype = 'u'
      and (select array_agg(a.attname::text order by a.attname)
           from pg_attribute a
           where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) = array['ad_name', 'data']
  loop
    execute format('alter table public.gastos drop constraint %I', r.conname);
    raise notice 'constraint removida: %', r.conname;
  end loop;

  -- Índice UNIQUE solto exatamente em (data, ad_name)
  for r in
    select i.indexrelid::regclass::text as nome
    from pg_index i
    where i.indrelid = 'public.gastos'::regclass
      and i.indisunique
      and not i.indisprimary
      and (select array_agg(a.attname::text order by a.attname)
           from pg_attribute a
           where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) = array['ad_name', 'data']
  loop
    execute format('drop index if exists %s', r.nome);
    raise notice 'índice removido: %', r.nome;
  end loop;
end $$;

-- Linhas de anúncio (ad_id preenchido) repetidas no mesmo dia impediriam o
-- índice. O sync apaga e regrava o período, então não deve haver — mas se
-- houver, fica a mais recente.
delete from public.gastos g
using public.gastos d
where g.ad_id is not null
  and g.ad_id = d.ad_id
  and g.data = d.data
  and g.created_at < d.created_at;

create unique index if not exists gastos_data_ad_id_key on public.gastos (data, ad_id);
