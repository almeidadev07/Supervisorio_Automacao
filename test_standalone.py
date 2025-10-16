#!/usr/bin/env python3
"""
Teste do Controlador PLC Standalone
"""

import sys
import os
import time
import threading
from unittest.mock import Mock

# Adiciona o diretório do projeto ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Mock do socketio
class MockSocketIO:
    def emit(self, event, data):
        print(f"[MOCK_SOCKETIO] Emitindo {event}: {len(data)} tags")

def test_standalone_controller():
    """Testa o controlador standalone"""
    print("=" * 60)
    print("TESTE DO CONTROLADOR PLC STANDALONE")
    print("=" * 60)
    
    # Configuração de teste
    machines_config = [
        {
            'name': '700CX',
            'default_plc_ip': '100.70.0.10',
            'plc_type': 'siemens_s7',
            'plc_port': 102,
            'plc_rack': 0,
            'plc_slot': 1
        }
    ]
    
    # Cria controlador
    from app.services.plc_controller_standalone import StandalonePLCController
    
    controller = StandalonePLCController(MockSocketIO(), machines_config)
    
    print(f"\n✅ Controlador criado com sucesso")
    print(f"📊 Estatísticas iniciais: {controller.get_statistics()}")
    
    # Testa configuração de máquina
    print(f"\n🔧 Configurando máquina 700CX...")
    success, msg = controller.set_active_machine(machines_config[0])
    print(f"Resultado: {success} - {msg}")
    
    # Aguarda um pouco para o polling
    print(f"\n⏳ Aguardando 3 segundos para polling...")
    time.sleep(3)
    
    # Testa leitura de tags
    print(f"\n📖 Testando leitura de tags...")
    test_tags = ['VELOCIDADE_PROGRAMADA', 'COMANDO_INICIO', 'ALARME_GERAL']
    data = controller.read_tags(test_tags)
    print(f"Dados lidos: {data}")
    
    # Testa subscrição
    print(f"\n📋 Testando subscrição de tags...")
    client_id = "test_client_001"
    subscribed = controller.subscribe_tags(client_id, test_tags)
    print(f"Subscrição: {subscribed}")
    
    # Aguarda mais um pouco para ver o polling com subscrições
    print(f"\n⏳ Aguardando 5 segundos para polling com subscrições...")
    time.sleep(5)
    
    # Testa escrita
    print(f"\n✏️ Testando escrita de tags...")
    write_data = {'VELOCIDADE_PROGRAMADA': 150.0, 'COMANDO_INICIO': 1}
    write_success = controller.write_tags(write_data)
    print(f"Escrita: {write_success}")
    
    # Testa heartbeat
    print(f"\n💓 Testando heartbeat...")
    heartbeat = controller.heartbeat_client(client_id)
    print(f"Heartbeat: {heartbeat}")
    
    # Verifica estatísticas finais
    print(f"\n📊 Estatísticas finais:")
    stats = controller.get_statistics()
    for key, value in stats.items():
        print(f"  {key}: {value}")
    
    # Testa desconexão
    print(f"\n🔌 Testando desconexão...")
    controller.cleanup()
    
    print(f"\n✅ Teste concluído com sucesso!")
    return True

if __name__ == "__main__":
    try:
        success = test_standalone_controller()
        if success:
            print(f"\n🎉 TODOS OS TESTES PASSARAM!")
            sys.exit(0)
        else:
            print(f"\n❌ ALGUNS TESTES FALHARAM!")
            sys.exit(1)
    except Exception as e:
        print(f"\n💥 ERRO NO TESTE: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
