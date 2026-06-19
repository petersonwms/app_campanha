# Roteiro do Serviço Python - Fallback 3 & OCR

Este diretório contém o serviço em Python projetado para atuar como o **Fallback 3 (Scraping avançado)** e realizar o **processamento de OCR (Prints de Tela)** para capturar automaticamente títulos, descrições e preços de produtos.

## Funcionalidades
1. **OCR de Imagens (`POST /ocr`)**: Recebe um print de tela em formato Base64 enviado pelo aplicativo móvel, extrai os textos usando a biblioteca `EasyOCR` e processa os dados para autopreencher o título e preços (De/Por).
2. **Headless Scraping (`POST /scrape`)**: Acessa a página do produto da Shopee usando a biblioteca `Playwright`, burla proteções antibot e tira uma captura de tela (print) da página atual, retornando-a codificada em Base64 como a imagem principal do anúncio.

---

## Como Rodar Localmente

### 1. Pré-requisitos
Certifique-se de ter o Python 3.8+ instalado na sua máquina.

### 2. Instalação de Dependências
Crie um ambiente virtual e instale as dependências:

```bash
# Cria ambiente virtual
python -m venv venv

# Ativa o ambiente (Windows)
.\venv\Scripts\activate

# Instala dependências do requirements.txt
pip install -r requirements.txt

# Instala os binários do Chromium necessários para o Playwright
playwright install chromium
```

### 3. Configurando a Chave de API
O serviço é protegido por um token de autorização. Defina a variável de ambiente correspondente no terminal:

```powershell
# PowerShell (Windows)
$env:PYTHON_SERVICE_TOKEN="seu_token_secreto_aqui"
```

### 4. Executando o Servidor
Inicie o servidor de desenvolvimento:

```bash
python app.py
```
O serviço estará ativo em `http://localhost:8000`.

---

## Como Hospedar Gratuitamente no Render

Você pode subir este serviço no Render de forma gratuita como um **Web Service** usando o Dockerfile do próprio Render ou apenas configurando as dependências.

### Variáveis de Ambiente no Render:
- `PYTHON_SERVICE_TOKEN`: Defina um token seguro de sua escolha. Esta chave deve ser colada na tela de **Ajustes** do App de Campanhas.

*Nota: Para rodar OCR e Playwright de forma gratuita na nuvem, o tamanho da imagem do container ou uso de memória de 512MB RAM do Render Free pode sofrer com restrições. Recomenda-se rodar o script Python localmente ou em uma VPS para performance ideal com EasyOCR.*
