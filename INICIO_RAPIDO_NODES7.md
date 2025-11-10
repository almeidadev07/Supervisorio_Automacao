# 🚀 Início Rápido - Supervisório com Nodes7

## ⚡ Uso Rápido (1 comando)

```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

**Pronto!** O script inicia tudo automaticamente:
- ✅ Servidor Node.js (Nodes7)
- ✅ Aplicação Flask
- ✅ Gerencia o encerramento correto

Para parar: **Ctrl+C**

---

## 📝 Parâmetros

```powershell
.\start_supervisorio_with_nodes7.ps1 `
    -Machine "700CX" `           # Nome da máquina (200CX, 400CX, 700CX)
    -PlcIp "100.70.0.10" `       # IP do PLC
    -WsPort 8081 `               # Porta WebSocket (padrão: 8081)
    -FlaskPort 5000              # Porta Flask (padrão: 5000)
```

---

## 🔍 Verificar se está funcionando

### 1. Acesse o Supervisório
```
http://127.0.0.1:5000
```

### 2. Verifique o servidor Nodes7
```powershell
curl http://127.0.0.1:8081/health
```

Resposta esperada:
```json
{"ok": true}
```

### 3. Veja as estatísticas
```powershell
curl http://127.0.0.1:8081/api/stats
```

---

## 🛠️ Requisitos

- ✅ Node.js instalado (`node --version`)
- ✅ Python instalado (`python --version`)
- ✅ Dependências instaladas (o script instala automaticamente)

---

## ❓ Problemas?

### Servidor não inicia
```powershell
# Instale as dependências manualmente
npm install
```

### Não conecta ao PLC
```powershell
# Teste a conexão
Test-NetConnection -ComputerName 100.70.0.10 -Port 102
```

### Porta em uso
```powershell
# Mude a porta
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10" -WsPort 8082
```

---

## 📚 Documentação Completa

Para mais detalhes, veja: [MIGRACAO_NODES7.md](MIGRACAO_NODES7.md)

---

## 🔄 Exemplos de Uso

### Máquina 200CX
```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "200CX" -PlcIp "100.20.0.10"
```

### Máquina 400CX
```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "400CX" -PlcIp "100.40.0.10"
```

### Máquina 700CX
```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

---

## 🎯 O que mudou?

| Antes (Snap7) | Agora (Nodes7) |
|---------------|----------------|
| 1 comando: `python app.py` | 1 comando: `.\start_supervisorio_with_nodes7.ps1` |
| DLL nativa necessária | Apenas JavaScript puro |
| Polling pelo Python | Polling pelo Node.js (mais rápido) |
| Reconexão manual | Reconexão automática |

**Vantagens:**
- ⚡ **Mais rápido** - Polling otimizado
- 🔧 **Mais fácil** - Instalação simples
- 🛡️ **Mais estável** - Reconexão automática
- 📊 **Mais completo** - Logs e estatísticas detalhadas

