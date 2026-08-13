-- Método de pagamento da venda (Cartão / Pix / Boleto / PayPal / Outros).
-- Preenchido pelos webhooks daqui pra frente; vendas antigas ficam nulas.
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS metodo_pagamento text;
