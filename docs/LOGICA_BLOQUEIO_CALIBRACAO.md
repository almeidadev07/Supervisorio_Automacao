# Lógica de Bloqueio para Escrita de Bits em WORDs Compartilhadas

## Visão Geral

Este documento descreve a lógica implementada na tela de Balança (`balance.js`) para evitar conflitos ao escrever bits em WORDs compartilhadas do PLC. O problema ocorre quando múltiplas linhas/elementos compartilham a mesma WORD no PLC, e escritas rápidas sequenciais podem causar **race conditions** onde um bit sobrescreve o outro.

## O Problema

Quando várias linhas compartilham a mesma WORD no PLC (ex: linhas 1-16 usam `XLCLASS_DB229_CALIBRAR_PESO_MINIMO_01`), o processo de escrita é:

1. **Lê** o valor atual da WORD
2. **Modifica** apenas o bit desejado
3. **Escreve** o novo valor de volta

Se duas escritas acontecem muito rapidamente:
```
Requisição 1: Lê WORD = 0x0000, seta bit 0 → escreve 0x0001
Requisição 2: Lê WORD = 0x0000 (ainda não atualizou!) → seta bit 5 → escreve 0x0020
Resultado: bit 0 foi SOBRESCRITO porque requisição 2 leu antes do PLC atualizar!
```

## Solução: Bloqueio em 2 Camadas

### Camada 1: Backend (Python/Flask)

**Arquivo:** `app/controllers/machines_controller.py`

```python
# Lock por WORD para garantir operações atômicas
_word_write_locks = {}  # tag_name -> threading.Lock
_locks_lock = threading.Lock()

def get_word_lock(tag_name):
    """Obtém ou cria um lock para uma tag WORD específica"""
    with _locks_lock:
        if tag_name not in _word_write_locks:
            _word_write_locks[tag_name] = threading.Lock()
        return _word_write_locks[tag_name]

@machines_bp.route('/write_word_bit', methods=['POST'])
def write_word_bit():
    # ...
    if mode == 'state':
        word_lock = get_word_lock(name)
        
        with word_lock:  # LOCK ADQUIRIDO
            # Lê valor atual
            values = current_app.plc_controller.read_tags([name])
            word = int(values[name]) & 0xFFFF
            
            # Modifica bit
            if val == 1:
                new_word = (word | (1 << bit)) & 0xFFFF
            else:
                new_word = (word & ~(1 << bit)) & 0xFFFF
            
            # Escreve no PLC
            current_app.plc_controller.write_tags({ name: int(new_word) })
            
            # ✅ CRÍTICO: Aguarda DENTRO DO LOCK para PLC processar
            time.sleep(2.0)  # 2 segundos
            
        # LOCK LIBERADO
```

**Pontos importantes:**
- Lock por **WORD** (não por bit) - todas as escritas na mesma WORD são serializadas
- Delay de **2 segundos DENTRO do lock** para garantir que o PLC processou antes de liberar
- Próxima requisição só lê o valor APÓS o delay

### Camada 2: Frontend (JavaScript)

**Arquivo:** `static/scripts/partials/balance.js`

