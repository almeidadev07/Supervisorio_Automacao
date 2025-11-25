# Script para iniciar o Flask usando o venv correto
Write-Host "Ativando ambiente virtual..." -ForegroundColor Green
& .\venv\Scripts\Activate.ps1

Write-Host "Verificando se requests está instalado..." -ForegroundColor Yellow
.\venv\Scripts\python.exe -m pip show requests | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Instalando requests..." -ForegroundColor Yellow
    .\venv\Scripts\pip.exe install requests
}

Write-Host "Iniciando servidor Flask..." -ForegroundColor Green
.\venv\Scripts\python.exe app.py

