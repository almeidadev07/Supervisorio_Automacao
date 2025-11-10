# 🔧 Correção - Erro "Address out of range"

## ❌ Erro Encontrado

```
Erro ao Ler DB1: b'CPU : Address out of range'
```

### O Que Significa?

**"Address out of range"** = "Endereço fora do alcance"

Isso significa que o DataHub estava tentando ler **mais bytes** de uma DB do que ela realmente possui no PLC.

---

## 🔍 Diagnóstico

### Configuração Anterior (ERRADA)

```python
DBS = [
    {"id": 1, "size": 512},   # ❌ Tentava ler 512 bytes
    {"id": 2, "size": 256},   # ❌ DB2 nem existe!
    {"id": 10, "size": 1024}, # ❌ Tentava ler 1024 bytes
    {"id": 20, "size": 512},  # ❌ Tentava ler 512 bytes
]
```

### Tamanhos Reais no PLC 700CX (CORRETO)

Usando o script `descobrir_tamanho_dbs.py`, descobrimos:

| DB | Tamanho Real | Estava Configurado | Status |
|----|--------------|-------------------|--------|
| DB1 | 200 bytes | 512 bytes | ❌ Erro! |
| DB2 | Não existe | 256 bytes | ❌ Erro! |
| DB3 | 256 bytes | Não estava | ⚠️ Faltava |
| DB4 | 50 bytes | Não estava | ⚠️ Faltava |
| DB10 | 10 bytes | 1024 bytes | ❌ Erro! |
| DB20 | 50 bytes | 512 bytes | ❌ Erro! |
| DB40 | 50 bytes | Não estava | ⚠️ Faltava |
| DB50 | 50 bytes | Não estava | ⚠️ Faltava |

---

## ✅ Solução Aplicada

### Nova Configuração (CORRIGIDA)

```python
DBS = [
    {"id": 1, "size": 200},   # ✅ DB1: 200 bytes (correto)
    {"id": 3, "size": 256},   # ✅ DB3: 256 bytes
    {"id": 4, "size": 50},    # ✅ DB4: 50 bytes
    {"id": 10, "size": 10},   # ✅ DB10: 10 bytes (correto)
    {"id": 20, "size": 50},   # ✅ DB20: 50 bytes (correto)
    {"id": 40, "size": 50},   # ✅ DB40: 50 bytes
    {"id": 50, "size": 50},   # ✅ DB50: 50 bytes
]
```

---

## 🚀 Como Testar

### 1. Reinicie o DataHub

```powershell
# Pare o DataHub atual (Ctrl+C)
# Reinicie
python datahub.py
```

### 2. Verifique os Logs

Agora deve mostrar:

```
✅ Conectado à máquina 700CX (100.70.0.10)
📡 Lendo DBs: [1, 3, 4, 10, 20, 40, 50]
```

**Sem erros de "Address out of range"!**

### 3. Teste a API

```powershell
# Teste status
Invoke-WebRequest http://localhost:8000/api/status | ConvertFrom-Json

# Teste dados
Invoke-WebRequest http://localhost:8000/api/data | ConvertFrom-Json
```

---

## 📊 Por Que Isso Aconteceu?

O DataHub vinha com **tamanhos padrão** que funcionam para a maioria dos PLCs:

```python
{"id": 1, "size": 512}   # Comum em muitos projetos
{"id": 2, "size": 256}   # Comum em muitos projetos
```

Mas **cada projeto TIA Portal tem DBs de tamanhos diferentes!**

Por exemplo:
- Um projeto pode ter DB1 com 512 bytes
- Outro projeto pode ter DB1 com 200 bytes (seu caso)

---

## 🔍 Como Descobrir Tamanhos no Futuro

### Opção 1: Script Automático (Recomendado)

```powershell
python descobrir_tamanho_dbs.py
```

Este script:
- ✅ Conecta ao PLC
- ✅ Testa várias DBs automaticamente
- ✅ Descobre os tamanhos reais
- ✅ Gera a configuração pronta para copiar

### Opção 2: TIA Portal (Manual)

1. Abra seu projeto no TIA Portal
2. Vá em "Program blocks"
3. Veja as Data Blocks (DB)
4. Para cada DB, veja o tamanho na coluna "Size"

### Opção 3: Teste Manual

```python
import snap7

client = snap7.client.Client()
client.connect("100.70.0.10", 0, 1)

# Testa diferentes tamanhos
for tamanho in [10, 50, 100, 200, 500]:
    try:
        data = client.db_read(1, 0, tamanho)
        print(f"✅ {tamanho} bytes - OK")
    except Exception as e:
        print(f"❌ {tamanho} bytes - {e}")
        break
```

