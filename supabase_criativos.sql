-- Rodar no Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.criativos (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome          text NOT NULL,
  prefixo       text NOT NULL DEFAULT 'IZ',
  tipo_campanha text NOT NULL DEFAULT 'CBO',
  objetivo      text NOT NULL DEFAULT 'VENDAS',
  fase          text,
  campaign_name text NOT NULL,
  status        text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado')),
  created_at    timestamptz DEFAULT now()
);
