#!/usr/bin/env python3
"""
Teste específico para PLC 700CX (100.70.0.10)
"""

import sys
import os
import time
import socket

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    print("🔍 Testando PLC 700CX (100.70.0.10)...")
    
    # Teste de conectividade
    print("1. Testando conectividade...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(3)
    result = sock.connect_ex(('100.70.0.10', 102))
    sock.close()
    print(f"   Conexão com 100.70.0.10:102 = {result} (0 = sucesso)")
    
    # Teste de ping
    print("2. Testando ping...")
    import subprocess
    result = subprocess.run(["ping", "-n", "1", "-w", "1000", "100.70.0.10"], 
                          capture_output=True, timeout=2)
    print(f"   Ping para 100.70.0.10 = {result.returncode} (0 = sucesso)")
    
    # Teste de descoberta
    print("3. Testando descoberta...")
    from app.services.connection_manager import ConnectionManager
    import json
    
    # Carrega configuração
    with open('app/data/machines_config.json', 'r', encoding='utf-8') as f:
        machines_config = json.load(f)
    
    # Cria gerenciador
    conn_manager = ConnectionManager(machines_config)
    
    # Testa descoberta do grupo principal
    print("   Testando descoberta do grupo principal...")
    conn_manager._scan_group_plcs('principal')
    
    # Aguarda um pouco
    time.sleep(2)
    
    # Verifica status
    status = conn_manager.get_connection_status()
    print(f"   Status das conexões:")
    for group, info in status.items():
        print(f"     {group}: {info}")
    
    # Testa descoberta do grupo lavadora
    print("   Testando descoberta do grupo lavadora...")
    conn_manager._scan_group_plcs('lavadora')
    
    # Aguarda um pouco
    time.sleep(2)
    
    # Verifica status novamente
    status = conn_manager.get_connection_status()
    print(f"   Status das conexões após teste lavadora:")
    for group, info in status.items():
        print(f"     {group}: {info}")
    
    print("\n🎉 Teste concluído!")
    
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()
