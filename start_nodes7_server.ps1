# start_nodes7_server.ps1
# Script para iniciar o servidor Node.js com Nodes7

Write-Host "🚀 Iniciando servidor Node.js com Nodes7" -ForegroundColor Green

# Verifica se Node.js está instalado
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js encontrado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js não encontrado. Por favor, instale o Node.js." -ForegroundColor Red
    exit 1
}

# Verifica se npm está instalado
try {
    $npmVersion = npm --version
    Write-Host "✅ npm encontrado: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm não encontrado. Por favor, instale o npm." -ForegroundColor Red
    exit 1
}

# Instala dependências se necessário
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erro ao instalar dependências" -ForegroundColor Red
        exit 1
    }
}

# Verifica variáveis de ambiente
$machine = $env:MACHINE
$plcIp = $env:PLC_IP
$wsPort = $env:WS_PORT

if (-not $machine) {
    Write-Host "⚠️ Variável MACHINE não definida. Usando valores padrão." -ForegroundColor Yellow
} else {
    Write-Host "🏭 Máquina: $machine" -ForegroundColor Cyan
}

if ($plcIp) {
    Write-Host "📡 PLC IP: $plcIp" -ForegroundColor Cyan
}

if ($wsPort) {
    Write-Host "🔌 WebSocket Port: $wsPort" -ForegroundColor Cyan
} else {
    Write-Host "🔌 WebSocket Port: 8081 (padrão)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "▶️ Iniciando servidor..." -ForegroundColor Green
Write-Host ""

# Inicia o servidor Node.js
npm start

