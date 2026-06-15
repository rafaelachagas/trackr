-- Adiciona campo de link do anúncio na tabela criativos
ALTER TABLE public.criativos ADD COLUMN IF NOT EXISTS link_anuncio text;
