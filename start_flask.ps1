# Script PowerShell - execute com: .\start_flask.ps1 (NAO use "python start_flask.ps1")
$venvPath = if (Test-Path ".\.venv") { ".\.venv" } else { ".\venv" }
$pythonExe = Join-Path $venvPath "Scripts\python.exe"
$pipExe = Join-Path $venvPath "Scripts\pip.exe"

Write-Host "Usando ambiente virtual: $venvPath" -ForegroundColor Green

if (-not (Test-Path $pythonExe)) {
    Write-Host "Erro: Python do venv nao encontrado em $pythonExe" -ForegroundColor Red
    exit 1
}

Write-Host "Verificando modulo requests..." -ForegroundColor Yellow
& $pythonExe -m pip show requests 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Instalando requests..." -ForegroundColor Yellow
    & $pipExe install requests
}

Write-Host "Iniciando servidor Flask..." -ForegroundColor Green
& $pythonExe app.py

