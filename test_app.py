#!/usr/bin/env python3
"""
Teste simples para verificar se a aplicação carrega corretamente
"""

try:
    print("🔄 Tentando importar create_app...")
    from app import create_app
    print("✅ Importação bem-sucedida")
    
    print("🔄 Tentando criar aplicação...")
    app, socketio = create_app()
    print("✅ Aplicação criada com sucesso!")
    
    print("🔄 Verificando tipos...")
    print(f"  - app: {type(app)}")
    print(f"  - socketio: {type(socketio)}")
    
    print("🎉 Tudo funcionando perfeitamente!")
    
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()
