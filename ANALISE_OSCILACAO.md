# 🔬 ANÁLISE PROFISSIONAL - OSCILAÇÃO DE VALORES EM TELA

**Data:** 07/11/2025  
**Problema Relatado:** Valores em tela ficam "caindo e voltando" (oscilando)  
**Arquitetura:** Flask + SocketIO + DataHub (FastAPI) + PLC Siemens S7

---

## 📊 ESTADO ATUAL DO SISTEMA

**DataHub Status:**
- ✅ Conectado ao PLC 700CX (100.70.0.10)
- ✅ Uptime: ~508 segundos
- ✅ Leituras: 891 (0 erros)
- ✅ Polling: 200ms (5 leituras/segundo)

**Problema:** Apesar da conexão estável, valores oscilam na interface (aparecem, desaparecem, reaparecem)

---

## 🔍 CAUSAS IDENTIFICADAS

### 🔴 **CAUSA #1: Cache Parcial com `.update()`** (CRÍTICO)
**Arquivo:** `datahub.py` - Linha 525

```python
# PROBLEMA: Se uma DB falha, mantém valor antigo indefinidamente
new_cache = {}
for db_config in self.dbs:
    data = self.snap7_handler.read_db(db_id, 0, size)
    if data is not None:
        new_cache[db_id] = data

if new_cache:
    with self.cache_lock:
        self.cache.update(new_cache)  # ❌ Mantém DBs antigas não atualizadas!
```

**Impacto:**
- Se DB1 falha temporariamente, mantém dados antigos
- Se DB3 é atualizada, DB1 fica "congelada" no tempo
- Frontend recebe mix de dados novos + dados antigos
- **Resultado:** Valores parecem "oscilar" entre atual e antigo

**Exemplo Real:**
1. T0: DB1=100 (velocidade), DB3=50 (alarme)
2. T1: DB1 falha leitura, DB3=55 → Cache fica {DB1: 100, DB3: 55}
3. T2: DB1=105, DB3=60 → Cache atualiza {DB1: 105, DB3: 60}
4. T3: DB1 falha novamente → Cache fica {DB1: 105, DB3: 65}
5. Frontend vê velocidade "congelada" em 105 enquanto alarme atualiza

---

### 🟡 **CAUSA #2: Conversão Silenciosa de Falhas**
**Arquivo:** `app/services/datahub_controller.py` - Linha 191

```python
def _convert_datahub_to_plc_format(self, datahub_data):
    # ...
    for tag in comm_map:
        try:
            # Conversão pode falhar silenciosamente
            if data_type == 'REAL':
                value = struct.unpack('>f', bytes_data)[0]
                result[tag_name] = value
        except Exception as e:
            # ❌ Continua sem adicionar a tag ao resultado
            print(f"Erro ao converter tag {tag_name}: {e}")
            continue  # Tag não aparece no resultado!
```

**Impacto:**
- Tag que falha conversão simplesmente "desaparece" do resultado
- Frontend recebe dados incompletos aleatoriamente
- Se conversão falha intermitentemente → tag "pisca" (aparece/desaparece)

---

### 🟡 **CAUSA #3: Timeout HTTP Curto**
**Arquivo:** `app/services/datahub_controller.py` - Linha 166-175

```python
# Timeout muito curto pode causar falhas intermitentes
status_response = requests.get(f'{DATAHUB_URL}/api/status', timeout=2)
data_response = requests.get(f'{DATAHUB_URL}/api/data', timeout=2)
```

**Impacto:**
- DataHub tem 30+ DBs para ler
- Se resposta HTTP levar > 2 segundos → timeout
- Controlador marca como "falha" e não atualiza dados
- **Resultado:** Frontend fica com dados desatualizados até próximo polling

---

### 🟡 **CAUSA #4: Race Condition no Frontend**
**Arquivo:** `static/scripts/partials/grid.js` - Sistema de estabilidade

```javascript
// Sistema de estabilidade reduzido para 1 (atualização MUITO rápida)
if (valueStabilityCount >= 1) {
    atualizarVelocidadeRealUI(val);
}
```

