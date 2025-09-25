#!/usr/bin/env python3
"""
Script para diagnosticar problemas com write_tags
"""
import requests
import json

def test_write_tags():
    base_url = "http://127.0.0.1:5000"
    tag_name = "XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03"
    
    print("=== DIAGNÓSTICO WRITE_TAGS ===\n")
    
    # 1. Verificar se servidor está rodando
    try:
        r = requests.get(f"{base_url}/api/current", timeout=5)
        print(f"✅ Servidor respondendo - Status: {r.status_code}")
        current = r.json()
        print(f"   Máquina: {current.get('machine')}")
        print(f"   Conectado: {current.get('connected')}")
    except Exception as e:
        print(f"❌ Servidor não está rodando: {e}")
        return
    
    # 2. Verificar comm_map
    try:
        r = requests.get(f"{base_url}/api/comm_map")
        print(f"\n✅ Comm_map - Status: {r.status_code}")
        comm_map = r.json()
        print(f"   Tipo: {type(comm_map)}")
        
        if isinstance(comm_map, dict):
            for machine, tags in comm_map.items():
                print(f"   Máquina {machine}: {len(tags) if isinstance(tags, list) else 'N/A'} tags")
                if isinstance(tags, list) and len(tags) > 0:
                    print(f"   Primeira tag: {tags[0] if isinstance(tags[0], dict) else 'N/A'}")
                    # Procurar nossa tag
                    found = False
                    for tag in tags:
                        if isinstance(tag, dict) and tag.get('name') == tag_name:
                            found = True
                            print(f"   ✅ Tag {tag_name} encontrada!")
                            print(f"   Detalhes: {tag}")
                            break
                    if not found:
                        print(f"   ❌ Tag {tag_name} NÃO encontrada no comm_map")
    except Exception as e:
        print(f"❌ Erro ao verificar comm_map: {e}")
    
    # 3. Testar leitura da tag
    try:
        r = requests.get(f"{base_url}/api/read_tags?names={tag_name}")
        print(f"\n✅ Leitura da tag - Status: {r.status_code}")
        data = r.json()
        print(f"   Resposta: {data}")
    except Exception as e:
        print(f"❌ Erro na leitura: {e}")
    
    # 4. Testar escrita da tag
    try:
        payload = {tag_name: 4097}
        r = requests.post(f"{base_url}/api/write_tags", json=payload)
        print(f"\n📝 Escrita da tag - Status: {r.status_code}")
        print(f"   Resposta: {r.text}")
    except Exception as e:
        print(f"❌ Erro na escrita: {e}")

if __name__ == "__main__":
    test_write_tags()
