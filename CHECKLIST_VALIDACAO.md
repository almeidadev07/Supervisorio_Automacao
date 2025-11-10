# ✅ Checklist de Validação - Migração Nodes7

Use este checklist para validar que a migração foi bem-sucedida.

---

## 📋 Pré-requisitos

- [ ] Node.js instalado (`node --version`)
- [ ] Python instalado (`python --version`)
- [ ] npm instalado (`npm --version`)
- [ ] Rede configurada (acesso ao PLC)

---

## 🔧 Instalação

- [ ] Dependências Node.js instaladas (`npm install`)
- [ ] Dependências Python instaladas (Flask, Flask-SocketIO)
- [ ] Arquivos de configuração existem:
  - [ ] `config/comm_map/200CX.json`
  - [ ] `config/comm_map/400CX.json`
  - [ ] `config/comm_map/700CX.json`
  - [ ] `app/data/machines_config.json`

---

## 📁 Arquivos Criados

- [ ] `app/plc_drivers/nodes7.py` existe
- [ ] `start_nodes7_server.ps1` existe
- [ ] `start_supervisorio_with_nodes7.ps1` existe
- [ ] `test_nodes7_connection.py` existe
- [ ] Documentação criada:
  - [ ] `INICIO_RAPIDO_NODES7.md`
  - [ ] `MIGRACAO_NODES7.md`
  - [ ] `COMANDOS_UTEIS.md`
  - [ ] `EXEMPLO_USO.md`
  - [ ] `RESUMO_MIGRACAO.md`
  - [ ] `README_NODES7.md`

---

## 🔧 Configuração

- [ ] `app/plc_drivers/__init__.py` registra driver nodes7
- [ ] `app/data/machines_config.json` tem `plc_type: "nodes7"`
- [ ] Todas as máquinas têm `rack` e `slot` definidos
- [ ] Servidor Node.js tem acesso aos comm_maps

---

## 🧪 Testes Básicos

### 1. Health Check
```powershell
curl http://127.0.0.1:8081/health
```
- [ ] Retorna `{"ok": true}`

### 2. Estatísticas
```powershell
curl http://127.0.0.1:8081/api/stats
```
- [ ] Retorna estatísticas válidas
- [ ] Mostra IP do PLC correto
- [ ] Mostra comm_map carregado

### 3. Tags Monitoradas
```powershell
curl http://127.0.0.1:8081/api/items
```
- [ ] Retorna lista de tags
- [ ] Count > 0
- [ ] Tags reconhecíveis

### 4. Snapshot
```powershell
curl http://127.0.0.1:8081/api/snapshot
```
- [ ] Retorna valores
- [ ] Valores não são todos None
- [ ] Pelo menos 50% dos valores são válidos

---

## 🧪 Teste Automatizado

```powershell
python test_nodes7_connection.py
```

- [ ] Teste 1: Health Check - **PASSOU**
- [ ] Teste 2: Estatísticas - **PASSOU**
- [ ] Teste 3: Tags Monitoradas - **PASSOU**
- [ ] Teste 4: Snapshot - **PASSOU**
- [ ] Teste 5: Driver Python - **PASSOU**

**Total:** [ ] 5/5 testes passaram (100%)

---

## 🚀 Teste de Inicialização

### Servidor Node.js

```powershell
.\start_nodes7_server.ps1
```

- [ ] Inicia sem erros
- [ ] Mostra: `[BOOT] NodeS7 iniciando...`
- [ ] Mostra: `[PLC] conectado` (após alguns segundos)
- [ ] Mostra: `[HTTP+WS] Servidor ouvindo em :8081`
- [ ] Mostra ciclos de polling: `[Polling] ciclo=XXms`

### Aplicação Flask

Em outro terminal:
```powershell
python app.py
```

- [ ] Inicia sem erros
- [ ] Mostra: `[DRIVER] Criando Nodes7Driver`
- [ ] Mostra: `[Nodes7] Driver criado`
- [ ] Mostra: `[Nodes7] ✅ Servidor Node.js acessível`
- [ ] Mostra: `[STANDALONE_PLC] 🚀 Controlador PLC standalone inicializado`
- [ ] Flask responde em http://127.0.0.1:5000

### Script Integrado