```javascript
// ✅ Sistema de bloqueio baseado em TIMESTAMP (não depende de timers)
let calibrationBlockedUntil = 0; // Timestamp até quando está bloqueado
const CALIBRATION_BLOCK_MS = 6000; // 6 segundos de bloqueio após cada escrita
let lastWaitPopupTime = 0; // Timestamp da última vez que o popup de espera foi mostrado
const WAIT_POPUP_COOLDOWN = 4000; // Mostra popup de espera no máximo a cada 4 segundos

// ✅ Função para verificar se está bloqueado (baseado em timestamp, não em flag)
function isCalibrationBusy() {
    return Date.now() < calibrationBlockedUntil;
}

// ✅ Função para verificar se pode mostrar popup de espera (evita spam)
function canShowWaitPopup() {
    const now = Date.now();
    if (now - lastWaitPopupTime > WAIT_POPUP_COOLDOWN) {
        lastWaitPopupTime = now;
        return true;
    }
    return false;
}

// ✅ Função para bloquear (seta timestamp futuro)
function startCalibrationBlock() {
    // Durante a escrita, bloqueia por tempo maior (escrita pode demorar)
    calibrationBlockedUntil = Date.now() + 15000; // 15s de margem durante escrita
    console.log(`[BALANCE] 🔒 Calibração BLOQUEADA (escrita em andamento)`);
}

// ✅ Função para finalizar (ajusta timestamp para cooldown restante)
function endCalibrationBlock() {
    calibrationBlockedUntil = Date.now() + CALIBRATION_BLOCK_MS;
    console.log(`[BALANCE] ⏳ Escrita concluída - cooldown de ${CALIBRATION_BLOCK_MS/1000}s`);
}
```

## Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ USUÁRIO CLICA EM "CONFIRMAR CALIBRAÇÃO"                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Frontend verifica: isCalibrationBusy()?                                 │
│     │                                                                       │
│     ├─ SIM → Mostra popup "Aguarde..." (se canShowWaitPopup()) → RETORNA   │
│     │                                                                       │
│     └─ NÃO → Continua ↓                                                    │
│                                                                             │
│  2. Frontend: startCalibrationBlock()                                       │
│     └─ calibrationBlockedUntil = Date.now() + 15000 (15s de margem)        │
│                                                                             │
│  3. Frontend: fetch('/api/write_word_bit', {...})                          │
│     │                                                                       │
│     └─ Backend recebe requisição ↓                                         │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BACKEND                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  4. Backend: word_lock = get_word_lock(tag_name)                           │
│                                                                             │
│  5. Backend: with word_lock: (LOCK ADQUIRIDO)                              │
│     │                                                                       │
│     ├─ 5a. Lê valor atual da WORD do PLC                                   │
│     │                                                                       │
│     ├─ 5b. Modifica apenas o bit desejado                                  │
│     │                                                                       │
│     ├─ 5c. Escreve novo valor no PLC                                       │
│     │                                                                       │
│     └─ 5d. time.sleep(2.0) ← AGUARDA 2s DENTRO DO LOCK                     │
│                                                                             │
│  6. Backend: LOCK LIBERADO → Retorna resposta                              │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ FRONTEND (continuação)                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  7. Frontend recebe resposta                                                │
│                                                                             │
│  8. Frontend: endCalibrationBlock()                                         │
│     └─ calibrationBlockedUntil = Date.now() + 6000 (6s de cooldown)        │
│                                                                             │
│  9. LIBERADO para próxima calibração após 6 segundos                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Timeline de Tempos

```
[CLIQUE] ─────────────────────────────────────────────────────────────────────►
    │
    ├── t=0: startCalibrationBlock() → bloqueio por 15s (margem)
    │
    ├── t=0: Requisição enviada ao backend
    │
    ├── t=0.1: Backend adquire lock
    │
    ├── t=0.2: Backend lê WORD, modifica bit, escreve
    │
    ├── t=0.3 a t=2.3: Backend aguarda 2s DENTRO do lock
    │
    ├── t=2.3: Backend libera lock, retorna resposta
    │
    ├── t=2.4: Frontend recebe resposta
    │
    ├── t=2.4: endCalibrationBlock() → cooldown de 6s
    │
    └── t=8.4: calibrationBlockedUntil expira → LIBERADO 🔓

TEMPO TOTAL DE BLOQUEIO: ~8 segundos
```

## Popup de Espera

O popup de espera é mostrado quando o usuário tenta calibrar enquanto o sistema está bloqueado:

