# 🔧 Solução: Servidor Node.js Não Está Respondendo

## 🚨 Problema Identificado

O servidor Node.js **não está ouvindo na porta 8081**!

**Diagnóstico:**
- ✅ Processos Node.js estão rodando (PIDs: 5220, 13024)
- ❌ Porta 8081 não está em LISTENING
- ❌ Muitas conexões em SYN_SENT (tentando conectar mas não consegue)
- ❌ Flask não consegue conectar ao Node.js

## 🔧 Solução Imediata

### 1. Pare os processos Node.js travados:

```powershell
# Para todos os processos Node.js
Get-Process node | Stop-Process -Force

# Aguarda 2 segundos
Start-Sleep -Seconds 2

# Verifica se parou
Get-Process node -ErrorAction SilentlyContinue
```

### 2. Limpe conexões antigas:

```powershell
# Se ainda houver conexões travadas, aguarde mais
Start-Sleep -Seconds 3
```

### 3. Inicie o sistema novamente:

```powershell
.\start.ps1
```

### 4. Aguarde 10 segundos e teste:

```powershell
.\teste_terminal.ps1
```

## 🔍 Verificação

Após reiniciar, verifique se a porta está ouvindo:

```powershell
netstat -ano | findstr :8081 | findstr LISTENING
```

**Deve aparecer algo como:**
```
TCP    0.0.0.0:8081           0.0.0.0:0              LISTENING       12345
```

## 🐛 Possíveis Causas

1. **Servidor Node.js travou** durante inicialização
2. **Erro no código** que impediu o servidor de iniciar
3. **Porta em uso** por outro processo
4. **Erro de conexão com PLC** que travou o servidor

## 📝 Logs Importantes

Ao reiniciar, veja os logs do Node.js e procure por:

### ✅ Logs Bons:
```
[BOOT] NodeS7 iniciando...
[Polling] Carregando comm_map...
[PLC] conectado
[HTTP+WS] Servidor ouvindo em :8081
```

### ❌ Logs Ruins:
```
Error: listen EADDRINUSE :::8081
Error: Cannot connect to PLC
```

## 🚀 Se Ainda Não Funcionar

1. **Verifique se há erros no código Node.js:**
   ```powershell
   node src/server.js
   ```
   Veja os erros que aparecem

2. **Teste se o servidor inicia isoladamente:**
   ```powershell
   $env:MACHINE = "700CX"
   $env:PLC_IP = "100.70.0.10"
   node src/server.js
   ```

3. **Verifique se a porta está livre:**
   ```powershell
   netstat -ano | findstr :8081
   ```
   Se aparecer LISTENING com outro PID, mate aquele processo

## ✅ Checklist de Recuperação

- [ ] Parei todos os processos Node.js
- [ ] Aguardei 5 segundos
- [ ] Verifiquei que não há mais processos Node.js
- [ ] Iniciei com `.\start.ps1`
- [ ] Aguardei 10 segundos
- [ ] Executei `.\teste_terminal.ps1`
- [ ] Health check retornou OK
- [ ] Stats mostra ciclos aumentando

## 🎯 Próximos Passos

1. **Execute os comandos acima** para reiniciar corretamente
2. **Veja os logs** do Node.js ao iniciar
3. **Me envie os logs** se ainda houver problemas

---

**O problema é que o servidor Node.js não está rodando corretamente!** 🚨