```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

- [ ] Verifica Node.js e Python
- [ ] Instala dependências se necessário
- [ ] Inicia servidor Node.js em background
- [ ] Aguarda servidor estar pronto
- [ ] Testa health check
- [ ] Inicia aplicação Flask
- [ ] Ambos os servidores funcionando

---

## 🔌 Teste de Conectividade

### Rede
```powershell
Test-NetConnection -ComputerName 100.70.0.10 -Port 102
```
- [ ] TcpTestSucceeded: True

### PLC
- [ ] Servidor Node.js reporta: `[PLC] conectado`
- [ ] Sem mensagens de erro: `[PLC] desconectado`
- [ ] Sem mensagens de erro: `[PLC] erro de conexão`

---

## 📊 Teste de Leitura

### Leitura Individual
```powershell
curl "http://127.0.0.1:8081/api/read?tags=VELOCIDADE_E1"
```
- [ ] Retorna valor válido (não None)
- [ ] Valor é numérico ou booleano conforme esperado

### Leitura Múltipla
```powershell
curl "http://127.0.0.1:8081/api/read?tags=VELOCIDADE_E1,VELOCIDADE_E2,VELOCIDADE_E3"
```
- [ ] Retorna múltiplos valores
- [ ] Todos os valores pedidos presentes
- [ ] Valores válidos

---

## ✏️ Teste de Escrita

```powershell
$body = @{
    values = @{
        "TESTE_TAG" = 100.0
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8081/api/write" -Method POST -Body $body -ContentType "application/json"
```

- [ ] Retorna `{"ok": true}`
- [ ] Sem erros no log
- [ ] Valor foi escrito no PLC (verificar com leitura)

---

## 🌐 Teste de Interface Web

Acesse: http://127.0.0.1:5000

- [ ] Página carrega sem erros
- [ ] Valores aparecem na interface
- [ ] Valores atualizam em tempo real
- [ ] Gráficos funcionam
- [ ] Controles de escrita funcionam (se aplicável)
- [ ] Sem erros no console do navegador (F12)

---

## 📈 Teste de Performance

### Polling
- [ ] Ciclos regulares (logs mostram ciclo a cada ~200ms)
- [ ] Tempo médio < 100ms
- [ ] Updates por ciclo > 0
- [ ] Sem timeouts

### Latência
```powershell
Measure-Command { curl http://127.0.0.1:8081/api/snapshot }
```
- [ ] TotalMilliseconds < 500ms

### CPU/Memória
```powershell
# Node.js
Get-Process node | Select-Object CPU,WorkingSet

# Python
Get-Process python | Select-Object CPU,WorkingSet
```
- [ ] CPU < 50% (em polling normal)
- [ ] Memória estável (não cresce continuamente)

---

## 🔄 Teste de Reconexão

### Simular perda de conexão
1. Desconecte PLC da rede (ou desligue)
2. Aguarde logs: `[PLC] desconectado`
3. Reconecte PLC
4. Aguarde logs: `[PLC] conectado`

- [ ] Sistema detecta desconexão
- [ ] Sistema tenta reconectar automaticamente
- [ ] Sistema reconecta com sucesso
- [ ] Valores voltam a aparecer

---

## 🛡️ Teste de Estabilidade

### Teste de 1 hora
```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
# Deixe rodando por 1 hora
```

- [ ] Sem crashes
- [ ] Sem memory leaks (memória estável)
- [ ] Polling continua regular
- [ ] Valores continuam atualizando
- [ ] Sem erros acumulados nos logs

---

## 📝 Teste de Documentação

- [ ] `INICIO_RAPIDO_NODES7.md` - instruções claras e funcionam
- [ ] `MIGRACAO_NODES7.md` - informação completa e precisa
- [ ] `COMANDOS_UTEIS.md` - comandos funcionam como descrito
- [ ] `EXEMPLO_USO.md` - exemplo funciona passo a passo
- [ ] `README_NODES7.md` - resumo útil e correto

---

## 🔙 Teste de Rollback

### Reverter para Snap7
1. Edite `app/data/machines_config.json`: `"plc_type": "siemens_s7"`
2. Reinicie: `python app.py`

- [ ] Sistema inicia com Snap7
- [ ] Comunicação funciona
- [ ] Sem erros

### Voltar para Nodes7
1. Edite `app/data/machines_config.json`: `"plc_type": "nodes7"`
2. Reinicie com Nodes7

- [ ] Sistema volta a usar Nodes7
- [ ] Comunicação funciona
- [ ] Sem erros

---

## ✅ Validação Final

### Todos os Testes

- [ ] **Pré-requisitos:** 100% ✅
- [ ] **Instalação:** 100% ✅
- [ ] **Arquivos:** 100% ✅
- [ ] **Configuração:** 100% ✅
- [ ] **Testes Básicos:** 100% ✅
- [ ] **Teste Automatizado:** 5/5 (100%) ✅
- [ ] **Inicialização:** 100% ✅
- [ ] **Conectividade:** 100% ✅
- [ ] **Leitura:** 100% ✅
- [ ] **Escrita:** 100% ✅
- [ ] **Interface Web:** 100% ✅
- [ ] **Performance:** 100% ✅
- [ ] **Reconexão:** 100% ✅
- [ ] **Estabilidade:** 100% ✅
- [ ] **Documentação:** 100% ✅
- [ ] **Rollback:** 100% ✅

---

## 🎉 Aprovação Final

### Critérios Mínimos
- [x] Todos os testes automatizados passam
- [ ] Comunicação com PLC funciona
- [ ] Leitura e escrita funcionam
- [ ] Interface web funciona
- [ ] Sistema estável por pelo menos 1 hora
- [ ] Documentação completa e precisa

### Assinatura

**Data:** _______________

**Testado por:** _______________

**Resultado:** [ ] ✅ APROVADO  [ ] ❌ REPROVADO

**Observações:**
```
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
```

---

## 📞 Suporte

Em caso de problemas:

1. Consulte [COMANDOS_UTEIS.md](COMANDOS_UTEIS.md)
2. Execute `python test_nodes7_connection.py`
3. Verifique logs do Node.js e Flask
4. Teste conectividade com PLC

---

**Migração concluída com sucesso! 🚀**

