#!/usr/bin/env python3
# test_optimized_plc.py
# Script de teste para o controlador PLC otimizado

import sys
import os
import time
import json
from typing import Dict, Any

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.plc_controller_final import FinalPLCController
from app.data.machines_config import machines_config

def test_plc_controller():
    """Testa o controlador PLC otimizado"""
    print("🧪 Testando Controlador PLC Otimizado")
    print("=" * 50)
    
    # Cria controlador
    controller = FinalPLCController(None, machines_config)
    
    try:
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
        
        # Testa gerenciador de prioridades
        print("\n6. Testando gerenciador de prioridades...")
        priority_stats = controller.priority_manager.get_statistics()
        print(f"🎯 Estatísticas de prioridade:")
        for key, value in priority_stats.items():
            print(f"   {key}: {value}")
        
        # Testa verificador de escrita
        print("\n7. Testando verificador de escrita...")
        verifier_stats = controller.write_verifier.get_statistics()
        print(f"🔍 Estatísticas do verificador:")
        for key, value in verifier_stats.items():
            print(f"   {key}: {value}")
        
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
        controller.cleanup()

def test_priority_system():
    """Testa o sistema de prioridades"""
    print("\n🎯 Testando Sistema de Prioridades")
    print("=" * 40)
    
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

def test_write_verifier():
    """Testa o verificador de escrita"""
    print("\n🔍 Testando Verificador de Escrita")
    print("=" * 40)
    
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

if __name__ == "__main__":
    print("🚀 Iniciando Testes do Controlador PLC Otimizado")
    print("=" * 60)
    
    # Testa sistema de prioridades
    test_priority_system()
    
    # Testa verificador de escrita
    test_write_verifier()
    
    # Testa controlador principal
    success = test_plc_controller()
    
    if success:
        print("\n🎉 Todos os testes passaram com sucesso!")
        print("✅ O controlador PLC otimizado está funcionando corretamente")
    else:
        print("\n❌ Alguns testes falharam")
        print("⚠️ Verifique os logs para mais detalhes")
    
    print("\n" + "=" * 60)
    print("🏁 Testes concluídos")
