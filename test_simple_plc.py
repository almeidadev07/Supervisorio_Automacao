#!/usr/bin/env python3
# test_simple_plc.py
# Teste simples para verificar os componentes do controlador PLC

import sys
import os
import time
from typing import Dict, Any

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_priority_manager():
    """Testa o gerenciador de prioridades"""
    print("🎯 Testando Sistema de Prioridades")
    print("=" * 40)
    
    try:
        from app.services.priority_manager import PriorityManager, TagPriority
        
        manager = PriorityManager()
        
        # Testa registro de tags
        test_tags = [
            "VELOCIDADE_PRINCIPAL",  # Deve ser CRITICAL
            "TEMP_MOTOR",           # Deve ser HIGH
            "STATUS_GERAL",         # Deve ser NORMAL
            "HISTORICO_DADOS"       # Deve ser LOW
        ]
        
        for tag in test_tags:
            tag_info = manager.register_tag(tag)
            print(f"📋 {tag}: {tag_info.priority.name} (crítico: {tag_info.is_critical})")
        
        # Testa throttling
        print("\n⏱️ Testando throttling...")
        for tag in test_tags:
            can_read = manager.can_read(tag)
            can_write = manager.can_write(tag)
            print(f"📊 {tag}: ler={can_read}, escrever={can_write}")
        
        # Testa ordenação por prioridade
        print("\n📋 Testando ordenação por prioridade...")
        ordered_tags = manager.get_read_priority(test_tags)
        print(f"🔢 Ordem de prioridade: {ordered_tags}")
        
        # Testa estatísticas
        stats = manager.get_statistics()
        print(f"\n📊 Estatísticas: {stats}")
        
        manager.cleanup()
        print("✅ Teste do gerenciador de prioridades passou!")
        return True
        
    except Exception as e:
        print(f"❌ Erro no teste do gerenciador de prioridades: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_write_verifier():
    """Testa o verificador de escrita"""
    print("\n🔍 Testando Verificador de Escrita")
    print("=" * 40)
    
    try:
        from app.services.write_verifier import WriteVerifier
        
        # Função mock para leitura
        def mock_read_function(tags):
            return {tag: f"mock_value_{tag}" for tag in tags}
        
        verifier = WriteVerifier(mock_read_function)
        
        # Testa agendamento de verificação
        test_values = {
            "TAG1": 100.0,
            "TAG2": 200.0
        }
        
        verifier.schedule_verification("test_001", test_values)
        print(f"📝 Verificação agendada para: {list(test_values.keys())}")
        
        # Aguarda um pouco
        time.sleep(0.1)
        
        # Testa estatísticas
        stats = verifier.get_statistics()
        print(f"📊 Estatísticas do verificador: {stats}")
        
        verifier.cleanup()
        print("✅ Teste do verificador de escrita passou!")
        return True
        
    except Exception as e:
        print(f"❌ Erro no teste do verificador de escrita: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_imports():
    """Testa se os módulos podem ser importados"""
    print("📦 Testando Importações")
    print("=" * 30)
    
    modules = [
        "app.services.priority_manager",
        "app.services.write_verifier",
        "app.services.plc_controller_final"
    ]
    
    success = True
    for module in modules:
        try:
            __import__(module)
            print(f"✅ {module}")
        except Exception as e:
            print(f"❌ {module}: {e}")
            success = False
    
    return success

if __name__ == "__main__":
    print("🚀 Iniciando Testes Simples do Controlador PLC")
    print("=" * 60)
    
    # Testa importações
    imports_ok = test_imports()
    
    if not imports_ok:
        print("\n❌ Falha nas importações - verifique dependências")
        sys.exit(1)
    
    # Testa sistema de prioridades
    priority_ok = test_priority_manager()
    
    # Testa verificador de escrita
    verifier_ok = test_write_verifier()
    
    # Resultado final
    if priority_ok and verifier_ok:
        print("\n🎉 Todos os testes passaram com sucesso!")
        print("✅ Os componentes do controlador PLC estão funcionando")
    else:
        print("\n❌ Alguns testes falharam")
        print("⚠️ Verifique os logs para mais detalhes")
    
    print("\n" + "=" * 60)
    print("🏁 Testes concluídos")
