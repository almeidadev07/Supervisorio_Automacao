# ============================================================================
# Script de inicialização do DataHub PLC
# ============================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "             DATAHUB PLC - Sistema de Comunicação           " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Verifica se Python está instalado
Write-Host "[1/5] Verificando Python..." -ForegroundColor Yellow
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Host "❌ Python não encontrado!" -ForegroundColor Red
    Write-Host "   Instale Python 3.8+ de https://www.python.org" -ForegroundColor Red
    exit 1
}

$pythonVersion = python --version
Write-Host "✅ $pythonVersion encontrado" -ForegroundColor Green

# Verifica se venv existe
Write-Host ""
Write-Host "[2/5] Verificando ambiente virtual..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    Write-Host "⚠️  Ambiente virtual não encontrado - criando..." -ForegroundColor Yellow
    python -m venv venv
    Write-Host "✅ Ambiente virtual criado" -ForegroundColor Green
} else {
    Write-Host "✅ Ambiente virtual encontrado" -ForegroundColor Green
}

# Ativa venv
Write-Host ""
Write-Host "[3/5] Ativando ambiente virtual..." -ForegroundColor Yellow
& "venv\Scripts\Activate.ps1"
Write-Host "✅ Ambiente virtual ativado" -ForegroundColor Green

# Verifica/instala dependências
Write-Host ""
Write-Host "[4/5] Verificando dependências..." -ForegroundColor Yellow
if (Test-Path "requirements_datahub.txt") {
    Write-Host "📦 Instalando/atualizando pacotes..." -ForegroundColor Cyan
    pip install -q -r requirements_datahub.txt
    Write-Host "✅ Dependências instaladas" -ForegroundColor Green
} else {
    Write-Host "⚠️  requirements_datahub.txt não encontrado" -ForegroundColor Yellow
    Write-Host "📦 Instalando pacotes essenciais..." -ForegroundColor Cyan
    pip install -q python-snap7 fastapi uvicorn pydantic
    Write-Host "✅ Pacotes essenciais instalados" -ForegroundColor Green
}

# Verifica se datahub.py existe
Write-Host ""
Write-Host "[5/5] Verificando arquivo datahub.py..." -ForegroundColor Yellow
if (-not (Test-Path "datahub.py")) {
    Write-Host "❌ Arquivo datahub.py não encontrado!" -ForegroundColor Red
    Write-Host "   Certifique-se de estar no diretório correto" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Arquivo datahub.py encontrado" -ForegroundColor Green

# Inicia DataHub
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "             INICIANDO DATAHUB...                           " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Dicas:" -ForegroundColor Yellow
Write-Host "   - Pressione Ctrl+C para parar" -ForegroundColor Gray
Write-Host "   - API disponível em http://localhost:8000" -ForegroundColor Gray
Write-Host "   - Docs em http://localhost:8000/docs" -ForegroundColor Gray
Write-Host ""

# Executa
python datahub.py

