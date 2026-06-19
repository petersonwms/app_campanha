import os
import re
import base64
import io
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

# Tentativa de importar bibliotecas de OCR e Headless Browser
# Caso não estejam instaladas localmente para testes rápidos, o script não quebra
try:
    from PIL import Image
    import easyocr
    # Inicializa o leitor de OCR para Português e Inglês
    reader = easyocr.Reader(['pt', 'en'])
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    print("⚠️ Bibliotecas 'easyocr' ou 'pillow' não encontradas. OCR não estará disponível localmente.")

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("⚠️ Biblioteca 'playwright' não encontrada. Scraping avançado com print não estará disponível.")

app = FastAPI(title="Serviço Python Compartilhado - Automação de Ofertas", version="1.0.0")

# Habilita CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Chave de segurança (Token)
API_TOKEN = os.getenv("PYTHON_SERVICE_TOKEN", "token_secreto_python")

# Modelos de dados
class ScrapeRequest(BaseModel):
    url: str
    prompt: Optional[str] = ""

class OCRRequest(BaseModel):
    image_base64: str  # Imagem codificada em base64

def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token de autorização ausente.")
    
    # Extrai "Bearer token"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Formato de cabeçalho inválido. Use Bearer <TOKEN>")
    
    token = parts[1]
    if token != API_TOKEN:
        raise HTTPException(status_code=403, detail="Token de autorização inválido.")
    return token

# -------------------------------------------------------------
# LOGICA DE OCR (PRINT DE TELA DO USUÁRIO)
# -------------------------------------------------------------

def extract_prices_from_ocr_text(text: str):
    """
    Busca padrões de preço como 'R$ 99,90', 'De 100 por 49', '99.90', etc. no texto do OCR.
    """
    prices = []
    # Regex para capturar valores monetários no formato brasileiro ou americano
    pattern_price = r'(?:r\$)?\s*(\d+(?:[.,]\d{2})?)'
    matches = re.findall(pattern_price, text, re.IGNORECASE)
    
    for match in matches:
        # Formata o preço encontrado
        cleaned = match.strip()
        if ',' in cleaned and '.' in cleaned:
            cleaned = cleaned.replace('.', '').replace(',', '.')
        elif ',' in cleaned:
            cleaned = cleaned.replace(',', '.')
        try:
            val = float(cleaned)
            if val > 0 and val not in prices:
                prices.append(val)
        except ValueError:
            continue
            
    # Ordena preços encontrados. Geralmente o maior é o "De" (original) e o menor é o "Por" (promocional)
    prices.sort(reverse=True)
    
    original_price = prices[0] if len(prices) > 0 else None
    promo_price = prices[1] if len(prices) > 1 else (prices[0] if len(prices) == 1 else None)
    
    # Se só encontrou um preço, define como promocional
    if len(prices) == 1:
        original_price = None
        promo_price = prices[0]
        
    return original_price, promo_price

