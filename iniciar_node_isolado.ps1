# iniciar_node_isolado.ps1
# Script para iniciar apenas o servidor Node.js isoladamente para debug

Write-Host "=== INICIANDO SERVIDOR NODE.JS ===" -ForegroundColor Cyan
Write-Host ""

# Configura variáveis de ambiente
$env:MACHINE = "700CX"
$env:PLC_IP = "100.70.0.10"
$env:PLC_RACK = "0"
$env:PLC_SLOT = "1"
$env:WS_PORT = "8081"
$env:NODE_S7_PORT = "8081"
$env:SCAN_MS = "200"
$env:NS7_CHUNK_SIZE = "64"
$env:NS7_INTER_CHUNK_MS = "0"

Write-Host "Configuracoes:" -ForegroundColor Yellow
Write-Host "  MACHINE: $env:MACHINE"
Write-Host "  PLC_IP: $env:PLC_IP"
Write-Host "  WS_PORT: $env:WS_PORT"
Write-Host ""

# Verifica se Node.js está instalado
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Node.js nao encontrado!" -ForegroundColor Red
    exit 1
}

# Verifica dependências
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "Iniciando servidor Node.js..." -ForegroundColor Green
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Yellow
Write-Host ""

# Inicia o servidor (sem background para ver logs)
npm start

