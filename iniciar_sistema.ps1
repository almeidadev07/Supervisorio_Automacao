# Script para iniciar DataHub + Supervisório
# Limpa tudo antes de iniciar

Write-Host "=================================" -ForegroundColor Cyan
Write-Host "🚀 INICIANDO SISTEMA COMPLETO" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# 1. Mata processos antigos
Write-Host "`n1️⃣  Parando processos antigos..." -ForegroundColor Yellow
Stop-Job * -ErrorAction SilentlyContinue | Out-Null
Remove-Job * -Force -ErrorAction SilentlyContinue | Out-Null
Stop-Process -Name python -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. Inicia DataHub
Write-Host "`n2️⃣  Iniciando DataHub (porta 8000)..." -ForegroundColor Yellow
$datahub = Start-Job -ScriptBlock {
    cd C:\PROGRAMAS\Supervisorio
    .\venv\Scripts\python.exe datahub.py
}
Write-Host "   Job ID: $($datahub.Id)" -ForegroundColor Green

# Aguarda DataHub iniciar
Write-Host "   Aguardando DataHub inicializar..." -ForegroundColor Gray
Start-Sleep -Seconds 8

# Verifica se DataHub respondeu
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/status" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   ✅ DataHub OK!" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  DataHub pode não estar respondendo ainda" -ForegroundColor Yellow
}

# 3. Inicia app.py
Write-Host "`n3️⃣  Iniciando Supervisório (porta 5000)..." -ForegroundColor Yellow
$app = Start-Job -ScriptBlock {
    cd C:\PROGRAMAS\Supervisorio
    .\venv\Scripts\python.exe app.py
}
Write-Host "   Job ID: $($app.Id)" -ForegroundColor Green

# Aguarda app.py iniciar
Write-Host "   Aguardando Supervisório inicializar..." -ForegroundColor Gray
Start-Sleep -Seconds 8

# Verifica se app.py respondeu
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   ✅ Supervisório OK!" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Supervisório pode não estar respondendo ainda" -ForegroundColor Yellow
}

Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host "✅ SISTEMA INICIADO" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Status dos Jobs:" -ForegroundColor White
Get-Job | Format-Table -AutoSize

Write-Host "`n🌐 URLs:" -ForegroundColor White
Write-Host "   DataHub:      http://localhost:8000/api/status"
Write-Host "   Supervisório: http://localhost:5000/"

Write-Host "`n📝 Para ver logs:" -ForegroundColor White
Write-Host "   Get-Job | Receive-Job"

Write-Host "`n🛑 Para parar tudo:" -ForegroundColor White
Write-Host "   Stop-Job *; Remove-Job * -Force; Stop-Process -Name python -Force"

Write-Host ""


