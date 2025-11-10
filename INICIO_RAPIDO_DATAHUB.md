# 🚀 Início Rápido - DataHub PLC

## ⚡ 3 Passos para Começar

### 1️⃣ Instalar

**Windows (PowerShell):**
```powershell
.\start_datahub.ps1
```

**Linux/Mac:**
```bash
pip install -r requirements_datahub.txt
python datahub.py
```

### 2️⃣ Verificar

Abra o navegador: **http://localhost:8000/docs**

### 3️⃣ Usar

**Python:**
```python
import requests
dados = requests.get('http://localhost:8000/api/data/1').json()
print(dados)
```

**JavaScript:**
```javascript
fetch('http://localhost:8000/api/data/1')
    .then(res => res.json())
    .then(data => console.log(data));
```

---

## 📋 Comandos Essenciais

| Comando | Descrição |
|---------|-----------|
| `python datahub.py` | Iniciar DataHub |
| `python test_datahub.py` | Testar funcionamento |
| `python exemplo_uso_datahub.py` | Ver exemplos |
| `Ctrl+C` | Parar DataHub |

---

## 🌐 URLs Importantes

| URL | Descrição |
|-----|-----------|
| http://localhost:8000 | Raiz da API |
| http://localhost:8000/docs | **Documentação interativa** ⭐ |
| http://localhost:8000/api/status | Status da conexão |
| http://localhost:8000/api/data | Todos os dados |
| http://localhost:8000/api/data/1 | Dados da DB1 |
| ws://localhost:8000/ws/alarms | WebSocket (tempo real) |

---

## 🎯 O Que Faz?

O DataHub:
1. ✅ **Detecta** qual PLC está ligado (200CX, 400CX ou 700CX)
2. ✅ **Conecta** automaticamente ao PLC ativo
3. ✅ **Lê** os dados continuamente (a cada 200ms)
4. ✅ **Armazena** em cache local
5. ✅ **Disponibiliza** via API REST e WebSocket
6. ✅ **Reconecta** automaticamente se cair

---

## 📊 Exemplo de Uso Real

### Obter Status da Máquina

```python
import requests

response = requests.get('http://localhost:8000/api/status')
status = response.json()

if status['connected']:
    print(f"✅ Conectado à {status['machine_name']}")
    print(f"   IP: {status['machine_ip']}")
    print(f"   Leituras: {status['read_count']}")
else:
    print("❌ Desconectado")
```

**Saída:**
```
✅ Conectado à 400CX
   IP: 100.40.0.10
   Leituras: 1523
```

### Ler Dados do PLC

```python
import requests

response = requests.get('http://localhost:8000/api/data/1')
data = response.json()

db = data['db']
db_data = db['data']  # Lista de bytes

# Ler bit específico (DB1.DBX10.5)
byte_10 = db_data[10]
bit_5 = bool(byte_10 & (1 << 5))

print(f"DB1.DBX10.5 = {bit_5}")
```

### Monitorar Mudanças (WebSocket)

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/alarms');

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === 'alarm_changes') {
        msg.changes.forEach(change => {
            console.log(`${change.tag} mudou para ${change.value}`);
        });
    }
};
```

---

## 🔧 Personalizar

### Adicionar Mais DBs

Edite `datahub.py`:

```python
DBS = [
    {"id": 1, "size": 512},
    {"id": 2, "size": 256},
    {"id": 100, "size": 2048},  # ← Adicione aqui
]
```

### Mudar Velocidade de Leitura

```python
POLLING_INTERVAL = 0.1  # 100ms (mais rápido)
```

### Adicionar Outro PLC

```python
PLC_CONFIGS = [
    {"name": "200CX", "ip": "100.20.0.10", "rack": 0, "slot": 1},
    {"name": "MEU_PLC", "ip": "192.168.1.100", "rack": 0, "slot": 1},  # ← Novo
]
```

---

## 🐛 Problemas?

### DataHub não inicia

```bash
# Instale as dependências
pip install python-snap7 fastapi uvicorn pydantic
```

### Não encontra PLC

```bash
# Teste manualmente
ping 100.40.0.10
```

Se não responder:
- Verifique se o PLC está ligado
- Verifique se está na mesma rede
- Verifique firewall

### Erro ao ler dados

Verifique se:
- ✅ As DBs existem no PLC
- ✅ Rack/Slot estão corretos (geralmente 0/1)
- ✅ GET/PUT estão habilitados no PLC

---

## 📚 Documentação Completa

Para tudo sobre o DataHub:

| Arquivo | O Que Contém |
|---------|--------------|
| **README_DATAHUB.md** | Visão geral e guia rápido |
| **MANUAL_DATAHUB.md** | Documentação completa e detalhada ⭐ |
| **exemplo_uso_datahub.py** | Exemplos práticos de código |
| **test_datahub.py** | Testes automatizados |

---

## 💡 Dicas

### Testar Antes de Integrar

```bash
# 1. Inicie o DataHub
python datahub.py

