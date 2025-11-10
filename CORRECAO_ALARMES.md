# 🔧 Correção do Sistema de Alarmes

## Problema Identificado

Os alarmes não estavam aparecendo em tela porque o `DataHubController.read_tags([])` retornava um dicionário vazio quando recebia uma lista vazia de tags. Isso fazia com que o processador de alarmes não tivesse dados para processar.

## Correções Realizadas

### 1. `app/services/datahub_controller.py`

#### a) Correção do método `read_tags()`
**ANTES:**
```python
def read_tags(self, tag_names):
    # ... código ...
    result = {}
    with self._cache_lock:
        for tag_name in tag_names:  # Se tag_names for [], loop não executa
            result[tag_name] = self._cache.get(tag_name, None)
    return result  # Retorna {} vazio!
```

**DEPOIS:**
```python
def read_tags(self, tag_names):
    # ... código ...
    with self._cache_lock:
        if not tag_names:
            # Se lista vazia, retorna TODO o cache
            print(f"[DATAHUB_CONTROLLER] read_tags(): Retornando todo o cache ({len(self._cache)} tags)")
            return self._cache.copy()
        
        # Busca valores específicos
        result = {}
        for tag_name in tag_names:
            result[tag_name] = self._cache.get(tag_name, None)
        return result
```

#### b) Correção da contagem de conversões
- Adicionado `converted_count += 1` para todos os tipos de dados (BOOL, BYTE, INT, WORD, DINT, DWORD, REAL)
- Antes só contava REAL, agora conta todos os tipos corretamente

### 2. Logs de Debug Adicionados

#### `static/scripts/partials/grid.js`
- Logs na função `atualizarContadoresAlarme()`
- Mostra resposta da API, resumo de alarmes, e contadores calculados
- Indica quando círculos são marcados com `has-alarms`

#### `static/scripts/partials/alarm.js`
- Logs na função `atualizarIndicadoresAbas()`
- Mostra tipos ativos detectados e quais abas foram marcadas
- Logs na função `atualizarContadoresAlarmes()`

## Como Testar

### 1. Reinicie o Servidor Flask

Pare o servidor (Ctrl+C) e inicie novamente:

```bash
python run.py
```

### 2. Execute o Script de Teste

Em outro terminal:

```bash
python testar_alarmes_endpoint.py
```

O script vai mostrar:
- Status da requisição
- Número de alarmes ativos
- Conteúdo do `alarm_summary`
- JSON completo da resposta

### 3. Verifique o Terminal do Servidor

Procure por estas mensagens:

```
[DATAHUB_CONTROLLER] read_tags(): Retornando todo o cache (XXX tags)
[DATAHUB_CONTROLLER] Convertidas XXX/803 tags com sucesso
[ALARM] base=DB10_PARTIDA_DIRETA_ALARMES_TERMICOS bit=X type=thermal priority=thermal
```

### 4. Abra o Navegador e Verifique o Console (F12)

Recarregue a página (Ctrl+F5) e verifique os logs:

```
[GRID ALARM] Resposta da API /api/alarms: {...}
[GRID ALARM] Resumo de alarmes: {emergency: 0, nr12: 0, drives: 2, ...}
[GRID ALARM] Total de alarmes ativos: X
[GRID ALARM] ✓ Atualizado círculo 'drives': 2
[GRID ALARM] ✓ Círculo 'drives' marcado com has-alarms
```

### 5. Verifique o Grid

No grid principal, os círculos de alarme devem:
- Mostrar números corretos (não "##" ou "00")
- Piscar quando houver alarmes ativos
- Atualizar a cada 2 segundos

### 6. Abra a Tela de Alarmes

Clique em um círculo de alarme:
- Deve abrir a tela de alarmes
- A aba correspondente deve ser selecionada
- Alarmes devem aparecer na lista
- Abas com alarmes devem piscar

## Possíveis Problemas e Soluções

### ❌ "plc_data keys: 0"
**Problema:** DataHub não está retornando dados  
**Solução:** Verifique se o DataHub está rodando (`http://localhost:8000/api/status`)

### ❌ "DBs faltando no DataHub: [901, 911, 921]"
**Problema:** DataHub não tem todas as DBs configuradas  
**Solução:** Adicione as DBs faltantes no arquivo `datahub.py`

### ❌ "alarm_summary está vazio"
**Problema:** Nenhum alarme detectado ou tags de alarme não estão sendo lidas  
**Solução:** 
1. Verifique se o comm_map tem tags de alarme (com "ALARME" no nome)
2. Verifique se essas DBs estão configuradas no DataHub
3. Verifique os arquivos em `alarmes/` com as descrições

### ❌ Círculos mostram "##"
**Problema:** Frontend não consegue conectar ao backend  
**Solução:**
1. Verifique se o servidor está rodando na porta 5000
2. Limpe o cache do navegador (Ctrl+Shift+Delete)
3. Recarregue a página com Ctrl+F5

## Fluxo de Dados Completo

```
DataHub (port 8000)
  ↓ (HTTP GET /api/data)
DataHubController._fetch_from_datahub()
  ↓ (converte DBs para tags)
DataHubController._cache
  ↓ (read_tags([]))
machines_controller.get_alarms()
  ↓ (process_alarm_data)
AlarmProcessor
  ↓ (alarm_summary)
Frontend /api/alarms
  ↓ (JavaScript)
Grid + Tela de Alarmes
```

## Arquivos Modificados

1. ✅ `app/services/datahub_controller.py` - Corrigido read_tags() e contagem
2. ✅ `static/scripts/partials/grid.js` - Adicionados logs de debug
3. ✅ `static/scripts/partials/alarm.js` - Adicionados logs e atualização de contadores
4. ✅ `testar_alarmes_endpoint.py` - Novo script de teste

## Próximos Passos

1. ✅ Execute o script de teste
2. ✅ Verifique os logs do servidor
3. ✅ Verifique o console do navegador
4. ✅ Confirme que os alarmes aparecem no grid e na tela de alarmes

Se ainda houver problemas, compartilhe:
- Output do script `testar_alarmes_endpoint.py`
- Logs do terminal do servidor Flask
- Logs do console do navegador (F12)

