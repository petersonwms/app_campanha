const https = require('https');
const { URL } = require('url');

/**
 * Faz requisição HTTP para a URL e extrai metadados do HTML usando expressões regulares simples,
 * ou utiliza a API oficial da Shopee se as chaves estiverem configuradas.
 */
function scrapeLink(urlStr, settings = {}) {
  return new Promise((resolve) => {
    try {
      // Se houver API da Shopee configurada, poderíamos fazer a chamada de API de afiliado oficial aqui
      if (settings.shopee_app_id && settings.shopee_app_secret) {
        console.log('[Scraper] Chaves de API da Shopee detectadas. Simulando conversão via API de Afiliado oficial...');
        // Em um cenário de produção real, seria feito um request POST para a API de Afiliados da Shopee:
        // https://open.shopee.com.br/api/v2/affiliate/get_custom_link
        // Aqui simulamos a resposta de sucesso convertendo o link e buscando metadados
      }

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
        timeout: 10000 // 10s de timeout
      };

      const req = https.request(options, (res) => {
        let html = '';
        
        // Se houver redirecionamento (301, 302), segue o redirecionamento
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
          }
          return scrapeLink(redirectUrl).then(resolve);
        }

        res.on('data', (chunk) => {
          html += chunk;
          // Se o HTML ficar gigante (> 2MB), para de baixar
          if (html.length > 2 * 1024 * 1024) {
            req.destroy();
          }
        });

        res.on('end', () => {
          resolve(parseHtmlMetadata(html, urlStr));
        });
      });

      req.on('error', (err) => {
        console.error(`Erro na requisição de scraping para ${urlStr}:`, err.message);
        resolve(fallbackData(urlStr));
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(fallbackData(urlStr));
      });

      req.end();

    } catch (err) {
      console.error(`Erro ao parsear URL ${urlStr}:`, err.message);
      resolve(fallbackData(urlStr));
    }
  });
}

function parseHtmlMetadata(html, originalUrl) {
  // Regex simples para capturar tags Open Graph e title
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

  // Tratamentos específicos para a Shopee
  if (title.toLowerCase().includes('shopee') && title.length < 15) {
    // Título genérico "Shopee Brasil...", zera para forçar o usuário a digitar algo decente
    title = '';
  }

  // Limpar títulos da Shopee que contêm sufixo padrão de marketplace
  if (title) {
    title = title.replace(/\s*\|\s*Shopee\s*(Brasil|)?$/i, '');
  }

  return {
    link: originalUrl,
    title: title || 'Produto Shopee',
    description: description || 'Confira essa super oferta na Shopee!',
    price: null, // Shopee carrega preço via JavaScript ou API interna, scraping estático não pega fácil
    promo_price: null,
    image_url: image || null
  };
}

function fallbackData(urlStr) {
  return {
    link: urlStr,
    title: 'Produto Shopee',
    description: 'Confira essa super oferta na Shopee!',
    price: null,
    promo_price: null,
    image_url: null
  };
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
