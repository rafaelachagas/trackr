-- ============================================================
-- Snapshot diário de performance por criativo (memória protegida)
-- ------------------------------------------------------------
-- Congela o ROAS/gasto/receita de cada criativo (chave = código|fase|flags,
-- mesma normalização de lib/meta-chave.ts) assim que o dia fecha. É gravado
-- UMA VEZ por dia por criativo e nunca mais recalculado a partir de `vendas`/
-- `gastos` — mesmo que essas tabelas sejam editadas, corrigidas ou percam
-- dados depois, a decisão histórica (o que foi escalado/pausado naquele dia,
-- com que número) fica preservada aqui.
-- ============================================================

CREATE TABLE IF NOT EXISTS performance_criativo_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,                    -- dia fechado (fuso America/Sao_Paulo)
  chave VARCHAR(300) NOT NULL,           -- codigo|fase|flags — mesma chave do performance-v2
  criativo VARCHAR(100) NOT NULL,
  fase VARCHAR(20),
  ad_name VARCHAR(255),
  campaign_name VARCHAR(255),
  gasto DECIMAL(12,2) NOT NULL DEFAULT 0,
  receita DECIMAL(12,2) NOT NULL DEFAULT 0,
  vendas_count INTEGER NOT NULL DEFAULT 0,
  roas DECIMAL(10,4),
  acao VARCHAR(30),                      -- ação do framework naquele dia (se disponível)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(data, chave)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_data ON performance_criativo_snapshot(data);
CREATE INDEX IF NOT EXISTS idx_snapshot_criativo ON performance_criativo_snapshot(criativo);
CREATE INDEX IF NOT EXISTS idx_snapshot_chave ON performance_criativo_snapshot(chave);

ALTER TABLE performance_criativo_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role acesso total - performance_criativo_snapshot"
  ON performance_criativo_snapshot FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Usuarios autenticados leem performance_criativo_snapshot"
  ON performance_criativo_snapshot FOR SELECT USING (auth.role() = 'authenticated');
