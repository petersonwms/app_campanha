const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let sock = null;
let qrCodeBase64 = null;
let connectionState = 'DISCONNECTED'; // 'DISCONNECTED', 'CONNECTING', 'CONNECTED', 'QR_READY'
let groupList = [];

const sessionDir = path.resolve(process.env.WHATSAPP_SESSION_DIR || './session');

// Cria o diretório de sessão se não existir
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  
  console.log(`Usando Baileys v${version.join('.')}, isLatest: ${isLatest}`);
  connectionState = 'CONNECTING';

  sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
    logger: pino({ level: 'silent' }), // Silenciar logs verbosos do pino
    browser: ['App Campanhas', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      connectionState = 'QR_READY';
      try {
        qrCodeBase64 = await QRCode.toDataURL(qr);
      } catch (err) {
        console.error('Erro ao gerar QR Code Base64:', err);
      }
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada devido a:', lastDisconnect?.error, ', tentando reconectar:', shouldReconnect);
      qrCodeBase64 = null;
      connectionState = 'DISCONNECTED';
      groupList = [];
      
      if (shouldReconnect) {
        // Aguarda 5 segundos antes de tentar reconectar para evitar loops intensos
        setTimeout(connectToWhatsApp, 5000);
      } else {
        console.log('Deslogado do WhatsApp. Limpe a pasta de sessões para gerar um novo QR.');
        fs.rmSync(sessionDir, { recursive: true, force: true });
        setTimeout(connectToWhatsApp, 1000);
      }
    } else if (connection === 'open') {
      console.log('Conexão aberta com o WhatsApp!');
      connectionState = 'CONNECTED';
      qrCodeBase64 = null;
      
      // Carregar a lista de chats/grupos
      await loadGroups();
    }
  });
}

/**
 * Carrega e filtra os grupos de WhatsApp que a conta participa.
 */
async function loadGroups() {
  if (!sock) return;
  try {
    const chats = await sock.groupFetchAllParticipating();
    groupList = Object.values(chats).map(group => ({
      id: group.id,
      name: group.subject,
      participantsCount: group.participants.length
    }));
    console.log(`Carregados ${groupList.length} grupos do WhatsApp.`);
  } catch (err) {
    console.error('Erro ao carregar grupos do WhatsApp:', err);
  }
}

/**
 * Envia uma oferta estruturada para um grupo.
 * @param {string} targetGroupIdOrName - O JID do grupo (ex: 1203630248384@g.us) ou o nome do grupo para buscar
 * @param {object} offer - Detalhes da oferta (title, description, price, promoPrice, link, imageUrl)
 */
async function sendOfferMessage(targetGroupIdOrName, offer) {
  if (connectionState !== 'CONNECTED' || !sock) {
    throw new Error('WhatsApp não está conectado. Não é possível enviar a mensagem.');
  }

  // Se o target não for um JID válido de grupo (que termina em @g.us), tenta encontrar pelo nome nos grupos carregados
  let targetJid = targetGroupIdOrName;
  if (!targetJid.endsWith('@g.us')) {
    const matchedGroup = groupList.find(g => g.name.toLowerCase() === targetGroupIdOrName.toLowerCase());
    if (matchedGroup) {
      targetJid = matchedGroup.id;
    } else {
      // Recarregar os grupos e tentar novamente caso o grupo seja novo
      await loadGroups();
      const retryMatched = groupList.find(g => g.name.toLowerCase() === targetGroupIdOrName.toLowerCase());
      if (retryMatched) {
        targetJid = retryMatched.id;
      } else {
        throw new Error(`Grupo "${targetGroupIdOrName}" não encontrado na lista de chats.`);
      }
    }
  }

  // Formata o preço de forma elegante
  const formatPrice = (value) => {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Constrói a mensagem estilizada com emojis e formatação estruturada
  let messageText = `🔥 *OFERTA IMPERDÍVEL* 🔥\n\n`;
  messageText += `*${offer.title}*\n\n`;
  
  if (offer.description) {
    messageText += `${offer.description}\n\n`;
  }

  if (offer.price) {
    messageText += `❌ De: ~${formatPrice(offer.price)}~\n`;
  }
  
  if (offer.promo_price) {
    messageText += `✅ *Por apenas: ${formatPrice(offer.promo_price)}*\n\n`;
  }

  messageText += `👉 *Aproveite aqui:* ${offer.link}\n`;

  // Se a oferta tiver imagem, envia a imagem com a legenda estruturada
  if (offer.image_url) {
    await sock.sendMessage(targetJid, {
      image: { url: offer.image_url },
      caption: messageText
    });
  } else {
    // Caso contrário, envia apenas texto com preview de link
    await sock.sendMessage(targetJid, {
      text: messageText,
      linkPreview: true
    });
  }

  return true;
}

function getWhatsappState() {
  return {
    status: connectionState,
    qr: qrCodeBase64,
    groups: groupList
  };
}

module.exports = {
  connectToWhatsApp,
  sendOfferMessage,
  getWhatsappState,
  loadGroups
};
