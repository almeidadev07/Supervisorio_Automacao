# 🔗 Como Integrar o DataHub com Seu Supervisório Existente

## 🎯 Entendendo a Arquitetura

Você **NÃO precisa substituir** seu supervisório atual! O DataHub funciona **em paralelo**:

```
┌─────────────────────────────────────────────────────────────┐
│                    SEU SUPERVISÓRIO ATUAL                    │
│                    (app.py + Flask/outro)                    │
│                                                              │
│  ┌─────────────────┐                                        │
│  │  templates/     │  ← Suas telas HTML continuam aqui      │
│  │  - dashboard    │                                         │
│  │  - partials/    │                                         │
│  └─────────────────┘                                        │
│                                                              │
│  ┌─────────────────┐                                        │
│  │  static/        │  ← Seus CSS/JS continuam aqui          │
│  │  - styles/      │                                         │
│  │  - scripts/     │                                         │
│  └─────────────────┘                                        │
│                                                              │
│         │                                                    │
│         │ Faz requisições HTTP                               │
│         ↓                                                    │
└─────────────────────────────────────────────────────────────┘
                        │
                        ↓ http://localhost:8000/api
┌─────────────────────────────────────────────────────────────┐
│                      DATAHUB (NOVO)                          │
│                   Roda em paralelo                           │
│                                                              │
│  ┌─────────────────┐       ┌─────────────────┐             │
│  │   API REST      │       │   WebSocket     │             │
│  │   :8000         │       │   :8000/ws      │             │
│  └─────────────────┘       └─────────────────┘             │
│         │                          │                         │
│         └──────────┬───────────────┘                        │
│                    ↓                                         │
│           ┌─────────────────┐                               │
│           │  Snap7 Handler  │                               │
│           │  (Comunicação)  │                               │
│           └─────────────────┘                               │
│                    │                                         │
└────────────────────┼─────────────────────────────────────────┘
                     │
                     ↓
              ┌─────────────┐
              │  PLC 700CX  │
              │ 100.70.0.10 │
              └─────────────┘
```

---

## 🚀 Como Funciona

### Antes (com problema)
Seu `app.py` conectava diretamente ao PLC via Snap7:
```python
# app.py (antigo)
import snap7
client = snap7.client.Client()
client.connect("100.70.0.10", 0, 1)
data = client.db_read(1, 0, 512)
```

### Depois (com DataHub)
Seu `app.py` busca dados do DataHub via HTTP:
```python
# app.py (novo)
import requests
response = requests.get('http://localhost:8000/api/data/1')
data = response.json()['db']['data']
```

---

## 📋 Passo a Passo de Integração

### 1️⃣ Mantenha Seu App Atual Rodando

**Não mude nada** no seu app principal ainda. Ele continua na porta dele (ex: 5000).

```bash
# Terminal 1: Seu supervisório atual
python app.py
# Roda em http://localhost:5000
```

### 2️⃣ Inicie o DataHub em Paralelo

```bash
# Terminal 2: DataHub (nova janela)
.\venv\Scripts\Activate.ps1
python datahub.py
# Roda em http://localhost:8000
```

Agora você tem **dois servidores** rodando:
- `localhost:5000` → Seu supervisório com telas
- `localhost:8000` → DataHub com dados do PLC

### 3️⃣ Modifique Suas Telas HTML

Nas suas telas HTML atuais, onde você busca dados do PLC, mude para buscar do DataHub:

#### **Antes (antigo):**
```javascript
// static/scripts/seu-script.js

// Buscava dados diretamente do backend
fetch('/api/plc/dados')  // ← Seu endpoint antigo
    .then(res => res.json())
    .then(data => {
        // processar dados
    });
```

#### **Depois (novo):**
```javascript
// static/scripts/seu-script.js

// Busca dados do DataHub
fetch('http://localhost:8000/api/data/1')  // ← DataHub
    .then(res => res.json())
    .then(data => {
        const dbData = data.db.data;
        // processar dados
    });
```

---

## 💻 Exemplos Práticos de Integração

### Exemplo 1: Modificar Dashboard Existente

Se você tem um `templates/dashboard.html`:

