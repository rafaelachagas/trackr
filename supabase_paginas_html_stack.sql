-- Snapshot navegável da página do concorrente: guarda o HTML bruto e o stack detectado.
-- Idempotente — pode rodar mais de uma vez.

alter table rastreador_paginas_hist add column if not exists html text;
alter table rastreador_paginas_hist add column if not exists stack jsonb default '[]'::jsonb;
