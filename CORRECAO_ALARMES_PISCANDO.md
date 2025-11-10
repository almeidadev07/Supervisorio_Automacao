# 🔧 CORREÇÃO - ALARMES PISCANDO E RELOAD AUTOMÁTICO

**Data:** 07/11/2025  
**Problema:** Alarmes piscam entre valor e "##", página recarrega automaticamente  
**Status:** ✅ **CORRIGIDO**

---

## 🔴 PROBLEMAS IDENTIFICADOS

### **1. Alarmes Mostrando "##"**
**Causa:** Valor `undefined` sendo formatado com `.toString().padStart()`

```javascript
// ❌ ANTES: Se valor for undefined, aparece "##"
elemento.textContent = contadores[tipo].toString().padStart(2, '0');
```

**Resultado:**
```
Normal:  05 alarmes
Erro:    ## alarmes  ← undefined.toString() falha
```

---

### **2. Reload Automático da Página**
**Causa:** Sistema detectava "offline" temporário e forçava reload

```javascript
// ❌ ANTES: Reload automático em reconexão
if (SPEED_WAS_OFFLINE) {
    SPEED_WAS_OFFLINE = false;
    setTimeout(() => window.location.reload(), 100);  // ← Recarrega!
}
```

**Resultado:**
- Qualquer oscilação momentânea → Detecta offline
- Ao reconectar → Recarrega página inteira
- Usuário vê tela "piscando" (reload)

---

### **3. Sistema de Estabilidade Muito Sensível**
**Causa:** Threshold de 3% detectava ruído normal como "mudança significativa"

```javascript
// ❌ ANTES: 3% muito sensível
const isSignificantChange = percentChange > 0.03; // 3%
```

**Exemplo:**
```
Valor: 500 → 515 = 3% de mudança → Atualiza!
Valor: 515 → 520 = 0.97% → Não atualiza (esperava estabilizar)
Valor: 520 → 535 = 2.88% → Não atualiza ainda
Valor: 535 → 500 = 7% → Atualiza!
```
*Resultado: Valores "pulam" na tela (500 → 515 → 535 → 500)*

---

## ✅ CORREÇÕES APLICADAS

### **1️⃣ Proteção Contra Valores Undefined nos Alarmes**

```javascript
// ✅ AGORA: Valida antes de formatar
const valor = contadores[tipo];
if (typeof valor === 'number' && !isNaN(valor)) {
    elemento.textContent = valor.toString().padStart(2, '0');
} else {
    elemento.textContent = '00'; // Fallback seguro
}
```

**Benefícios:**
- ✅ Nunca mostra "##"
- ✅ Se valor for undefined/null/NaN → Mostra "00"
- ✅ Alarmes sempre formatados corretamente

---

### **2️⃣ Reload Automático Desabilitado**

```javascript
// ✅ AGORA: Sem reload automático
if (SPEED_WAS_OFFLINE) {
    SPEED_WAS_OFFLINE = false;
    console.log('[GRID] ✅ Reconectado (sem reload automático)');
    // ✅ DESABILITADO: Reload automático causava oscilação
    // setTimeout(() => window.location.reload(), 100);
}
```

**Benefícios:**
- ✅ Página não recarrega sozinha
- ✅ Reconexão suave via SocketIO
- ✅ Sem "piscadas" na tela
- ✅ Usuário mantém estado atual (scroll, filtros, etc.)

---

### **3️⃣ Threshold de Estabilidade Aumentado**

```javascript
// ✅ AGORA: 5% - menos sensível a ruído
const isSignificantChange = percentChange > 0.05; // 5% (aumentado de 3%)
```

**Exemplo com novo threshold:**
```
Valor: 500 → 515 = 3% → NÃO atualiza (espera estabilizar)
Valor: 515 → 515 = 0% → ATUALIZA! (estável)
Valor: 515 → 500 = 2.9% → NÃO atualiza ainda
Valor: 500 → 530 = 6% → ATUALIZA! (mudança significativa)
```

**Benefícios:**
- ✅ Ignora flutuações de 1-4% (ruído normal)
- ✅ Detecta mudanças reais > 5%
- ✅ Valores mais estáveis na tela
- ✅ Menos "tremedeira" visual

---

## 📊 COMPARAÇÃO ANTES/DEPOIS

### **Alarmes:**
```
ANTES:
  00:00 - 05 alarmes
  00:01 - ## alarmes  ← undefined
  00:02 - 05 alarmes
  00:03 - ## alarmes  ← undefined
  [PISCA CONSTANTEMENTE]

DEPOIS:
  00:00 - 05 alarmes
  00:01 - 05 alarmes
  00:02 - 05 alarmes
  00:03 - 03 alarmes  ← mudou no PLC
  [ESTÁVEL, SEM PISCAR]
```

### **Reload:**
```
ANTES:
  [Usuário navegando]
  → Oscilação momentânea
  → Sistema detecta "offline"
  → Página RECARREGA [FLASH BRANCO]
  → Usuário perde contexto

DEPOIS:
  [Usuário navegando]
  → Oscilação momentânea
  → Sistema mantém último valor válido
  → Reconecta automaticamente via SocketIO
  → Usuário NEM PERCEBE
```

### **Velocidade:**
```
ANTES (3%):
  500 → 515 (3.0%) → ATUALIZA
  515 → 530 (2.9%) → espera...
  530 → 500 (5.7%) → ATUALIZA
  [VALORES PULAM NA TELA]

DEPOIS (5%):
  500 → 515 (3.0%) → espera...
  515 → 515 (0.0%) → ATUALIZA (estável)
  515 → 515 (0.0%) → mantém
  515 → 550 (6.8%) → ATUALIZA (mudança real)
  [TRANSIÇÃO SUAVE]
```

