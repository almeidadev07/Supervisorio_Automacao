# 🚀 Início Simplificado

## ⚡ Comando Mais Simples

```powershell
.\start.ps1
```

O sistema **detecta automaticamente** a máquina baseado no IP da sua rede!

---

## 🔍 Como Funciona a Detecção Automática

O script:
1. ✅ Lê sua configuração de rede (IP local)
2. ✅ Compara com os ranges de IP em `app/data/machines_config.json`
3. ✅ Identifica qual máquina você está (200CX, 400CX ou 700CX)
4. ✅ Usa o PLC IP configurado para essa máquina

### Exemplo:

Se seu computador tem IP **100.70.0.50**, o sistema detecta automaticamente:
- **Máquina:** 700CX
- **PLC IP:** 100.70.0.10

---

## 📋 Opções

### Opção 1: Detecção Automática (Recomendado)
```powershell
.\start.ps1
```
ou
```powershell
.\start_supervisorio_with_nodes7.ps1
```

### Opção 2: Especificar Manualmente
```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

---

## ✅ Vantagens da Detecção Automática

- ✅ **Sem parâmetros** - Apenas execute `.\start.ps1`
- ✅ **Sem configuração** - Detecta baseado na rede
- ✅ **Sem erros** - Não precisa lembrar IPs ou nomes
- ✅ **Portável** - Funciona em qualquer máquina da rede

---

## 🔧 Configuração dos Ranges

Os ranges estão em `app/data/machines_config.json`:

```json
{
  "name": "200CX",
  "ip_ranges": ["100.20.0.0/24", "100.20.110.0/24"],
  "default_plc_ip": "100.20.0.10"
},
{
  "name": "400CX",
  "ip_ranges": ["100.40.0.0/24", "100.40.110.0/24"],
  "default_plc_ip": "100.40.0.10"
},
{
  "name": "700CX",
  "ip_ranges": ["100.70.0.0/24", "100.70.110.0/24"],
  "default_plc_ip": "100.70.0.10"
}
```

O sistema compara os **3 primeiros octetos** do seu IP com esses ranges.

---

## 📝 Exemplo Prático

### Seu IP: 100.70.0.50

```powershell
PS C:\PROGRAMAS\Supervisorio> .\start.ps1

===================================================================
SUPERVISORIO COM NODES7
===================================================================

Detectando maquina automaticamente...
IPs locais encontrados: 100.70.0.50, 192.168.1.100
Maquina detectada: 700CX (rede: 100.70.0.x)
Maquina: 700CX
PLC IP: 100.70.0.10
Porta WebSocket: 8081
Porta Flask: 5000

Node.js: v18.x.x
Python: 3.x.x

===================================================================

Iniciando servidor Node.js...
Servidor Node.js iniciado (Job ID: 1)
Aguardando servidor Node.js inicializar...
Servidor Node.js esta respondendo!

Iniciando aplicacao Flask...

===================================================================
SUPERVISORIO RODANDO
===================================================================
Flask: http://127.0.0.1:5000
Node.js WebSocket: http://127.0.0.1:8081

Para parar o servidor, pressione Ctrl+C
===================================================================
```

---

## ⚠️ Se a Detecção Falhar

Se o sistema não conseguir detectar automaticamente, você verá:

```
AVISO: Maquina nao especificada e nao detectada automaticamente
Uso: .\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

Neste caso, especifique manualmente:

```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

---

## 🎯 Resumo

| Comando | Descrição | Quando Usar |
|---------|-----------|-------------|
| `.\start.ps1` | Detecção automática | ✅ Sempre (recomendado) |
| `.\start_supervisorio_with_nodes7.ps1` | Detecção automática (completo) | ✅ Alternativa ao start.ps1 |
| `.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"` | Manual | ⚠️ Se detecção falhar |

---

## 🎉 Pronto!

Agora você pode iniciar o supervisório com apenas:

```powershell
.\start.ps1
```

**Mais simples impossível!** 🚀

