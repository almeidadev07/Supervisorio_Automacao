# Sistema de Reconexão Automática com PLC

## Visão Geral

O sistema de supervisório agora possui reconexão automática robusta com PLCs Siemens S7. Quando o PLC é desligado e religado, o servidor detecta automaticamente a perda de conexão e tenta reconectar sem necessidade de reiniciar o servidor.

## Funcionalidades Implementadas

### 1. Detecção Inteligente de Falhas
- **Verificação de saúde da conexão**: A cada 10 segundos, o sistema verifica se a conexão TCP está realmente funcional
- **Detecção de falhas consecutivas**: Após 3 falhas consecutivas, inicia tentativas de reconexão
- **Monitoramento contínuo**: O loop de polling detecta imediatamente quando a conexão é perdida

### 2. Sistema de Reconexão Robusto
- **Retry com backoff exponencial**: Tenta reconectar com intervalos crescentes (1s, 2s, 4s)
- **Limpeza forçada de conexões**: Destrói completamente a conexão anterior antes de tentar nova
- **Tentativas periódicas**: Quando desconectado, tenta reconectar a cada 5 segundos
- **Múltiplas tentativas**: Até 3 tentativas por ciclo de reconexão

### 3. Verificação de Saúde da Conexão TCP
- **Detecção de conexões "mortas"**: Identifica conexões TCP que o snap7 reporta como conectadas mas não funcionam
- **Teste de funcionalidade**: Executa `get_cpu_info()` para verificar se a conexão está realmente funcional
- **Verificação periódica**: A cada 10 segundos durante operação normal

### 4. Detecção Automática de PLCs Disponíveis
- **Detecção inteligente**: Verifica PLCs disponíveis apenas quando desconectado
- **Verificação via snap7**: Confirma que é realmente um PLC (não apenas ping)
- **Troca automática**: Troca automaticamente para um PLC real quando disponível
- **Priorização inteligente**: Prioriza PLCs reais sobre mocks (700CX > 400CX > 200CX)
- **Sem varredura desnecessária**: Para de verificar IPs quando PLC está conectado

### 5. API para Controle Manual
- **Endpoint**: `POST /api/force_reconnect` - Força reconexão imediata
- **Endpoint**: `POST /api/detect_plcs` - Força detecção de PLCs disponíveis
- **Funcionalidade**: Permite controle manual para testes ou situações específicas

## Como Funciona

### Fluxo de Reconexão Automática

1. **Detecção de Falha**:
   ```
   PLC desconectado → Sistema detecta falha → Inicia contador de falhas consecutivas
   ```

2. **Tentativa de Reconexão**:
   ```
   Falhas consecutivas ≥ 3 → Força desconexão completa → Cria novo cliente snap7 → Tenta conectar
   ```

3. **Backoff Exponencial**:
   ```
   Tentativa 1: Aguarda 1s
   Tentativa 2: Aguarda 2s  
   Tentativa 3: Aguarda 4s
   ```

4. **Tentativas Periódicas**:
   ```
   Se ainda desconectado → Aguarda 5s → Tenta novamente
   ```

### Logs de Monitoramento

O sistema gera logs detalhados para monitoramento:

```
[PLC] Driver desconectado (falha 1/3)
[PLC] Tentando reconectar (falha 3/3)
[S7] Tentativa de conexão 1/3 para 100.70.0.10
[S7] Conectado usando rack=0, slot=1
[PLC] Reconexão bem-sucedida na tentativa 1
[PLC] Reconexão bem-sucedida!
```

## Testando o Sistema

### 1. Teste Básico de Conexão
```bash
python teste.py
```

### 2. Teste de Reconexão Automática
1. Execute o servidor: `python app.py`
2. Observe que a conexão com o PLC é estabelecida
3. **Desligue o PLC fisicamente**
4. Observe nos logs as tentativas de reconexão
5. **Ligue o PLC novamente**
6. A conexão deve ser restabelecida automaticamente em até 5 segundos

