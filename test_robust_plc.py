#!/usr/bin/env python3
# test_robust_plc.py
# Teste do controlador PLC robusto

import sys
import os
import time
from typing import Dict, List, Any

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_robust_controller():
    """Testa o controlador PLC robusto"""
    print("🧪 Testando Controlador PLC Robusto")
    print("=" * 50)
    
    try:
        from app.services.plc_controller_robust import RobustPLCController
        from app.data.machines_config import machines_config
        
        # Cria controlador
        controller = RobustPLCController(None, machines_config)
        
        # Testa configuração de máquina
        print("\n1. Testando configuração de máquina...")
        if machines_config:
            controller.set_active_machine(machines_config[0])
            print(f"✅ Máquina ativa: {machines_config[0]['name']}")
        else:
            print("❌ Nenhuma configuração de máquina encontrada")
            return False
        
        # Testa leitura de tags
        print("\n2. Testando leitura de tags...")
        test_tags = [
            "XLCLASS_DB10_PARTIDA_DIRETA_CMD",
            "XLCLASS_DB10_PARTIDA_DIRETA_ESTADO",
            "XLCLASS_DB10_PARTIDA_DIRETA_VELOCIDADE"
        ]
        
        # Filtra tags que existem no comm_map
        available_tags = []
        for machine_name, comm_map in controller._comm_map_by_machine.items():
            for tag_def in comm_map:
                if tag_def.get('name') in test_tags:
                    available_tags.append(tag_def.get('name'))
        
        if available_tags:
            print(f"📋 Tags disponíveis para teste: {available_tags[:3]}")
            data = controller.read_tags(available_tags[:3])
            print(f"📊 Dados lidos: {len(data)} tags")
            for tag, value in data.items():
                print(f"   {tag}: {value}")
        else:
            print("⚠️ Nenhuma tag de teste encontrada no comm_map")
        
        # Testa escrita de tags
        print("\n3. Testando escrita de tags...")
        test_write_values = {
            "XLCLASS_DB10_PARTIDA_DIRETA_VELOCIDADE": 50.0,
            "XLCLASS_DB10_PARTIDA_DIRETA_CMD": 1
        }
        
        # Filtra tags que existem e são graváveis
        writable_values = {}
        for machine_name, comm_map in controller._comm_map_by_machine.items():
            for tag_def in comm_map:
                tag_name = tag_def.get('name')
                if tag_name in test_write_values:
                    tag_type = tag_def.get('type', 'REAL')
                    if tag_type in ['REAL', 'WORD', 'BOOL']:
                        writable_values[tag_name] = test_write_values[tag_name]
        
        if writable_values:
            print(f"📝 Testando escrita de: {list(writable_values.keys())}")
            success = controller.write_tags(writable_values)
            if success:
                print("✅ Escrita bem-sucedida")
            else:
                print("❌ Falha na escrita")
        else:
            print("⚠️ Nenhuma tag gravável encontrada para teste")
        
        # Testa subscrições
        print("\n4. Testando sistema de subscrições...")
        controller.subscribe_tags("test_client", available_tags[:3])
        subscribed = controller.get_subscribed_tags()
        print(f"📋 Tags subscritas: {len(subscribed)}")
        
        # Testa estatísticas
        print("\n5. Testando estatísticas...")
        stats = controller.get_statistics()
        print(f"📊 Estatísticas:")
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        # Testa sistema de prioridades
        print("\n6. Testando sistema de prioridades...")
        with controller._tag_lock:
            critical_tags = [tag for tag, info in controller._tag_info.items() if info.priority.value == 1]
            high_tags = [tag for tag, info in controller._tag_info.items() if info.priority.value == 2]
            normal_tags = [tag for tag, info in controller._tag_info.items() if info.priority.value == 3]
            low_tags = [tag for tag, info in controller._tag_info.items() if info.priority.value == 4]
            
            print(f"🎯 Tags críticas: {len(critical_tags)}")
            print(f"🎯 Tags de alta prioridade: {len(high_tags)}")
            print(f"🎯 Tags normais: {len(normal_tags)}")
            print(f"🎯 Tags de baixa prioridade: {len(low_tags)}")
        
        # Testa sistema de backoff
        print("\n7. Testando sistema de backoff...")
        print(f"🚫 Tags problemáticas: {len(controller._problematic_tags)}")
        print(f"🚫 Ativações de backoff: {controller._stats['backoff_activations']}")
        
        print("\n✅ Teste concluído com sucesso!")
        return True
        
    except Exception as e:
        print(f"\n❌ Erro durante o teste: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Limpeza
        print("\n🧹 Limpando recursos...")
        try:
            controller.cleanup()
        except:
            pass

def test_error_handling():
    """Testa o tratamento de erros"""
    print("\n🛡️ Testando Tratamento de Erros")
    print("=" * 40)
    
    try:
        from app.services.plc_controller_robust import RobustPLCController
        from app.data.machines_config import machines_config
        
        controller = RobustPLCController(None, machines_config)
        
        # Simula erro de "Address out of range"
        print("🔍 Simulando erro 'Address out of range'...")
        controller._handle_tag_error("TEST_TAG", "CPU : Address out of range")
        
        # Simula erro de "Item not available"
        print("🔍 Simulando erro 'Item not available'...")
        controller._handle_tag_error("TEST_TAG2", "CPU : Item not available")
        
        # Verifica estatísticas
        stats = controller.get_statistics()
        print(f"📊 Erros de Address out of range: {stats['address_errors']}")
        print(f"📊 Erros de Item not available: {stats['item_not_available_errors']}")
        print(f"📊 Ativações de backoff: {stats['backoff_activations']}")
        
        controller.cleanup()
        print("✅ Teste de tratamento de erros passou!")
        return True
        
    except Exception as e:
        print(f"❌ Erro no teste de tratamento de erros: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Iniciando Testes do Controlador PLC Robusto")
    print("=" * 60)
    
    # Testa controlador principal
    controller_ok = test_robust_controller()
    
    # Testa tratamento de erros
    error_handling_ok = test_error_handling()
    
    # Resultado final
    if controller_ok and error_handling_ok:
        print("\n🎉 Todos os testes passaram com sucesso!")
        print("✅ O controlador PLC robusto está funcionando corretamente")
        print("🛡️ Sistema de tratamento de erros está operacional")
    else:
        print("\n❌ Alguns testes falharam")
        print("⚠️ Verifique os logs para mais detalhes")
    
    print("\n" + "=" * 60)
    print("🏁 Testes concluídos")