@app.post("/ocr", dependencies=[Depends(verify_token)])
async def process_ocr(payload: OCRRequest):
    if not OCR_AVAILABLE:
        raise HTTPException(status_code=500, detail="Serviço de OCR não está instalado ou configurado no servidor Python.")
        
    try:
        # Decodifica a imagem Base64
        header, encoded = payload.image_base64.split(",", 1) if "," in payload.image_base64 else (None, payload.image_base64)
        image_data = base64.b64decode(encoded)
        image = Image.open(io.BytesIO(image_data))
        
        # Converte para array numpy que o EasyOCR aceita
        # EasyOCR lê diretamente o arquivo ou imagem PIL
        results = reader.readtext(image_data)
        
        # Junta todas as strings de texto extraídas
        full_text = " ".join([res[1] for res in results])
        print(f"[Python OCR] Texto extraído: {full_text}")
        
        # Extrai preços
        original_price, promo_price = extract_prices_from_ocr_text(full_text)
        
        # Tenta pescar um título aproximado (primeiras palavras ou textos em destaque)
        # Em imagens de produto, textos maiores ou as primeiras linhas costumam ser o título
        title = "Produto Extraído via Print"
        for res in results:
            text_line = res[1].strip()
            # Se for uma linha com tamanho razoável e não for só preço/números, assume como título provisório
            if len(text_line) > 15 and not any(char.isdigit() for char in text_line[:5]):
                title = text_line
                break
                
        return {
            "success": True,
            "text": full_text,
            "title": title,
            "price": original_price,
            "promo_price": promo_price,
            "description": f"Oferta extraída via print de tela!\n\n{full_text[:200]}..."
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao processar imagem para OCR: {str(e)}")

# -------------------------------------------------------------
# LOGICA DE SCRAPING AVANÇADO (FALLBACK 3)
# -------------------------------------------------------------

@app.post("/scrape", dependencies=[Depends(verify_token)])
async def process_scrape(payload: ScrapeRequest):
    if not PLAYWRIGHT_AVAILABLE:
        # Se Playwright não estiver ativo, simula retorno com base no prompt
        return {
            "title": "Produto Shopee (Sem Playwright)",
            "description": payload.prompt or "Confira a oferta!",
            "price": None,
            "promo_price": None,
            "image_url": f"https://api.microlink.io/?url={payload.url}&screenshot=true&embed=screenshot.url"
        }
        
    try:
        print(f"[Python Scraper] Iniciando scraping avançado do link: {payload.url}")
        
        with sync_playwright() as p:
            # Inicializa navegador headless
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            
            # Navega até a página do produto
            page.goto(payload.url, wait_until="networkidle", timeout=20000)
            
            # Aguarda elementos da Shopee carregarem (título ou preço)
            try:
                page.wait_for_selector("div.SPmeta-title, h1, [data-qd-id]", timeout=5000)
            except:
                pass
                
            # Captura dados da página
            title = page.title()
            # Limpa título
            title = title.replace("| Shopee Brasil", "").strip()
            
            # Tira print screen da página do produto e converte para base64
            screenshot_bytes = page.screenshot(type="jpeg", quality=80)
            screenshot_base64 = f"data:image/jpeg;base64,{base64.b64encode(screenshot_bytes).decode('utf-8')}"
            
            # Tenta extrair preços do HTML rodando script na página
            # Muitos elementos de preço da Shopee usam classes específicas
            prices_in_page = page.evaluate("""() => {
                const elements = document.querySelectorAll('div[class*="price"], span[class*="price"], .SPmeta-price');
                const found = [];
                elements.forEach(el => {
                    const text = el.innerText;
                    if (text && text.includes('R$')) {
                        found.push(text);
                    }
                });
                return found;
            }""")
            
            print(f"[Python Scraper] Preços encontrados na página: {prices_in_page}")
            
            # Se encontrar preços, faz parse para extrair valores
            original_price = None
            promo_price = None
            
            if prices_in_page:
                all_vals = []
                for p_str in prices_in_page:
                    matches = re.findall(r'(?:r\$)?\s*(\d+(?:[.,]\d{2})?)', p_str, re.IGNORECASE)
                    for m in matches:
                        cleaned = m.replace('.', '').replace(',', '.')
                        try:
                            all_vals.append(float(cleaned))
                        except:
                            continue
                all_vals = sorted(list(set(all_vals)), reverse=True)
                if len(all_vals) > 0:
                    original_price = all_vals[0]
                    promo_price = all_vals[1] if len(all_vals) > 1 else all_vals[0]
                    if len(all_vals) == 1:
                        original_price = None
                        promo_price = all_vals[0]
            
            browser.close()
            
            # Se não extraiu preços do HTML, extrai do prompt do usuário
            if not promo_price and payload.prompt:
                # Usa regex simples
                match = re.search(r'de\s*(?:r\$)?\s*(\d+(?:[.,]\d{2})?)\s*por\s*(?:até)?\s*(?:r\$)?\s*(\d+(?:[.,]\d{2})?)', payload.prompt, re.IGNORECASE)
                if match:
                    original_price = float(match.group(1).replace(',', '.'))
                    promo_price = float(match.group(2).replace(',', '.'))
            
            return {
                "success": True,
                "title": title or "Produto Shopee",
                "description": payload.prompt or f"Confira essa super oferta!",
                "price": original_price,
                "promo_price": promo_price,
                "image_url": screenshot_base64  # Retorna o print screen real codificado em Base64!
            }
            
    except Exception as e:
        print(f"[Python Scraper] Erro no Playwright: {str(e)}")
        # Fallback local simulado se der erro
        return {
            "title": "Produto Shopee (Scrape Fallback)",
            "description": payload.prompt or "Acesse o link para conferir!",
            "price": None,
            "promo_price": None,
            "image_url": f"https://api.microlink.io/?url={payload.url}&screenshot=true&embed=screenshot.url"
        }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "ocr_available": OCR_AVAILABLE,
        "playwright_available": PLAYWRIGHT_AVAILABLE
    }

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
