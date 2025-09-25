#!/usr/bin/env python3
"""
Script para diagnosticar escrita de tags no PLC
"""
import json
import requests

def test_plc_write():
    base_url = "http://127.0.0.1:5000"
    
    print("=== DIAGNÓSTICO DE ESCRITA NO PLC ===\n")
    
    # 1. Verificar se o servidor está rodando
    try:
        r = requests.get(f"{base_url}/api/current", timeout=5)
        print(f"✅ Servidor respondendo - Status: {r.status_code}")
        current = r.json()
        print(f"   Máquina ativa: {current.get('machine', 'N/A')}")
        print(f"   Conectado: {current.get('connected', 'N/A')}")
    except Exception as e:
        print(f"❌ Servidor não está rodando: {e}")
        return
    
    # 2. Verificar status da conexão PLC
    try:
        r = requests.get(f"{base_url}/api/read_tags?names=XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03")
        print(f"\n✅ Leitura da tag - Status: {r.status_code}")
        data = r.json()
        print(f"   Resposta: {data}")
    except Exception as e:
        print(f"❌ Erro na leitura: {e}")
    
    # 3. Tentar escrever na tag
    try:
        payload = {
            "tag_values": {
                "XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03": 1
            }
        }
        r = requests.post(f"{base_url}/api/write_tags", 
                         json=payload, 
                         timeout=10)
        print(f"\n📝 Escrita da tag - Status: {r.status_code}")
        print(f"   Resposta: {r.text}")
    except Exception as e:
        print(f"❌ Erro na escrita: {e}")
    
    # 4. Ler novamente para confirmar
    try:
        r = requests.get(f"{base_url}/api/read_tags?names=XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03")
        print(f"\n🔍 Leitura após escrita - Status: {r.status_code}")
        data = r.json()
        print(f"   Resposta: {data}")
    except Exception as e:
        print(f"❌ Erro na leitura final: {e}")

if __name__ == "__main__":
    test_plc_write()
