# MCP_BOOTSTRAP – APP CAMPANHA (AUTOMAÇÃO DE OFERTAS)
**Versão:** 1.0 — Especificação Mestra  
**Status:** ATIVO — Consultar sempre ao iniciar sessão  
**Escopo:** Diretriz de governança para desenvolvimento, arquitetura e deploy do App de Agendamento e Automação de Ofertas.

---

## TEMA 1: GOVERNANÇA E REGRAS DE DESENVOLVIMENTO PARA AGENTES DE IA

### 1.1 Regras de Ouro
1. **Ambiente Local Primeiro**: Desenvolver e validar localmente. Não atualizar o ambiente online (Render/Vercel) exceto sob solicitação direta do usuário. Garantir versionamento via Git.
2. **Proibição Absoluta de Select Direto**: O backend Node.js **JAMAIS** fará queries SQL ad-hoc (ex: `SELECT * FROM table`, `UPDATE ... SET ...`). Todo e qualquer acesso, alteração ou deleção de dados deve ser executado exclusivamente através de **Stored Functions ou Procedures** no banco de dados Postgres 16.
3. **Proibição de Termos Restritos**: JAMAIS citar "supabase" no código, logs ou documentação. O banco é referenciado estritamente como **Postgres 16** (Neon.tech para nuvem ou local para desenvolvimento).
4. **Idempotência no Envio de Mensagens**: Garantir que uma mesma oferta nunca seja postada mais de uma vez no mesmo grupo do WhatsApp (controle atômico de status 'Criada' -> 'Postada').

---

## TEMA 2: STACK TECNOLÓGICA E INFRAESTRUTURA

| Camada | Tecnologia | Hospedagem Gratuita |
|---|---|---|
| **Backend** | Node.js (Express) | **Render Web Services** (Plano Free) |
| **Frontend / PWA** | React + Vite (Vanilla CSS) | **Vercel** (Plano Free) |
| **Banco de Dados** | PostgreSQL 16 | **Neon.tech** (Plano Free - 0.5 GiB) |
| **Automação WhatsApp** | `@whiskeysockets/baileys` | Rodado no container Node.js persistente |

---

## TEMA 3: DOUTRINA DE ACESSO A DADOS (POSTGRES 16)

### 3.1 Schema de Banco de Dados (`tenant_campaigns`)

Todas as tabelas e stored functions residem sob o schema `tenant_campaigns`.

```sql
CREATE SCHEMA IF NOT EXISTS tenant_campaigns;

-- Tabela de Ofertas/Campanhas
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

-- Tabela de Configurações (Chave-Valor para API Keys)
CREATE TABLE IF NOT EXISTS tenant_campaigns.settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Catálogo de Stored Functions Obrigatórias

O backend deve invocar apenas estas funções:

1. `tenant_campaigns.create_offer(...)` -> Salva uma nova campanha/oferta com status 'Criada'.
2. `tenant_campaigns.get_offers_by_status(status)` -> Retorna ofertas filtradas por status para o painel Kanban.
3. `tenant_campaigns.update_offer_status(id, status)` -> Atualiza o status da oferta.
4. `tenant_campaigns.get_offers_to_process()` -> Seleciona ofertas com `status = 'Criada'` e `scheduled_at <= NOW()`.
5. `tenant_campaigns.get_offer_by_id(id)` -> Retorna detalhes de uma oferta.
6. `tenant_campaigns.update_offer(...)` -> Atualiza os dados editados de uma oferta.
7. `tenant_campaigns.delete_offer(id)` -> Remove a oferta do banco.
8. `tenant_campaigns.save_setting(key, value)` -> Cria ou atualiza chaves de API.
9. `tenant_campaigns.get_settings()` -> Retorna todas as chaves de API salvas como um objeto JSONB.

---

## TEMA 4: ESPECIFICAÇÃO DE APIS E CHAVES DE INTEGRAÇÃO

O sistema foi desenhado para gerenciar de forma dinâmica chaves de API salvas no banco de dados, eliminando a necessidade de redeploys no Render.

### 4.1 Chaves de API Gerenciadas
- **Shopee API**:
  - `shopee_app_id`: ID da aplicação de afiliado.
  - `shopee_app_secret`: Chave de autenticação da aplicação.
  - `shopee_affiliate_id`: Identificador de afiliado para substituição e geração do link parametrizado.
- **WhatsApp API (Gateway Externo)**:
  - `whatsapp_api_url`: URL do endpoint do gateway (ex: Evolution API ou Z-API).
  - `whatsapp_api_token`: Token de autorização.
  - `whatsapp_api_client_id`: ID da instância no gateway.
- **Python Compartilhado**:
  - `python_service_url`: URL do serviço Python compartilhado para extrações avançadas de dados.
  - `python_service_token`: Token de segurança para autenticar requisições.
- **Gerais**:
  - `default_group_id`: Identificador do grupo de WhatsApp padrão do usuário.

### 4.2 Lógica de Roteamento de Disparo (WhatsApp)
- **Modo Baileys (Nativo / Gratuito)**: Se `whatsapp_api_url` e `whatsapp_api_token` estiverem ausentes nas configurações, o backend usa a biblioteca nativa `@whiskeysockets/baileys` para se conectar diretamente ao WhatsApp Web por QR Code.
- **Modo Gateway (API Externa)**: Se as chaves do WhatsApp estiverem configuradas no banco, as postagens de ofertas serão enviadas via chamada HTTP REST para o gateway configurado (Evolution API, etc.), poupando recursos do servidor Render.

---

## TEMA 5: FRONTEND E DESIGN SYSTEM DO KANBAN

O frontend é projetado como um PWA mobile-first responsivo de alta fidelidade visual (premium dark mode).

### 5.1 Estados do Kanban (Colunas)
Toda oferta transita estritamente entre estes 6 estados:
1. `Criada`: Link salvo, agendado e aguardando processamento.
2. `Postada`: Mensagem gerada e postada no grupo do WhatsApp com sucesso.
3. `Em Campanha`: Oferta ativa com interações do público (status manual).
4. `Encerrada`: Promoção terminada pelo usuário ou data de vigência expirada.
5. `Suspensa`: Pausada devido a falhas de conexão com WhatsApp ou pendência manual.
6. `Cancelada`: Oferta descartada pelo usuário ou inválida.

### 5.2 Ergonomia e UI Mobile-First
- **Mobile layout**: Ao invés de exibir 6 colunas espremidas na horizontal, o celular renderiza uma barra superior de Abas/Filtros horizontais deslizantes para selecionar o status ativo, exibindo as ofertas em lista vertical do status selecionado.
- **Desktop layout**: Grid de 6 colunas horizontais com suporte a reordenação.
- **Visual**: Glassmorphism sutil sobre gradientes de fundo radial, com botões de tamanho de toque de no mínimo 48px para facilitar o uso no celular.
