# 🎯 Guia Rápido - Configurar para 700CX

## ✅ Problema Resolvido

O DataHub agora está configurado para:
1. ✅ **Priorizar o 700CX** (testado primeiro)
2. ✅ **Testar conexão Snap7 real** (não apenas ping)
3. ✅ **Opção de forçar IP específico**

---

## 🔧 Mudanças Aplicadas

### 1. Ordem de Prioridade Alterada

**Antes:**
```python
PLC_CONFIGS = [
    {"name": "200CX", "ip": "100.20.0.10", ...},
    {"name": "400CX", "ip": "100.40.0.10", ...},  # Era testado antes
    {"name": "700CX", "ip": "100.70.0.10", ...},
]
```

**Agora:**
```python
PLC_CONFIGS = [
    {"name": "700CX", "ip": "100.70.0.10", ...},  # ✅ Prioridade 1
    {"name": "400CX", "ip": "100.40.0.10", ...},
    {"name": "200CX", "ip": "100.20.0.10", ...},
]
```

### 2. Detecção Melhorada

**Antes:** Testava apenas ping (que pode funcionar mas Snap7 não)

**Agora:** Testa ping E conexão Snap7 real:
```
🔍 Procurando PLC ativo...
   Testando 700CX (100.70.0.10)...
      ✓ Ping OK
      Testando conexão Snap7...
✅ PLC encontrado e acessível: 700CX (100.70.0.10)
```

### 3. Opção de Forçar IP

Adicionada configuração para forçar um IP específico:

```python
# No início de datahub.py
FORCE_PLC_IP = None  # Auto-detecção (padrão)
# ou
FORCE_PLC_IP = "100.70.0.10"  # Força usar apenas 700CX
```

---

## 🚀 Como Usar

### Opção 1: Auto-Detecção (Recomendado)

Simplesmente **reinicie o DataHub**:

```bash
# Pare o DataHub atual (Ctrl+C)
# Inicie novamente
python datahub.py
```

Agora ele testará o **700CX primeiro** e só tentará outros se falhar.

### Opção 2: Forçar 700CX (Mais Rápido)

Se você quer **APENAS o 700CX**, edite `datahub.py`:

```python
# Linha 61 - mude de:
FORCE_PLC_IP = None

# Para:
FORCE_PLC_IP = "100.70.0.10"
```

Depois reinicie:

```bash
python datahub.py
```

Verá:
```
🎯 Forçando conexão com IP: 100.70.0.10
   Usando 700CX (100.70.0.10)...
✅ Conectado à máquina 700CX (100.70.0.10)
```

---

## 🔍 Diagnóstico do Problema Anterior

Pelo log que você mostrou:

```
Testando 400CX (100.40.0.10)...
✅ PLC encontrado: 400CX (100.40.0.10)
connecting to 100.40.0.10:102 rack 0 slot 1
❌ Erro ao conectar: b' TCP : Connection timed out'
```

**Causa identificada:**
- ✅ O **ping funcionava** no 400CX
- ❌ Mas a **porta 102 (Snap7)** estava **bloqueada ou inacessível**
- ❌ O sistema ficava preso tentando conectar (21s de timeout)

**Solução aplicada:**
- ✅ Agora testa **conexão Snap7 antes** de marcar como "encontrado"
- ✅ Se ping OK mas Snap7 falha, **pula para próximo PLC**
- ✅ Logs mais claros: mostra se é problema de ping ou Snap7

---

## 📊 Novo Fluxo de Detecção

```
┌─────────────────────────────────────────┐
│  Início da Detecção                     │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│  Teste 1: 700CX (100.70.0.10)           │
│    ├─ Ping? ────────→ OK                │
│    └─ Snap7? ───────→ OK ✓              │
│  ✅ CONECTADO!                          │
└─────────────────────────────────────────┘
```

**Se 700CX falhar:**

```
┌─────────────────────────────────────────┐
│  Teste 1: 700CX (100.70.0.10)           │
│    ├─ Ping? ────────→ FALHOU            │
│  ⚠️  Próximo...                         │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│  Teste 2: 400CX (100.40.0.10)           │
│    ├─ Ping? ────────→ OK                │
│    └─ Snap7? ───────→ TIMEOUT           │
│  ⚠️  Próximo...                         │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│  Teste 3: 200CX (100.20.0.10)           │
│    ├─ Ping? ────────→ OK                │
│    └─ Snap7? ───────→ OK ✓              │
│  ✅ CONECTADO!                          │
└─────────────────────────────────────────┘
```

