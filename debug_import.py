#!/usr/bin/env python3
"""
Debug de importações
"""

import sys
import os

print("🔍 Debug de importações...")

try:
    print("1. Testando importação do Flask...")
    from flask import Flask
    print("✅ Flask importado")
    
    print("2. Testando importação do SocketIO...")
    from flask_socketio import SocketIO
    print("✅ SocketIO importado")
    
    print("3. Testando importação do enhanced_api_controller...")
    from app.controllers.enhanced_api_controller import enhanced_api_bp, init_enhanced_controller
    print("✅ enhanced_api_controller importado")
    
    print("4. Testando criação da aplicação...")
    app = Flask(__name__)
    socketio = SocketIO(app, cors_allowed_origins="*")
    print("✅ Aplicação Flask criada")
    
    print("5. Testando carregamento de configuração...")
    import json
    machines_config_path = os.path.join('app', 'data', 'machines_config.json')
    with open(machines_config_path, 'r', encoding='utf-8') as f:
        machines_config = json.load(f)
    print(f"✅ Configuração carregada: {len(machines_config)} máquinas")
    
    print("6. Testando inicialização do controlador...")
    enhanced_plc_controller = init_enhanced_controller(socketio, machines_config)
    print("✅ Controlador inicializado")
    
    print("🎉 Todas as importações funcionando!")
    
except Exception as e:
    print(f"❌ Erro na linha {e.__traceback__.tb_lineno}: {e}")
    import traceback
    traceback.print_exc()
