#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script de teste para verificar a comunicação com o servidor Nodes7.

Uso:
    python test_nodes7_connection.py
"""

import sys
import json
import time
import urllib.request
import urllib.error

def print_header(text):
    """Imprime cabeçalho formatado"""
    print()
    print("=" * 60)
    print(f"  {text}")
    print("=" * 60)

def print_status(status, message):
    """Imprime status com emoji"""
    emoji = "✅" if status else "❌"
    print(f"{emoji} {message}")

def test_server_health(base_url):
    """Testa se o servidor está acessível"""
    print_header("Teste 1: Health Check do Servidor")
    
    try:
        req = urllib.request.Request(f"{base_url}/health")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get('ok'):
                print_status(True, "Servidor Node.js está respondendo")
                return True
            else:
                print_status(False, "Servidor respondeu mas não está OK")
                return False
    except urllib.error.URLError as e:
        print_status(False, f"Servidor não acessível: {e}")
        return False
    except Exception as e:
        print_status(False, f"Erro ao testar servidor: {e}")
        return False

def test_server_stats(base_url):
    """Obtém e exibe estatísticas do servidor"""
    print_header("Teste 2: Estatísticas do Servidor")
    
    try:
        req = urllib.request.Request(f"{base_url}/api/stats")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            if not data.get('ok'):
                print_status(False, "Erro ao obter estatísticas")
                return False
            
            stats = data.get('stats', {})
            config = data.get('config', {})
            
            print_status(True, "Estatísticas obtidas com sucesso")
            print()
            print("📊 Configuração:")
            print(f"   - PLC IP: {config.get('PLC_IP', 'N/A')}")
            print(f"   - Rack/Slot: {config.get('PLC_RACK', 'N/A')}/{config.get('PLC_SLOT', 'N/A')}")
            print(f"   - Scan MS: {config.get('SCAN_MS', 'N/A')}ms")
            print(f"   - WS Port: {config.get('WS_PORT', 'N/A')}")
            print(f"   - Comm Map: {config.get('COMM_MAP_PATH', 'auto-detect')}")
            print()
            print("📈 Estatísticas:")
            print(f"   - Ciclos: {stats.get('cycles', 'N/A')}")
            print(f"   - Updates: {stats.get('updates', 'N/A')}")
            print(f"   - Média: {stats.get('avgMs', 'N/A')}ms")
            print(f"   - Blocos: {stats.get('blocks', 'N/A')}")
            
            return True
            
    except Exception as e:
        print_status(False, f"Erro ao obter estatísticas: {e}")
        return False

def test_tags_list(base_url):
    """Lista as tags monitoradas"""
    print_header("Teste 3: Tags Monitoradas")
    
    try:
        req = urllib.request.Request(f"{base_url}/api/items")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            if not data.get('ok'):
                print_status(False, "Erro ao obter lista de tags")
                return False
            
            items = data.get('items', [])
            count = data.get('count', 0)
            
            print_status(True, f"{count} tags estão sendo monitoradas")
            
            if count > 0:
                print()
                print("📋 Primeiras 10 tags:")
                for i, tag in enumerate(items[:10], 1):
                    print(f"   {i}. {tag}")
                
                if count > 10:
                    print(f"   ... e mais {count - 10} tags")
            else:
                print_status(False, "⚠️ Nenhuma tag sendo monitorada - verifique o comm_map")
            
            return count > 0
            
    except Exception as e:
        print_status(False, f"Erro ao obter lista de tags: {e}")
        return False

def test_snapshot(base_url):
    """Obtém snapshot dos valores"""
    print_header("Teste 4: Snapshot de Valores")
    
    try:
        req = urllib.request.Request(f"{base_url}/api/snapshot")
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            
            if not data.get('ok'):
                print_status(False, "Erro ao obter snapshot")
                return False
            
            snapshot = data.get('data', {})
            stats = data.get('stats', {})
            
            count = len(snapshot)
            print_status(True, f"Snapshot obtido com {count} valores")
            
            if count > 0:
                print()
                print("📊 Primeiros 5 valores:")
                for i, (tag, value) in enumerate(list(snapshot.items())[:5], 1):
                    print(f"   {i}. {tag} = {value}")
                
                if count > 5:
                    print(f"   ... e mais {count - 5} valores")
                    
                # Verifica se há valores válidos (não None)
                valid_values = sum(1 for v in snapshot.values() if v is not None)
                print()
                print(f"📈 Valores válidos: {valid_values}/{count}")
                
                if valid_values == 0:
                    print_status(False, "⚠️ Todos os valores são None - problema na comunicação com PLC")
                    return False
            else:
                print_status(False, "⚠️ Snapshot vazio")
                return False
            
            return True
            
    except Exception as e:
        print_status(False, f"Erro ao obter snapshot: {e}")
        return False

def test_python_driver():
    """Testa se o driver Python está disponível"""
    print_header("Teste 5: Driver Python")
    
    try:
        from app.plc_drivers import create_driver_for_config
        print_status(True, "Módulo de drivers importado com sucesso")
        
        # Testa criação de driver nodes7
        test_config = {
            'name': 'TEST',
            'plc_type': 'nodes7',
            'default_plc_ip': '127.0.0.1',
            'rack': 0,
            'slot': 1,
            'comm_map': []
        }
        
        driver = create_driver_for_config(test_config)
        print_status(True, f"Driver criado: {driver.__class__.__name__}")
        
        # Testa conexão
        connected = driver.connect()
        if connected:
            print_status(True, "Driver conectou ao servidor Node.js")
            
            # Testa verificação de conexão
            is_conn = driver.is_connected()
            print_status(is_conn, f"Driver reporta conectado: {is_conn}")
            
            driver.disconnect()
            print_status(True, "Driver desconectado")
            
            return True
        else:
            print_status(False, "Driver não conseguiu conectar ao servidor")
            return False
            
    except ImportError as e:
        print_status(False, f"Erro ao importar driver: {e}")
        return False
    except Exception as e:
        print_status(False, f"Erro ao testar driver: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Função principal"""
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 10 + "TESTE DE COMUNICAÇÃO NODES7" + " " * 21 + "║")
    print("╚" + "═" * 58 + "╝")
    
    # Configuração
    base_url = "http://127.0.0.1:8081"
    
    # Executa testes
    results = []
    
    results.append(("Health Check", test_server_health(base_url)))
    time.sleep(0.5)
    
    results.append(("Estatísticas", test_server_stats(base_url)))
    time.sleep(0.5)
    
    results.append(("Tags Monitoradas", test_tags_list(base_url)))
    time.sleep(0.5)
    
    results.append(("Snapshot", test_snapshot(base_url)))
    time.sleep(0.5)
    
    results.append(("Driver Python", test_python_driver()))
    
    # Resumo
    print_header("Resumo dos Testes")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    print()
    for test_name, result in results:
        status = "✅ PASSOU" if result else "❌ FALHOU"
        print(f"{status:15} - {test_name}")
    
    print()
    print("=" * 60)
    percentage = (passed / total) * 100
    print(f"Resultado: {passed}/{total} testes passaram ({percentage:.1f}%)")
    print("=" * 60)
    
    if passed == total:
        print()
        print("🎉 Todos os testes passaram!")
        print("✅ A comunicação com Nodes7 está funcionando corretamente!")
        print()
        return 0
    else:
        print()
        print("⚠️ Alguns testes falharam.")
        print()
        print("Verifique:")
        print("1. O servidor Node.js está rodando? (npm start)")
        print("2. O PLC está acessível na rede?")
        print("3. O comm_map está correto?")
        print()
        return 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        print("🛑 Teste interrompido pelo usuário")
        sys.exit(130)
    except Exception as e:
        print()
        print(f"❌ Erro fatal: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

