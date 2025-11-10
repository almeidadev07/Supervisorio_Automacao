# 🚨 Problema: Comunicação Parou de Funcionar

## Situação Reportada

1. ❌ Velocidade real **parou de atualizar** (não sincroniza com PLC)
2. ❌ Velocidade programada **não escreve** no PLC

---

## 🔍 Diagnóstico Rápido

Execute este comando para diagnóstico automático:

```powershell
.\diagnostico_rapido.ps1
```

Isso vai testar:
- ✅ Servidor Node.js
- ✅ Tags monitoradas
- ✅ Valores do PLC
- ✅ Aplicação Flask

---

## 📋 Checklist Manual

### 1. Servidor Node.js está rodando?

```powershell
curl http://127.0.0.1:8081/health
```

**Esperado:** `{"ok":true}`

**Se der erro:** O servidor não está rodando!
```powershell
.\start.ps1
```

---

### 2. Veja os logs do servidor Node.js

No terminal onde rodou `.\start.ps1`, procure por:

#### ✅ Logs Bons (tudo funcionando):
```
[Polling] buildGroupedByDb: 156 tags válidas, 12 ignoradas
[PlcPolling] ✅ Manager configurado com tradução de 156 tags
[PLC] conectado
[Polling] ciclo=45ms avg=45.2ms updates=12 blocks=5
```

#### ❌ Logs Ruins (problemas):
```
[Polling] buildGroupedByDb: 0 tags válidas
[PlcPolling] ✅ Manager configurado com tradução de 0 tags
```
**Problema:** Comm_map não carregou!

```
[PLC] erro de conexão
[PLC] desconectado
```
**Problema:** PLC não está acessível!

```
[Polling] ciclo=45ms avg=45.2ms updates=0 blocks=5
```
**Problema:** Conectado mas sem updates (PLC não responde)!

---

### 3. Estatísticas do servidor

```powershell
curl http://127.0.0.1:8081/api/stats | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**Veja:**
- `cycles` > 0? (número de ciclos executados)
- `updates` > 0? (número de valores atualizados)
- `COMM_MAP_PATH` aponta para arquivo correto?

---

### 4. Tags monitoradas

```powershell
curl http://127.0.0.1:8081/api/items
```

**Esperado:** Lista com nomes de tags

**Se retornar vazio:** Comm_map não foi carregado!

---

### 5. Valores atuais

```powershell
curl http://127.0.0.1:8081/api/snapshot
```

**Esperado:** Objeto com valores (não todos null)

**Se todos null:** PLC não está respondendo!

---

## 🔧 Soluções Comuns

### Problema 1: Servidor Node.js não inicia

**Sintomas:**
- `curl http://127.0.0.1:8081/health` dá erro
- Terminal mostra erro ao iniciar

**Soluções:**

1. **Verifique se porta 8081 está livre:**
   ```powershell
   netstat -ano | findstr :8081
   ```
   
   Se estiver em uso, mate o processo:
   ```powershell
   # Substitua PID pelo número que apareceu
   taskkill /PID 1234 /F
   ```

2. **Reinstale dependências:**
   ```powershell
   npm install
   ```

3. **Tente iniciar manualmente:**
   ```powershell
   npm start
   ```
   Veja os erros que aparecem

---

### Problema 2: Comm_map não carrega (0 tags)

**Sintomas:**
- Logs mostram: `0 tags válidas`
- `/api/items` retorna lista vazia

**Soluções:**

1. **Verifique qual comm_map deveria ser usado:**
   ```powershell
   # Veja variável de ambiente
   $env:MACHINE
   ```

2. **Verifique se arquivo existe:**
   ```powershell
   Test-Path "config\comm_map\700CX.json"
   ```

3. **Defina explicitamente:**
   ```powershell
   $env:COMM_MAP_PATH = "config\comm_map\700CX.json"
   npm start
   ```

---

### Problema 3: PLC não conecta

**Sintomas:**
- Logs mostram: `[PLC] erro de conexão`
- Valores são todos null