**Impacto:**
- Qualquer valor diferente já atualiza imediatamente
- Se dados vêm com "ruído" (conversão incorreta), UI oscila rapidamente
- Sem filtro de estabilidade, qualquer glitch é mostrado

---

### 🟢 **CAUSA #5: Polling Duplo (Não crítico, mas ineficiente)**

**DataHub:** 200ms (5x/segundo)  
**DataHubController:** 1000ms (1x/segundo)

```
DataHub:        |--|--|--|--|--|  (lê PLC)
Controller:          [REQUEST]   (busca HTTP)
Frontend:               [UPDATE]  (atualiza UI)
```

**Impacto Mínimo:** Latência adicional, mas não causa oscilação direta.

---

## 🎯 DIAGNÓSTICO FINAL

### **Cenário Mais Provável:**

1. **DataHub lê todas as DBs a cada 200ms**
2. **Uma ou mais DBs falham temporariamente** (timeout, PLC ocupado, etc.)
3. **Cache mantém valores antigos** dessas DBs (`.update()`)
4. **DataHubController pega snapshot** com mix de dados novos + antigos
5. **Conversão falha** para algumas tags (dados corrompidos/incompletos)
6. **Frontend recebe dados parciais**:
   - Tags que falharam conversão → undefined/null
   - Tags de DBs antigas → valores desatualizados
   - Tags atualizadas → valores corretos
7. **UI oscila:** hora mostra valor correto, hora mostra null/antigo

---

## 🏆 SOLUÇÕES RECOMENDADAS

### ✅ **SOLUÇÃO #1: Cache Completo com Timestamp** (PRIORIDADE MÁXIMA)

**Arquivo:** `datahub.py`

```python
def _read_all_dbs(self):
    # Lê TODAS as DBs antes de atualizar cache
    new_cache = {}
    failed_dbs = []
    
    for db_config in self.dbs:
        db_id = db_config['id']
        size = db_config['size']
        
        data = self.snap7_handler.read_db(db_id, 0, size)
        if data is not None:
            new_cache[db_id] = data
        else:
            failed_dbs.append(db_id)
    
    # ✅ SÓ atualiza se TODAS as DBs críticas foram lidas
    critical_dbs = [1, 3, 4, 101, 200]  # DBs essenciais
    critical_failed = [db for db in failed_dbs if db in critical_dbs]
    
    if not critical_failed:
        # Atualização completa (substitui cache)
        with self.cache_lock:
            self.cache = new_cache.copy()  # ✅ Substitui completamente
            self.last_read_time = datetime.now()
        
        self.read_count += 1
        self._detect_and_notify_changes()
    else:
        # Não atualiza cache - mantém dados consistentes anteriores
        logger.warning(f"⚠️ DBs críticas falharam: {critical_failed} - mantendo cache anterior")
        self.error_count += 1
```

**Benefícios:**
- ✅ Cache sempre consistente (todos os dados da mesma "foto")
- ✅ Não mistura dados novos com antigos
- ✅ Se leitura falha, mantém snapshot anterior completo

---

### ✅ **SOLUÇÃO #2: Aumentar Timeout HTTP**

**Arquivo:** `app/services/datahub_controller.py`

```python
# Aumenta timeout para dar tempo ao DataHub processar 30+ DBs
status_response = requests.get(f'{DATAHUB_URL}/api/status', timeout=5)  # ✅ 2s → 5s
data_response = requests.get(f'{DATAHUB_URL}/api/data', timeout=5)      # ✅ 2s → 5s
```

---

### ✅ **SOLUÇÃO #3: Validação de Dados no Controller**

**Arquivo:** `app/services/datahub_controller.py`

```python
def _convert_datahub_to_plc_format(self, datahub_data):
    # ... conversão ...
    
    # ✅ VALIDAÇÃO: Só retorna se converteu quantidade mínima de tags
    min_required_tags = len(comm_map) * 0.9  # 90% das tags
    
    if converted_count < min_required_tags:
        print(f"[DATAHUB_CONTROLLER] ❌ Dados incompletos: {converted_count}/{len(comm_map)} tags")
        print(f"[DATAHUB_CONTROLLER] ❌ Descartando leitura - mantendo cache anterior")
        return None  # ✅ Não atualiza se dados incompletos
    
    return result
```