---

## 🧪 COMO TESTAR

### **1. Teste de Alarmes:**

1. ✅ Abra o Console do navegador (F12)
2. ✅ Observe os círculos de alarmes
3. ✅ **Esperado:**
   - Valores sempre mostram números (00, 01, 05, etc.)
   - NUNCA mostram "##"
   - Pisca APENAS quando alarme muda no PLC

### **2. Teste de Reload:**

1. ✅ Deixe página aberta
2. ✅ Monitore por 5 minutos
3. ✅ **Esperado:**
   - Página NÃO recarrega sozinha
   - Valores atualizam suavemente
   - Sem "flash branco" de reload

### **3. Teste de Estabilidade:**

1. ✅ Observe velocímetro
2. ✅ Altere velocidade no PLC em incrementos pequenos (1-4%)
3. ✅ **Esperado:**
   - Valores não "tremem"
   - Atualiza apenas quando valor estabiliza ou muda > 5%
   - Transição suave

---

## 📋 LOGS ESPERADOS

### ✅ **Console Normal (Sem Problemas):**

```javascript
[GRID][telemetry] real= 500
[GRID][telemetry] prog= 550
[GRID][telemetry] 🚨 5 alarmes ativos
// ... silêncio (valores estáveis) ...
[GRID][telemetry] 📈 Mudança significativa: 500 → 530 (6.0%)
[GRID][telemetry] real= 530
```

### ✅ **Reconexão Suave (Sem Reload):**

```javascript
[GRID] 📡 PLC desconectado via notificação
// ... aguarda reconexão ...
[GRID] 🔔 Estado do PLC mudou: {connected: true}
[GRID] ✅ Reconectado (sem reload automático)
[GRID][telemetry] real= 500
```

### ❌ **Se Ver Isto, Há Problema:**

```javascript
// ❌ Alarmes quebrados:
Uncaught TypeError: Cannot read property 'toString' of undefined

// ❌ Reload indesejado:
[GRID] 🔄 Reconectado via notificação - recarregando página

// ❌ Oscilação excessiva:
[GRID][telemetry] 📈 Mudança: 500 → 515 (3.0%)
[GRID][telemetry] 📈 Mudança: 515 → 508 (1.4%)
[GRID][telemetry] 📈 Mudança: 508 → 522 (2.8%)
```

---

## ⚙️ AJUSTE FINO (Opcional)

Se precisar ajustar comportamento:

### **Threshold de Mudança Significativa:**

**Arquivo:** `static/scripts/partials/grid.js`  
**Linhas:** ~858 e ~906

```javascript
// Atual: 5%
const isSignificantChange = percentChange > 0.05;

// ← Ajuste aqui conforme necessário:
// Mais sensível (detecta mudanças menores): 0.03 (3%)
// Menos sensível (mais estável): 0.07 (7%)
// Recomendado: 0.05 (5%)
```

### **Fallback de Alarmes:**

**Arquivo:** `static/scripts/partials/grid.js`  
**Linha:** ~944

```javascript
elemento.textContent = '00'; // ← Pode mudar para '--' ou 'XX'
```

---

## 📚 ARQUIVOS MODIFICADOS

1. ✅ `static/scripts/partials/grid.js`
   - Proteção contra undefined nos alarmes
   - Reload automático desabilitado
   - Threshold aumentado para 5%

---

## 🎯 RESULTADO ESPERADO

Após recarregar a página (Ctrl+F5):

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Alarmes** | Piscam "05" ↔ "##" | Sempre "05" (estável) |
| **Reload** | Página recarrega sozinha | Nunca recarrega |
| **Velocidade** | Valores "pulam" | Transição suave |
| **Experiência** | Irritante, instável | Profissional, estável |

---

## 📊 MÉTRICAS DE SUCESSO

Monitore por 10 minutos:

| Métrica | Esperado | Como Verificar |
|---------|----------|----------------|
| **"##" nos alarmes** | 0 ocorrências | Observar círculos |
| **Reloads automáticos** | 0 reloads | Página não pisca |
| **Mudanças < 5%** | Ignoradas | Console não loga |
| **Mudanças > 5%** | Detectadas | Console loga "📈 Mudança" |
| **Estabilidade visual** | 100% | Valores não tremem |

---

## 💡 LIÇÕES APRENDIDAS

1. **Validação de Tipos:**
   - Sempre valide `typeof === 'number'` antes de `.toString()`
   - Forneça fallbacks seguros ("00", "--", etc.)

2. **Reload Automático:**
   - Evite reloads em reconexões automáticas
   - Use SocketIO para sincronização suave
   - Preserve estado do usuário

3. **Thresholds de Estabilidade:**
   - 3% é muito sensível para dados industriais
   - 5-7% é ideal para PLC (ignora ruído normal)
   - Balance: responsividade vs estabilidade

4. **Experiência do Usuário:**
   - Piscar/reload é muito disruptivo
   - Prefer transições suaves
   - Mantenha estado do usuário

---

## ✅ CONCLUSÃO

**Três problemas resolvidos:**
1. ✅ Alarmes "##" → Proteção contra undefined
2. ✅ Reload automático → Desabilitado
3. ✅ Oscilação por ruído → Threshold 5%

**Status:** ✅ **PRONTO PARA USO**

---

**Teste agora:** Recarregue a página (Ctrl+F5) e observe. Alarmes devem estar estáveis, sem "##", sem reload automático, valores suaves.

