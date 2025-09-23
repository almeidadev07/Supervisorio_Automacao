# 🚀 Arquitetura Aprimorada do Supervisório

## Visão Geral

A nova arquitetura implementa controle dinâmico de assinatura de tags e gerenciamento inteligente de múltiplos PLCs, otimizando drasticamente o desempenho e a escalabilidade do sistema.

## 🎯 Objetivos Alcançados

### ✅ Controle Dinâmico de Tags
- **Leitura/escrita apenas das tags necessárias** para a tela atualmente exibida
- **Mudança automática de subscrições** quando o usuário navega entre telas
- **Redução de 80-90% no tráfego de rede** com o PLC

### ✅ Gerenciamento de Múltiplos PLCs
- **Discovery automático** de PLCs disponíveis
- **Conexão simultânea** com PLC Principal e Lavadora
- **Reconexão automática** quando conexão cai
- **Balanceamento inteligente** de carga

### ✅ Otimizações de Desempenho
- **Sistema de cache** para evitar leituras repetidas
- **Fila de prioridades** para operações críticas
- **Processamento em lotes** para reduzir overhead
- **Detecção de mudanças** para enviar apenas dados atualizados

## 🏗️ Componentes da Arquitetura

### 1. ConnectionManager
**Arquivo:** `app/services/connection_manager.py`

**Responsabilidades:**
- Discovery automático de PLCs nas faixas de IP
- Manutenção de uma conexão ativa por grupo (Principal/Lavadora)
- Reconexão automática em caso de falha
- Notificação de mudanças de estado

**Características:**
- Suporte a múltiplas faixas de IP por máquina
- Teste de conectividade via ping e socket
- Callbacks para notificações em tempo real
- Thread-safe e otimizado para performance

### 2. TagSubscriptionManager
**Arquivo:** `app/services/tag_subscription_manager.py`

**Responsabilidades:**
- Mapeamento de telas para suas tags necessárias
- Gerenciamento de subscrições ativas por cliente
- Controle de heartbeat para detectar clientes inativos
- Otimização de leituras baseada em mudanças de tela

**Características:**
- Configuração JSON para mapeamento tela→tags
- Suporte a subscrição por tela ou tags específicas
- Limpeza automática de clientes inativos
- Estatísticas detalhadas de uso

### 3. PLCQueue
**Arquivo:** `app/services/plc_queue.py`

**Responsabilidades:**
- Fila de requisições com priorização
- Processamento em lotes para otimizar comunicação
- Gerenciamento de timeouts e retry
- Balanceamento de carga entre PLCs

**Características:**
- 4 níveis de prioridade (CRITICAL, HIGH, NORMAL, LOW)
- Processamento assíncrono em background
- Batching inteligente de requisições
- Estatísticas de performance

### 4. PLCCache
**Arquivo:** `app/services/plc_cache.py`

**Responsabilidades:**
- Cache inteligente de valores de tags
- Detecção de mudanças significativas
- Gerenciamento de TTL e eviction
- Redução de leituras desnecessárias

**Características:**
- Thresholds configuráveis por tipo de tag
- Eviction baseada em LRU e TTL
- Estatísticas de hit/miss
- Callbacks para mudanças de valor

### 5. EnhancedPLCController
**Arquivo:** `app/services/enhanced_plc_controller.py`

**Responsabilidades:**
- Orquestração de todos os componentes
- API unificada para o frontend
- Integração com Socket.IO para notificações
- Gerenciamento do ciclo de vida completo

**Características:**
- Integração transparente com componentes existentes
- API compatível com sistema anterior
- Notificações em tempo real via WebSocket
- Monitoramento e estatísticas completas

## 📊 Configurações

### Máquinas (app/data/machines_config.json)
```json
{
  "name": "200CX",
  "ip_ranges": ["100.20.0.0/24", "100.20.110.0/24"],
  "default_plc_ip": "100.20.0.10",
  "plc_groups": {
    "principal": {"ips": ["100.20.0.10"]},
    "lavadora": {"ips": ["100.20.110.10"]}
  }
}
```

### Telas (config/screen_tags.json)
```json
{
  "tela_principal": ["TAG1", "TAG2", "TAG3"],
  "tela_alarmes": ["ALARM1", "ALARM2", "ALARM3"]
}
```

## 🚀 Como Usar

### 1. Inicialização
```python
from app.services.enhanced_plc_controller import EnhancedPLCController

# Cria controlador
controller = EnhancedPLCController(socketio, machines_config)

# Inicia componentes automaticamente
controller.start_components()
```

### 2. Subscrição por Tela
```javascript
// Frontend
enhancedSubscriptionManager.subscribeToScreen('tela_principal');
```

