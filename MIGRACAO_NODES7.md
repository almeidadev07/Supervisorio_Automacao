# Migração de Snap7 para Nodes7

Este documento descreve como foi realizada a migração da comunicação do supervisório de Snap7 para Nodes7.

## 📋 O que foi feito

### 1. Criação do Driver Nodes7

Foi criado um novo driver em `app/plc_drivers/nodes7.py` que:
- Implementa a interface `BasePLC` para compatibilidade com o sistema existente
- Usa o `NodeS7Proxy` para comunicação com o servidor Node.js
- Mantém a mesma API de leitura e escrita de tags
- Inclui reconexão automática e health checks

### 2. Registro do Driver

O driver foi registrado em `app/plc_drivers/__init__.py`:
- Suporta o tipo `plc_type: "nodes7"` nas configurações de máquina
- Fallback automático para MockNodes7Driver em caso de erro
- Mantém compatibilidade com o driver Snap7 existente

### 3. Atualização das Configurações

Todas as máquinas em `app/data/machines_config.json` foram atualizadas:
- `plc_type` alterado de `"siemens_s7"` para `"nodes7"`
- Adicionados parâmetros `rack` e `slot` para o servidor Nodes7
- Configuração aplicada para: 200CX, 400CX e 700CX

### 4. Scripts de Inicialização

Foram criados scripts PowerShell para facilitar o uso:

#### `start_nodes7_server.ps1`
Inicia apenas o servidor Node.js com Nodes7.

```powershell
# Uso básico
.\start_nodes7_server.ps1

# Com variáveis de ambiente personalizadas
$env:MACHINE = "700CX"
$env:PLC_IP = "100.70.0.10"
$env:WS_PORT = "8081"
.\start_nodes7_server.ps1
```

#### `start_supervisorio_with_nodes7.ps1`
Inicia ambos os servidores (Node.js + Flask) de forma integrada.

```powershell
# Uso básico
.\start_supervisorio_with_nodes7.ps1

# Com parâmetros
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10" -WsPort 8081 -FlaskPort 5000
```

## 🚀 Como usar

### Opção 1: Script Integrado (Recomendado)

Use o script que inicia tudo automaticamente:

```powershell
# Para máquina 700CX (exemplo)
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

O script irá:
1. ✅ Verificar se Node.js e Python estão instalados
2. ✅ Instalar dependências Node.js se necessário
3. ✅ Iniciar o servidor Node.js em background
4. ✅ Aguardar o servidor estar pronto
5. ✅ Iniciar a aplicação Flask
6. ✅ Gerenciar o encerramento correto ao pressionar Ctrl+C

### Opção 2: Manual

Se preferir iniciar manualmente:

#### Terminal 1 - Servidor Node.js
```powershell
$env:MACHINE = "700CX"
$env:PLC_IP = "100.70.0.10"
$env:WS_PORT = "8081"
npm start
```

#### Terminal 2 - Aplicação Flask
```powershell
$env:NODE_S7_PORT = "8081"
python app.py
```

## 🔧 Configuração

### Variáveis de Ambiente

#### Para o Servidor Node.js:
- `MACHINE`: Nome da máquina (200CX, 400CX, 700CX)
- `PLC_IP`: IP do PLC (ex: 100.70.0.10)
- `PLC_RACK`: Rack do PLC (padrão: 0)
- `PLC_SLOT`: Slot do PLC (padrão: 1)
- `WS_PORT`: Porta do servidor WebSocket (padrão: 8081)
- `SCAN_MS`: Intervalo de polling em ms (padrão: 200)
- `COMM_MAP_PATH`: Caminho personalizado para o comm_map (opcional)

#### Para a Aplicação Flask:
- `NODE_S7_PORT` ou `WS_PORT`: Porta do servidor Node.js (padrão: 8081)
- `NODE_S7_HOST`: Host do servidor Node.js (padrão: 127.0.0.1)
- `APP_PORT`: Porta da aplicação Flask (padrão: 5000)
- `APP_HOST`: Host da aplicação Flask (padrão: 127.0.0.1)

### Arquivos de Configuração

#### `config/machines_config_block.json`
O servidor Node.js pode usar este arquivo para configuração automática quando a variável `MACHINE` é definida.

#### `config/comm_map/[MAQUINA].json`
Arquivos de mapeamento de tags por máquina. O servidor Node.js detecta automaticamente o arquivo correto.

## 🔍 Verificação

### 1. Servidor Node.js

Verifique se o servidor está rodando:

```powershell
# Health check
curl http://127.0.0.1:8081/health

# Estatísticas
curl http://127.0.0.1:8081/api/stats

# Lista de tags monitoradas
curl http://127.0.0.1:8081/api/items