```html
<!-- templates/dashboard.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Dashboard</title>
    <link rel="stylesheet" href="/static/styles/dashboard.css">
</head>
<body>
    <h1>Supervisório Industrial</h1>
    
    <div class="status">
        <h2>Status PLC</h2>
        <p id="plc-status">Verificando...</p>
        <p id="plc-machine">-</p>
    </div>
    
    <div class="dados">
        <h2>Dados em Tempo Real</h2>
        <div id="dados-container"></div>
    </div>

    <!-- ADICIONE ESTE SCRIPT -->
    <script>
        // URL do DataHub
        const DATAHUB_URL = 'http://localhost:8000';
        
        // Função para buscar status
        async function atualizarStatus() {
            try {
                const response = await fetch(`${DATAHUB_URL}/api/status`);
                const status = await response.json();
                
                document.getElementById('plc-status').textContent = 
                    status.connected ? '✅ Conectado' : '❌ Desconectado';
                    
                document.getElementById('plc-machine').textContent = 
                    status.machine_name || 'Nenhum';
                    
            } catch (error) {
                console.error('Erro ao buscar status:', error);
                document.getElementById('plc-status').textContent = '⚠️ Erro';
            }
        }
        
        // Função para buscar dados
        async function atualizarDados() {
            try {
                const response = await fetch(`${DATAHUB_URL}/api/data/1`);
                const result = await response.json();
                const dbData = result.db.data;
                
                // Exemplo: mostrar primeiros 10 bytes
                let html = '<ul>';
                for (let i = 0; i < Math.min(10, dbData.length); i++) {
                    html += `<li>Byte ${i}: ${dbData[i]}</li>`;
                }
                html += '</ul>';
                
                document.getElementById('dados-container').innerHTML = html;
                
            } catch (error) {
                console.error('Erro ao buscar dados:', error);
            }
        }
        
        // Atualiza a cada 1 segundo
        setInterval(() => {
            atualizarStatus();
            atualizarDados();
        }, 1000);
        
        // Primeira atualização imediata
        atualizarStatus();
        atualizarDados();
    </script>
</body>
</html>
```

### Exemplo 2: Criar Nova Rota no Seu App.py

Se você quiser manter endpoints no seu `app.py` mas buscar dados do DataHub:

```python
# app.py (seu arquivo principal)
from flask import Flask, render_template, jsonify
import requests

app = Flask(__name__)

# URL do DataHub
DATAHUB_URL = "http://localhost:8000"

@app.route('/')
def dashboard():
    """Renderiza sua tela principal."""
    return render_template('dashboard.html')

@app.route('/api/plc/status')
def plc_status():
    """Endpoint que busca status do DataHub."""
    try:
        response = requests.get(f'{DATAHUB_URL}/api/status', timeout=2)
        return jsonify(response.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/plc/dados/<int:db_id>')
def plc_dados(db_id):
    """Endpoint que busca dados do DataHub."""
    try:
        response = requests.get(f'{DATAHUB_URL}/api/data/{db_id}', timeout=2)
        return jsonify(response.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

Agora suas telas podem continuar usando seus endpoints:

```javascript
// Continua funcionando do mesmo jeito!
fetch('/api/plc/status')  // ← Seu endpoint (que por dentro chama o DataHub)
    .then(res => res.json())
    .then(data => console.log(data));
```

### Exemplo 3: WebSocket para Tempo Real

Para receber notificações de mudanças em tempo real:

```javascript
// static/scripts/realtime.js

// Conecta ao WebSocket do DataHub
const ws = new WebSocket('ws://localhost:8000/ws/alarms');

ws.onopen = () => {
    console.log('✅ Conectado ao DataHub WebSocket');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'alarm_changes') {
        // Mudanças detectadas!
        data.changes.forEach(change => {
            console.log(`Alarme: ${change.tag} = ${change.value}`);
            
            // Exibir notificação na tela
            mostrarAlarme(change.tag, change.value);
        });
    }
};

ws.onerror = (error) => {
    console.error('Erro WebSocket:', error);
};

ws.onclose = () => {
    console.log('⚠️ WebSocket desconectado - reconectando em 5s...');
    setTimeout(() => location.reload(), 5000);
};

function mostrarAlarme(tag, valor) {
    // Sua lógica para mostrar alarme na tela
    const alarmeDiv = document.getElementById('alarmes');
    alarmeDiv.innerHTML += `<p class="alarme">${tag}: ${valor ? 'ATIVO' : 'INATIVO'}</p>`;
}
```

---

## 🔧 Configuração de Portas

Se houver conflito de portas, você pode mudar:

### Mudar Porta do DataHub

```python
# datahub.py - linha ~780
config = uvicorn.Config(
    app=app,
    host="0.0.0.0",
    port=8001,  # ← Mude de 8000 para 8001
    log_level="info"
)
```

Depois use `http://localhost:8001` nos seus scripts.

---

## 📊 Comparação: Antes vs Depois

