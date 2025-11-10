# ✅ Correção - Escrita e Atraso na Leitura

## 🐛 Problemas Reportados

1. ❌ **Velocidade real com atraso de ~10 segundos**
2. ❌ **Erro ao escrever velocidade programada:** "Falha ao escrever tags no PLC"

---

## 🔧 Correções Aplicadas

### 1. Logs Detalhados na Escrita (Node.js)

**Arquivos modificados:**
- `src/plc/plcManager.js` - Logs detalhados de escrita
- `src/plc/plcPolling.js` - Validação de tradução de tags

**O que foi adicionado:**
- ✅ Verificação se tradução está configurada
- ✅ Log de cada tag antes de escrever
- ✅ Log da tradução (nome → endereço)
- ✅ Log detalhado de erros

**Logs esperados na escrita:**
```
[PlcManager] 📝 Tentando escrever 1 tags: ['XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG']
[PlcManager] 📝 Valores: { XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG: 150.0 }
[PlcManager] 📍 Tag "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG" → "DB1,REAL48"
[PlcManager] ✅ Conectado, iniciando escrita...
[PlcManager] Adicionando items para escrita: ['XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG']
[PlcManager] Chamando writeItems...
[PlcManager] ✅ Escrita bem-sucedida!
```

---

## 🧪 Como Testar Agora

### Passo 1: Reiniciar Sistema

```powershell
# Se estiver rodando, pare com Ctrl+C
# Depois reinicie
.\start.ps1
```

### Passo 2: Verificar Logs de Inicialização (Terminal Node.js)

Procure por:
```
[Polling] buildGroupedByDb: X tags válidas, Y ignoradas
[Polling] buildGroupedByDb: N DBs agrupadas
[PlcPolling] ✅ Manager configurado com tradução de X tags
```

Se NÃO aparecer a última linha, o manager não está configurado!

### Passo 3: Testar Escrita

1. **Acesse:** http://127.0.0.1:5000

2. **Vá para a tela de velocidades**

3. **Digite um novo valor** (ex: 150) e pressione Enter

4. **Verifique terminal Node.js:**

   **Se aparecer isto - TAG NÃO ENCONTRADA:**
   ```
   [PlcPolling] ⚠️ Tag "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG" não encontrada no comm_map
   [PlcManager] ❌ Tag "..." não pode ser traduzida para endereço
   ```
   
   **Solução:** A tag não está no comm_map! Veja "Problema 1" abaixo.

   **Se aparecer isto - SUCESSO:**
   ```
   [PlcManager] 📝 Tentando escrever 1 tags: [...]
   [PlcManager] 📍 Tag "..." → "DB1,REAL48"
   [PlcManager] ✅ Escrita bem-sucedida!
   ```
   
   **Ótimo!** A escrita funcionou!

---

## 🔍 Diagnóstico de Problemas

### Problema 1: Tag não encontrada no comm_map

**Sintoma:**
```
[PlcPolling] ⚠️ Tag "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG" não encontrada no comm_map
```

**Causa:** A tag que você está tentando escrever não existe no arquivo `comm_map`.

**Solução:**

1. **Descubra qual comm_map está sendo usado:**
   ```powershell
   curl http://127.0.0.1:8081/api/stats
   ```
   
   Procure por: `"COMM_MAP_PATH": "config/comm_map/700CX.json"`

2. **Verifique se a tag existe:**
   ```powershell
   $machine = "700CX"  # ajuste para sua máquina
   Get-Content "config\comm_map\$machine.json" | Select-String "VELOC_PROG"
   ```

3. **Se NÃO encontrar a tag:**
   - A tag pode ter outro nome
   - Veja os logs do frontend para descobrir o nome correto da tag
   - Abra o comm_map e procure por tags relacionadas a velocidade

4. **Veja qual tag o frontend está tentando usar:**
   - Abra `static/scripts/partials/grid.js`
   - Procure por: `SPEED_TAG_PROGRAMMED`
   - Linha ~25: `const SPEED_TAG_PROGRAMMED = 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG';`

5. **Verifique se essa tag existe no comm_map:**
   ```powershell
   Get-Content "config\comm_map\700CX.json" | Select-String "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG"
   ```

6. **Se a tag não existir, você precisa:**
   - Adicionar a tag no comm_map, OU
   - Mudar o nome da tag no `grid.js` para corresponder ao que existe no comm_map

---

### Problema 2: Atraso de 10 segundos na velocidade real

**Causa Provável:** Intervalo de polling do frontend está em 5000ms (5 segundos)

**Onde está:** `static/scripts/partials/grid.js` linha ~1269

**Valor atual:**
```javascript
let adaptiveInterval = 5000; // Intervalo adaptativo base
```

**Para reduzir o atraso:**

1. **Abra:** `static/scripts/partials/grid.js`

2. **Procure linha ~1269:**
   ```javascript
   let adaptiveInterval = 5000;
   ```

3. **Mude para 1000ms (1 segundo):**
   ```javascript
   let adaptiveInterval = 1000; // Intervalo de 1 segundo
   ```

4. **Salve e recarregue a página**