---

## 🧪 Verificar se Funcionou

Após reiniciar o DataHub, você deve ver:

```
🔍 Procurando PLC ativo...
   Testando 700CX (100.70.0.10)...
      ✓ Ping OK
      Testando conexão Snap7...
✅ PLC encontrado e acessível: 700CX (100.70.0.10)
✅ Conectado à máquina 700CX (100.70.0.10)
📡 Iniciando leitura cíclica (intervalo: 0.2s)
```

Se aparecer isso, **problema resolvido!** ✅

---

## ❓ E Se Ainda Não Funcionar?

### Cenário 1: 700CX não responde ao ping

```
Testando 700CX (100.70.0.10)...
   ❌ Ping falhou
```

**Possíveis causas:**
- PLC desligado
- IP incorreto
- Problema de rede/roteamento

**Solução:**
```bash
# Teste manualmente
ping 100.70.0.10

# Se não responder, verifique:
# - PLC está ligado?
# - IP está correto?
# - Está na mesma rede?
```

### Cenário 2: Ping OK mas Snap7 falha

```
Testando 700CX (100.70.0.10)...
   ✓ Ping OK
   Testando conexão Snap7...
   ⚠️  Ping OK mas Snap7 falhou (porta 102 bloqueada?)
```

**Possíveis causas:**
- Firewall bloqueando porta 102
- PLC não permite conexões GET/PUT
- Rack/Slot incorretos
- PLC em modo STOP

**Solução:**
1. Verifique firewall:
   ```bash
   # Windows PowerShell (como admin)
   New-NetFirewallRule -DisplayName "S7 PLC" -Direction Outbound -LocalPort 102 -Protocol TCP -Action Allow
   ```

2. Verifique configuração do PLC (via TIA Portal):
   - Proteção: GET/PUT habilitado
   - Modo: RUN
   - Comunicação: Permitir acesso via ethernet

3. Teste rack/slot diferentes:
   ```python
   # Em datahub.py, tente:
   {"name": "700CX", "ip": "100.70.0.10", "rack": 0, "slot": 2},  # slot 2
   ```

---

## 🛠️ Configurações Personalizadas

### Usar Apenas 700CX (Ignorar Outros)

```python
# datahub.py - linha 61
FORCE_PLC_IP = "100.70.0.10"
```

### Mudar Rack/Slot do 700CX

```python
# datahub.py - linha 41
{"name": "700CX", "ip": "100.70.0.10", "rack": 0, "slot": 1},
#                                       ↑          ↑
#                                   geralmente 0  geralmente 1 ou 2
```

### Desabilitar Outros PLCs

```python
# datahub.py - linhas 40-44
PLC_CONFIGS = [
    {"name": "700CX", "ip": "100.70.0.10", "rack": 0, "slot": 1},
    # {"name": "400CX", "ip": "100.40.0.10", "rack": 0, "slot": 1},  # Desabilitado
    # {"name": "200CX", "ip": "100.20.0.10", "rack": 0, "slot": 1},  # Desabilitado
]
```

---

## 📋 Checklist Rápido

- [ ] Pare o DataHub atual (Ctrl+C)
- [ ] Reinicie: `python datahub.py`
- [ ] Verifique os logs: deve conectar em 700CX
- [ ] Teste a API: `http://localhost:8000/api/status`
- [ ] Confirme que `machine_name` é "700CX"

---

## 💡 Logs Detalhados

Para ver mais detalhes no log, edite `datahub.py`:

```python
# Linha 64 - mude de:
logging.basicConfig(level=logging.INFO, ...)

# Para:
logging.basicConfig(level=logging.DEBUG, ...)
```

Isso mostrará tentativas de conexão Snap7 detalhadas.

---

## ✅ Resumo

| Configuração | Antes | Depois |
|--------------|-------|--------|
| Prioridade 700CX | 3° (último) | 1° (primeiro) ✅ |
| Detecção | Apenas ping | Ping + Snap7 ✅ |
| Opção forçar IP | Não existia | Sim ✅ |
| Logs | Básicos | Detalhados ✅ |
| Timeout no 400CX | 21s esperando | Pula rápido ✅ |

---

**Reinicie o DataHub agora e ele deve conectar ao 700CX!** 🎉

