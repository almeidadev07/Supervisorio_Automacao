#!/usr/bin/env python3
"""
Execução simples da aplicação
"""

import sys
import os

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    print("🚀 Iniciando Supervisório Aprimorado...")
    
    # Importa diretamente do módulo app
    from app import create_app
    
    print("✅ Módulo importado com sucesso")
    
    # Cria aplicação
    app, socketio = create_app()
    
    print("✅ Aplicação criada com sucesso")
    print("🌐 Iniciando servidor...")
    
    # Executa servidor
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
    
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()
