-- Landing Page Views da Meta por anúncio/dia — denominador do "Play Rate Real"
-- (Plays únicos da VTurb ÷ LP Views da Meta). Rode uma vez no SQL Editor.
alter table gastos add column if not exists lp_views int not null default 0;