**OU use apenas Socket.IO** (mais rápido, sem polling HTTP):

O sistema já tem Socket.IO configurado! O atraso pode ser porque:
- Socket.IO não está conectando
- Está caindo para o fallback HTTP

Verifique no console do navegador (F12):
```
[GRID] ✅ Socket.IO conectado
[GRID][telemetry] real= 123.45
```

Se NÃO ver essas mensagens, o Socket.IO não está funcionando.

---

## 📊 Fluxo Completo de Escrita

### Quando você clica para escrever:

```
1. Frontend (grid.js)
   ↓ POST /api/write_tags
   
2. Flask (machines_controller.py)
   ↓ plc_controller.write_tags()
   
3. StandalonePLCController
   ↓ driver.write_tags()
   
4. Nodes7Driver (Python)
   ↓ proxy.write_tags()
   
5. NodeS7Proxy
   ↓ POST http://127.0.0.1:8081/api/write
   
6. Servidor Node.js (server.js)
   ↓ manager.writeChunk()
   
7. PlcManager
   ↓ Traduz tag nome → endereço
   ↓ connection.writeItems()
   
8. nodes7 library
   ↓ Protocolo S7
   
9. PLC Siemens
```

**Cada etapa agora tem logs detalhados!**

---

## 🧪 Teste Completo

### Terminal 1 - Inicie o sistema:
```powershell
.\start.ps1
```

### Terminal 2 - Monitore o Node.js:
```powershell
# Os logs do Node.js aparecem junto com o Flask
# Procure por linhas que começam com [PlcManager] ou [PlcPolling]
```

### Terminal 3 - Teste manual a escrita:
```powershell
$body = @{
    "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG" = 150.0
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/write_tags" `
    -Method POST -Body $body -ContentType "application/json"
```

**Veja os logs em tempo real nos terminais!**

---

## ✅ Checklist de Validação

- [ ] Servidor Node.js iniciou
- [ ] Logs mostram: `[PlcPolling] ✅ Manager configurado com tradução de X tags`
- [ ] X > 0 (tem tags no comm_map)
- [ ] Tentou escrever via interface
- [ ] Logs mostram: `[PlcManager] 📝 Tentando escrever...`
- [ ] Logs mostram a tradução da tag: `[PlcManager] 📍 Tag "..." → "..."`
- [ ] Logs mostram: `[PlcManager] ✅ Escrita bem-sucedida!`
- [ ] Valor mudou no PLC

---

## 🔧 Correção Rápida se Tag não Existe

Se a tag `XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG` não existe no seu comm_map:

1. **Descubra qual tag usar:**
   ```powershell
   # Liste todas as tags de velocidade no comm_map
   Get-Content "config\comm_map\700CX.json" | Select-String -Pattern "veloc|speed" -CaseInsensitive
   ```

2. **Edite grid.js:**
   - Abra: `static/scripts/partials/grid.js`
   - Linha ~25-26, mude para o nome correto:
     ```javascript
     const SPEED_TAG_PRIMARY = 'NOME_CORRETO_VELOCIDADE_REAL';
     const SPEED_TAG_PROGRAMMED = 'NOME_CORRETO_VELOCIDADE_PROG';
     ```

3. **Recarregue a página** (Ctrl+F5)

---

## 📝 Próximos Passos

1. **Reinicie o sistema:** `.\start.ps1`

2. **Veja os logs detalhados** no terminal

3. **Tente escrever** a velocidade programada

4. **Se der erro de "tag não encontrada":**
   - Veja qual comm_map está sendo usado
   - Verifique se a tag existe
   - Ajuste o nome da tag no código se necessário

5. **Me avise dos logs que aparecerem!**

---

## 🎯 O que Vai Aparecer nos Logs

### Inicialização:
```
[Polling] buildGroupedByDb: 156 tags válidas, 12 ignoradas
[Polling] buildGroupedByDb: 5 DBs agrupadas
[PlcPolling] ✅ Manager configurado com tradução de 156 tags
[BOOT] NodeS7 iniciando...
[PLC] conectado
[Polling] ciclo=45ms avg=45.2ms updates=12 blocks=5
```

### Escrita (sucesso):
```
[Nodes7] 📝 Escrevendo 1 tags: ['XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG']
[Nodes7] 📝 Valores: {'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG': 150.0}
[PlcManager] 📝 Tentando escrever 1 tags: ['XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG']
[PlcManager] 📍 Tag "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG" → "DB1,REAL48"
[PlcManager] ✅ Conectado, iniciando escrita...
[PlcManager] Adicionando items para escrita...
[PlcManager] Chamando writeItems...
[PlcManager] ✅ Escrita bem-sucedida!
[Nodes7] ✅ Escrita bem-sucedida!
```

### Escrita (erro - tag não existe):
```
[PlcPolling] ⚠️ Tag "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG" não encontrada no comm_map
[PlcManager] ❌ Tag "XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG" não pode ser traduzida para endereço
[Nodes7] ❌ Erro ao escrever tags
```

---

**Reinicie e teste! Me envie os logs que aparecerem.** 🚀

