# Script de inicialização para 700CX com CPU 1517T-3PN
# Força slot 1 correto

Write-Host "[START] Configurando ambiente para 700CX (CPU 1517T-3PN)..." -ForegroundColor Green

# Define variáveis de ambiente
$env:MACHINE = "700CX"
$env:PLC_IP = "100.70.0.10"
$env:PLC_RACK = "0"
$env:PLC_SLOT = "1"
$env:COMM_MAP_PATH = "config\comm_map\700CX.json"
$env:SCAN_MS = "200"

Write-Host "[START] MACHINE=$env:MACHINE" -ForegroundColor Cyan
Write-Host "[START] PLC_IP=$env:PLC_IP" -ForegroundColor Cyan
Write-Host "[START] PLC_RACK=$env:PLC_RACK" -ForegroundColor Cyan
Write-Host "[START] PLC_SLOT=$env:PLC_SLOT (CPU 1517T-3PN)" -ForegroundColor Cyan
Write-Host "[START] COMM_MAP_PATH=$env:COMM_MAP_PATH" -ForegroundColor Cyan
Write-Host ""
Write-Host "[START] Iniciando aplicação..." -ForegroundColor Green
Write-Host ""

# Ativa venv e executa
.\venv\Scripts\Activate.ps1
python app.py