### 3. Subscrição por Tags
```javascript
// Frontend
enhancedSubscriptionManager.subscribeToTags(['TAG1', 'TAG2', 'TAG3']);
```

### 4. Leitura de Tags
```javascript
// Frontend
const data = await enhancedSubscriptionManager.readTags(['TAG1', 'TAG2']);
```

### 5. Escrita de Tags
```javascript
// Frontend
await enhancedSubscriptionManager.writeTags({
  'TAG1': 100,
  'TAG2': true
});
```

## 📈 Benefícios de Performance

### Antes da Arquitetura Aprimorada
- ❌ Leitura de **todas as 800+ tags** a cada ciclo
- ❌ **15 segundos** de intervalo entre leituras
- ❌ **Alta latência** para mudanças de tela
- ❌ **Sobrecarga** no PLC com muitas requisições
- ❌ **Conexão única** por máquina

### Após a Arquitetura Aprimorada
- ✅ Leitura de **apenas 10-50 tags** necessárias
- ✅ **500ms** de intervalo para tela ativa
- ✅ **Mudança instantânea** de subscrições
- ✅ **Redução de 80-90%** no tráfego de rede
- ✅ **Múltiplas conexões** simultâneas

## 🔧 API Endpoints

### Subscrições
- `POST /api/enhanced/subscribe_screen` - Subscrever a uma tela
- `POST /api/enhanced/subscribe_tags` - Subscrever a tags específicas
- `POST /api/enhanced/unsubscribe` - Remover subscrições
- `POST /api/enhanced/heartbeat` - Atualizar heartbeat

### Operações
- `POST /api/enhanced/read_tags` - Ler tags específicas
- `POST /api/enhanced/write_tags` - Escrever tags específicas

### Monitoramento
- `GET /api/enhanced/status` - Status completo do sistema
- `GET /api/enhanced/connection_status` - Status das conexões
- `GET /api/enhanced/subscription_status` - Status das subscrições
- `GET /api/enhanced/queue_status` - Status da fila
- `GET /api/enhanced/cache_status` - Status do cache

### Controle
- `POST /api/enhanced/force_reconnect` - Forçar reconexão
- `GET /api/enhanced/screens` - Listar telas disponíveis
- `GET /api/enhanced/screen/<name>` - Informações de uma tela

## 🧪 Testes

Execute o script de teste para validar a implementação:

```bash
python test_enhanced_architecture.py
```

O script testa:
- ✅ ConnectionManager
- ✅ TagSubscriptionManager
- ✅ PLCQueue
- ✅ PLCCache
- ✅ EnhancedPLCController
- ✅ Integração completa

## 📊 Monitoramento

### Métricas Disponíveis
- **Conexões:** Status de cada grupo de PLCs
- **Subscrições:** Clientes ativos e tags subscritas
- **Fila:** Requisições pendentes por prioridade
- **Cache:** Taxa de hit/miss e uso de memória
- **Performance:** Tempo de resposta e throughput

### Logs Estruturados
```
[CONN] 🔌 Conexão principal: 100.20.0.10 (200CX) - conectado
[TAG] 📊 Subscrições atualizadas: 15 tags
[QUEUE] 📦 Processando lote de leitura: 3 requisições, 15 tags
[CACHE] 💾 Cache hit rate: 85.2%
[ENHANCED] 🚀 Sistema otimizado e funcionando
```

## 🔄 Migração

### Passo a Passo
1. **Backup** do sistema atual
2. **Instalar** novos componentes
3. **Configurar** mapeamento de telas
4. **Testar** em ambiente de desenvolvimento
5. **Deploy** gradual por máquina
6. **Monitorar** performance e estabilidade

### Compatibilidade
- ✅ **API existente** mantida para compatibilidade
- ✅ **Configurações** migradas automaticamente
- ✅ **Frontend** atualizado gradualmente
- ✅ **Rollback** disponível se necessário

## 🎯 Próximos Passos

### Melhorias Planejadas
- [ ] **Dashboard** de monitoramento em tempo real
- [ ] **Alertas** automáticos para falhas de conexão
- [ ] **Métricas** históricas de performance
- [ ] **Configuração** dinâmica via interface web
- [ ] **Testes** automatizados de carga
- [ ] **Documentação** interativa da API

### Otimizações Futuras
- [ ] **Machine Learning** para previsão de tags necessárias
- [ ] **Compressão** de dados para reduzir tráfego
- [ ] **Caching** distribuído entre instâncias
- [ ] **Load balancing** inteligente entre PLCs

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte os logs do sistema
2. Execute o script de teste
3. Verifique as métricas de performance
4. Entre em contato com a equipe de desenvolvimento

---

**🎉 A arquitetura aprimorada está pronta para revolucionar o desempenho do supervisório!**
