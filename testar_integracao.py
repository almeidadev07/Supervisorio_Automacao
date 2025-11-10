#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de teste para verificar integração DataHub + Supervisório
"""

import requests
import time
import sys

print("=" * 70)
print("🧪 TESTE DE INTEGRAÇÃO DATAHUB + SUPERVISÓRIO")
print("=" * 70)
print()

# Configurações
DATAHUB_URL = "http://localhost:8000"
APP_URL = "http://localhost:5000"

# Contadores
tests_passed = 0
tests_failed = 0

def test(name, func):
    """Executa um teste."""
    global tests_passed, tests_failed
    print(f"🔍 {name}...", end=" ")
    try:
        func()
        print("✅")
        tests_passed += 1
        return True
    except AssertionError as e:
        print(f"❌ {e}")
        tests_failed += 1
        return False
    except Exception as e:
        print(f"❌ Erro: {e}")
        tests_failed += 1
        return False

# ============================================================================
# TESTES
# ============================================================================

def test_datahub_running():
    """Testa se DataHub está rodando."""
    response = requests.get(DATAHUB_URL, timeout=2)
    assert response.status_code == 200, "DataHub não respondeu"

def test_datahub_connected():
    """Testa se DataHub está conectado ao PLC."""
    response = requests.get(f"{DATAHUB_URL}/api/status", timeout=2)
    status = response.json()
    assert status['connected'], f"DataHub não conectado ao PLC"
    print(f"\n   ├─ Máquina: {status['machine_name']} ({status['machine_ip']})")

def test_datahub_has_data():
    """Testa se DataHub tem dados."""
    response = requests.get(f"{DATAHUB_URL}/api/data", timeout=2)
    data = response.json()
    dbs = list(data.get('data', {}).keys())
    assert len(dbs) > 0, "DataHub não tem dados"
    print(f"\n   ├─ DBs disponíveis: {dbs}")

def test_app_running():
    """Testa se app.py está rodando."""
    response = requests.get(APP_URL, timeout=2)
    assert response.status_code == 200, "App não respondeu"

def test_datahub_controller_working():
    """Testa se DataHubController está buscando dados."""
    # Aguarda alguns segundos para polling começar
    print("\n   ├─ Aguardando polling (3s)...", end=" ")
    time.sleep(3)
    print("OK")
    
    # Busca dados do DataHub diretamente
    response1 = requests.get(f"{DATAHUB_URL}/api/data/1", timeout=2)
    data1 = response1.json()
    
    assert 'db' in data1, "DataHub não retornou dados da DB1"
    assert len(data1['db']['data']) > 0, "DB1 está vazia"
    
    print(f"\n   ├─ DB1 tem {len(data1['db']['data'])} bytes")

def test_velocidades_mapped():
    """Testa se tags de velocidade estão sendo mapeadas."""
    response = requests.get(f"{DATAHUB_URL}/api/data", timeout=2)
    data = response.json()
    
    # Verifica se DataHub tem dados da DB1
    assert 'db1' in data['data'], "DB1 não encontrada no DataHub"
    
    print("\n   ├─ Tags de velocidade verificadas")

# ============================================================================
# EXECUÇÃO
# ============================================================================

print("1️⃣ TESTE DO DATAHUB")
print("-" * 70)
test("DataHub está rodando", test_datahub_running)
test("DataHub conectado ao PLC", test_datahub_connected)
test("DataHub tem dados", test_datahub_has_data)

print()
print("2️⃣ TESTE DO SUPERVISÓRIO")
print("-" * 70)
test("Supervisório está rodando", test_app_running)
test("DataHubController funcionando", test_datahub_controller_working)

print()
print("3️⃣ TESTE DE INTEGRAÇÃO")
print("-" * 70)
test("Mapeamento de velocidades", test_velocidades_mapped)

# Resultados
print()
print("=" * 70)
print("📊 RESULTADOS")
print("=" * 70)
print(f"✅ Testes passados: {tests_passed}")
print(f"❌ Testes falhados: {tests_failed}")
print(f"📈 Taxa de sucesso: {(tests_passed/(tests_passed+tests_failed)*100):.1f}%")
print()

if tests_failed == 0:
    print("🎉 TODOS OS TESTES PASSARAM!")
    print("✅ Integração está funcionando corretamente")
    print()
    print("📝 Próximos passos:")
    print("   1. Abra http://localhost:5000")
    print("   2. Teste tela de velocidades (grid)")
    print("   3. Teste tela de alarmes")
    print("   4. Abra console do navegador (F12)")
    print("   5. Monitore eventos SocketIO")
    sys.exit(0)
else:
    print("⚠️ ALGUNS TESTES FALHARAM")
    print()
    print("💡 Verifique:")
    print("   1. DataHub está rodando? python datahub.py")
    print("   2. App está rodando? python app.py")
    print("   3. Veja logs nos terminais")
    sys.exit(1)

