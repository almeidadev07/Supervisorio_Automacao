#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Testa velocidades e alarmes"""

import requests
import time

print("=" * 70)
print("🧪 TESTE COMPLETO - Velocidades e Alarmes")
print("=" * 70)

# Aguarda servidores iniciarem
print("\n⏳ Aguardando servidores iniciarem...")
time.sleep(2)

# 1. Testa DataHub status
print("\n1️⃣  Status do DataHub:")
print("-" * 70)
try:
    resp = requests.get("http://localhost:8000/api/status", timeout=2)
    status = resp.json()
    print(f"   Conectado: {status.get('connected')}")
    print(f"   PLC: {status.get('active_plc')}")
    print(f"   IP: {status.get('plc_ip')}")
    print(f"   DBs no cache: {status.get('db_count', 0)}")
except Exception as e:
    print(f"   ❌ Erro: {e}")

# 2. Testa velocidade REAL
print("\n2️⃣  Velocidade REAL:")
print("-" * 70)
try:
    resp = requests.get("http://localhost:5000/api/read_tags?names=XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL", timeout=2)
    data = resp.json()
    vel_real = data.get('values', {}).get('XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL')
    if vel_real is not None:
        print(f"   ✅ Velocidade Real: {vel_real} cx/h")
    else:
        print(f"   ⚠️  Velocidade Real: NULL")
except Exception as e:
    print(f"   ❌ Erro: {e}")

# 3. Testa velocidade PROG
print("\n3️⃣  Velocidade PROG:")
print("-" * 70)
try:
    resp = requests.get("http://localhost:5000/api/read_tags?names=XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG", timeout=2)
    data = resp.json()
    vel_prog = data.get('values', {}).get('XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG')
    if vel_prog is not None:
        print(f"   ✅ Velocidade Prog: {vel_prog} cx/h")
    else:
        print(f"   ⚠️  Velocidade Prog: NULL")
except Exception as e:
    print(f"   ❌ Erro: {e}")

# 4. Testa ESCRITA de velocidade PROG
print("\n4️⃣  Teste de ESCRITA - Velocidade PROG:")
print("-" * 70)
try:
    print("   📝 Escrevendo velocidade PROG = 500.0...")
    resp = requests.post(
        "http://localhost:5000/api/write_tags",
        json={"XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG": 500.0},
        timeout=2
    )
    if resp.status_code == 200:
        print("   ✅ Escrita OK")
        
        # Aguarda e lê de volta
        time.sleep(1)
        resp = requests.get("http://localhost:5000/api/read_tags?names=XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG", timeout=2)
        data = resp.json()
        vel_prog = data.get('values', {}).get('XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG')
        print(f"   📖 Leitura após escrita: {vel_prog} cx/h")
        
        if abs(vel_prog - 500.0) < 0.1:
            print("   ✅ Escrita verificada com sucesso!")
        else:
            print(f"   ⚠️  Valor diferente do esperado: {vel_prog} != 500.0")
    else:
        print(f"   ❌ Erro na escrita: {resp.status_code}")
        print(f"   {resp.text}")
except Exception as e:
    print(f"   ❌ Erro: {e}")

# 5. Testa alarmes
print("\n5️⃣  Alarmes:")
print("-" * 70)
try:
    resp = requests.get("http://localhost:5000/api/alarms", timeout=2)
    data = resp.json()
    
    if resp.status_code == 200:
        alarmes = data.get('alarms', [])
        print(f"   ✅ Total de alarmes ativos: {len(alarmes)}")
        
        if alarmes:
            print(f"\n   📋 Primeiros 5 alarmes:")
            for i, alarm in enumerate(alarmes[:5], 1):
                print(f"      {i}. {alarm.get('name', 'N/A')[:50]}")
                print(f"         Descrição: {alarm.get('description', 'N/A')[:60]}")
                print(f"         Bit: {alarm.get('bit')}, Ativo: {alarm.get('value')}")
        else:
            print("   ℹ️  Nenhum alarme ativo no momento")
    else:
        print(f"   ⚠️  Status {resp.status_code}: {data.get('error', 'Erro desconhecido')}")
        
except Exception as e:
    print(f"   ❌ Erro: {e}")

print("\n" + "=" * 70)
print("✅ TESTE COMPLETO")
print("=" * 70)

