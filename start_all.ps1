# ============================================================================
# Script para iniciar DataHub + Supervisório
# ============================================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         INICIANDO SISTEMA COMPLETO                         " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Verifica se venv existe
if (-not (Test-Path "venv")) {
    Write-Host "❌ Ambiente virtual não encontrado!" -ForegroundColor Red
    Write-Host "   Execute primeiro: python -m venv venv" -ForegroundColor Yellow
    exit 1
}

# Inicia DataHub em nova janela
Write-Host "🚀 Iniciando DataHub..." -ForegroundColor Green
$datahubScript = @"
cd '$PWD'
.\venv\Scripts\Activate.ps1
Write-Host '═════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '            DATAHUB - Porta 8000             ' -ForegroundColor Cyan
Write-Host '═════════════════════════════════════════════' -ForegroundColor Cyan
python datahub.py
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $datahubScript

Write-Host "   ✓ DataHub iniciando em nova janela..." -ForegroundColor Green
Write-Host "   URL: http://localhost:8000" -ForegroundColor Yellow

# Aguarda 3 segundos para DataHub iniciar
Write-Host ""
Write-Host "⏳ Aguardando DataHub inicializar (3s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Verifica se app.py existe
if (Test-Path "app.py") {
    Write-Host ""
    Write-Host "🚀 Iniciando Supervisório Principal..." -ForegroundColor Green
    
    $appScript = @"
cd '$PWD'
.\venv\Scripts\Activate.ps1
Write-Host '═════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '         SUPERVISÓRIO - Porta 5000           ' -ForegroundColor Cyan
Write-Host '═════════════════════════════════════════════' -ForegroundColor Cyan
python app.py
"@
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $appScript
    
    Write-Host "   ✓ Supervisório iniciando em nova janela..." -ForegroundColor Green
    Write-Host "   URL: http://localhost:5000" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "⚠️  app.py não encontrado - iniciando apenas DataHub" -ForegroundColor Yellow
}

# Resumo
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "                   SISTEMA INICIADO!                        " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📡 DataHub (comunicação PLC):" -ForegroundColor Green
Write-Host "   http://localhost:8000" -ForegroundColor White
Write-Host "   http://localhost:8000/docs (documentação)" -ForegroundColor Gray
Write-Host ""

if (Test-Path "app.py") {
    Write-Host "🖥️  Supervisório (telas):" -ForegroundColor Green
    Write-Host "   http://localhost:5000" -ForegroundColor White
    Write-Host ""
}

Write-Host "💡 Dicas:" -ForegroundColor Yellow
Write-Host "   - Use Ctrl+C nas janelas para parar cada serviço" -ForegroundColor Gray
Write-Host "   - Veja INTEGRACAO_SUPERVISORIO.md para usar em suas telas" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ Tudo pronto para usar!" -ForegroundColor Green
Write-Host ""

