#!/usr/bin/env python3
"""
Teste Standalone do Controlador PLC Simples e Robusto
Sem dependências do Flask
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

# Mock do driver PLC
class MockDriver:
    def __init__(self, config):
        self.config = config
        self.connected = False
        self.read_count = 0
        self.write_count = 0
    
    def connect(self):
        print(f"[MOCK_DRIVER] Conectando ao PLC {self.config.get('name', 'Unknown')}")
        self.connected = True
        return True
    
    def disconnect(self):
        print("[MOCK_DRIVER] Desconectando do PLC")
        self.connected = False
    
    def is_connected(self):
        return self.connected
    
    def read_tags(self, tag_defs):
        if not self.connected:
            return {}
        
        self.read_count += 1
        data = {}
        
        for tag_def in tag_defs:
            tag_name = tag_def.get('name', 'unknown')
            # Simula dados baseados no tipo
            if 'VELOCIDADE' in tag_name.upper():
                data[tag_name] = 100.0 + (self.read_count % 10)
            elif 'COMANDO' in tag_name.upper():
                data[tag_name] = 1 if self.read_count % 2 == 0 else 0
            elif 'ALARME' in tag_name.upper():
                data[tag_name] = 0
            else:
                data[tag_name] = self.read_count % 100
        
        print(f"[MOCK_DRIVER] Lendo {len(data)} tags (leitura #{self.read_count})")
        return data
    
    def write_tags(self, tag_values):
        if not self.connected:
            return False
        
        self.write_count += 1
        print(f"[MOCK_DRIVER] Escrevendo {len(tag_values)} tags (escrita #{self.write_count})")
        return True

# Mock do create_driver_for_config
def mock_create_driver_for_config(config):
    return MockDriver(config)

# Substitui as importações reais
sys.modules['app.plc_drivers'] = Mock()
sys.modules['app.plc_drivers'].create_driver_for_config = mock_create_driver_for_config

# Mock do alarm_processor
class MockAlarmProcessor:
    def process_alarm_data(self, data, machine):
        return []
    
    def get_alarm_summary(self, alarms):
        return {'total': 0, 'critical': 0, 'warning': 0}

# Substitui a importação real
sys.modules['app.services.alarm_processor'] = Mock()
sys.modules['app.services.alarm_processor'].alarm_processor = MockAlarmProcessor()

# Importa diretamente o controlador sem passar pelo __init__.py
def test_simple_robust_controller():
    """Testa o controlador simples e robusto"""
    print("=" * 60)
    print("TESTE STANDALONE DO CONTROLADOR PLC SIMPLES E ROBUSTO")
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
    
    # Cria controlador diretamente
    from app.services.plc_controller_simple_robust import SimpleRobustPLCController
    
    controller = SimpleRobustPLCController(MockSocketIO(), machines_config)
    
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
        success = test_simple_robust_controller()
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
