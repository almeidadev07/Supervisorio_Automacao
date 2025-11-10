# Script para reiniciar limpo - CPU 1517T-3PN (slot 1)

Write-Host "[RESTART] Parando todos os processos antigos..." -ForegroundColor Yellow
taskkill /F /IM python.exe /T 2>$null
taskkill /F /IM node.exe /T 2>$null
Start-Sleep -Seconds 3

Write-Host "[RESTART] Limpando logs antigos..." -ForegroundColor Yellow
Remove-Item app_output.log -ErrorAction SilentlyContinue
Remove-Item app_error.log -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[RESTART] Configurando ambiente para 700CX (CPU 1517T-3PN)..." -ForegroundColor Green
$env:MACHINE = "700CX"
$env:PLC_IP = "100.70.0.10"
$env:PLC_RACK = "0"
$env:PLC_SLOT = "1"
$env:COMM_MAP_PATH = "config\comm_map\700CX.json"
$env:SCAN_MS = "200"

Write-Host "[RESTART] MACHINE = $env:MACHINE" -ForegroundColor Cyan
Write-Host "[RESTART] PLC_IP = $env:PLC_IP" -ForegroundColor Cyan
Write-Host "[RESTART] PLC_RACK = $env:PLC_RACK" -ForegroundColor Cyan
Write-Host "[RESTART] PLC_SLOT = $env:PLC_SLOT (CPU 1517T-3PN - S7-1500)" -ForegroundColor Cyan
Write-Host "[RESTART] COMM_MAP_PATH = $env:COMM_MAP_PATH" -ForegroundColor Cyan
Write-Host ""
Write-Host "[RESTART] Ativando venv e iniciando aplicação..." -ForegroundColor Green
Write-Host ""

.\venv\Scripts\Activate.ps1
python app.py

