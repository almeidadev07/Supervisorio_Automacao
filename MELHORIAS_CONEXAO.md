# Melhorias na Estabilidade da Conexão PLC

## Problemas Identificados e Corrigidos

### 1. **Timeouts Inadequados**
- **Problema**: Timeouts muito baixos causavam desconexões prematuras
- **Solução**: 
  - Aumentou timeout de conexão de 5s para 10s
  - Aumentou timeout de leitura de 2s para 5s
  - Aumentou timeout de ping de 500ms para 1000ms

### 2. **Loop de Polling Complexo**
- **Problema**: Lógica confusa com múltiplas condições aninhadas
- **Solução**: 
  - Reescrito o `_poll_loop` com lógica simplificada
  - Separado em métodos específicos: `_handle_no_connection` e `_handle_connected_reading`
  - Implementado polling adaptativo baseado na estabilidade

### 3. **Verificação de Saúde Agressiva**
- **Problema**: Verificação de saúde muito frequente (10s) causava overhead
- **Solução**: 
  - Aumentou intervalo de verificação de saúde para 30s
  - Melhorou verificação de saúde com logs mais informativos
  - Implementou contador de falhas consecutivas

### 4. **Falta de Backoff Exponencial**
- **Problema**: Tentativas de reconexão muito frequentes sobrecarregavam o PLC
- **Solução**: 
  - Implementou backoff exponencial com limite máximo
  - Aumentou intervalos entre tentativas de reconexão
  - Adicionou limite máximo de tentativas de reconexão

### 5. **Tratamento de Erros Inadequado**
- **Problema**: Erros não eram tratados adequadamente, causando loops infinitos
- **Solução**: 
  - Melhorou tratamento de exceções em todos os métodos
  - Adicionou logs mais informativos com emojis para facilitar debug
  - Implementou contadores de falhas consecutivas

## Melhorias Implementadas

### Driver Siemens S7 (`app/plc_drivers/siemens_s7.py`)

1. **Timeouts Robustos**:
   ```python
   self._connection_timeout = 10.0  # Timeout para conexão
   self._read_timeout = 5.0         # Timeout para leitura
   self._health_check_interval = 30.0  # Verificação de saúde
   ```

2. **Backoff Exponencial**:
   ```python
   retry_delay = min(retry_delay * 1.5, 30.0)  # Backoff limitado
   ```

3. **Contador de Retry**:
   ```python
   self._connection_retry_count = 0
   self._max_connection_retries = 5
   ```

4. **Verificação de Saúde Melhorada**:
   ```python
   def _check_connection_health(self) -> bool:
       cpu_info = self.client.get_cpu_info()
       if cpu_info:
           print(f'[S7] ✅ Verificação de saúde OK - CPU: {cpu_info.get("ModuleTypeName")}')
           return True
   ```

### PLC Controller (`app/services/plc_controller.py`)

1. **Loop de Polling Simplificado**:
   ```python
   def _poll_loop(self):
       # FASE 1: Verifica se precisa detectar PLCs
       if not self.driver or not self.driver.is_connected():
           self._handle_no_connection(current_time)
           continue
       
       # FASE 2: Driver conectado - tenta ler dados
       success = self._handle_connected_reading(current_time)
   ```

2. **Polling Adaptativo**:
   ```python
   if success:
       self._polling_interval = max(0.5, self._polling_interval * 0.9)  # Reduz quando estável
   else:
       self._polling_interval = min(5.0, self._polling_interval * 1.1)  # Aumenta quando instável
   ```

3. **Intervalos Configuráveis**:
   ```python
   self._connection_retry_interval = 5.0      # Reconexão a cada 5s
   self._plc_detection_interval = 10.0        # Detecção a cada 10s
   self._polling_interval = 1.0               # Polling base de 1s
   ```

### Utils (`app/utils.py`)

1. **Ping Melhorado**:
   ```python
   def ping_ip(ip_address: str, timeout_ms: int = 1000) -> bool:
       # Timeout maior e tratamento de exceções melhorado
   ```

2. **Detecção de PLCs Robusta**:
   ```python
   def detect_by_reachable_plc(configs):
       # Logs detalhados e priorização de PLCs
       # Verificação mais robusta com snap7
   ```

## Configurações Adicionais

### Arquivo de Configuração (`app/config/connection_config.json`)
```json
{
  "connection_settings": {
    "timeouts": {
      "connection": 10.0,
      "read": 5.0,
      "ping": 1000
    },
    "retry_settings": {
      "max_connection_retries": 5,
      "base_retry_delay": 2.0,
      "max_retry_delay": 30.0
    },
    "polling_settings": {
      "base_interval": 1.0,
      "min_interval": 0.5,
      "max_interval": 5.0
    }
  }
}
```

### Script de Teste (`test_connection_stability.py`)
- Testa detecção de PLCs
- Testa estabilidade da conexão por período configurável
- Gera relatório de taxa de sucesso

## Como Usar

1. **Executar o sistema**:
   ```bash
   python app.py
   ```

2. **Testar estabilidade**:
   ```bash
   python test_connection_stability.py
   ```

3. **Monitorar logs**:
   - Logs agora incluem emojis para facilitar identificação
   - `[S7]` - Driver Siemens S7
   - `[PLC]` - PLC Controller
   - `[DETECT]` - Detecção de PLCs
   - `[PING]` - Testes de ping

## Benefícios Esperados

1. **Maior Estabilidade**: Conexões mais estáveis com menos desconexões
2. **Recuperação Automática**: Reconexão automática mais eficiente
3. **Melhor Performance**: Polling adaptativo reduz overhead
4. **Debug Facilitado**: Logs mais informativos e organizados
5. **Configurabilidade**: Parâmetros ajustáveis via arquivo de configuração

## Monitoramento

- **Taxa de Sucesso**: Deve ser >= 95% para conexão estável
- **Tempo de Reconexão**: Máximo 30 segundos com backoff exponencial
- **Intervalo de Polling**: Adapta-se automaticamente (0.5s a 5s)
- **Verificação de Saúde**: A cada 30 segundos quando conectado
