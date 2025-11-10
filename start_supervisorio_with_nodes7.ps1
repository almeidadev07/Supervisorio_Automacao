# start_supervisorio_with_nodes7.ps1
# Script para iniciar o supervisorio com Nodes7
# Inicia tanto o servidor Node.js quanto a aplicacao Flask

param(
    [string]$Machine = "",
    [string]$PlcIp = "",
    [int]$WsPort = 8081,
    [int]$FlaskPort = 5000
)

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "SUPERVISORIO COM NODES7" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# Funcao para detectar maquina automaticamente pela rede
function Get-AutoDetectedMachine {
    Write-Host "Detectando maquina automaticamente..." -ForegroundColor Yellow
    
    # Carrega configuracao de maquinas
    $machinesConfigPath = "app\data\machines_config.json"
    if (-not (Test-Path $machinesConfigPath)) {
        Write-Host "Configuracao de maquinas nao encontrada" -ForegroundColor Red
        return $null
    }
    
    $machinesConfig = Get-Content $machinesConfigPath | ConvertFrom-Json
    
    # Obtem IP local
    $localIPs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" } | Select-Object -ExpandProperty IPAddress
    
    Write-Host "IPs locais encontrados: $($localIPs -join ', ')" -ForegroundColor Gray
    
    # Tenta encontrar maquina que corresponde a rede local
    foreach ($machine in $machinesConfig) {
        $machineName = $machine.name
        $ipRanges = $machine.ip_ranges
        
        foreach ($range in $ipRanges) {
            foreach ($localIP in $localIPs) {
                # Compara os 3 primeiros octetos (ex: 100.70.0)
                $rangeParts = $range -split '\.'
                $ipParts = $localIP -split '\.'
                
                if ($rangeParts.Count -ge 3 -and $ipParts.Count -ge 3) {
                    $rangePrefix = "$($rangeParts[0]).$($rangeParts[1]).$($rangeParts[2])"
                    $ipPrefix = "$($ipParts[0]).$($ipParts[1]).$($ipParts[2])"
                    
                    if ($rangePrefix -eq $ipPrefix) {
                        Write-Host "Maquina detectada: $machineName (rede: $rangePrefix.x)" -ForegroundColor Green
                        return @{
                            Name = $machineName
                            PlcIp = $machine.default_plc_ip
                        }
                    }
                }
            }
        }
    }
    
    Write-Host "Nenhuma maquina detectada automaticamente" -ForegroundColor Yellow
    return $null
}

# Detecta maquina automaticamente se nao foi especificada
if (-not $Machine) {
    $detected = Get-AutoDetectedMachine
    if ($detected) {
        $Machine = $detected.Name
        if (-not $PlcIp) {
            $PlcIp = $detected.PlcIp
        }
    }
}

# Define variaveis de ambiente
if ($Machine) {
    $env:MACHINE = $Machine
    Write-Host "Maquina: $Machine" -ForegroundColor Green
} else {
    Write-Host "AVISO: Maquina nao especificada e nao detectada automaticamente" -ForegroundColor Yellow
    Write-Host "Uso: .\start_supervisorio_with_nodes7.ps1 -Machine ""700CX"" -PlcIp ""100.70.0.10""" -ForegroundColor Yellow
}

if ($PlcIp) {
    $env:PLC_IP = $PlcIp
    Write-Host "PLC IP: $PlcIp" -ForegroundColor Green
}

$env:WS_PORT = $WsPort
$env:NODE_S7_PORT = $WsPort
$env:APP_PORT = $FlaskPort
# Otimizações de polling do NodeS7
$env:SCAN_MS = "200"              # intervalo base do polling no Node (ms)
$env:NS7_CHUNK_SIZE = "64"        # aumenta o lote por leitura
$env:NS7_INTER_CHUNK_MS = "0"     # sem atraso entre lotes

Write-Host "Porta WebSocket: $WsPort" -ForegroundColor Green
Write-Host "Porta Flask: $FlaskPort" -ForegroundColor Green
Write-Host ""

# Verifica se Node.js esta instalado
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js nao encontrado. Por favor, instale o Node.js." -ForegroundColor Red
    exit 1
}

# Verifica se Python esta instalado
try {
    $pythonVersion = python --version
    Write-Host "Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Python nao encontrado. Por favor, instale o Python." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# Instala dependencias Node.js se necessario
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias Node.js..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao instalar dependencias Node.js" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

Write-Host "Iniciando servidor Node.js..." -ForegroundColor Green

# Inicia o servidor Node.js em background
$nodeJob = Start-Job -ScriptBlock {
    param($WsPort, $Machine, $PlcIp)
    
    $env:WS_PORT = $WsPort
    $env:NODE_S7_PORT = $WsPort
    if ($Machine) { $env:MACHINE = $Machine }
    if ($PlcIp) { $env:PLC_IP = $PlcIp }
    
    Set-Location $using:PWD
    npm start 2>&1
} -ArgumentList $WsPort, $Machine, $PlcIp

Write-Host "Servidor Node.js iniciado (Job ID: $($nodeJob.Id))" -ForegroundColor Green

# Aguarda o servidor Node.js inicializar
Write-Host "Aguardando servidor Node.js inicializar..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Testa se o servidor Node.js esta respondendo
$maxRetries = 10
$retryCount = 0
$serverReady = $false

while (-not $serverReady -and $retryCount -lt $maxRetries) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$WsPort/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $serverReady = $true
            Write-Host "Servidor Node.js esta respondendo!" -ForegroundColor Green
        }
    } catch {
        $retryCount++
        Write-Host "Tentativa $retryCount/$maxRetries..." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }
}

if (-not $serverReady) {
    Write-Host "Servidor Node.js nao respondeu apos $maxRetries tentativas" -ForegroundColor Red
    Write-Host "Output do servidor Node.js:" -ForegroundColor Yellow
    Receive-Job -Job $nodeJob
    Stop-Job -Job $nodeJob
    Remove-Job -Job $nodeJob
    exit 1
}

Write-Host ""
Write-Host "Iniciando aplicacao Flask..." -ForegroundColor Green
Write-Host ""
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "SUPERVISORIO RODANDO" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "Flask: http://127.0.0.1:$FlaskPort" -ForegroundColor Cyan
Write-Host "Node.js WebSocket: http://127.0.0.1:$WsPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para parar o servidor, pressione Ctrl+C" -ForegroundColor Yellow
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# Define handler para Ctrl+C
$ctrlCHandler = {
    Write-Host ""
    Write-Host "Encerrando servidores..." -ForegroundColor Yellow
    
    # Para o job do Node.js
    Stop-Job -Job $nodeJob -ErrorAction SilentlyContinue
    Remove-Job -Job $nodeJob -ErrorAction SilentlyContinue
    
    Write-Host "Servidores encerrados" -ForegroundColor Green
    exit 0
}

# Registra o handler
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action $ctrlCHandler

# Inicia Flask no processo principal (para poder interromper com Ctrl+C)
try {
    python app.py
} finally {
    # Cleanup ao sair
    Write-Host ""
    Write-Host "Encerrando servidores..." -ForegroundColor Yellow
    Stop-Job -Job $nodeJob -ErrorAction SilentlyContinue
    Remove-Job -Job $nodeJob -ErrorAction SilentlyContinue
    Write-Host "Servidores encerrados" -ForegroundColor Green
}
