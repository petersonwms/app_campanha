-- Criação do Schema
CREATE SCHEMA IF NOT EXISTS tenant_campaigns;

-- Tabela de Ofertas
CREATE TABLE IF NOT EXISTS tenant_campaigns.offers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link         TEXT NOT NULL,
  title        TEXT,
  description  TEXT,
  price        NUMERIC(10,2),
  promo_price  NUMERIC(10,2),
  image_url    TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Criada', -- 'Criada', 'Postada', 'Em Campanha', 'Encerrada', 'Suspensa', 'Cancelada'
  target_group TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhorar a performance das Stored Functions
CREATE INDEX IF NOT EXISTS idx_offers_status ON tenant_campaigns.offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_scheduled_at ON tenant_campaigns.offers(scheduled_at);

-- -------------------------------------------------------------
-- STORED FUNCTIONS (Garante: NENHUM SELECT DIRETO NO BACKEND)
-- -------------------------------------------------------------

-- 1. Criar Nova Oferta
CREATE OR REPLACE FUNCTION tenant_campaigns.create_offer(
  p_link TEXT,
  p_title TEXT,
  p_description TEXT,
  p_price NUMERIC(10,2),
  p_promo_price NUMERIC(10,2),
  p_image_url TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_target_group TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO tenant_campaigns.offers (
    link, title, description, price, promo_price, image_url, scheduled_at, target_group
  )
  VALUES (
    p_link, p_title, p_description, p_price, p_promo_price, p_image_url, p_scheduled_at, p_target_group
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Listar Ofertas por Status (Kanban)
CREATE OR REPLACE FUNCTION tenant_campaigns.get_offers_by_status(p_status TEXT)
RETURNS TABLE (
  id UUID,
  link TEXT,
  title TEXT,
  description TEXT,
  price NUMERIC(10,2),
  promo_price NUMERIC(10,2),
  image_url TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT,
  target_group TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.link, o.title, o.description, o.price, o.promo_price, o.image_url, o.scheduled_at, o.status, o.target_group, o.created_at, o.updated_at
  FROM tenant_campaigns.offers o
  WHERE o.status = p_status
  ORDER BY o.scheduled_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atualizar Status de uma Oferta
CREATE OR REPLACE FUNCTION tenant_campaigns.update_offer_status(
  p_id UUID,
  p_status TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE tenant_campaigns.offers
  SET status = p_status,
      updated_at = NOW()
  WHERE id = p_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Listar Ofertas Prontas para Processamento (Agendadas para agora ou passado e no status 'Criada')
CREATE OR REPLACE FUNCTION tenant_campaigns.get_offers_to_process()
RETURNS TABLE (
  id UUID,
  link TEXT,
  title TEXT,
  description TEXT,
  price NUMERIC(10,2),
  promo_price NUMERIC(10,2),
  image_url TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT,
  target_group TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.link, o.title, o.description, o.price, o.promo_price, o.image_url, o.scheduled_at, o.status, o.target_group
  FROM tenant_campaigns.offers o
  WHERE o.status = 'Criada'
    AND o.scheduled_at <= NOW()
  ORDER BY o.scheduled_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Obter Oferta por ID
CREATE OR REPLACE FUNCTION tenant_campaigns.get_offer_by_id(p_id UUID)
RETURNS TABLE (
  id UUID,
  link TEXT,
  title TEXT,
  description TEXT,
  price NUMERIC(10,2),
  promo_price NUMERIC(10,2),
  image_url TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT,
  target_group TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.link, o.title, o.description, o.price, o.promo_price, o.image_url, o.scheduled_at, o.status, o.target_group, o.created_at, o.updated_at
  FROM tenant_campaigns.offers o
  WHERE o.id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Atualizar Detalhes da Oferta
CREATE OR REPLACE FUNCTION tenant_campaigns.update_offer(
  p_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_price NUMERIC(10,2),
  p_promo_price NUMERIC(10,2),
  p_image_url TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_target_group TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE tenant_campaigns.offers
  SET title = p_title,
      description = p_description,
      price = p_price,
      promo_price = p_promo_price,
      image_url = p_image_url,
      scheduled_at = p_scheduled_at,
      target_group = p_target_group,
      updated_at = NOW()
  WHERE id = p_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Deletar Oferta
CREATE OR REPLACE FUNCTION tenant_campaigns.delete_offer(p_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM tenant_campaigns.offers
  WHERE id = p_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------------
-- CONFIGURAÇÕES (API KEYS, SHOPEE, WHATSAPP E PYTHON COMPARTILHADO)
-- -------------------------------------------------------------

-- Tabela de Configurações (Chave-Valor)
CREATE TABLE IF NOT EXISTS tenant_campaigns.settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Função para Salvar/Atualizar uma Configuração
CREATE OR REPLACE FUNCTION tenant_campaigns.save_setting(
  p_key TEXT,
  p_value TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO tenant_campaigns.settings (key, value, updated_at)
  VALUES (p_key, p_value, NOW())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW();
      
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para Obter Todas as Configurações como Objeto JSON
CREATE OR REPLACE FUNCTION tenant_campaigns.get_settings()
RETURNS JSONB AS $$
DECLARE
  v_settings JSONB;
BEGIN
  SELECT jsonb_object_agg(key, value) INTO v_settings FROM tenant_campaigns.settings;
  
  IF v_settings IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  
  RETURN v_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

