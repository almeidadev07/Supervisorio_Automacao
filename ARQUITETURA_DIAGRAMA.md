# 🏗️ Diagrama da Arquitetura Aprimorada

## Visão Geral do Sistema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           🚀 SUPERVISÓRIO APRIMORADO                            │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   🌐 FRONTEND   │    │   🔌 BACKEND    │    │   🏭 PLCs       │
│                 │    │                 │    │                 │
│ • Tela Principal│◄──►│ • API Routes    │◄──►│ • PLC Principal │
│ • Tela Alarmes  │    │ • Socket.IO     │    │ • PLC Lavadora  │
│ • Tela Embalad. │    │ • WebSocket     │    │ • Múltiplas IPs │
│ • ...           │    │ • Notificações  │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Componentes da Arquitetura

### 1. Frontend (JavaScript)
```
┌─────────────────────────────────────────────────────────────────┐
│                    🌐 ENHANCED SUBSCRIPTION MANAGER            │
├─────────────────────────────────────────────────────────────────┤
│ • Gerenciamento de subscrições por tela                        │
│ • Detecção automática de mudanças de rota                      │
│ • Heartbeat para manter conexão ativa                          │
│ • API unificada para leitura/escrita de tags                   │
│ • Retry automático e tratamento de erros                       │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Backend (Python)
```
┌─────────────────────────────────────────────────────────────────┐
│                    🚀 ENHANCED PLC CONTROLLER                  │
├─────────────────────────────────────────────────────────────────┤
│ • Orquestração de todos os componentes                         │
│ • API REST para comunicação com frontend                       │
│ • Integração com Socket.IO para notificações                   │
│ • Gerenciamento do ciclo de vida completo                      │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Gerenciamento de Conexões
```
┌─────────────────────────────────────────────────────────────────┐
│                    🔌 CONNECTION MANAGER                       │
├─────────────────────────────────────────────────────────────────┤
│ • Discovery automático de PLCs disponíveis                     │
│ • Manutenção de conexão ativa por grupo (Principal/Lavadora)   │
│ • Reconexão automática em caso de falha                        │
│ • Teste de conectividade via ping e socket                     │
│ • Notificação de mudanças de estado                            │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Gerenciamento de Tags
```
┌─────────────────────────────────────────────────────────────────┐
│                    📋 TAG SUBSCRIPTION MANAGER                 │
├─────────────────────────────────────────────────────────────────┤
│ • Mapeamento de telas para suas tags necessárias               │
│ • Gerenciamento de subscrições ativas por cliente              │
│ • Controle de heartbeat para detectar clientes inativos        │
│ • Otimização de leituras baseada em mudanças de tela           │
│ • Configuração JSON para mapeamento tela→tags                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Sistema de Fila
```
┌─────────────────────────────────────────────────────────────────┐
│                    📦 PLC QUEUE                                │
├─────────────────────────────────────────────────────────────────┤
│ • Fila de requisições com priorização (CRITICAL, HIGH, NORMAL, LOW) │
│ • Processamento em lotes para otimizar comunicação             │
│ • Gerenciamento de timeouts e retry                            │
│ • Balanceamento de carga entre PLCs                            │
│ • Processamento assíncrono em background                       │
└─────────────────────────────────────────────────────────────────┘
```

### 6. Sistema de Cache
```
┌─────────────────────────────────────────────────────────────────┐
│                    💾 PLC CACHE                                │
├─────────────────────────────────────────────────────────────────┤
│ • Cache inteligente de valores de tags                         │
│ • Detecção de mudanças significativas                          │
│ • Gerenciamento de TTL e eviction                              │
│ • Redução de leituras desnecessárias                           │
│ • Thresholds configuráveis por tipo de tag                     │
└─────────────────────────────────────────────────────────────────┘
```

## Fluxo de Dados

### 1. Inicialização
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Cliente   │───►│  Frontend   │───►│   Backend   │───►│    PLCs     │
│  Conecta    │    │  Carrega    │    │  Inicia     │    │  Detecta    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### 2. Subscrição a Tela
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Cliente   │───►│  Frontend   │───►│ Tag Manager │───►│  PLC Queue  │
│ Subscreve   │    │  Envia      │    │  Mapeia     │    │  Agenda     │
│   Tela      │    │  Request    │    │   Tags      │    │  Leitura    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### 3. Leitura de Tags
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  PLC Queue  │───►│  PLC Cache  │───►│ Connection  │───►│    PLCs     │
│  Processa   │    │  Verifica   │    │  Manager    │    │    Lê       │
│   Lote      │    │   Cache     │    │  Distribui  │    │   Tags      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### 4. Envio para Frontend
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    PLCs     │───►│  PLC Cache  │───►│   Backend   │───►│  Frontend   │
│  Retorna    │    │  Atualiza   │    │  Socket.IO  │    │  Atualiza   │
│   Dados     │    │   Cache     │    │  Emite      │    │   UI        │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## Configuração de PLCs