### 3. Teste de Reconexão Manual
```bash
curl -X POST http://localhost:5000/api/force_reconnect
```

### 4. Teste de Detecção Automática de PLCs
```bash
curl -X POST http://localhost:5000/api/detect_plcs
```

### 5. Teste Completo do Cenário Descrito
1. Execute o servidor: `python app.py`
2. **Com o PLC desligado**: Observe que o sistema NÃO cria nenhum driver (sem conexão)
3. **Ligue o PLC real** (100.70.0.10)
4. **Aguarde até 5 segundos**: O sistema deve detectar automaticamente o PLC real e criar conexão
5. **Verifique os logs**: Deve aparecer "Detectado PLC disponível: 700CX (sem driver inicial)"
6. **Confirme a conexão**: A conexão deve ser criada automaticamente para o PLC real

## Configurações

### Timeouts e Intervalos
- **Timeout de conexão**: 5 segundos
- **Timeout de leitura**: 2 segundos  
- **Intervalo de verificação de saúde**: 10 segundos
- **Intervalo de tentativas de reconexão**: 5 segundos
- **Intervalo de detecção de PLCs (sem driver)**: 5 segundos
- **Intervalo de detecção de PLCs (desconectado)**: 5 segundos
- **Intervalo de detecção de PLCs (conectado)**: 20 segundos
- **Máximo de falhas consecutivas**: 3

### Parâmetros Ajustáveis
No arquivo `app/services/plc_controller.py`:
```python
self._connection_retry_interval = 5.0  # Segundos entre tentativas
self._plc_detection_interval = 10.0    # Segundos entre detecções de PLCs
max_consecutive_failures = 3           # Falhas antes de tentar reconectar
```

No arquivo `app/plc_drivers/siemens_s7.py`:
```python
self._health_check_interval = 10.0     # Segundos entre verificações de saúde
max_retries = 3                        # Tentativas de conexão
```

## Eventos Socket.IO

O sistema emite eventos para o frontend:

- **`plc_connection_changed`**: Estado da conexão mudou
- **`plc_reconnected`**: PLC foi reconectado com sucesso'
- **`plc_detected`**: PLC foi detectado e conectado automaticamente
- **`force_reload`**: Força atualização da página (usado quando PLC é detectado)
- **`telemetry`**: Dados de telemetria (inclui `plc_connected: true/false`)

## Solução de Problemas

### PLC não reconecta automaticamente
1. Verifique se o IP do PLC está correto
2. Confirme que o PLC está realmente ligado e em RUN
3. Verifique os logs para erros específicos
4. Tente reconexão manual via API

### Conexão instável
1. Verifique a qualidade da rede
2. Ajuste os timeouts se necessário
3. Considere usar cabo de rede ao invés de WiFi

### Logs de erro
- **"snap7 not installed"**: Instale a biblioteca snap7
- **"TCP reset by peer"**: Normal durante reconexão, será tratado automaticamente
- **"Connection refused"**: PLC não está ligado ou IP incorreto

## Benefícios

✅ **Sem necessidade de reiniciar o servidor**  
✅ **Detecção rápida de falhas de conexão**  
✅ **Reconexão automática robusta**  
✅ **Detecção automática de PLCs disponíveis**  
✅ **Criação automática de driver quando PLC é detectado**  
✅ **Sem driver inicial quando não há PLCs disponíveis**  
✅ **Priorização inteligente de PLCs**  
✅ **Atualização automática do frontend**  
✅ **Verificação via snap7 (não apenas ping)**  
✅ **Sem varredura desnecessária quando conectado**  
✅ **Logs detalhados para monitoramento**  
✅ **API para controle manual**  
✅ **Verificação de saúde da conexão TCP**  
✅ **Backoff exponencial para evitar sobrecarga**  

## Compatibilidade

- **PLCs Siemens S7-300/400/1200/1500**
- **Protocolo S7 (snap7)**
- **Python 3.7+**
- **Flask + Socket.IO**