---

### ✅ **SOLUÇÃO #4: Sistema de Estabilidade Inteligente no Frontend**

**Arquivo:** `static/scripts/partials/grid.js`

```javascript
// Sistema de estabilidade com filtro de outliers
const STABILITY_WINDOW = 3;  // 3 leituras consecutivas
let valueHistory = [];

socket.on('telemetry', data => {
    const val = pickSpeedValue(data);
    
    if (val != null) {
        valueHistory.push(val);
        
        // Mantém apenas últimas N leituras
        if (valueHistory.length > STABILITY_WINDOW) {
            valueHistory.shift();
        }
        
        // ✅ Atualiza apenas se:
        // 1. Valor é estável (repetiu pelo menos 2x)
        // 2. OU valor mudou significativamente (>5%)
        if (valueHistory.length >= 2) {
            const lastVal = valueHistory[valueHistory.length - 1];
            const prevVal = valueHistory[valueHistory.length - 2];
            
            const isStable = lastVal === prevVal;
            const isSignificantChange = Math.abs(lastVal - prevVal) / prevVal > 0.05;
            
            if (isStable || isSignificantChange) {
                atualizarVelocidadeRealUI(lastVal);
            }
        }
    } else {
        // ✅ null não limpa histórico imediatamente (tolera 1 falha)
        if (valueHistory.length > 0) {
            // Usa último valor válido
            atualizarVelocidadeRealUI(valueHistory[valueHistory.length - 1]);
        }
    }
});
```

---

## 📋 PLANO DE AÇÃO RECOMENDADO

### **Fase 1: Correções Críticas (Aplicar AGORA)**
1. ✅ Corrigir cache do DataHub (`.update()` → substituição completa)
2. ✅ Aumentar timeout HTTP (2s → 5s)
3. ✅ Adicionar validação de dados no controller

### **Fase 2: Melhorias (Próximos dias)**
4. ✅ Implementar sistema de estabilidade inteligente no frontend
5. ✅ Adicionar métricas de qualidade de dados (% sucesso, latência)
6. ✅ Implementar health check endpoint no DataHub

### **Fase 3: Otimizações (Futuro)**
7. ⏭️ Considerar cache Redis para dados PLC
8. ⏭️ Implementar compressão HTTP (gzip)
9. ⏭️ WebSocket direto DataHub → Flask (eliminar polling HTTP)

---

## 🧪 TESTES RECOMENDADOS

Após aplicar correções, testar:

1. **Teste de Estresse:**
   ```bash
   # Simular leitura falha em DB crítica
   # Verificar se cache NÃO oscila
   ```

2. **Teste de Latência:**
   ```bash
   # Medir tempo entre mudança no PLC e atualização na tela
   # Deve ser < 2 segundos
   ```

3. **Teste de Estabilidade:**
   ```bash
   # Deixar sistema rodando 30 minutos
   # Verificar se valores continuam estáveis
   ```

---

## 📊 MÉTRICAS DE SUCESSO

Após correções, sistema deve apresentar:

- ✅ **0 oscilações** em valores estáveis
- ✅ **< 2s** latência média (PLC → Tela)
- ✅ **> 99%** taxa de sucesso em leituras
- ✅ **0 mix** de dados novos com antigos

---

## 📚 REFERÊNCIAS

- DataHub: `datahub.py`
- Controller: `app/services/datahub_controller.py`
- Frontend: `static/scripts/partials/grid.js`
- Alarm Processor: `app/services/alarm_processor.py`

---

**Conclusão:** O problema de oscilação é causado principalmente pelo **cache parcial** no DataHub. A correção é simples mas crítica: substituir `.update()` por atribuição completa do cache, garantindo que todos os dados sejam sempre da mesma "fotografia" do PLC.

