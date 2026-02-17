#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Script para descobrir tamanho das DBs de alarmes"""

import snap7
import time

# DBs que precisamos descobrir o tamanho
DBS_TO_CHECK = [6, 31, 32, 101, 103, 104, 181, 200, 201, 202, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 229, 360, 361, 362, 363, 364, 365, 366, 400]

PLC_IP = "100.70.0.10"
RACK = 0
SLOT = 1

print(f"🔍 Conectando ao PLC {PLC_IP}...")

client = snap7.client.Client()

try:
    client.connect(PLC_IP, RACK, SLOT)
    print(f"✅ Conectado!")
    
    print(f"\n📊 Descobrindo tamanho das DBs...")
    print("=" * 60)
    
    db_sizes = {}
    
    for db_num in DBS_TO_CHECK:
        # Tenta tamanhos crescentes até encontrar erro
        for size in [10, 50, 100, 200, 256, 500, 1000, 2000, 5000]:
            try:
                data = client.db_read(db_num, 0, size)
                db_sizes[db_num] = size
                print(f"  DB{db_num:3d}: >= {size:4d} bytes ✓")
                time.sleep(0.1)
            except Exception as e:
                error_msg = str(e)
                if "Address out of range" in error_msg or "out of range" in error_msg.lower():
                    # Tamanho anterior era o máximo
                    if db_num in db_sizes:
                        print(f"  DB{db_num:3d}: ~{db_sizes[db_num]:4d} bytes (máximo)")
                    break
                elif "DB does not exist" in error_msg or "does not exist" in error_msg.lower():
                    print(f"  DB{db_num:3d}: NÃO EXISTE ❌")
                    break
                else:
                    print(f"  DB{db_num:3d}: Erro: {error_msg}")
                    break
    
    print("\n" + "=" * 60)
    print("📝 Adicione estas linhas ao datahub.py na configuração DBS:\n")
    
    for db_num in sorted(db_sizes.keys()):
        size = db_sizes[db_num]
        print(f'    {{"id": {db_num}, "size": {size}}},  # DB{db_num}')
    
    print("\n" + "=" * 60)

except Exception as e:
    print(f"❌ Erro ao conectar: {e}")

finally:
    if client:
        client.disconnect()
        client.destroy()
    print("\n✅ Conexão fechada")


