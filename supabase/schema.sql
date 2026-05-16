-- ============================================================
-- ROAS Dashboard - Schema Supabase
-- ============================================================

-- Tabela de vendas (recebidas via webhook Hotmart)
CREATE TABLE IF NOT EXISTS vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(100) UNIQUE NOT NULL,
  data TIMESTAMP WITH TIME ZONE NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  valor_centavos INTEGER NOT NULL,
  moeda VARCHAR(10) DEFAULT 'BRL',
  produto VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('front', 'upsell')),
  status VARCHAR(50) NOT NULL,
  buyer_email VARCHAR(255),
  sck VARCHAR(500),
  criativo VARCHAR(100),
  vsl VARCHAR(255),
  venda_front_id UUID REFERENCES vendas(id),
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data);
CREATE INDEX IF NOT EXISTS idx_vendas_sck ON vendas(sck);
CREATE INDEX IF NOT EXISTS idx_vendas_criativo ON vendas(criativo);
CREATE INDEX IF NOT EXISTS idx_vendas_vsl ON vendas(vsl);
CREATE INDEX IF NOT EXISTS idx_vendas_status ON vendas(status);
CREATE INDEX IF NOT EXISTS idx_vendas_tipo ON vendas(tipo);
CREATE INDEX IF NOT EXISTS idx_vendas_buyer_email ON vendas(buyer_email);

-- Tabela de gastos (sincronizados do Meta Ads)
CREATE TABLE IF NOT EXISTS gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  campaign_id VARCHAR(100),
  campaign_name VARCHAR(255),
  adset_id VARCHAR(100),
  adset_name VARCHAR(255),
  ad_id VARCHAR(100),
  ad_name VARCHAR(255),
  criativo VARCHAR(100),
  valor_gasto DECIMAL(10,2) NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  cpc DECIMAL(10,4),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(data, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_gastos_data ON gastos(data);
CREATE INDEX IF NOT EXISTS idx_gastos_criativo ON gastos(criativo);
CREATE INDEX IF NOT EXISTS idx_gastos_ad_name ON gastos(ad_name);

-- Tabela de VSLs cadastradas
CREATE TABLE IF NOT EXISTS vsls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vturb_video_id VARCHAR(100) UNIQUE,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado', 'arquivado')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cache de conversões do VTurb
CREATE TABLE IF NOT EXISTS vturb_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vturb_video_id VARCHAR(100) NOT NULL,
  vsl_nome VARCHAR(255),
  conversion_key VARCHAR(500),
  data TIMESTAMP WITH TIME ZONE,
  valor_centavos INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(conversion_key, vturb_video_id)
);

CREATE INDEX IF NOT EXISTS idx_vturb_conv_key ON vturb_conversions(conversion_key);

-- Configurações do sistema
CREATE TABLE IF NOT EXISTS configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave VARCHAR(100) UNIQUE NOT NULL,
  valor TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Produtos mapeados (front vs upsell)
CREATE TABLE IF NOT EXISTS produtos_mapeamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_produto VARCHAR(255) UNIQUE NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('front', 'upsell')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Log de sincronizações
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo VARCHAR(50) NOT NULL, -- 'meta', 'vturb'
  status VARCHAR(20) NOT NULL CHECK (status IN ('sucesso', 'erro', 'em_andamento')),
  mensagem TEXT,
  registros_processados INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- DADOS INICIAIS
-- ============================================================

INSERT INTO configuracoes (chave, valor) VALUES
  ('meta_access_token', ''),
  ('meta_ad_account_id', ''),
  ('hotmart_hottok', ''),
  ('vturb_api_key', ''),
  ('roas_minimo', '1.0'),
  ('meta_ultima_sync', ''),
  ('vturb_ultima_sync', '')
ON CONFLICT (chave) DO NOTHING;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsls ENABLE ROW LEVEL SECURITY;
ALTER TABLE vturb_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos_mapeamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Política: service_role tem acesso total (para o backend)
-- Para usuários autenticados: acesso de leitura

CREATE POLICY "Service role acesso total - vendas" ON vendas
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Usuarios autenticados leem vendas" ON vendas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role acesso total - gastos" ON gastos
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Usuarios autenticados leem gastos" ON gastos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role acesso total - vsls" ON vsls
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Usuarios autenticados leem vsls" ON vsls
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados escrevem vsls" ON vsls
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados atualizam vsls" ON vsls
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Service role acesso total - vturb_conversions" ON vturb_conversions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Usuarios autenticados leem vturb_conversions" ON vturb_conversions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role acesso total - configuracoes" ON configuracoes
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Usuarios autenticados leem e escrevem configuracoes" ON configuracoes
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Service role acesso total - produtos_mapeamento" ON produtos_mapeamento
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Usuarios autenticados acesso total - produtos_mapeamento" ON produtos_mapeamento
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Service role acesso total - sync_logs" ON sync_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Usuarios autenticados leem sync_logs" ON sync_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vendas_updated_at
  BEFORE UPDATE ON vendas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuracoes_updated_at
  BEFORE UPDATE ON configuracoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
