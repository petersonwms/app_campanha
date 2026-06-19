const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente do pool de banco de dados:', err);
});

/**
 * Executa uma chamada de função do banco de dados (Stored Function).
 * Essa é a única forma de acessar o banco, cumprindo a regra de NUNCA fazer select direto no backend.
 */
async function callDbFunction(functionName, params = []) {
  const client = await pool.connect();
  try {
    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
    const queryText = `SELECT * FROM ${functionName}(${placeholders})`;
    const res = await client.query(queryText, params);
    return res.rows;
  } catch (err) {
    console.error(`Erro ao chamar Stored Function ${functionName}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cria/Agenda uma nova oferta.
 */
async function createOffer({ link, title, description, price, promoPrice, imageUrl, scheduledAt, targetGroup }) {
  const result = await callDbFunction('tenant_campaigns.create_offer', [
    link,
    title || null,
    description || null,
    price || null,
    promoPrice || null,
    imageUrl || null,
    scheduledAt,
    targetGroup
  ]);
  return result[0]?.create_offer;
}

/**
 * Obtém ofertas por status para o Kanban.
 */
async function getOffersByStatus(status) {
  return await callDbFunction('tenant_campaigns.get_offers_by_status', [status]);
}

/**
 * Atualiza o status de uma oferta específica.
 */
async function updateOfferStatus(id, status) {
  const result = await callDbFunction('tenant_campaigns.update_offer_status', [id, status]);
  return result[0]?.update_offer_status || false;
}

/**
 * Obtém ofertas prontas para serem processadas (agendamento <= NOW e status 'Criada').
 */
async function getOffersToProcess() {
  return await callDbFunction('tenant_campaigns.get_offers_to_process', []);
}

/**
 * Obtém detalhes de uma oferta pelo ID.
 */
async function getOfferById(id) {
  const result = await callDbFunction('tenant_campaigns.get_offer_by_id', [id]);
  return result[0] || null;
}

/**
 * Atualiza os dados de uma oferta.
 */
async function updateOffer(id, { title, description, price, promoPrice, imageUrl, scheduledAt, targetGroup }) {
  const result = await callDbFunction('tenant_campaigns.update_offer', [
    id,
    title || null,
    description || null,
    price || null,
    promoPrice || null,
    imageUrl || null,
    scheduledAt,
    targetGroup
  ]);
  return result[0]?.update_offer || false;
}

/**
 * Deleta uma oferta.
 */
async function deleteOffer(id) {
  const result = await callDbFunction('tenant_campaigns.delete_offer', [id]);
  return result[0]?.delete_offer || false;
}

/**
 * Obtém todas as configurações do sistema como um objeto JSON.
 */
async function getSettings() {
  const result = await callDbFunction('tenant_campaigns.get_settings', []);
  return result[0]?.get_settings || {};
}

/**
 * Salva/Atualiza uma configuração específica.
 */
async function saveSetting(key, value) {
  const result = await callDbFunction('tenant_campaigns.save_setting', [key, value]);
  return result[0]?.save_setting || false;
}

module.exports = {
  pool,
  createOffer,
  getOffersByStatus,
  updateOfferStatus,
  getOffersToProcess,
  getOfferById,
  updateOffer,
  deleteOffer,
  getSettings,
  saveSetting
};