```javascript
// Verifica se está bloqueado (escrita em andamento ou cooldown)
if (isCalibrationBusy()) {
    console.log(`[BALANCE] ⏸️ Linha ${lineNumber} bloqueada`);
    // Mostra popup de espera apenas se não foi mostrado recentemente (evita spam)
    if (canShowWaitPopup()) {
        showBalanceToast('⏳ Aguarde alguns segundos e tente novamente', 3000);
    }
    return;
}
```

**Características:**
- Popup aparece por **3 segundos**
- Só aparece novamente após **4 segundos** do último popup (evita spam)
- Não mostra contagem regressiva (mensagem simples)

## Por que Timestamp em vez de Flags?

### ❌ Problema com Flags:
```javascript
let isBlocked = false;
setTimeout(() => { isBlocked = false; }, 5000);
// Se o setTimeout não executar (erro, tab em background), fica bloqueado PARA SEMPRE
```

### ✅ Solução com Timestamp:
```javascript
let blockedUntil = Date.now() + 5000;
function isBlocked() {
    return Date.now() < blockedUntil;  // SEMPRE funciona, baseado no tempo real
}
// Mesmo se algo der errado, o tempo passa e automaticamente libera
```

## Aplicando em Outras Telas

Para aplicar esta lógica em outra tela:

### 1. Backend (se ainda não existir)
Usar o endpoint `/api/write_word_bit` com `mode: 'state'`:
```javascript
fetch('/api/write_word_bit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        name: 'NOME_DA_TAG_WORD',
        bit: numeroDoBit,  // 0-15
        mode: 'state',
        value: 1  // ou 0
    })
});
```

### 2. Frontend - Variáveis de Estado
```javascript
let operationBlockedUntil = 0;
const OPERATION_BLOCK_MS = 6000;  // Ajustar conforme necessidade
let lastWaitPopupTime = 0;
const WAIT_POPUP_COOLDOWN = 4000;
```

### 3. Frontend - Funções de Bloqueio
```javascript
function isOperationBusy() {
    return Date.now() < operationBlockedUntil;
}

function canShowWaitPopup() {
    const now = Date.now();
    if (now - lastWaitPopupTime > WAIT_POPUP_COOLDOWN) {
        lastWaitPopupTime = now;
        return true;
    }
    return false;
}

function startOperationBlock() {
    operationBlockedUntil = Date.now() + 15000;  // Margem durante escrita
}

function endOperationBlock() {
    operationBlockedUntil = Date.now() + OPERATION_BLOCK_MS;
}
```

### 4. Frontend - Uso na Função de Escrita
```javascript
async function handleConfirmOperation() {
    // Verifica bloqueio
    if (isOperationBusy()) {
        if (canShowWaitPopup()) {
            showToast('⏳ Aguarde alguns segundos e tente novamente', 3000);
        }
        return;
    }
    
    // Bloqueia
    startOperationBlock();
    
    try {
        // Executa escrita
        const response = await fetch('/api/write_word_bit', {...});
        // ...
    } finally {
        // Libera com cooldown
        endOperationBlock();
    }
}
```

## Tempos Recomendados

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| Backend sleep | 2s | Tempo dentro do lock para PLC processar |
| Margem durante escrita | 15s | Bloqueio inicial (segurança) |
| Cooldown após escrita | 6s | Tempo mínimo entre operações |
| Popup cooldown | 4s | Intervalo mínimo entre popups |
| Popup duração | 3s | Tempo que o popup fica visível |

## Arquivos Relacionados

- `app/controllers/machines_controller.py` - Endpoint `/api/write_word_bit`
- `static/scripts/partials/balance.js` - Implementação frontend
- `templates/partials/balance.html` - HTML dos modais

## Histórico de Problemas Resolvidos

1. **Race condition em escritas rápidas** → Lock por WORD + delay no backend
2. **Popup travando na tela** → Sistema baseado em timestamp
3. **Popup aparecendo quando não deveria** → Verificação de bloqueio real
4. **Spam de popups** → Cooldown entre popups
5. **selectedLine null** → Verificações de null + stopPropagation nos eventos

