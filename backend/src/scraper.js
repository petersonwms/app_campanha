const https = require('https');
const { URL } = require('url');

/**
 * Chama o serviço Python compartilhado.
 */
function callPythonService(serviceUrl, token, payload) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(serviceUrl);
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${token}`
        },
        timeout: 15000 // 15s de timeout
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(body));
            } else {
              reject(new Error(`Status ${res.statusCode}: ${body}`));
            }
          } catch (e) {
            reject(new Error(`Falha ao fazer parse da resposta do Python: ${e.message}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout na chamada do serviço Python'));
      });
      
      req.write(postData);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Função principal do scraper de links da Shopee.
 * Aceita configurações (para o script Python) e o prompt opcional do usuário.
 */
async function scrapeLink(urlStr, settings = {}, promptText = '') {
  // 1. Tenta usar o serviço Python do usuário se configurado
  if (settings.python_service_url && settings.python_service_token) {
    console.log('[Scraper] Chaves do serviço Python detectadas. Chamando script Python compartilhado...');
    try {
      const pyResult = await callPythonService(
        settings.python_service_url,
        settings.python_service_token,
        { url: urlStr, prompt: promptText }
      );
      
      // O script Python deve retornar um JSON com título, descrição, preços, etc.
      if (pyResult && (pyResult.title || pyResult.image_url)) {
        console.log('[Scraper] Dados retornados com sucesso pelo script Python!');
        return {
          link: urlStr,
          title: pyResult.title || 'Produto Shopee',
          description: pyResult.description || promptText || 'Confira essa oferta!',
          price: pyResult.price || null,
          promo_price: pyResult.promo_price || null,
          image_url: pyResult.image_url || null
        };
      }
    } catch (err) {
      console.error('[Scraper] Falha ao chamar o script Python compartilhado:', err.message);
      console.log('[Scraper] Fazendo fallback para o scraping local...');
    }
  }

  // 2. Fallback local: Faz requisição HTTP para extrair tags meta
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(urlStr);
      
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let html = '';
        
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
          }
          return scrapeLink(redirectUrl, settings, promptText).then(resolve);
        }

        res.on('data', (chunk) => {
          html += chunk;
          if (html.length > 2 * 1024 * 1024) {
            req.destroy();
          }
        });

        res.on('end', () => {
          const metaResult = parseHtmlMetadata(html, urlStr, promptText);
          resolve(metaResult);
        });
      });

      req.on('error', (err) => {
        console.error(`[Scraper] Erro no request do HTML:`, err.message);
        resolve(generateFallbackWithScreenshot(urlStr, promptText));
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(generateFallbackWithScreenshot(urlStr, promptText));
      });

      req.end();

    } catch (err) {
      console.error(`[Scraper] Erro geral de scraping local:`, err.message);
      resolve(generateFallbackWithScreenshot(urlStr, promptText));
    }
  });
}

/**
 * Parse do HTML básico. Se as tags de imagem/título estiverem vazias (bloqueio da Shopee),
 * faz o fallback injetando screenshot e regex de preço.
 */
function parseHtmlMetadata(html, originalUrl, promptText) {
  const titleRegex = /<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i;
  const imageRegex = /<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i;
  const descRegex = /<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i;
  const rawTitleRegex = /<title>(.*?)<\/title>/i;

  let title = '';
  let image = '';
  let description = '';

  const titleMatch = html.match(titleRegex);
  if (titleMatch && titleMatch[1]) {
    title = decodeHtmlEntities(titleMatch[1]);
  } else {
    const rawTitleMatch = html.match(rawTitleRegex);
    if (rawTitleMatch && rawTitleMatch[1]) {
      title = decodeHtmlEntities(rawTitleMatch[1]);
    }
  }

  const imageMatch = html.match(imageRegex);
  if (imageMatch && imageMatch[1]) {
    image = imageMatch[1];
  }

  const descMatch = html.match(descRegex);
  if (descMatch && descMatch[1]) {
    description = decodeHtmlEntities(descMatch[1]);
  }

  // Remove sufixo Shopee
  if (title) {
    title = title.replace(/\s*\|\s*Shopee\s*(Brasil|)?$/i, '');
  }

  // Se cair no bloqueio da Shopee (título genérico ou imagem nula)
  if (!image || (title.toLowerCase().includes('shopee') && title.length < 15)) {
    console.log('[Scraper] Bloqueio detectado ou dados nulos no HTML. Gerando dados de fallback com screenshot...');
    return generateFallbackWithScreenshot(originalUrl, promptText);
  }

  // Tenta extrair preços do prompt do usuário
  const { price, promoPrice } = extractPricesFromText(promptText);

  return {
    link: originalUrl,
    title: title || 'Produto Shopee',
    description: promptText || description || 'Confira essa super oferta na Shopee!',
    price: price,
    promo_price: promoPrice,
    image_url: image
  };
}

/**
 * Cria dados de fallback, tirando um print-screen real da página do produto via Microlink API
 * e extraindo preços digitados pelo usuário no prompt de texto.
 */
function generateFallbackWithScreenshot(urlStr, promptText) {
  // Extrai preço do prompt
  const { price, promoPrice } = extractPricesFromText(promptText);

  // API do Microlink para gerar screenshot (retorna a URL da imagem do screenshot da página da Shopee)
  const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(urlStr)}&screenshot=true&embed=screenshot.url`;

  return {
    link: urlStr,
    title: 'Produto Shopee',
    description: promptText || 'Confira essa super oferta no link!',
    price: price,
    promo_price: promoPrice,
    image_url: screenshotUrl
  };
}

/**
 * Regex para extrair preço original e promocional da descrição/prompt.
 */
function extractPricesFromText(text) {
  if (!text) return { price: null, promoPrice: null };

  let price = null;
  let promoPrice = null;

  // 1. Procura padrão "de R$ X por até R$ Y" ou "de X por Y"
  const patternDePor = /de\s*(?:r\$)?\s*(\d+(?:[.,]\d{2})?)\s*por\s*(?:até|apenas)?\s*(?:r\$)?\s*(\d+(?:[.,]\d{2})?)/i;
  const matchDePor = text.match(patternDePor);

  if (matchDePor) {
    price = parsePriceValue(matchDePor[1]);
    promoPrice = parsePriceValue(matchDePor[2]);
  } else {
    // 2. Procura apenas "por R$ Y" ou "por até Y" ou "apenas Y"
    const patternPor = /(?:por|até|apenas)\s*(?:r\$)?\s*(\d+(?:[.,]\d{2})?)/i;
    const matchPor = text.match(patternPor);
    if (matchPor) {
      promoPrice = parsePriceValue(matchPor[1]);
    }
  }

  return { price, promoPrice };
}

function parsePriceValue(str) {
  if (!str) return null;
  let cleaned = str.trim();
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&');
}

module.exports = {
  scrapeLink
};