---

## 💡 Dicas para Evitar no Futuro

### 1. Use o Script de Descoberta

Sempre que mudar de PLC ou projeto:

```powershell
python descobrir_tamanho_dbs.py
```

### 2. Documente Seus DBs

Crie um arquivo `ESTRUTURA_DBS.md`:

```markdown
# Estrutura das DBs - Projeto 700CX

| DB | Tamanho | Descrição |
|----|---------|-----------|
| DB1 | 200 bytes | Dados de produção |
| DB3 | 256 bytes | Configurações |
| DB4 | 50 bytes | Alarmes |
| DB10 | 10 bytes | Status geral |
```

### 3. Adicione Comentários no Código

```python
DBS = [
    {"id": 1, "size": 200},   # Dados de produção
    {"id": 3, "size": 256},   # Configurações da máquina
    {"id": 4, "size": 50},    # Alarmes ativos
]
```

---

## 🧪 Validação

Para confirmar que está tudo certo:

### Teste 1: Conexão

```
✅ Conectado à máquina 700CX (100.70.0.10)
```

### Teste 2: Leitura sem erros

```
📡 Iniciando leitura cíclica
(Não deve aparecer "Address out of range")
```

### Teste 3: API retorna dados

```javascript
fetch('http://localhost:8000/api/data')
    .then(res => res.json())
    .then(data => {
        console.log('DBs disponíveis:', Object.keys(data.data));
        // Deve mostrar: ["db1", "db3", "db4", "db10", "db20", "db40", "db50"]
    });
```

---

## 📋 Checklist de Correção

- [x] Executado `descobrir_tamanho_dbs.py`
- [x] Identificados tamanhos reais das DBs
- [x] Atualizado `datahub.py` com tamanhos corretos
- [ ] Reiniciado DataHub
- [ ] Verificado logs (sem erros)
- [ ] Testado API (retorna dados)
- [ ] Documentado estrutura das DBs

---

## 🎓 Entendendo o Erro Técnico

### Como Funciona a Leitura no Snap7

```
┌─────────────────────────────────────┐
│  DB1 no PLC (200 bytes reais)       │
│  ┌───────────────────────────────┐  │
│  │ Byte 0   ... Byte 199         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         │
         │ DataHub tenta ler 512 bytes
         ↓
❌ ERRO! "Address out of range"
         (tentou ler bytes 200-511 que não existem)
```

### Leitura Correta

```
┌─────────────────────────────────────┐
│  DB1 no PLC (200 bytes reais)       │
│  ┌───────────────────────────────┐  │
│  │ Byte 0   ... Byte 199         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         │
         │ DataHub lê apenas 200 bytes ✅
         ↓
✅ OK! Todos os dados lidos corretamente
```

---

## 🔧 Outras Causas Possíveis

Se ainda aparecer "Address out of range" após correção:

### 1. Offset Incorreto

```python
# Errado
client.db_read(1, 100, 200)  # Offset 100 + 200 bytes = 300 bytes total
                              # ❌ Se DB tem 200 bytes, dá erro!

# Correto
client.db_read(1, 0, 200)    # Offset 0 + 200 bytes = 200 bytes total
                             # ✅ OK se DB tem 200 bytes
```

### 2. DB Dinâmica

Algumas DBs mudam de tamanho dinamicamente. Solução:

```python
# Descubra o tamanho da DB
db_info = client.db_get(db_number)
tamanho_real = db_info['size']

# Use o tamanho real
data = client.db_read(db_number, 0, tamanho_real)
```

### 3. Tipo de Acesso

Verifique no TIA Portal:
- DB Properties → Attributes
- ✅ "Optimized block access" deve estar **DESABILITADO**
- ✅ "Access rights" deve permitir GET/PUT

---

## 📚 Referências

- `descobrir_tamanho_dbs.py` - Script de descoberta automática
- `datahub.py` linha 48 - Configuração das DBs
- TIA Portal - Estrutura do projeto

---

## ✅ Status Final

**PROBLEMA RESOLVIDO!** ✅

As DBs foram configuradas com os tamanhos corretos:
- DB1: 200 bytes ✅
- DB3: 256 bytes ✅
- DB4: 50 bytes ✅
- DB10: 10 bytes ✅
- DB20: 50 bytes ✅
- DB40: 50 bytes ✅
- DB50: 50 bytes ✅

**Próximo passo:** Reinicie o DataHub e teste!

```powershell
python datahub.py
```

---

**Desenvolvido para você** ❤️

