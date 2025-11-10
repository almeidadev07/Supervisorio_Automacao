# 🔧 Comandos Úteis - Nodes7

## 🚀 Iniciar Sistema

### Opção 1: Tudo junto (Recomendado)
```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

### Opção 2: Separado
```powershell
# Terminal 1 - Servidor Node.js
.\start_nodes7_server.ps1

# Terminal 2 - Aplicação Flask
python app.py
```

---

## 🧪 Testar Comunicação

### Teste completo automatizado
```powershell
python test_nodes7_connection.py
```

### Testes manuais rápidos
```powershell
# Health check
curl http://127.0.0.1:8081/health

# Estatísticas
curl http://127.0.0.1:8081/api/stats

# Lista de tags
curl http://127.0.0.1:8081/api/items

# Valores atuais
curl http://127.0.0.1:8081/api/snapshot
```

---

## 📊 Monitoramento

### Ver logs do Node.js
```powershell
# Se iniciado com o script integrado
# Os logs aparecem no console

# Se iniciado com npm start
npm start
```

### Ver logs do Flask
```powershell
python app.py
```

### Estatísticas em tempo real
```powershell
# Loop que atualiza a cada 2 segundos
while ($true) {
    Clear-Host
    curl http://127.0.0.1:8081/api/stats | ConvertFrom-Json | ConvertTo-Json -Depth 10
    Start-Sleep -Seconds 2
}
```

---

## 🔍 Debug

### Verificar conexão com PLC
```powershell
# Testa porta 102 (S7)
Test-NetConnection -ComputerName 100.70.0.10 -Port 102

# Ping simples
ping 100.70.0.10
```

### Verificar portas em uso
```powershell
# Porta 8081 (Node.js)
netstat -ano | findstr :8081

# Porta 5000 (Flask)
netstat -ano | findstr :5000
```

### Verificar processos
```powershell
# Node.js
Get-Process node

# Python
Get-Process python
```

---

## 🛠️ Manutenção

### Limpar e reinstalar dependências Node.js
```powershell
# Remove node_modules
Remove-Item -Recurse -Force node_modules

# Reinstala
npm install
```

### Atualizar dependências
```powershell
# Node.js
npm update

# Python
pip install --upgrade flask flask-socketio python-socketio
```

### Verificar versões
```powershell
node --version
npm --version
python --version
pip --version
```

---

## 🔄 Trocar Máquina

### Via script
```powershell
# Para 200CX
.\start_supervisorio_with_nodes7.ps1 -Machine "200CX" -PlcIp "100.20.0.10"

# Para 400CX
.\start_supervisorio_with_nodes7.ps1 -Machine "400CX" -PlcIp "100.40.0.10"

# Para 700CX
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

### Via variáveis de ambiente
```powershell
$env:MACHINE = "700CX"
$env:PLC_IP = "100.70.0.10"
npm start
```

---

## 📝 Logs e Diagnóstico

### Salvar logs em arquivo
```powershell
# Node.js
npm start > logs_nodes7.txt 2>&1

# Flask
python app.py > logs_flask.txt 2>&1
```

### Ver últimas linhas do log
```powershell
Get-Content -Tail 20 logs_nodes7.txt
```

### Monitorar log em tempo real
```powershell
Get-Content -Wait -Tail 20 logs_nodes7.txt
```

---

## 🔧 Configuração Avançada

### Mudar intervalo de polling
```powershell
# Mais rápido (100ms)
$env:SCAN_MS = "100"
npm start

# Mais lento (500ms)
$env:SCAN_MS = "500"
npm start
```

### Mudar porta WebSocket
```powershell
$env:WS_PORT = "8082"
$env:NODE_S7_PORT = "8082"
npm start
```

### Especificar comm_map manualmente
```powershell
$env:COMM_MAP_PATH = "C:\PROGRAMAS\Supervisorio\config\comm_map\700CX.json"
npm start
```

