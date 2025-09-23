#!/usr/bin/env python3
"""
Teste simples de conexão com PLC 700CX
"""

import sys
import os

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    print("🔍 Testando conexão simples com PLC 700CX...")
    
    # Importa módulos
    from app.plc_drivers import create_driver_for_config
    import json
    
    # Carrega configuração
    with open('app/data/machines_config.json', 'r', encoding='utf-8') as f:
        machines_config = json.load(f)
    
    # Encontra configuração da 700CX
    config_700cx = None
    for config in machines_config:
        if config['name'] == '700CX':
            config_700cx = config
            break
    
    if not config_700cx:
        print("❌ Configuração 700CX não encontrada")
        exit(1)
    
    print(f"✅ Configuração 700CX encontrada: {config_700cx['name']}")
    print(f"   IP padrão: {config_700cx['default_plc_ip']}")
    
    # Cria driver
    driver = create_driver_for_config(config_700cx)
    print(f"✅ Driver criado: {type(driver).__name__}")
    
    # Tenta conectar
    print("🔄 Tentando conectar...")
    if driver.connect():
        print("✅ Conexão estabelecida!")
        
        # Testa leitura de uma tag
        print("🔄 Testando leitura de tag...")
        try:
            # Tenta ler uma tag simples
            result = driver.read_tags(['XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL'])
            print(f"✅ Leitura de tag: {result}")
        except Exception as e:
            print(f"⚠️ Erro na leitura: {e}")
        
        # Desconecta
        driver.disconnect()
        print("🔌 Desconectado")
    else:
        print("❌ Falha na conexão")
    
    print("\n🎉 Teste concluído!")
    
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()
