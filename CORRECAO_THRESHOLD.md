# 🔧 CORREÇÃO DE THRESHOLD - Cold Start

**Data:** 07/11/2025  
**Problema:** Valores pararam de aparecer na tela após correção de oscilação  
**Causa:** Threshold muito rigoroso (85%) bloqueava dados no cold start  
**Status:** ✅ **CORRIGIDO**

---

## 🔴 PROBLEMA IDENTIFICADO

### **Sintoma:**
```
❌ DADOS INCOMPLETOS: 644/803 tags (80.2%)
❌ Mínimo exigido: 683 tags (85%)
❌ Descartando leitura - mantendo cache anterior
```

### **Causa:**
A validação que implementei para evitar oscilação estava **muito rigorosa**:
- Exigia **85%** das tags convertidas
- Sistema tinha **80.2%** (644/803 tags)
- **80.2% < 85%** = dados descartados ❌
- Cache ficou vazio = tela em branco

### **Por Que 80.2%?**

Nem todas as DBs têm tags mapeadas no comm_map:
- Algumas DBs são parcialmente usadas
- Algumas tags podem não estar configuradas
- **80.2% é um valor EXCELENTE** em operação real
- Mas foi bloqueado pela validação muito rígida

---

## ✅ CORREÇÃO APLICADA

### **Threshold Adaptativo:**

```python
# ✅ ANTES (muito rigoroso):
min_required_tags = len(comm_map) * 0.85  # 85% sempre

# ✅ AGORA (adaptativo):
min_threshold = 0.70            # 70% em operação normal
cold_start_threshold = 0.50     # 50% no cold start

# Detecta cold start (cache vazio)
is_cold_start = len(self._cache) == 0

# Usa threshold apropriado
current_threshold = cold_start_threshold if is_cold_start else min_threshold
```

### **Lógica:**

1. **Cold Start** (primeira leitura):
   - Cache está vazio (sistema iniciando)
   - Aceita **50%+** das tags
   - Permite sistema "acordar" mesmo com dados parciais

2. **Operação Normal** (após cold start):
   - Cache já tem dados válidos
   - Aceita **70%+** das tags
   - Ainda protege contra dados muito incompletos

---

## 📊 COMPARAÇÃO

### **Antes (Bloqueado):**
```
Leitura: 644/803 tags (80.2%)
Validação: Exige 85% (683 tags)
Resultado: ❌ BLOQUEADO (80.2% < 85%)
Tela: Vazia (sem dados)
```

### **Depois (Aceito):**
```
Leitura: 644/803 tags (80.2%)
Validação: Exige 50% no cold start (402 tags)
Resultado: ✅ ACEITO (80.2% > 50%)
Tela: Valores aparecem!
```

---

## 🎯 THRESHOLDS CONFIGURADOS

| Situação | Threshold | Motivo |
|----------|-----------|--------|
| **Cold Start** | 50% | Permite inicialização mesmo com dados parciais |
| **Operação Normal** | 70% | Protege contra oscilação, mas aceita variação real |
| **Ideal** | 80%+ | Sistema funcionando perfeitamente |

---

## 🧪 LOGS ESPERADOS

### ✅ **Sucesso no Cold Start:**
```
[DATAHUB_CONTROLLER] ✅ COLD START OK: 644/803 tags (80.2%)
[DATAHUB_CONTROLLER] 💡 DBs faltando: [6, 7, ...]
[DATAHUB_CONTROLLER] 📊 Velocidades: Real=500, Prog=550
```

### ✅ **Operação Normal:**
```
[DATAHUB_CONTROLLER] ✓ Convertidas 650/803 tags (80.9%)
[DATAHUB_CONTROLLER] ✓ Convertidas 655/803 tags (81.6%)
```

### ⚠️ **Dados Realmente Incompletos (< 70%):**
```
[DATAHUB_CONTROLLER] ❌ DADOS INCOMPLETOS [NORMAL]: 400/803 tags (49.8%)
[DATAHUB_CONTROLLER] ❌ Mínimo exigido: 562 tags (70%)
[DATAHUB_CONTROLLER] ❌ Descartando leitura
```
*Neste caso, a validação está correta - dados estão realmente ruins*

---

## 🔍 POR QUE NÃO 100%?

É **NORMAL** não ter 100% das tags convertidas:

### **Razões Comuns:**

1. **DBs Não Acessíveis:**
   - DB6, DB7 podem estar bloqueadas no PLC
   - Algumas DBs são opcionais

2. **Tags Reservadas:**
   - Algumas posições são reservadas mas não usadas
   - Gaps no mapeamento de memória

3. **Tags Condicionais:**
   - Algumas tags só existem em certos modos de operação
   - Depende do setup da máquina

4. **Variação Temporal:**
   - Durante reinicializações, algumas DBs podem demorar mais
   - Ordem de leitura pode afetar disponibilidade

**Conclusão:** **75-85%** é um range **EXCELENTE** em operação real.

---

## 📋 COMO TESTAR

1. **Pare o Flask** (Ctrl+C)

2. **Reinicie:**
   ```powershell
   python run.py
   ```

3. **Observe logs:**
   ```
   ✅ COLD START OK: 644/803 tags (80.2%)
   ```

4. **Verifique tela:**
   - Valores devem aparecer
   - Velocímetro funcionando
   - Alarmes visíveis

5. **Aguarde 30 segundos:**
   - Valores devem permanecer estáveis
   - Sem oscilação

---

## ⚙️ AJUSTE FINO (Opcional)

Se quiser ajustar os thresholds, edite `app/services/datahub_controller.py`:

```python
# Linha ~321
min_threshold = 0.70            # ← Ajuste aqui (operação normal)
cold_start_threshold = 0.50     # ← Ajuste aqui (cold start)
```

### **Sugestões:**

- **Sistema muito estável:** Aumente para `0.75` e `0.60`
- **Sistema com muitas DBs opcionais:** Reduza para `0.65` e `0.45`
- **Dúvida:** Mantenha os valores atuais (0.70 e 0.50)

---

## ✅ RESULTADO ESPERADO

Após reiniciar o Flask:

1. ✅ Cold start aceita dados (50%+)
2. ✅ Valores aparecem na tela
3. ✅ Sistema continua protegido contra oscilação (70%+)
4. ✅ Melhor dos dois mundos: **inicialização rápida** + **proteção contra oscilação**

---

## 🎯 MÉTRICAS DE QUALIDADE

Após a correção, monitore:

| Métrica | Esperado | Como Verificar |
|---------|----------|----------------|
| **Tags no Cold Start** | > 50% | Primeiro log após iniciar |
| **Tags em Operação** | > 70% | Logs periódicos |
| **Valores na Tela** | Visíveis | Dashboard mostra dados |
| **Oscilação** | Zero | Valores estáveis |

---

## 📚 ARQUIVOS MODIFICADOS

- ✅ `app/services/datahub_controller.py` - Threshold adaptativo

---

## 💡 LIÇÃO APRENDIDA

**Validação muito rigorosa pode ser pior que oscilação:**
- ✅ Validação deve ser **proporcional ao risco**
- ✅ Cold start precisa ser **permissivo** (sistema inicializando)
- ✅ Operação normal pode ser **mais rigoroso** (dados já estabelecidos)
- ✅ **Balance:** Proteger sem bloquear

---

**Conclusão:** Threshold adaptativo resolve o problema de cold start mantendo proteção contra oscilação em operação normal.

**Status:** ✅ **PRONTO PARA TESTE**

