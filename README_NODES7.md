# 🚀 Supervisório com Nodes7

## ⚡ Início Rápido

```powershell
.\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
```

Acesse: http://127.0.0.1:5000

Para parar: **Ctrl+C**

---

## ✅ Migração Completa

O supervisório foi migrado de **Snap7** para **Nodes7** com sucesso!

### O que mudou?
- ✅ Comunicação mais rápida e estável
- ✅ Reconexão automática ao PLC
- ✅ Instalação mais simples (sem DLLs nativas)
- ✅ Logs e monitoramento aprimorados

### O que NÃO mudou?
- ✅ Interface do supervisório
- ✅ Funcionalidades
- ✅ API de uso

---

## 📚 Documentação

| Documento | Descrição |
|-----------|-----------|
| [INICIO_RAPIDO_NODES7.md](INICIO_RAPIDO_NODES7.md) | 📖 Guia de início rápido |
| [MIGRACAO_NODES7.md](MIGRACAO_NODES7.md) | 📚 Documentação completa |
| [COMANDOS_UTEIS.md](COMANDOS_UTEIS.md) | 🔧 Lista de comandos |
| [EXEMPLO_USO.md](EXEMPLO_USO.md) | 📖 Exemplo prático |
| [RESUMO_MIGRACAO.md](RESUMO_MIGRACAO.md) | ✅ Resumo técnico |

---

## 🧪 Testar

```powershell
python test_nodes7_connection.py
```

---

## 🔧 Requisitos

- Node.js (v14+)
- Python (v3.8+)
- npm (vem com Node.js)

---

## 📊 Status

| Componente | Status |
|------------|--------|
| Driver Nodes7 | ✅ Implementado |
| Scripts | ✅ Criados |
| Configuração | ✅ Atualizada |
| Documentação | ✅ Completa |
| Testes | ✅ Funcionando |

---

## 🎯 Para Produção

1. **Testar comunicação:**
   ```powershell
   python test_nodes7_connection.py
   ```

2. **Iniciar sistema:**
   ```powershell
   .\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"
   ```

3. **Acessar supervisório:**
   ```
   http://127.0.0.1:5000
   ```

4. **Monitorar:**
   ```powershell
   curl http://127.0.0.1:8081/api/stats
   ```

---

## ❓ Problemas?

### Servidor não inicia
```powershell
npm install
```

### Não conecta ao PLC
```powershell
Test-NetConnection -ComputerName 100.70.0.10 -Port 102
```

### Mais ajuda
Veja [COMANDOS_UTEIS.md](COMANDOS_UTEIS.md)

---

## 🔙 Reverter para Snap7

Se necessário, edite `app/data/machines_config.json`:
```json
"plc_type": "siemens_s7"
```

E reinicie:
```powershell
python app.py
```

---

## 🎉 Pronto!

O sistema está **100% funcional** com Nodes7.

**Boa sorte!** 🚀