| Aspecto | Antes (Snap7 direto) | Depois (com DataHub) |
|---------|----------------------|----------------------|
| **Conexão PLC** | Múltiplas threads competindo | ✅ Uma única conexão estável |
| **Leitura** | Tag por tag (lento) | ✅ Blocos inteiros (rápido) |
| **Cache** | Não tinha | ✅ Dados sempre disponíveis |
| **Seu app.py** | Snap7 direto | ✅ HTTP simples |
| **Suas telas** | Sem mudanças | ✅ Fetch/WebSocket |
| **Estabilidade** | ⚠️ Instável | ✅ Robusto |
| **Reconexão** | Manual | ✅ Automática |

---

## 🎓 Migração Gradual (Recomendado)

Você **não precisa migrar tudo de uma vez**. Faça gradualmente:

### Fase 1: Teste o DataHub
```
1. Inicie DataHub em paralelo
2. Acesse http://localhost:8000/docs
3. Teste os endpoints manualmente
4. Confirme que está conectando ao 700CX
```

### Fase 2: Migre uma Tela
```
1. Escolha UMA tela para migrar
2. Modifique o JavaScript dela para usar DataHub
3. Teste se funciona
4. Se funcionar, continue para próxima tela
```

### Fase 3: Migre Todas as Telas
```
1. Repita o processo para cada tela
2. Gradualmente substitua Snap7 direto por DataHub
3. Mantenha ambos rodando durante migração
```

### Fase 4: Remova Snap7 do Seu App
```
1. Quando todas as telas estiverem usando DataHub
2. Remova código Snap7 do app.py
3. Deixe apenas DataHub gerenciar comunicação
```

---

## 📁 Estrutura Final

```
C:\PROGRAMAS\Supervisorio\
│
├── app.py                    ← Seu supervisório principal
├── datahub.py                ← DataHub (novo)
│
├── templates/                ← Suas telas HTML (mantém)
│   ├── dashboard.html
│   └── partials/
│
├── static/                   ← Seus CSS/JS (mantém)
│   ├── styles/
│   └── scripts/
│       └── realtime.js       ← Adicione WebSocket aqui
│
├── app/                      ← Sua estrutura atual (mantém)
│   ├── controllers/
│   ├── services/
│   └── ...
│
└── venv/                     ← Ambiente virtual (compartilhado)
```

---

## 🚦 Como Iniciar Tudo

### Opção 1: Dois Terminais

```powershell
# Terminal 1: DataHub
.\venv\Scripts\Activate.ps1
python datahub.py

# Terminal 2: Seu supervisório
.\venv\Scripts\Activate.ps1
python app.py
```

### Opção 2: Script Único (criar)

Crie `start_all.ps1`:

```powershell
# start_all.ps1
Write-Host "Iniciando DataHub..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\venv\Scripts\Activate.ps1; python datahub.py"

Start-Sleep -Seconds 3

Write-Host "Iniciando Supervisório..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\venv\Scripts\Activate.ps1; python app.py"

Write-Host "Ambos iniciados!" -ForegroundColor Cyan
Write-Host "DataHub: http://localhost:8000" -ForegroundColor Yellow
Write-Host "Supervisório: http://localhost:5000" -ForegroundColor Yellow
```

Execute:
```powershell
.\start_all.ps1
```

---

## ✅ Checklist de Integração

- [ ] DataHub rodando e conectado ao 700CX
- [ ] Seu app.py rodando na porta 5000
- [ ] Testado endpoint do DataHub no navegador
- [ ] Modificado uma tela HTML para usar DataHub
- [ ] Testado se tela atualiza dados corretamente
- [ ] Implementado WebSocket se necessário
- [ ] Documentado mudanças para equipe

---

## 🆘 Problemas Comuns

### CORS Error no Navegador

Se aparecer erro de CORS no console do navegador:

```javascript
// Adicione isto no início do datahub.py (já está incluído)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite qualquer origem
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### DataHub não encontra PLC

Veja: `CONFIGURAR_700CX.md` e `CORRECAO_ERRO_SNAP7.md`

### Seu app não consegue acessar DataHub

```python
# Teste no terminal Python
import requests
response = requests.get('http://localhost:8000/api/status')
print(response.json())
```

---

## 💡 Resumo

**Você NÃO substitui seu supervisório!**

O DataHub é apenas a **camada de comunicação com o PLC**:

1. ✅ DataHub conecta ao PLC (porta 8000)
2. ✅ Seu app.py serve as telas (porta 5000)
3. ✅ Suas telas HTML buscam dados do DataHub via JavaScript
4. ✅ Tudo funciona em paralelo

**É só uma mudança de onde vem os dados!**

---

Quer que eu crie um exemplo específico para uma das suas telas atuais? Posso pegar um dos seus arquivos HTML e mostrar exatamente o que mudar! 🎯

