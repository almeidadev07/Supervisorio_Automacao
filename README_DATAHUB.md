# 🏭 DataHub PLC - Sistema de Comunicação Robusto

<div align="center">

![Status](https://img.shields.io/badge/status-pronto-brightgreen)
![Python](https://img.shields.io/badge/python-3.8+-blue)
![Siemens](https://img.shields.io/badge/PLC-Siemens%20S7-orange)

**Sistema de comunicação inteligente e estável para PLCs Siemens via Snap7**

[Características](#-características) • [Instalação](#-instalação-rápida) • [Uso](#-uso-básico) • [Documentação](#-documentação)

</div>

---

## 🎯 O Que É?

O **DataHub** é uma solução completa para comunicação com PLCs Siemens S7, projetado especificamente para supervisórios web. Substitui implementações instáveis e oferece:

- ✅ **Auto-detecção** de qual PLC está ativo
- ✅ **Conexão única** e persistente (sem conflitos)
- ✅ **Leitura otimizada** por blocos (não tag por tag)
- ✅ **Cache local** sempre atualizado
- ✅ **API REST** para fácil integração
- ✅ **WebSocket** para notificações em tempo real
- ✅ **Reconexão automática** inteligente
- ✅ **Logs claros** e descritivos

---

## 🚀 Instalação Rápida

### Windows (PowerShell)

```powershell
# 1. Baixe os arquivos
# 2. Abra PowerShell na pasta
# 3. Execute:
.\start_datahub.ps1
```

### Linux/Mac

```bash
# 1. Instale dependências
pip install -r requirements_datahub.txt

# 2. Execute
python datahub.py
```

---

## 📋 Arquivos Inclusos

| Arquivo | Descrição |
|---------|-----------|
| `datahub.py` | **Arquivo principal** - sistema completo em um único arquivo |
| `requirements_datahub.txt` | Dependências Python necessárias |
| `exemplo_uso_datahub.py` | Exemplos práticos de integração |
| `start_datahub.ps1` | Script de inicialização para Windows |
| `README_DATAHUB.md` | Documentacao completa + inicio rapido (este arquivo) |

---

## 💻 Uso Básico

### 1. Iniciar o DataHub

```bash
python datahub.py
```

Você verá:

```
============================================================
🚀 INICIANDO DATAHUB PLC
============================================================
🔍 Procurando PLC ativo...
   Testando 200CX (100.20.0.10)...
   Testando 400CX (100.40.0.10)...
✅ PLC encontrado: 400CX (100.40.0.10)
✅ Conectado à máquina 400CX (100.40.0.10)
============================================================
🌐 Servidor disponível em:
   REST API: http://0.0.0.0:8000
   WebSocket: ws://0.0.0.0:8000/ws/alarms
   Docs: http://0.0.0.0:8000/docs
============================================================
```

### 2. Testar no Navegador

Abra: **http://localhost:8000/docs**

Você terá uma interface interativa para testar todos os endpoints!

### 3. Obter Dados via API

#### Python

```python
import requests

# Status da conexão
status = requests.get('http://localhost:8000/api/status').json()
print(f"Conectado: {status['connected']}")
print(f"Máquina: {status['machine_name']}")

# Dados do PLC
dados = requests.get('http://localhost:8000/api/data/1').json()
print(f"DB1 Tamanho: {dados['db']['size']} bytes")
```

#### JavaScript

```javascript
// Status da conexão
fetch('http://localhost:8000/api/status')
    .then(res => res.json())
    .then(data => {
        console.log('Conectado:', data.connected);
        console.log('Máquina:', data.machine_name);
    });

// Dados do PLC
fetch('http://localhost:8000/api/data/1')
    .then(res => res.json())
    .then(data => {
        console.log('DB1:', data.db);
    });
```

#### cURL

```bash
# Status
curl http://localhost:8000/api/status

# Dados
curl http://localhost:8000/api/data/1

# Escrever
curl -X POST "http://localhost:8000/api/write/1?offset=10&value=255"
```

### 4. WebSocket (Tempo Real)

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/alarms');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'alarm_changes') {
        console.log('Mudanças detectadas:', data.changes);
        // Exemplo: [{ tag: 'DB1.DBX10.5', value: true, ... }]
    }
};
```

---

## 🔧 Configuração

### PLCs Detectados

O sistema detecta automaticamente estes PLCs (em ordem):

| Máquina | IP | Status |
|---------|------------|--------|
| 700CX | 100.70.0.10 | Prioridade 1 |
| 400CX | 100.40.0.10 | Prioridade 2 |
| 200CX | 100.20.0.10 | Prioridade 3 |

### DBs Lidas

Por padrão, lê estas DBs:

| DB | Tamanho |
|----|---------|
| DB1 | 512 bytes |
| DB2 | 256 bytes |
| DB10 | 1024 bytes |
| DB20 | 512 bytes |

### Personalizar

Edite o início do arquivo `datahub.py`:

```python
# Adicionar/remover PLCs
PLC_CONFIGS = [
    {"name": "200CX", "ip": "100.20.0.10", "rack": 0, "slot": 1},
    {"name": "MEU_PLC", "ip": "192.168.1.100", "rack": 0, "slot": 1},  # Novo!
]

# Forcar PLC especifico (ex: 700CX)
FORCE_PLC_IP = "100.70.0.10"  # ou None para auto-deteccao

# Adicionar/remover DBs
DBS = [
    {"id": 1, "size": 512},
    {"id": 100, "size": 2048},  # Nova DB!
]

# Ajustar velocidade
POLLING_INTERVAL = 0.1  # 100ms (padrão: 200ms)
```

---

## 📊 Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/status` | Status da conexão e estatísticas |
| `GET` | `/api/data` | Todos os dados em cache |
| `GET` | `/api/data/{db_id}` | Dados de uma DB específica |
| `POST` | `/api/write/{db_id}` | Escreve um byte no PLC |
| `WS` | `/ws/alarms` | WebSocket para mudanças em tempo real |

---

## 🎓 Exemplos

Execute os exemplos práticos:

```bash
python exemplo_uso_datahub.py
```

Isso demonstra:
- ✅ Como verificar status
- 📊 Como ler dados
- ✏️ Como escrever valores
- 🔗 Como integrar com Flask/outros frameworks
- ⚡ Como monitorar mudanças

---

## 📚 Documentação

### Documentação Completa

Veja a secao **Manual do DataHub PLC (Consolidado)** neste arquivo para:
- 📖 Guia detalhado de todas as funcionalidades
- 🔧 Configurações avançadas
- 📊 Como ler tipos Siemens (BOOL, BYTE, WORD, DWORD, REAL)
- 🐛 Troubleshooting completo
- 💡 Exemplos avançados

### Documentação Interativa

Com o DataHub rodando, acesse:

**http://localhost:8000/docs**

Interface Swagger com:
- 📋 Lista de todos os endpoints
- 🧪 Testar requisições diretamente
- 📄 Ver schemas de dados
- 💻 Copiar exemplos de código

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        DATAHUB PLC                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌─────────────┐                  │
│  │ Auto-Detecção│────────▶│  Snap7      │                  │
│  │   de PLC     │         │  Handler    │                  │
│  └──────────────┘         └─────────────┘                  │
│         │                        │                           │
│         │                        ▼                           │
│         │                 ┌─────────────┐                  │
│         └────────────────▶│   Cache     │                  │
│                           │   Local     │                  │
│                           └─────────────┘                  │
│                                  │                           │
│         ┌────────────────────────┴──────────────┐          │
│         │                                        │          │
│         ▼                                        ▼          │
│  ┌─────────────┐                         ┌─────────────┐  │
│  │  REST API   │                         │  WebSocket  │  │
│  │  (FastAPI)  │                         │  (Tempo     │  │
│  └─────────────┘                         │   Real)     │  │
│         │                                 └─────────────┘  │
└─────────┼──────────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────┐
   │  Frontend    │
   │  (HTML/JS)   │
   └──────────────┘
```

---

## 🔐 Segurança

### Recomendações

1. **Rede Isolada**: Use em rede industrial isolada
2. **Firewall**: Configure firewall para permitir apenas IPs autorizados
3. **Autenticação**: Adicione autenticação se exposto externamente (veja manual)
4. **HTTPS**: Use proxy reverso (nginx/apache) com HTTPS em produção

### Adicionar Autenticação Básica

```python
# No datahub.py, adicione:
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi import Depends, HTTPException

security = HTTPBasic()

def verify_auth(credentials: HTTPBasicCredentials = Depends(security)):
    if credentials.username != "admin" or credentials.password != "senha":
        raise HTTPException(status_code=401)

@app.get("/api/data", dependencies=[Depends(verify_auth)])
async def get_all_data():
    # ...
```

---

## 🐛 Problemas Comuns

### ❌ "Nenhum PLC respondeu ao ping"

**Solução:**
1. Verifique se os IPs estão corretos
2. Teste: `ping 100.40.0.10`
3. Confirme que o PLC está ligado
4. Verifique firewall/rede

### ❌ "Erro ao ler DB"

**Solução:**
1. Confirme que as DBs existem no PLC
2. Verifique rack/slot (geralmente 0/1)
3. Habilite GET/PUT no PLC
4. Confirme tamanhos das DBs

### ❌ "ModuleNotFoundError: No module named 'snap7'"

**Solução:**
```bash
pip install python-snap7 fastapi uvicorn pydantic
```

---

## 📈 Performance

| Métrica | Valor Típico |
|---------|--------------|
| Latência de leitura | ~50ms |
| Taxa de leitura | 5 ciclos/segundo |
| Memória usada | ~50MB |
| CPU | <5% |
| Conexões simultâneas | Ilimitado |
| WebSocket clientes | 100+ |

---

## 🔄 Comparação

| Característica | Antes (Snap7 direto) | Depois (DataHub) |
|----------------|----------------------|-------------------|
| Detecção de PLC | Manual | **Automática** |
| Threads | Múltiplas competindo | **Uma única** |
| Leitura | Tag por tag (lento) | **Por blocos** |
| Cache | Não | **Sim, em tempo real** |
| API | Não | **REST + WebSocket** |
| Reconexão | Manual | **Automática** |
| Logs | Confusos | **Claros com emojis** |
| Estabilidade | ⚠️ Instável | ✅ **Robusto** |

---

## 🛠️ Integração com Projetos Existentes

### Flask

```python
from flask import Flask, jsonify
import requests

app = Flask(__name__)

@app.route('/dados-plc')
def dados_plc():
    response = requests.get('http://localhost:8000/api/data')
    return jsonify(response.json())
```

### Django

```python
from django.http import JsonResponse
import requests

def dados_plc(request):
    response = requests.get('http://localhost:8000/api/data')
    return JsonResponse(response.json())
```

### Java/Spring

```java
RestTemplate restTemplate = new RestTemplate();
String url = "http://localhost:8000/api/status";
Status status = restTemplate.getForObject(url, Status.class);
```

---

## 📝 Changelog

### v1.0.0 (2025-11-06)
- ✨ Lançamento inicial
- ✅ Auto-detecção de PLC
- ✅ Leitura otimizada por blocos
- ✅ API REST completa
- ✅ WebSocket para tempo real
- ✅ Reconexão automática
- ✅ Documentação completa

---

## 📞 Suporte

### Documentação
- **Manual Completo**: secao "Manual do DataHub PLC (Consolidado)" neste arquivo
- **Exemplos**: `exemplo_uso_datahub.py`
- **API Docs**: http://localhost:8000/docs

### Troubleshooting
1. Verifique os logs do DataHub
2. Execute os exemplos de teste
3. Consulte a secao "Troubleshooting" neste arquivo
4. Verifique conectividade de rede

---

## 📄 Licença

Este código é fornecido como está, para uso em sistemas de automação industrial.

---

## ⭐ Características Futuras (Roadmap)

- [ ] Suporte a OPC UA
- [ ] Interface web de monitoramento
- [ ] Histórico de dados
- [ ] Alertas por email/SMS
- [ ] Suporte a múltiplos PLCs simultâneos
- [ ] Backup automático de configurações

---

# Manual do DataHub PLC (Consolidado)

## 🎯 Visão Geral

O **DataHub** é um sistema de comunicação robusto e inteligente para PLCs Siemens (CPU 1517T) via Snap7, projetado para substituir implementações instáveis e fornecer uma camada de comunicação confiável para supervisórios web.

### Principais Características

✅ **Auto-detecção de PLC** - Detecta automaticamente qual máquina está disponível  
✅ **Conexão Única** - Uma única conexão persistente, sem threads competindo  
✅ **Leitura Otimizada** - Lê DBs em blocos completos, não tag por tag  
✅ **Cache em Tempo Real** - Dados sempre atualizados localmente  
✅ **API REST** - Endpoints HTTP para integração fácil  
✅ **WebSocket** - Notificações em tempo real de mudanças  
✅ **Reconexão Automática** - Recupera-se de quedas de conexão  
✅ **Logs Claros** - Mensagens descritivas com emojis para fácil identificação  

---

## 🚀 Instalação

### 1. Requisitos

- Python 3.8 ou superior
- Windows ou Linux
- Acesso de rede aos PLCs (IPs: 100.20.0.10, 100.40.0.10, 100.70.0.10)

### 2. Instalar Dependências

```bash
pip install -r requirements_datahub.txt
```

Ou manualmente:

```bash
pip install python-snap7 fastapi uvicorn pydantic
```

### 3. Configurar (Opcional)

Edite o arquivo `datahub.py` se necessário:

```python
# Lista de PLCs
PLC_CONFIGS = [
    {"name": "200CX", "ip": "100.20.0.10", "rack": 0, "slot": 1},
    {"name": "400CX", "ip": "100.40.0.10", "rack": 0, "slot": 1},
    {"name": "700CX", "ip": "100.70.0.10", "rack": 0, "slot": 1},
]

# DBs a serem lidas
DBS = [
    {"id": 1, "size": 512},
    {"id": 2, "size": 256},
    {"id": 10, "size": 1024},
    {"id": 20, "size": 512},
]

# Timing
POLLING_INTERVAL = 0.2  # 200ms entre leituras
```

---

## 🎮 Uso

### Iniciar o DataHub

```bash
python datahub.py
```

Você verá:

```
============================================================
🚀 INICIANDO DATAHUB PLC
============================================================
🔍 Procurando PLC ativo...
   Testando 200CX (100.20.0.10)...
   Testando 400CX (100.40.0.10)...
✅ PLC encontrado: 400CX (100.40.0.10)
✅ Conectado à máquina 400CX (100.40.0.10)
✅ DataHub iniciado com sucesso
📡 Iniciando leitura cíclica (intervalo: 0.2s)
============================================================
🌐 Servidor disponível em:
   REST API: http://0.0.0.0:8000
   WebSocket: ws://0.0.0.0:8000/ws/alarms
   Docs: http://0.0.0.0:8000/docs
============================================================
```

---

## 🌐 API REST

### 1. Status do Sistema

```http
GET /api/status
```

**Resposta:**

```json
{
  "connected": true,
  "machine_name": "400CX",
  "machine_ip": "100.40.0.10",
  "uptime_seconds": 123.45,
  "last_read": "2025-11-06T14:30:00",
  "read_count": 617,
  "error_count": 0,
  "ws_clients": 2
}
```

### 2. Obter Todos os Dados

```http
GET /api/data
```

**Resposta:**

```json
{
  "timestamp": "2025-11-06T14:30:00",
  "data": {
    "db1": {
      "size": 512,
      "data": [0, 1, 2, 3, ...]
    },
    "db2": {
      "size": 256,
      "data": [0, 0, 0, ...]
    }
  }
}
```

### 3. Obter DB Específica

```http
GET /api/data/1
```

**Resposta:**

```json
{
  "timestamp": "2025-11-06T14:30:00",
  "db": {
    "db": 1,
    "size": 512,
    "data": [0, 1, 2, 3, ...]
  }
}
```

### 4. Escrever no PLC

```http
POST /api/write/1?offset=10&value=255
```

**Resposta:**

```json
{
  "success": true,
  "message": "Escrito valor 255 em DB1.DBB10"
}
```

---

## 🔌 WebSocket

### Conectar

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/alarms');

ws.onopen = () => {
    console.log('Conectado ao DataHub');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'connected') {
        console.log('Status:', data.status);
    }
    
    if (data.type === 'alarm_changes') {
        console.log('Mudanças detectadas:', data.changes);
        // data.changes = [
        //   { tag: 'DB1.DBX0.0', db: 1, offset: 0, bit: 0, value: true, timestamp: '...' },
        //   ...
        // ]
    }
};
```

### Mensagens Enviadas

**Ao conectar:**

```json
{
  "type": "connected",
  "message": "Conectado ao DataHub",
  "status": { ... }
}
```

**Quando há mudanças:**

```json
{
  "type": "alarm_changes",
  "changes": [
    {
      "tag": "DB1.DBX10.5",
      "db": 1,
      "offset": 10,
      "bit": 5,
      "value": true,
      "timestamp": "2025-11-06T14:30:00"
    }
  ],
  "count": 1
}
```

---

## 🔧 Integração com Projeto Existente

### Opção 1: Via Requests (Python)

```python
import requests

# Obter status
response = requests.get('http://localhost:8000/api/status')
status = response.json()
print(f"Conectado: {status['connected']}")

# Obter dados
response = requests.get('http://localhost:8000/api/data/1')
data = response.json()
db_data = bytearray(data['db']['data'])

# Ler bit específico
byte_value = db_data[10]  # Offset 10
bit_5 = bool(byte_value & (1 << 5))  # Bit 5
```

### Opção 2: Via Fetch (JavaScript)

```javascript
// Obter status
fetch('http://localhost:8000/api/status')
    .then(res => res.json())
    .then(data => {
        console.log('Conectado:', data.connected);
        console.log('Máquina:', data.machine_name);
    });

// Obter dados
fetch('http://localhost:8000/api/data/1')
    .then(res => res.json())
    .then(data => {
        const dbData = data.db.data;
        console.log('DB1 tamanho:', dbData.length);
    });
```

### Opção 3: Importar Diretamente (Python)

```python
from datahub import get_data, get_status_dict

# Obter dados
data = get_data()
print(data)

# Obter status
status = get_status_dict()
print(f"Conectado: {status['connected']}")
```

---

## 📊 Leitura de Dados Siemens

### Estrutura de Dados

O DataHub retorna os dados como **bytearray** (lista de bytes). Para ler tipos Siemens:

### Ler Bit (BOOL)

```python
def read_bit(db_data: bytearray, offset: int, bit: int) -> bool:
    """DB1.DBX10.5 = offset=10, bit=5"""
    byte_value = db_data[offset]
    return bool(byte_value & (1 << bit))

# Exemplo
bit_value = read_bit(db_data, offset=10, bit=5)
```

### Ler Byte (BYTE)

```python
def read_byte(db_data: bytearray, offset: int) -> int:
    """DB1.DBB10 = offset=10"""
    return db_data[offset]

# Exemplo
byte_value = read_byte(db_data, offset=10)  # 0-255
```

### Ler Word (WORD/INT)

```python
def read_word(db_data: bytearray, offset: int) -> int:
    """DB1.DBW10 = offset=10"""
    # Big-endian (padrão Siemens)
    return (db_data[offset] << 8) | db_data[offset + 1]

# Exemplo
word_value = read_word(db_data, offset=10)  # 0-65535
```

### Ler DWord (DWORD/DINT)

```python
def read_dword(db_data: bytearray, offset: int) -> int:
    """DB1.DBD10 = offset=10"""
    return (db_data[offset] << 24) | (db_data[offset + 1] << 16) | \
           (db_data[offset + 2] << 8) | db_data[offset + 3]

# Exemplo
dword_value = read_dword(db_data, offset=10)  # 0-4294967295
```

### Ler Real (REAL/FLOAT)

```python
import struct

def read_real(db_data: bytearray, offset: int) -> float:
    """DB1.DBD10 (REAL) = offset=10"""
    bytes_data = db_data[offset:offset+4]
    # Big-endian float
    return struct.unpack('>f', bytes_data)[0]

# Exemplo
float_value = read_real(db_data, offset=10)
```

---

## 🛠️ Configurações Avançadas

### Adicionar Mais DBs

Edite `datahub.py`:

```python
DBS = [
    {"id": 1, "size": 512},
    {"id": 2, "size": 256},
    {"id": 10, "size": 1024},
    {"id": 20, "size": 512},
    {"id": 100, "size": 2048},  # Nova DB
]
```

### Ajustar Timing

```python
POLLING_INTERVAL = 0.1  # 100ms (mais rápido)
RECONNECT_INTERVAL = 10.0  # 10s entre reconexões
```

### Mudar Porta

```python
# No final do arquivo datahub.py
config = uvicorn.Config(
    app=app,
    host="0.0.0.0",
    port=5000,  # Mudar de 8000 para 5000
    log_level="info"
)
```

### Adicionar Autenticação

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

security = HTTPBasic()

def verify_credentials(credentials: HTTPBasicCredentials = Depends(security)):
    if credentials.username != "admin" or credentials.password != "senha123":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas"
        )
    return credentials

@app.get("/api/data", dependencies=[Depends(verify_credentials)])
async def get_all_data():
    # ... resto do código
```

---

## 🐛 Troubleshooting

### Problema: DataHub não encontra nenhum PLC

**Sintomas:**
```
🔍 Procurando PLC ativo...
   Testando 200CX (100.20.0.10)...
   Testando 400CX (100.40.0.10)...
   Testando 700CX (100.70.0.10)...
❌ Nenhum PLC respondeu ao ping
```

**Soluções:**
1. Verifique se os IPs estão corretos
2. Teste manualmente: `ping 100.40.0.10`
3. Verifique firewall/rede
4. Confirme que o PLC está ligado

### Problema: Conecta mas não lê dados

**Sintomas:**
```
✅ Conectado à máquina 400CX (100.40.0.10)
❌ Erro ao ler DB1: ...
```

**Soluções:**
1. Verifique se as DBs existem no PLC
2. Confirme rack/slot corretos (geralmente 0/1)
3. Verifique permissões no PLC (GET/PUT habilitado)
4. Teste tamanho das DBs (pode estar errado)

### Problema: Conexão cai frequentemente

**Sintomas:**
```
❌ Conexão perdida - tentativa 1/3
```

**Soluções:**
1. Verifique estabilidade da rede
2. Aumente `RECONNECT_INTERVAL`
3. Verifique se outra aplicação está acessando o PLC
4. Reduza `POLLING_INTERVAL` (menos requisições)

### Problema: WebSocket desconecta

**Soluções:**
1. Implemente reconexão no cliente:

```javascript
function connectWebSocket() {
    const ws = new WebSocket('ws://localhost:8000/ws/alarms');
    
    ws.onclose = () => {
        console.log('Desconectado - reconectando em 5s...');
        setTimeout(connectWebSocket, 5000);
    };
    
    return ws;
}
```

---

## 📝 Logs

### Tipos de Mensagens

- 🔍 **Procurando** - Buscando PLC ativo
- ✅ **Sucesso** - Operação bem-sucedida
- ❌ **Erro** - Algo deu errado
- 📡 **Leitura** - Operação de leitura
- 🔄 **Reconexão** - Tentando reconectar
- ➕/➖ **WebSocket** - Cliente conectou/desconectou

### Exemplo de Log Completo

```
2025-11-06 14:30:00 [INFO] ============================================================
2025-11-06 14:30:00 [INFO] 🚀 INICIANDO DATAHUB PLC
2025-11-06 14:30:00 [INFO] ============================================================
2025-11-06 14:30:00 [INFO] 🔍 Procurando PLC ativo...
2025-11-06 14:30:00 [INFO]    Testando 200CX (100.20.0.10)...
2025-11-06 14:30:01 [INFO]    Testando 400CX (100.40.0.10)...
2025-11-06 14:30:01 [INFO] ✅ PLC encontrado: 400CX (100.40.0.10)
2025-11-06 14:30:01 [INFO] ✅ Conectado à máquina 400CX (100.40.0.10)
2025-11-06 14:30:01 [INFO] ✅ DataHub iniciado com sucesso
2025-11-06 14:30:01 [INFO] 📡 Iniciando leitura cíclica (intervalo: 0.2s)
```

---

## 🎓 Exemplos Práticos

Veja o arquivo `exemplo_uso_datahub.py` para exemplos completos de:

- ✅ Verificar status
- 📊 Ler todos os dados
- 🎯 Ler DB específica
- ⚡ Monitorar mudanças
- ✏️ Escrever valores
- 🔗 Integrar com Flask/outros frameworks

Execute:

```bash
python exemplo_uso_datahub.py
```

---

## 📚 Documentação Interativa

Acesse `http://localhost:8000/docs` para documentação interativa (Swagger UI) onde você pode:

- Ver todos os endpoints
- Testar requisições
- Ver schemas de dados
- Copiar exemplos de código

---

## 🤝 Suporte

Para problemas ou dúvidas:

1. Verifique os logs do DataHub
2. Consulte a seção Troubleshooting
3. Execute os exemplos de teste
4. Verifique conectividade de rede

---

## 📄 Licença

Este código é fornecido como está, para uso em sistemas de automação industrial.

---

**Desenvolvido com ❤️ para Sistemas de Supervisório Industrial**

---

<div align="center">

**Desenvolvido com ❤️ para Automação Industrial**

[⬆ Voltar ao topo](#-datahub-plc---sistema-de-comunicação-robusto)

</div>