# 2. Em outro terminal, execute os testes
python test_datahub.py

# 3. Veja exemplos práticos
python exemplo_uso_datahub.py
```

### Documentação Interativa

Com o DataHub rodando, acesse:

**http://localhost:8000/docs**

Você pode:
- 📋 Ver todos os endpoints
- 🧪 Testar as requisições
- 📄 Ver os dados retornados
- 💻 Copiar código de exemplo

### Monitorar Logs

O DataHub mostra logs claros:

```
✅ = Sucesso
❌ = Erro
🔍 = Procurando
📡 = Lendo dados
🔄 = Reconectando
➕➖ = WebSocket conectou/desconectou
```

---

## 🎓 Próximos Passos

1. ✅ Rode o DataHub
2. ✅ Teste com `test_datahub.py`
3. ✅ Veja exemplos em `exemplo_uso_datahub.py`
4. ✅ Integre com seu projeto existente
5. ✅ Leia o manual completo em `MANUAL_DATAHUB.md`

---

## 🤝 Integrar com Seu Projeto

### Flask

```python
from flask import Flask, jsonify
import requests

app = Flask(__name__)
DATAHUB = "http://localhost:8000"

@app.route('/plc/status')
def plc_status():
    res = requests.get(f"{DATAHUB}/api/status")
    return jsonify(res.json())

@app.route('/plc/data/<int:db_id>')
def plc_data(db_id):
    res = requests.get(f"{DATAHUB}/api/data/{db_id}")
    return jsonify(res.json())
```

### HTML/JavaScript

```html
<!DOCTYPE html>
<html>
<head>
    <title>Monitor PLC</title>
</head>
<body>
    <h1>Status do PLC</h1>
    <div id="status"></div>
    
    <script>
        // Atualiza status a cada 2 segundos
        setInterval(() => {
            fetch('http://localhost:8000/api/status')
                .then(res => res.json())
                .then(data => {
                    document.getElementById('status').innerHTML = 
                        data.connected 
                        ? `✅ Conectado à ${data.machine_name}` 
                        : '❌ Desconectado';
                });
        }, 2000);
    </script>
</body>
</html>
```

---

## ✨ Principais Vantagens

| Antes | Depois (com DataHub) |
|-------|----------------------|
| Instável | ✅ **Robusto** |
| Lento (tag por tag) | ✅ **Rápido (blocos)** |
| Múltiplas threads | ✅ **Thread única** |
| Sem cache | ✅ **Cache em tempo real** |
| Difícil integrar | ✅ **API REST + WebSocket** |
| Sem reconexão | ✅ **Reconexão automática** |
| Logs confusos | ✅ **Logs claros** |

---

## 📞 Precisa de Ajuda?

1. Veja os logs do DataHub
2. Execute `python test_datahub.py`
3. Consulte `MANUAL_DATAHUB.md`
4. Teste com `exemplo_uso_datahub.py`

---

<div align="center">

**🎉 Pronto! Agora você tem um DataHub robusto e confiável! 🎉**

</div>