# Snapshot dos valores
curl http://127.0.0.1:8081/api/snapshot
```

### 2. Logs

O servidor Node.js mostra logs detalhados:
- ✅ Conexão com o PLC
- 📊 Estatísticas de polling (ciclo, tempo médio, updates)
- ⚠️ Erros de conexão ou leitura
- 🔄 Reconexões automáticas

A aplicação Flask mostra logs do driver:
- `[Nodes7]` - Operações do driver
- `[DRIVER]` - Criação e seleção de drivers
- `[STANDALONE_PLC]` - Operações do controlador

## 🔄 Comparação: Snap7 vs Nodes7

| Aspecto | Snap7 | Nodes7 |
|---------|-------|--------|
| **Linguagem** | Python (wrapper C) | JavaScript (puro) |
| **Performance** | Boa | Excelente |
| **Instalação** | Complexa (DLL nativa) | Simples (npm install) |
| **Polling** | Por Python | Por Node.js |
| **WebSocket** | Via Flask-SocketIO | Nativo (ws) |
| **Reconexão** | Manual | Automática |
| **Debug** | Limitado | Logs detalhados |

## 🛠️ Troubleshooting

### Erro: "Servidor Node.js não respondeu"

**Causa**: O servidor Node.js não está rodando ou não consegue se conectar.

**Solução**:
1. Verifique se Node.js está instalado: `node --version`
2. Instale as dependências: `npm install`
3. Verifique se a porta 8081 está livre
4. Inicie o servidor manualmente para ver os logs: `npm start`

### Erro: "PLC não conectado"

**Causa**: O servidor Node.js não consegue se conectar ao PLC.

**Solução**:
1. Verifique o IP do PLC está correto
2. Teste a conexão: `Test-NetConnection -ComputerName 100.70.0.10 -Port 102`
3. Verifique se rack e slot estão corretos (geralmente 0,1 para S7-1500)
4. Veja os logs do servidor Node.js para detalhes

### Erro: "Tags retornando None"

**Causa**: O comm_map não foi carregado ou está incorreto.

**Solução**:
1. Verifique se o arquivo `config/comm_map/[MAQUINA].json` existe
2. Verifique se a variável `MACHINE` está definida corretamente
3. Veja as estatísticas: `curl http://127.0.0.1:8081/api/stats`
4. Veja as tags monitoradas: `curl http://127.0.0.1:8081/api/items`

### Erro de importação no Python

**Causa**: Módulos não encontrados.

**Solução**:
```powershell
pip install flask flask-socketio python-socketio
```

## 📊 Monitoramento

### Endpoints HTTP do Servidor Node.js

- `GET /health` - Health check básico
- `GET /api/stats` - Estatísticas do polling e configuração
- `GET /api/items` - Lista de tags monitoradas
- `GET /api/snapshot` - Snapshot completo dos valores
- `GET /api/read?tags=tag1,tag2` - Leitura direta de tags específicas
- `POST /api/write` - Escrita de tags (body JSON: `{"values": {"tag": value}}`)

### WebSocket

O servidor também expõe um WebSocket para updates em tempo real:
- Envia `tagUpdate` quando um valor muda
- Suporta subscrições com padrões de filtro
- Mantém ping/pong para liveness

## 🔙 Reverter para Snap7

Se precisar reverter para Snap7:

1. Edite `app/data/machines_config.json`:
   ```json
   "plc_type": "siemens_s7"
   ```

2. Reinicie apenas a aplicação Flask (não precisa do servidor Node.js):
   ```powershell
   python app.py
   ```

O sistema detectará automaticamente o tipo de driver e usará o Snap7.

## 📝 Notas Importantes

1. **Compatibilidade**: O driver Nodes7 mantém 100% de compatibilidade com a API existente
2. **Performance**: O polling pelo Node.js é mais eficiente e estável
3. **Manutenção**: Mais fácil debugar e manter (logs detalhados, código puro JavaScript)
4. **Escalabilidade**: Suporta múltiplos clientes WebSocket sem sobrecarga

## 🎉 Benefícios da Migração

- ✅ **Instalação simplificada**: Não precisa mais compilar DLLs nativas
- ✅ **Performance melhorada**: Polling mais rápido e eficiente
- ✅ **Reconexão automática**: Recupera de falhas sem intervenção
- ✅ **Logs detalhados**: Facilita debug e diagnóstico
- ✅ **WebSocket nativo**: Comunicação em tempo real mais eficiente
- ✅ **Cross-platform**: Funciona em Windows, Linux e macOS
- ✅ **Manutenção facilitada**: Código JavaScript puro, mais fácil de entender

## 📞 Suporte

Em caso de problemas:
1. Verifique os logs do servidor Node.js
2. Verifique os logs da aplicação Flask
3. Use os endpoints de diagnóstico (`/api/stats`, `/api/items`)
4. Teste a conexão com o PLC manualmente

