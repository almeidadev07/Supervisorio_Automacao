# diagnostico_rapido.ps1
# Script de diagnóstico rápido do sistema

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "DIAGNÓSTICO RÁPIDO - NODES7" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Teste 1: Servidor Node.js
Write-Host "1. Testando servidor Node.js..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8081/health" -TimeoutSec 2 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "   [OK] Servidor Node.js respondendo" -ForegroundColor Green
        
        # Testa stats
        try {
            $stats = Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/stats" -TimeoutSec 2
            Write-Host "   [OK] Estatísticas:" -ForegroundColor Green
            Write-Host "        PLC IP: $($stats.config.PLC_IP)" -ForegroundColor Gray
            Write-Host "        Comm Map: $($stats.config.COMM_MAP_PATH)" -ForegroundColor Gray
            Write-Host "        Ciclos: $($stats.stats.cycles)" -ForegroundColor Gray
            Write-Host "        Updates: $($stats.stats.updates)" -ForegroundColor Gray
        } catch {
            Write-Host "   [ERRO] Não conseguiu obter estatísticas" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "   [ERRO] Servidor Node.js não está respondendo!" -ForegroundColor Red
    Write-Host "   Solução: Inicie com .\start.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Teste 2: Tags monitoradas
Write-Host "2. Testando tags monitoradas..." -ForegroundColor Yellow
try {
    $items = Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/items" -TimeoutSec 2
    $count = $items.count
    if ($count -gt 0) {
        Write-Host "   [OK] $count tags sendo monitoradas" -ForegroundColor Green
    } else {
        Write-Host "   [ERRO] Nenhuma tag sendo monitorada!" -ForegroundColor Red
        Write-Host "   Problema: Comm_map não foi carregado" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   [ERRO] Não conseguiu listar tags" -ForegroundColor Red
}

Write-Host ""

# Teste 3: Snapshot de valores
Write-Host "3. Testando leitura de valores..." -ForegroundColor Yellow
try {
    $snapshot = Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/snapshot" -TimeoutSec 3
    $data = $snapshot.data
    $validCount = ($data.PSObject.Properties | Where-Object { $_.Value -ne $null }).Count
    $totalCount = $data.PSObject.Properties.Count
    
    if ($validCount -gt 0) {
        Write-Host "   [OK] $validCount valores válidos de $totalCount tags" -ForegroundColor Green
        
        # Mostra primeiros 5 valores
        Write-Host "   Primeiros valores:" -ForegroundColor Gray
        $data.PSObject.Properties | Select-Object -First 5 | ForEach-Object {
            Write-Host "      $($_.Name) = $($_.Value)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   [ERRO] Todos os valores são null!" -ForegroundColor Red
        Write-Host "   Problema: PLC não está conectado ou não está respondendo" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   [ERRO] Não conseguiu ler valores" -ForegroundColor Red
}

Write-Host ""

# Teste 4: Aplicação Flask
Write-Host "4. Testando aplicação Flask..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:5000/" -TimeoutSec 2 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "   [OK] Aplicação Flask respondendo" -ForegroundColor Green
    }
} catch {
    Write-Host "   [ERRO] Aplicação Flask não está respondendo!" -ForegroundColor Red
    Write-Host "   Solução: Inicie com .\start.ps1" -ForegroundColor Yellow
}

Write-Host ""

# Teste 5: Teste de escrita
Write-Host "5. Testando escrita (opcional)..." -ForegroundColor Yellow
Write-Host "   Para testar escrita, execute:" -ForegroundColor Gray
Write-Host '   $body = @{ "NOME_DA_TAG" = 100.0 } | ConvertTo-Json' -ForegroundColor Gray
Write-Host '   Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/write" -Method POST -Body $body -ContentType "application/json"' -ForegroundColor Gray

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "DIAGNÓSTICO CONCLUÍDO" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Se houver erros acima, veja os logs do servidor Node.js" -ForegroundColor Yellow
Write-Host "para mais detalhes." -ForegroundColor Yellow
Write-Host ""

