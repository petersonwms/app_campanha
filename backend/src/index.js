const express = require('express');
const cors = require('cors');
const db = require('./db');
const whatsapp = require('./whatsapp');
const scraper = require('./scraper');
const scheduler = require('./scheduler');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// ROTAS DE OFERTAS (CRUD via Stored Functions)
// -------------------------------------------------------------

// Criar / Agendar Oferta
app.post('/api/offers', async (req, res) => {
  try {
    const { link, title, description, price, promoPrice, imageUrl, scheduledAt, targetGroup } = req.body;
    
    if (!link || !scheduledAt || !targetGroup) {
      return res.status(400).json({ error: 'Os campos link, scheduledAt e targetGroup são obrigatórios.' });
    }

    const offerId = await db.createOffer({
      link,
      title,
      description,
      price,
      promoPrice,
      imageUrl,
      scheduledAt,
      targetGroup
    });

    res.status(201).json({ success: true, id: offerId });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno ao criar oferta.' });
  }
});

// Listar Ofertas por Status (Para o Kanban)
app.get('/api/offers/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const offers = await db.getOffersByStatus(status);
    res.json(offers);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar ofertas.' });
  }
});

// Mudar Status de Oferta (Kanban drag and drop ou ação)
app.patch('/api/offers/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status é obrigatório.' });
    }

    const updated = await db.updateOfferStatus(id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Oferta não encontrada.' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status da oferta.' });
  }
});

// Buscar Oferta por ID
app.get('/api/offers/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const offer = await db.getOfferById(id);
    if (!offer) {
      return res.status(404).json({ error: 'Oferta não encontrada.' });
    }
    res.json(offer);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter detalhes da oferta.' });
  }
});

// Editar Oferta
app.put('/api/offers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, promoPrice, imageUrl, scheduledAt, targetGroup } = req.body;

    const updated = await db.updateOffer(id, {
      title,
      description,
      price,
      promoPrice,
      imageUrl,
      scheduledAt,
      targetGroup
    });

    if (!updated) {
      return res.status(404).json({ error: 'Oferta não encontrada.' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar oferta.' });
  }
});

// Deletar Oferta
app.delete('/api/offers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.deleteOffer(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Oferta não encontrada.' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar oferta.' });
  }
});

// Scraping de Link Shopee
app.post('/api/offers/scrape', async (req, res) => {
  try {
    const { url, prompt } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL do link é obrigatório.' });
    }
    
    // Busca chaves de API e configurações do banco
    const settings = await db.getSettings();
    
    console.log(`Iniciando scraping do link: ${url} com prompt opcional: "${prompt || ''}"`);
    const metadata = await scraper.scrapeLink(url, settings, prompt);
    res.json(metadata);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao fazer scraping do link.' });
// OCR de Imagem (Print de Tela)
app.post('/api/offers/ocr', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'A imagem em base64 é obrigatória.' });
    }
    
    // Busca chaves do banco de dados (settings)
    const settings = await db.getSettings();
    
    console.log('[API] Recebida requisição de OCR de print screen.');
    const ocrResult = await scraper.processOCR(imageBase64, settings);
    res.json(ocrResult);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao processar OCR da imagem.' });
  }
});

// -------------------------------------------------------------
// ROTAS DE WHATSAPP (Via Baileys)
// -------------------------------------------------------------

// Obter status e QR Code do WhatsApp
app.get('/api/whatsapp/status', (req, res) => {
  try {
    const state = whatsapp.getWhatsappState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar status do WhatsApp.' });
  }
});

// Forçar sincronização de grupos do WhatsApp
app.post('/api/whatsapp/sync-groups', async (req, res) => {
  try {
    await whatsapp.loadGroups();
    const state = whatsapp.getWhatsappState();
    res.json({ success: true, groups: state.groups });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao sincronizar grupos.' });
  }
});

// -------------------------------------------------------------
// ROTAS DE CONFIGURAÇÕES (Settings via Stored Functions)
// -------------------------------------------------------------

// Obter todas as configurações
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter configurações.' });
  }
});

// Salvar/Atualizar configurações (recebe chaves e valores)
app.post('/api/settings', async (req, res) => {
  try {
    const settingsObj = req.body;
    
    if (!settingsObj || typeof settingsObj !== 'object') {
      return res.status(400).json({ error: 'Payload de configurações inválido.' });
    }

    // Itera por todas as chaves enviadas no body e salva no banco de forma atômica
    for (const [key, value] of Object.entries(settingsObj)) {
      await db.saveSetting(key, String(value));
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

// Endpoint de health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// -------------------------------------------------------------
// INICIALIZAÇÃO DE SERVIÇOS
// -------------------------------------------------------------

app.listen(PORT, async () => {
  console.log(`Servidor API rodando na porta ${PORT}`);
  
  // 1. Conecta ao WhatsApp via Baileys (restaura sessão ou aguarda QR code)
  try {
    await whatsapp.connectToWhatsApp();
  } catch (err) {
    console.error('Falha na inicialização do WhatsApp:', err);
  }

  // 2. Inicia o agendador de processamento (roda a cada 1 minuto)
  scheduler.startScheduler(60000);
});