**Soluções:**

1. **Teste conectividade:**
   ```powershell
   Test-NetConnection -ComputerName 100.70.0.10 -Port 102
   ```
   
   Deve mostrar: `TcpTestSucceeded: True`

2. **Verifique IP do PLC:**
   ```powershell
   ping 100.70.0.10
   ```

3. **Tente outro rack/slot:**
   ```powershell
   $env:PLC_RACK = "0"
   $env:PLC_SLOT = "2"
   npm start
   ```

---

### Problema 4: Conecta mas não lê valores

**Sintomas:**
- Logs mostram: `[PLC] conectado`
- Mas: `updates=0` nos ciclos
- Valores são null

**Possíveis causas:**

1. **Tags no comm_map estão erradas:**
   - Endereços incorretos
   - DBs que não existem no PLC
   - Offsets errados

2. **PLC está bloqueando leitura:**
   - Proteção de leitura ativa
   - Bloco otimizado impedindo acesso

**Teste leitura de tag específica:**
```powershell
# Tente ler uma tag conhecida
curl "http://127.0.0.1:8081/api/read?tags=NOME_TAG_CONHECIDA"
```

---

## 🆘 Solução de Emergência

Se nada funcionar, volte ao básico:

### 1. Pare tudo:
```powershell
# Ctrl+C no terminal
# OU mate os processos
Get-Process node | Stop-Process -Force
Get-Process python | Stop-Process -Force
```

### 2. Limpe cache:
```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

### 3. Teste Node.js isolado:
```powershell
# Terminal 1 - apenas Node.js
$env:MACHINE = "700CX"
$env:PLC_IP = "100.70.0.10"
npm start
```

Veja se consegue conectar e ler valores.

### 4. Teste Flask isolado:
```powershell
# Terminal 2 - apenas Flask
python app.py
```

---

## 📊 Fluxo de Debug

1. **Execute diagnóstico:**
   ```powershell
   .\diagnostico_rapido.ps1
   ```

2. **Veja onde falha:**
   - Servidor não responde? → Problema na inicialização
   - 0 tags? → Problema no comm_map
   - Valores null? → Problema na conexão PLC
   - Sem updates? → Problema na leitura

3. **Aplique solução correspondente**

4. **Reinicie:**
   ```powershell
   .\start.ps1
   ```

5. **Execute diagnóstico novamente**

---

## 🔍 Logs Importantes

### Ao iniciar, DEVE aparecer:

```
[BOOT] NodeS7 iniciando com IP=... rack=... slot=...
[Polling] Carregando comm_map de: config/comm_map/700CX.json
[Polling] buildGroupedByDb: X tags válidas, Y ignoradas
[PlcPolling] ✅ Manager configurado com tradução de X tags
[PlcManager] Tentando conectar host=...
[PLC] conectado
[Polling] ciclo=XXms avg=XXms updates=X blocks=X
```

### Se faltar alguma dessas linhas, há problema!

---

## 📝 Me Envie Estas Informações

Para eu ajudar melhor, me envie:

1. **Saída do diagnóstico:**
   ```powershell
   .\diagnostico_rapido.ps1 > diagnostico.txt
   ```

2. **Primeiras 50 linhas dos logs do Node.js:**
   (copie do terminal onde rodou `.\start.ps1`)

3. **Resultado destes comandos:**
   ```powershell
   curl http://127.0.0.1:8081/api/stats
   curl http://127.0.0.1:8081/api/items
   Test-NetConnection -ComputerName 100.70.0.10 -Port 102
   ```

---

## ⚡ Teste Rápido Agora

```powershell
# 1. Execute diagnóstico
.\diagnostico_rapido.ps1

# 2. Se der erro, reinicie
.\start.ps1

# 3. Aguarde 5 segundos e execute novamente
Start-Sleep -Seconds 5
.\diagnostico_rapido.ps1

# 4. Me envie os resultados!
```

---

**Execute o diagnóstico e me envie os resultados!** 🚀

