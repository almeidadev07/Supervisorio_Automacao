# 📖 Exemplo de Uso - Nodes7

Este documento mostra um exemplo prático de uso completo do sistema com Nodes7.

---

## 🎬 Cenário: Máquina 700CX

Vamos iniciar o supervisório para a máquina 700CX, ler algumas tags, escrever valores e monitorar em tempo real.

---

## Passo 1: Iniciar o Sistema

```powershell
# Abra PowerShell na pasta do projeto
cd C:\PROGRAMAS\Supervisorio

# Inicie o sistema completo
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

### Saída esperada:
```
═══════════════════════════════════════════════════════
🏭 SUPERVISÓRIO COM NODES7
═══════════════════════════════════════════════════════

🏭 Máquina: 700CX
📡 PLC IP: 100.70.0.10
🔌 Porta WebSocket: 8081
🌐 Porta Flask: 5000

✅ Node.js: v18.x.x
✅ Python: 3.x.x

═══════════════════════════════════════════════════════

🚀 Iniciando servidor Node.js...
✅ Servidor Node.js iniciado (Job ID: X)
⏳ Aguardando servidor Node.js inicializar...
✅ Servidor Node.js está respondendo!

🚀 Iniciando aplicação Flask...

═══════════════════════════════════════════════════════
📊 SUPERVISÓRIO RODANDO
═══════════════════════════════════════════════════════
🌐 Flask: http://127.0.0.1:5000
🔌 Node.js WebSocket: http://127.0.0.1:8081

⚠️ Para parar o servidor, pressione Ctrl+C
═══════════════════════════════════════════════════════
```

---

## Passo 2: Verificar Comunicação

Em outro terminal PowerShell:

```powershell
# Teste básico
curl http://127.0.0.1:8081/health
```

### Saída:
```json
{"ok": true}
```

---

## Passo 3: Ver Estatísticas

```powershell
curl http://127.0.0.1:8081/api/stats | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### Saída:
```json
{
  "ok": true,
  "stats": {
    "cycles": 150,
    "updates": 1234,
    "avgMs": 45.2,
    "blocks": 5
  },
  "config": {
    "PLC_IP": "100.70.0.10",
    "PLC_RACK": 0,
    "PLC_SLOT": 1,
    "SCAN_MS": 200,
    "WS_PORT": 8081,
    "COMM_MAP_PATH": "config/comm_map/700CX.json"
  }
}
```

---

## Passo 4: Listar Tags Monitoradas

```powershell
curl http://127.0.0.1:8081/api/items | ConvertFrom-Json
```

### Saída (exemplo):
```json
{
  "ok": true,
  "count": 156,
  "items": [
    "VELOCIDADE_E1",
    "VELOCIDADE_E2",
    "VELOCIDADE_E3",
    "VELOCIDADE_E4",
    "COMANDO_START_E1",
    "COMANDO_STOP_E1",
    // ... mais tags
  ]
}
```

---

## Passo 5: Ler Valores Específicos

```powershell
# Ler uma tag
curl "http://127.0.0.1:8081/api/read?tags=VELOCIDADE_E1"
```

### Saída:
```json
{
  "ok": true,
  "data": {
    "VELOCIDADE_E1": 100.5
  },
  "fresh": true
}
```

```powershell
# Ler múltiplas tags
curl "http://127.0.0.1:8081/api/read?tags=VELOCIDADE_E1,VELOCIDADE_E2,VELOCIDADE_E3"
```

### Saída:
```json
{
  "ok": true,
  "data": {
    "VELOCIDADE_E1": 100.5,
    "VELOCIDADE_E2": 98.3,
    "VELOCIDADE_E3": 102.1
  },
  "fresh": true
}
```

---

## Passo 6: Snapshot Completo

```powershell
curl http://127.0.0.1:8081/api/snapshot | ConvertFrom-Json
```

