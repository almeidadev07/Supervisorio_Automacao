#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para descobrir o tamanho real das DBs no PLC
"""

import snap7
import sys

# Configuração do PLC
PLC_IP = "100.70.0.10"
PLC_RACK = 0
PLC_SLOT = 1

# DBs a testar
DBS_PARA_TESTAR = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100]

print("=" * 70)
print("🔍 DESCOBRINDO TAMANHO DAS DBs NO PLC")
print("=" * 70)
print(f"PLC: {PLC_IP}")
print(f"Rack/Slot: {PLC_RACK}/{PLC_SLOT}")
print()

try:
    # Conecta ao PLC
    print("Conectando ao PLC...")
    client = snap7.client.Client()
    client.connect(PLC_IP, PLC_RACK, PLC_SLOT)
    
    if not client.get_connected():
        print("❌ Não conseguiu conectar ao PLC!")
        sys.exit(1)
    
    print("✅ Conectado ao PLC!")
    print()
    print("-" * 70)
    
    dbs_encontradas = []
    
    # Testa cada DB
    for db_id in DBS_PARA_TESTAR:
        print(f"\nTestando DB{db_id}...", end=" ")
        
        # Tenta descobrir o tamanho começando pequeno
        tamanho_encontrado = None
        
        # Testa tamanhos comuns
        tamanhos_para_testar = [1, 10, 50, 100, 200, 256, 512, 1024, 2048, 4096]
        
        for tamanho in tamanhos_para_testar:
            try:
                # Tenta ler
                data = client.db_read(db_id, 0, tamanho)
                tamanho_encontrado = tamanho
            except Exception as e:
                # Se der erro, o tamanho anterior era o máximo
                break
        
        if tamanho_encontrado:
            print(f"✅ Encontrada! Tamanho: {tamanho_encontrado} bytes")
            dbs_encontradas.append({
                'id': db_id,
                'size': tamanho_encontrado
            })
        else:
            print(f"❌ Não encontrada ou sem acesso")
    
    # Desconecta
    client.disconnect()
    
    print()
    print("=" * 70)
    print("📊 RESUMO - DBs Encontradas")
    print("=" * 70)
    
    if dbs_encontradas:
        print()
        print("DBs disponíveis:")
        for db in dbs_encontradas:
            print(f"   DB{db['id']}: {db['size']} bytes")
        
        print()
        print("-" * 70)
        print("✏️  COPIE ESTA CONFIGURAÇÃO PARA O DATAHUB.PY:")
        print("-" * 70)
        print()
        print("DBS = [")
        for db in dbs_encontradas:
            print(f'    {{"id": {db["id"]}, "size": {db["size"]}}},')
        print("]")
        print()
        
        print("-" * 70)
        print("📝 Edite datahub.py linha ~46 e substitua a configuração DBS")
        print()
    else:
        print()
        print("❌ Nenhuma DB encontrada!")
        print()
        print("Possíveis causas:")
        print("   1. PLC não tem DBs criadas")
        print("   2. Proteção de acesso no PLC")
        print("   3. DBs têm números diferentes")
        print()
        print("💡 Solução:")
        print("   - Verifique no TIA Portal quais DBs existem")
        print("   - Habilite GET/PUT no PLC")
        print("   - Modifique DBS_PARA_TESTAR no script")
    
    print("=" * 70)

except Exception as e:
    print(f"❌ Erro: {e}")
    print()
    print("Possíveis causas:")
    print("   1. PLC não está acessível")
    print("   2. IP/Rack/Slot incorretos")
    print("   3. Firewall bloqueando porta 102")
    sys.exit(1)

