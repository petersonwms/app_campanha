const db = require('./db');
const whatsapp = require('./whatsapp');

let schedulerInterval = null;
let isProcessing = false;

/**
 * Inicia o job agendado que roda periodicamente processando ofertas elegíveis.
 * @param {number} intervalMs - Intervalo de verificação em milissegundos (padrão: 1 minuto)
 */
function startScheduler(intervalMs = 60000) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  console.log(`Scheduler iniciado. Verificando ofertas a cada ${intervalMs / 1000} segundos.`);
  
  schedulerInterval = setInterval(async () => {
    if (isProcessing) {
      console.log('Scheduler já está executando um lote de processamento. Pulando esta iteração.');
      return;
    }
    
    isProcessing = true;
    try {
      await processPendingOffers();
    } catch (err) {
      console.error('Erro durante o processamento do scheduler:', err);
    } finally {
      isProcessing = false;
    }
  }, intervalMs);
}

/**
 * Busca e processa todas as ofertas prontas para envio.
 */
async function processPendingOffers() {
  // 1. Busca ofertas pendentes no banco (scheduled_at <= NOW e status = 'Criada')
  // Cumpre estritamente a regra de não fazer select direto: usa stored function get_offers_to_process
  const pendingOffers = await db.getOffersToProcess();
  
  if (pendingOffers.length === 0) {
    return;
  }
  
  console.log(`[Scheduler] Encontradas ${pendingOffers.length} ofertas para processar.`);
  
  // 2. Processa cada oferta individualmente
  for (const offer of pendingOffers) {
    try {
      console.log(`[Scheduler] Processando oferta "${offer.title}" (ID: ${offer.id}) com destino ao grupo: "${offer.target_group}"`);
      
      // Tenta enviar a mensagem via Baileys
      await whatsapp.sendOfferMessage(offer.target_group, offer);
      
      // Se enviou com sucesso, atualiza o status no banco para 'Postada' usando a stored function update_offer_status
      await db.updateOfferStatus(offer.id, 'Postada');
      console.log(`[Scheduler] Oferta ${offer.id} postada com sucesso e atualizada no banco.`);
      
    } catch (err) {
      console.error(`[Scheduler] Falha ao processar oferta ${offer.id}:`, err.message);
      
      // Em caso de erro, altera para 'Suspensa' para que o usuário possa intervir manualmente
      // no Kanban e evitar loop infinito de tentativas com erro.
      await db.updateOfferStatus(offer.id, 'Suspensa');
    }
  }
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Scheduler parado.');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  processPendingOffers
};
