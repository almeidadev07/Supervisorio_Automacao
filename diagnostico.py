#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Script rápido de diagnóstico"""

import requests
import sys

print("=" * 60)
print("🔍 DIAGNÓSTICO RÁPIDO")
print("=" * 60)

# 1. Testa DataHub
print("\n1. Testando DataHub (porta 8000)...")
try:
    resp = requests.get("http://localhost:8000/api/status", timeout=2)
    print(f"   ✅ DataHub respondeu: {resp.status_code}")
    data = resp.json()
    print(f"   📡 Conectado: {data.get('connected')}")
    print(f"   🏭 PLC Ativo: {data.get('active_plc')}")
    print(f"   📍 IP: {data.get('plc_ip')}")
except requests.exceptions.ConnectionError:
    print("   ❌ DataHub NÃO está rodando!")
    print("\n   👉 Solução: Execute em outro terminal:")
    print("      python datahub.py")
    sys.exit(1)
except Exception as e:
    print(f"   ❌ Erro: {e}")
    sys.exit(1)

# 2. Testa dados do DataHub
print("\n2. Testando cache do DataHub...")
try:
    resp = requests.get("http://localhost:8000/api/data", timeout=2)
    data = resp.json()
    dbs = data.get('data', {})
    print(f"   ✅ DBs no cache: {list(dbs.keys())}")
    
    # Verifica se tem dados
    total_bytes = sum(len(db.get('data', [])) for db in dbs.values())
    print(f"   📊 Total de bytes lidos: {total_bytes}")
    
    if total_bytes == 0:
        print("   ⚠️  Cache vazio - DataHub pode não estar conectado ao PLC")
except Exception as e:
    print(f"   ❌ Erro: {e}")

# 3. Testa app.py
print("\n3. Testando app.py (porta 5000)...")
try:
    resp = requests.get("http://localhost:5000/api/active_machine", timeout=2)
    print(f"   ✅ app.py respondeu: {resp.status_code}")
    data = resp.json()
    print(f"   🏭 Máquina: {data.get('name')}")
    print(f"   📍 IP: {data.get('ip')}")
except requests.exceptions.ConnectionError:
    print("   ❌ app.py NÃO está rodando!")
    print("\n   👉 Solução: Execute em outro terminal:")
    print("      python app.py")
    sys.exit(1)
except Exception as e:
    print(f"   ❌ Erro: {e}")

# 4. Testa leitura de tag específica
print("\n4. Testando leitura de velocidade...")
try:
    resp = requests.get("http://localhost:5000/api/read_tags?names=XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL", timeout=2)
    data = resp.json()
    values = data.get('values', {})
    vel_real = values.get('XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL')
    
    if vel_real is None:
        print(f"   ⚠️  Velocidade NULL - verificar comm_map e DBs")
        print(f"   📋 Response completo: {data}")
    else:
        print(f"   ✅ Velocidade Real: {vel_real}")
except Exception as e:
    print(f"   ❌ Erro: {e}")

print("\n" + "=" * 60)
print("✅ DIAGNÓSTICO COMPLETO")
print("=" * 60)