### Faixas de IP por Máquina
```
┌─────────────────────────────────────────────────────────────────┐
│                        🏭 MÁQUINAS                             │
├─────────────────────────────────────────────────────────────────┤
│ 200CX:                                                          │
│   • Principal: 100.20.0.10                                     │
│   • Lavadora:  100.20.110.10                                   │
│                                                                 │
│ 400CX:                                                          │
│   • Principal: 100.40.0.10                                     │
│   • Lavadora:  100.40.110.10                                   │
│                                                                 │
│ 700CX:                                                          │
│   • Principal: 100.70.0.10                                     │
│   • Lavadora:  100.70.110.10                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Mapeamento de Telas
```
┌─────────────────────────────────────────────────────────────────┐
│                        🖥️ TELAS                                │
├─────────────────────────────────────────────────────────────────┤
│ tela_principal:     [TAG1, TAG2, TAG3, ...]                    │
│ tela_alarmes:       [ALARM1, ALARM2, ALARM3, ...]              │
│ tela_embaladoras:   [EMB1, EMB2, EMB3, ...]                    │
│ tela_lavadora:      [LAV1, LAV2, LAV3, ...]                    │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

## Otimizações de Performance

### Antes da Arquitetura Aprimorada
```
┌─────────────────────────────────────────────────────────────────┐
│                        ❌ PROBLEMAS                            │
├─────────────────────────────────────────────────────────────────┤
│ • Leitura de TODAS as 800+ tags a cada ciclo                   │
│ • 15 segundos de intervalo entre leituras                      │
│ • Alta latência para mudanças de tela                          │
│ • Sobrecarga no PLC com muitas requisições                     │
│ • Conexão única por máquina                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Após a Arquitetura Aprimorada
```
┌─────────────────────────────────────────────────────────────────┐
│                        ✅ SOLUÇÕES                             │
├─────────────────────────────────────────────────────────────────┤
│ • Leitura de apenas 10-50 tags necessárias                     │
│ • 500ms de intervalo para tela ativa                           │
│ • Mudança instantânea de subscrições                           │
│ • Redução de 80-90% no tráfego de rede                        │
│ • Múltiplas conexões simultâneas                               │
└─────────────────────────────────────────────────────────────────┘
```

## Monitoramento e Métricas

### Dashboard de Status
```
┌─────────────────────────────────────────────────────────────────┐
│                    📊 DASHBOARD                                │
├─────────────────────────────────────────────────────────────────┤
│ Conexões:                                                       │
│   • Principal: ✅ 100.20.0.10 (200CX)                         │
│   • Lavadora:  ✅ 100.20.110.10 (200CX)                       │
│                                                                 │
│ Subscrições:                                                    │
│   • Clientes ativos: 3                                         │
│   • Tags subscritas: 45                                        │
│                                                                 │
│ Performance:                                                    │
│   • Cache hit rate: 85.2%                                      │
│   • Fila: 12 requisições                                       │
│   • Tempo de resposta: 150ms                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Logs Estruturados

### Exemplo de Logs
```
[CONN] 🔌 Conexão principal: 100.20.0.10 (200CX) - conectado
[TAG] 📊 Subscrições atualizadas: 15 tags
[QUEUE] 📦 Processando lote de leitura: 3 requisições, 15 tags
[CACHE] 💾 Cache hit rate: 85.2%
[ENHANCED] 🚀 Sistema otimizado e funcionando
```

## API Endpoints

### Subscrições
```
POST /api/enhanced/subscribe_screen    - Subscrever a uma tela
POST /api/enhanced/subscribe_tags      - Subscrever a tags específicas
POST /api/enhanced/unsubscribe         - Remover subscrições
POST /api/enhanced/heartbeat           - Atualizar heartbeat
```

### Operações
```
POST /api/enhanced/read_tags           - Ler tags específicas
POST /api/enhanced/write_tags          - Escrever tags específicas
```

### Monitoramento
```
GET  /api/enhanced/status              - Status completo do sistema
GET  /api/enhanced/connection_status   - Status das conexões
GET  /api/enhanced/subscription_status - Status das subscrições
GET  /api/enhanced/queue_status        - Status da fila
GET  /api/enhanced/cache_status        - Status do cache
```

---

**🎉 A arquitetura aprimorada está pronta para revolucionar o desempenho do supervisório!**
