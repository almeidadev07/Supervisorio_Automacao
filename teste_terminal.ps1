# teste_terminal.ps1
Write-Host "=== DIAGNOSTICO NODES7 ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Health Check:" -ForegroundColor Yellow
try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:8081/health" -TimeoutSec 2
    Write-Host "   OK: " -NoNewline
    Write-Host $h.ok -ForegroundColor Green
} catch {
    Write-Host "   ERRO: " -NoNewline
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "2. Stats:" -ForegroundColor Yellow
try {
    $s = Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/stats" -TimeoutSec 2
    Write-Host "   Ciclos: $($s.stats.cycles)" -ForegroundColor Gray
    Write-Host "   Updates: $($s.stats.lastUpdateCount)" -ForegroundColor Gray
    Write-Host "   Media: $([math]::Round($s.stats.avgCycleMs, 1))ms" -ForegroundColor Gray
    Write-Host "   Blocos: $($s.stats.blocks)" -ForegroundColor Gray
} catch {
    Write-Host "   ERRO: " -NoNewline
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Teste Leitura (Node.js):" -ForegroundColor Yellow
try {
    $url = "http://127.0.0.1:8081/api/read?tags=XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL,XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG"
    $r = Invoke-RestMethod -Uri $url -TimeoutSec 3
    $real = $r.data.'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL'
    $prog = $r.data.'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG'
    Write-Host "   OK: " -NoNewline
    Write-Host "REAL=$real, PROG=$prog" -ForegroundColor Green
    Write-Host "   Fresh: $($r.fresh)" -ForegroundColor Gray
} catch {
    Write-Host "   ERRO: " -NoNewline
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "4. Teste Escrita (Node.js):" -ForegroundColor Yellow
try {
    $body = @{
        values = @{
            "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG" = 350.0
        }
    } | ConvertTo-Json
    $w = Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/write" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5
    Write-Host "   OK: " -NoNewline
    Write-Host $w.ok -ForegroundColor Green
} catch {
    Write-Host "   ERRO: " -NoNewline
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "5. Flask (read_tags):" -ForegroundColor Yellow
try {
    $f = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/read_tags?names=XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL" -TimeoutSec 2
    $val = $f.values.'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL'
    Write-Host "   OK: " -NoNewline
    Write-Host "VELOC_REAL = $val" -ForegroundColor Green
} catch {
    Write-Host "   ERRO: " -NoNewline
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "6. Snapshot (Node.js):" -ForegroundColor Yellow
try {
    $snap = Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/snapshot" -TimeoutSec 3
    $count = ($snap.data.PSObject.Properties | Measure-Object).Count
    $validCount = ($snap.data.PSObject.Properties | Where-Object { $snap.data.($_.Name) -ne $null } | Measure-Object).Count
    Write-Host "   Tags no cache: $count" -ForegroundColor Gray
    Write-Host "   Valores validos: $validCount" -ForegroundColor Gray
} catch {
    Write-Host "   ERRO: " -NoNewline
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "=== FIM DIAGNOSTICO ===" -ForegroundColor Cyan