### Rack e Slot customizados
```powershell
# Para S7-300/400 (normalmente rack=0, slot=2)
$env:PLC_RACK = "0"
$env:PLC_SLOT = "2"
npm start
```

---

## 📊 API REST do Servidor Node.js

### Leitura de tags específicas
```powershell
# Uma tag
curl "http://127.0.0.1:8081/api/read?tags=VELOCIDADE_E1"

# Múltiplas tags
curl "http://127.0.0.1:8081/api/read?tags=VELOCIDADE_E1,VELOCIDADE_E2,VELOCIDADE_E3"
```

### Escrita de tags
```powershell
# PowerShell
$body = @{
    values = @{
        "VELOCIDADE_SP" = 100.0
        "COMANDO_START" = 1
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/write" -Method POST -Body $body -ContentType "application/json"
```

---

## 🧹 Limpeza

### Parar todos os processos
```powershell
# Node.js
Get-Process node | Stop-Process -Force

# Python/Flask
Get-Process python | Stop-Process -Force
```

### Limpar arquivos temporários
```powershell
# Cache Python
Remove-Item -Recurse -Force app\__pycache__
Remove-Item -Recurse -Force app\*\__pycache__

# Logs
Remove-Item -Force *.log
Remove-Item -Force run.log
```

---

## 🎯 Troubleshooting Rápido

### Problema: Porta em uso
```powershell
# Encontrar processo usando a porta
netstat -ano | findstr :8081

# Matar processo por PID (substitua 1234 pelo PID real)
taskkill /PID 1234 /F
```

### Problema: Servidor não conecta ao PLC
```powershell
# 1. Testa conectividade
Test-NetConnection -ComputerName 100.70.0.10 -Port 102

# 2. Verifica configuração
curl http://127.0.0.1:8081/api/stats

# 3. Tenta com rack/slot diferentes
$env:PLC_RACK = "0"
$env:PLC_SLOT = "2"
npm start
```

### Problema: Tags retornam None
```powershell
# 1. Verifica se tags foram carregadas
curl http://127.0.0.1:8081/api/items

# 2. Verifica comm_map
$env:COMM_MAP_PATH = "C:\PROGRAMAS\Supervisorio\config\comm_map\700CX.json"

# 3. Reinicia servidor
# Ctrl+C para parar
npm start
```

### Problema: "Cannot find module"
```powershell
# Reinstala dependências
npm install
```

---

## 🚦 Status e Saúde

### Dashboard simples no navegador
```
http://127.0.0.1:8081/api/stats
```

### Script de monitoramento contínuo
```powershell
# monitora_nodes7.ps1
while ($true) {
    Clear-Host
    Write-Host "=== STATUS NODES7 ===" -ForegroundColor Cyan
    Write-Host ""
    
    try {
        $health = curl -Silent http://127.0.0.1:8081/health | ConvertFrom-Json
        if ($health.ok) {
            Write-Host "✅ Servidor: OK" -ForegroundColor Green
        }
    } catch {
        Write-Host "❌ Servidor: OFFLINE" -ForegroundColor Red
    }
    
    try {
        $stats = curl -Silent http://127.0.0.1:8081/api/stats | ConvertFrom-Json
        Write-Host "📊 Ciclos: $($stats.stats.cycles)" -ForegroundColor Yellow
        Write-Host "📈 Updates: $($stats.stats.updates)" -ForegroundColor Yellow
        Write-Host "⏱️ Média: $($stats.stats.avgMs)ms" -ForegroundColor Yellow
    } catch {
        Write-Host "❌ Sem estatísticas" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Pressione Ctrl+C para sair" -ForegroundColor Gray
    Start-Sleep -Seconds 3
}
```

---

## 📞 Ajuda

Para mais informações:
- 📖 [INICIO_RAPIDO_NODES7.md](INICIO_RAPIDO_NODES7.md) - Guia de início rápido
- 📚 [MIGRACAO_NODES7.md](MIGRACAO_NODES7.md) - Documentação completa
- 🧪 `python test_nodes7_connection.py` - Teste automatizado