### Saída (resumida):
```json
{
  "ok": true,
  "data": {
    "VELOCIDADE_E1": 100.5,
    "VELOCIDADE_E2": 98.3,
    "VELOCIDADE_E3": 102.1,
    "VELOCIDADE_E4": 99.8,
    "COMANDO_START_E1": 1,
    "COMANDO_STOP_E1": 0,
    // ... 150+ tags
  },
  "stats": {
    "cycles": 150,
    "updates": 1234,
    "avgMs": 45.2
  }
}
```

---

## Passo 7: Escrever Valores

```powershell
# Preparar dados
$body = @{
    values = @{
        "VELOCIDADE_SP_E1" = 120.0
        "COMANDO_START_E1" = 1
    }
} | ConvertTo-Json

# Escrever no PLC
Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/write" -Method POST -Body $body -ContentType "application/json"
```

### Saída:
```json
{"ok": true}
```

---

## Passo 8: Acessar Interface Web

Abra o navegador:
```
http://127.0.0.1:5000
```

Você verá:
- 🖥️ Interface do supervisório
- 📊 Valores em tempo real
- 📈 Gráficos e indicadores
- ⚠️ Alarmes ativos

---

## Passo 9: Executar Teste Completo

Em outro terminal:

```powershell
python test_nodes7_connection.py
```

### Saída esperada:
```
╔══════════════════════════════════════════════════════╗
║          TESTE DE COMUNICAÇÃO NODES7                 ║
╚══════════════════════════════════════════════════════╝

============================================================
  Teste 1: Health Check do Servidor
============================================================
✅ Servidor Node.js está respondendo

============================================================
  Teste 2: Estatísticas do Servidor
============================================================
✅ Estatísticas obtidas com sucesso

📊 Configuração:
   - PLC IP: 100.70.0.10
   - Rack/Slot: 0/1
   - Scan MS: 200ms
   - WS Port: 8081
   - Comm Map: config/comm_map/700CX.json

📈 Estatísticas:
   - Ciclos: 150
   - Updates: 1234
   - Média: 45.2ms
   - Blocos: 5

============================================================
  Teste 3: Tags Monitoradas
============================================================
✅ 156 tags estão sendo monitoradas

📋 Primeiras 10 tags:
   1. VELOCIDADE_E1
   2. VELOCIDADE_E2
   3. VELOCIDADE_E3
   4. VELOCIDADE_E4
   5. COMANDO_START_E1
   6. COMANDO_STOP_E1
   7. ALARME_E1
   8. ALARME_E2
   9. ESTADO_E1
   10. ESTADO_E2
   ... e mais 146 tags

============================================================
  Teste 4: Snapshot de Valores
============================================================
✅ Snapshot obtido com 156 valores

📊 Primeiros 5 valores:
   1. VELOCIDADE_E1 = 100.5
   2. VELOCIDADE_E2 = 98.3
   3. VELOCIDADE_E3 = 102.1
   4. VELOCIDADE_E4 = 99.8
   5. COMANDO_START_E1 = 1
   ... e mais 151 valores

📈 Valores válidos: 156/156

============================================================
  Teste 5: Driver Python
============================================================
✅ Módulo de drivers importado com sucesso
✅ Driver criado: Nodes7Driver
✅ Driver conectou ao servidor Node.js
✅ Driver reporta conectado: True
✅ Driver desconectado

============================================================
  Resumo dos Testes
============================================================

✅ PASSOU      - Health Check
✅ PASSOU      - Estatísticas
✅ PASSOU      - Tags Monitoradas
✅ PASSOU      - Snapshot
✅ PASSOU      - Driver Python

============================================================
Resultado: 5/5 testes passaram (100.0%)
============================================================

🎉 Todos os testes passaram!
✅ A comunicação com Nodes7 está funcionando corretamente!
```

---

## Passo 10: Monitorar em Tempo Real

