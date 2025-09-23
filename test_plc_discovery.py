#!/usr/bin/env python3
"""
Teste de descoberta de PLC
"""

import sys
import os
import time

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    print("🔍 Testando descoberta de PLC...")
    
    # Importa módulos
    from app.services.connection_manager import ConnectionManager
    import json
    
    # Carrega configuração de máquinas
    with open('app/data/machines_config.json', 'r', encoding='utf-8') as f:
        machines_config = json.load(f)
    
    print("✅ Módulos importados com sucesso")
    
    # Cria gerenciador de conexões
    conn_manager = ConnectionManager(machines_config)
    
    print("✅ Gerenciador de conexões criado")
    
    # Testa descoberta do grupo principal
    print("\n🔍 Testando descoberta do grupo principal...")
    conn_manager._scan_group_plcs('principal')
    
    # Aguarda um pouco
    time.sleep(2)
    
    # Verifica status das conexões
    status = conn_manager.get_connection_status()
    print(f"\n📊 Status das conexões:")
    for group, info in status.items():
        print(f"  {group}: {info}")
    
    # Testa descoberta do grupo lavadora
    print("\n🔍 Testando descoberta do grupo lavadora...")
    conn_manager._scan_group_plcs('lavadora')
    
    # Aguarda um pouco
    time.sleep(2)
    
    # Verifica status das conexões novamente
    status = conn_manager.get_connection_status()
    print(f"\n📊 Status das conexões após teste lavadora:")
    for group, info in status.items():
        print(f"  {group}: {info}")
    
    print("\n🎉 Teste concluído!")
    
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()