```powershell
# Script de monitoramento contínuo
while ($true) {
    Clear-Host
    Write-Host "=== MONITORAMENTO 700CX ===" -ForegroundColor Cyan
    Write-Host ""
    
    $stats = curl -Silent http://127.0.0.1:8081/api/stats | ConvertFrom-Json
    
    Write-Host "📊 Estatísticas:" -ForegroundColor Yellow
    Write-Host "   Ciclos: $($stats.stats.cycles)"
    Write-Host "   Updates: $($stats.stats.updates)"
    Write-Host "   Média: $($stats.stats.avgMs)ms"
    Write-Host "   Blocos: $($stats.stats.blocks)"
    Write-Host ""
    
    $snapshot = curl -Silent "http://127.0.0.1:8081/api/read?tags=VELOCIDADE_E1,VELOCIDADE_E2,VELOCIDADE_E3,VELOCIDADE_E4" | ConvertFrom-Json
    
    Write-Host "🏭 Velocidades:" -ForegroundColor Green
    Write-Host "   E1: $($snapshot.data.VELOCIDADE_E1)"
    Write-Host "   E2: $($snapshot.data.VELOCIDADE_E2)"
    Write-Host "   E3: $($snapshot.data.VELOCIDADE_E3)"
    Write-Host "   E4: $($snapshot.data.VELOCIDADE_E4)"
    Write-Host ""
    
    Write-Host "Atualizando em 2s... (Ctrl+C para sair)" -ForegroundColor Gray
    Start-Sleep -Seconds 2
}
```

---

## Passo 11: Parar o Sistema

No terminal onde iniciou o supervisório:

```
Ctrl+C
```

### Saída:
```
🛑 Encerrando servidores...
✅ Servidores encerrados
```

---

## 💡 Dicas Práticas

### 1. Logs Detalhados

Os logs do servidor Node.js mostram cada operação:
```
[BOOT] NodeS7 iniciando com IP=100.70.0.10 rack=0 slot=1
[PLC] conectado
[Polling] ciclo=45ms avg=45.2ms updates=12 blocks=5
[Polling] ciclo=43ms avg=44.8ms updates=8 blocks=5
```

### 2. Debug de Tags

Se uma tag não funciona:
```powershell
# 1. Verifique se está na lista
curl http://127.0.0.1:8081/api/items | Select-String "NOME_TAG"

# 2. Tente ler diretamente
curl "http://127.0.0.1:8081/api/read?tags=NOME_TAG"

# 3. Verifique o comm_map
cat config\comm_map\700CX.json | Select-String "NOME_TAG"
```

### 3. Performance

Para otimizar performance:
```powershell
# Reduzir intervalo de polling (mais rápido, mais carga)
$env:SCAN_MS = "100"

# Aumentar intervalo de polling (mais lento, menos carga)
$env:SCAN_MS = "500"

# Reiniciar servidor com nova configuração
npm start
```

---

## 🎯 Casos de Uso Comuns

### Caso 1: Mudar Velocidade de uma Embaladora

```powershell
$body = @{
    values = @{
        "VELOCIDADE_SP_E1" = 150.0
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/write" -Method POST -Body $body -ContentType "application/json"
```

### Caso 2: Iniciar/Parar Máquina

```powershell
# Iniciar
$body = @{ values = @{ "COMANDO_START_E1" = 1 } } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/write" -Method POST -Body $body -ContentType "application/json"

# Parar
$body = @{ values = @{ "COMANDO_STOP_E1" = 1 } } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/write" -Method POST -Body $body -ContentType "application/json"
```

### Caso 3: Monitorar Alarmes

```powershell
$snapshot = curl -Silent http://127.0.0.1:8081/api/snapshot | ConvertFrom-Json
$alarmes = $snapshot.data.GetEnumerator() | Where-Object { $_.Key -like "*ALARME*" -and $_.Value -eq 1 }

if ($alarmes) {
    Write-Host "⚠️ ALARMES ATIVOS:" -ForegroundColor Red
    $alarmes | ForEach-Object { Write-Host "   - $($_.Key)" -ForegroundColor Yellow }
} else {
    Write-Host "✅ Sem alarmes" -ForegroundColor Green
}
```

---

## 📝 Conclusão

Este exemplo mostrou como:
- ✅ Iniciar o sistema com Nodes7
- ✅ Verificar comunicação
- ✅ Ler valores do PLC
- ✅ Escrever valores no PLC
- ✅ Monitorar em tempo real
- ✅ Testar a comunicação

O sistema está **100% funcional** e pronto para produção! 🎉

