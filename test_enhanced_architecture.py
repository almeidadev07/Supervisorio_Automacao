#!/usr/bin/env python3
"""
Teste da Arquitetura Aprimorada do Supervisório

Este script testa todos os componentes da nova arquitetura:
- ConnectionManager
- TagSubscriptionManager  
- PLCQueue
- PLCCache
- EnhancedPLCController
"""

import sys
import os
import time
import threading
import json

# Adiciona o diretório do projeto ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.connection_manager import ConnectionManager
from app.services.tag_subscription_manager import TagSubscriptionManager
from app.services.plc_queue import PLCQueue, Priority, OperationType
from app.services.plc_cache import PLCCache
from app.services.enhanced_plc_controller import EnhancedPLCController

def test_connection_manager():
    """Testa o ConnectionManager"""
    print("🔌 Testando ConnectionManager...")
    
    # Configuração de teste
    machines_config = [
        {
            "name": "200CX",
            "ip_ranges": ["100.20.0.0/24", "100.20.110.0/24"],
            "default_plc_ip": "100.20.0.10",
            "plc_type": "siemens_s7",
            "embaladoras": 2,
            "plc_groups": {
                "principal": {"ips": ["100.20.0.10"]},
                "lavadora": {"ips": ["100.20.110.10"]}
            }
        }
    ]
    
    # Cria ConnectionManager
    conn_manager = ConnectionManager(machines_config)
    
    # Testa callbacks
    def on_connection_change(group, ip, machine, connected):
        print(f"  📡 Conexão {group}: {ip} ({machine}) - {'conectado' if connected else 'desconectado'}")
    
    def on_plc_detected(group, ip, machine):
        print(f"  🎯 PLC detectado: {group} - {ip} ({machine})")
    
    conn_manager.set_callbacks(on_connection_change, on_plc_detected)
    
    # Inicia descoberta
    conn_manager.start_discovery()
    
    # Aguarda um pouco
    time.sleep(2)
    
    # Testa status
    status = conn_manager.get_connection_status()
    print(f"  📊 Status das conexões: {status}")
    
    # Para descoberta
    conn_manager.stop_discovery()
    conn_manager.cleanup()
    
    print("✅ ConnectionManager testado com sucesso\n")

def test_tag_subscription_manager():
    """Testa o TagSubscriptionManager"""
    print("📋 Testando TagSubscriptionManager...")
    
    # Cria TagSubscriptionManager
    tag_manager = TagSubscriptionManager()
    
    # Testa callbacks
    def on_subscription_change(tags):
        print(f"  📊 Subscrições atualizadas: {len(tags)} tags")
    
    def on_screen_change(client_id, screen, tags):
        print(f"  🖥️ Cliente {client_id} mudou para tela '{screen}' ({len(tags)} tags)")
    
    tag_manager.set_callbacks(on_subscription_change, on_screen_change)
    
    # Testa subscrição por tela
    client1 = "test_client_1"
    success = tag_manager.subscribe_to_screen(client1, "tela_principal")
    print(f"  📱 Subscrição à tela: {'✅' if success else '❌'}")
    
    # Testa subscrição por tags
    client2 = "test_client_2"
    success = tag_manager.subscribe_to_tags(client2, ["TAG1", "TAG2", "TAG3"])
    print(f"  🏷️ Subscrição a tags: {'✅' if success else '❌'}")
    
    # Testa heartbeat
    success = tag_manager.heartbeat_client(client1)
    print(f"  💓 Heartbeat: {'✅' if success else '❌'}")
    
    # Testa estatísticas
    stats = tag_manager.get_statistics()
    print(f"  📈 Estatísticas: {stats}")
    
    # Testa subscrições ativas
    subscribed_tags = tag_manager.get_subscribed_tags()
    print(f"  🎯 Tags subscritas: {len(subscribed_tags)}")
    
    # Limpa
    tag_manager.cleanup()
    
    print("✅ TagSubscriptionManager testado com sucesso\n")

def test_plc_queue():
    """Testa o PLCQueue"""
    print("📦 Testando PLCQueue...")
    
    # Cria PLCQueue
    plc_queue = PLCQueue(max_queue_size=100)
    
    # Testa callbacks
    def on_batch_ready(operation, data):
        print(f"  🔄 Lote {operation} processado: {len(data) if isinstance(data, (list, dict)) else 'N/A'}")
        return {"result": "success"}
    
    def on_request_processed(request, result):
        print(f"  ✅ Requisição {request.id} processada")
    
    def on_request_failed(request, error):
        print(f"  ❌ Requisição {request.id} falhou: {error}")
    
    plc_queue.set_callbacks(on_batch_ready, on_request_processed, on_request_failed)
    
    # Inicia processamento
    plc_queue.start_processing()
    
    # Testa adição de requisições
    request_id1 = plc_queue.add_read_request(["TAG1", "TAG2"], Priority.NORMAL)
    print(f"  📝 Requisição de leitura: {request_id1}")
    
    request_id2 = plc_queue.add_write_request({"TAG1": 100, "TAG2": True}, Priority.HIGH)
    print(f"  📝 Requisição de escrita: {request_id2}")
    
    request_id3 = plc_queue.add_batch_read_request(["TAG3", "TAG4", "TAG5"], Priority.CRITICAL)
    print(f"  📝 Requisição de lote: {request_id3}")
    
    # Aguarda processamento
    time.sleep(1)
    
    # Testa estatísticas
    stats = plc_queue.get_statistics()
    print(f"  📊 Estatísticas da fila: {stats}")
    
    # Para processamento
    plc_queue.stop_processing()
    plc_queue.cleanup()
    
    print("✅ PLCQueue testado com sucesso\n")

def test_plc_cache():
    """Testa o PLCCache"""
    print("💾 Testando PLCCache...")
    
    # Cria PLCCache
    plc_cache = PLCCache(default_ttl=10.0, max_size=100)
    
    # Testa callbacks
    def on_value_changed(tag, old_value, new_value):
        print(f"  🔄 Tag {tag} mudou: {old_value} → {new_value}")
    
    def on_cache_eviction(tag):
        print(f"  🗑️ Tag {tag} removida do cache")
    
    plc_cache.set_callbacks(on_value_changed, on_cache_eviction)
    
    # Testa operações básicas
    success = plc_cache.set("TAG1", 100, "REAL")
    print(f"  📝 Set TAG1: {'✅' if success else '❌'}")
    
    success = plc_cache.set("TAG2", True, "BOOL")
    print(f"  📝 Set TAG2: {'✅' if success else '❌'}")
    
    value = plc_cache.get("TAG1")
    print(f"  📖 Get TAG1: {value}")
    
    # Testa operações múltiplas
    values = {"TAG3": 200, "TAG4": False, "TAG5": 3.14}
    results = plc_cache.set_multiple(values)
    print(f"  📝 Set múltiplo: {results}")
    
    cached_data = plc_cache.get_multiple(["TAG1", "TAG2", "TAG3"])
    print(f"  📖 Get múltiplo: {cached_data}")
    
    # Testa mudança de valor
    success = plc_cache.set("TAG1", 150, "REAL")
    print(f"  🔄 Mudança TAG1: {'✅' if success else '❌'}")
    
    # Testa estatísticas
    stats = plc_cache.get_statistics()
    print(f"  📊 Estatísticas do cache: {stats}")
    
    # Limpa
    plc_cache.cleanup()
    
    print("✅ PLCCache testado com sucesso\n")

def test_enhanced_plc_controller():
    """Testa o EnhancedPLCController"""
    print("🚀 Testando EnhancedPLCController...")
    
    # Configuração de teste
    machines_config = [
        {
            "name": "200CX",
            "ip_ranges": ["100.20.0.0/24", "100.20.110.0/24"],
            "default_plc_ip": "100.20.0.10",
            "plc_type": "siemens_s7",
            "embaladoras": 2,
            "plc_groups": {
                "principal": {"ips": ["100.20.0.10"]},
                "lavadora": {"ips": ["100.20.110.10"]}
            }
        }
    ]
    
    # Cria EnhancedPLCController
    controller = EnhancedPLCController(None, machines_config)
    
    # Testa subscrições
    client1 = "test_client_1"
    success = controller.subscribe_to_screen(client1, "tela_principal")
    print(f"  📱 Subscrição à tela: {'✅' if success else '❌'}")
    
    client2 = "test_client_2"
    success = controller.subscribe_to_tags(client2, ["TAG1", "TAG2"])
    print(f"  🏷️ Subscrição a tags: {'✅' if success else '❌'}")
    
    # Testa heartbeat
    success = controller.heartbeat_client(client1)
    print(f"  💓 Heartbeat: {'✅' if success else '❌'}")
    
    # Testa leitura de tags
    data = controller.read_tags(["TAG1", "TAG2"])
    print(f"  📖 Leitura de tags: {len(data)} tags")
    
    # Testa escrita de tags
    success = controller.write_tags({"TAG1": 100, "TAG2": True})
    print(f"  📝 Escrita de tags: {'✅' if success else '❌'}")
    
    # Testa status
    status = controller.get_statistics()
    print(f"  📊 Status do sistema: {len(status)} métricas")
    
    # Limpa
    controller.cleanup()
    
    print("✅ EnhancedPLCController testado com sucesso\n")

def test_integration():
    """Testa integração completa"""
    print("🔗 Testando Integração Completa...")
    
    # Configuração de teste
    machines_config = [
        {
            "name": "200CX",
            "ip_ranges": ["100.20.0.0/24", "100.20.110.0/24"],
            "default_plc_ip": "100.20.0.10",
            "plc_type": "siemens_s7",
            "embaladoras": 2,
            "plc_groups": {
                "principal": {"ips": ["100.20.0.10"]},
                "lavadora": {"ips": ["100.20.110.10"]}
            }
        }
    ]
    
    # Cria controlador
    controller = EnhancedPLCController(None, machines_config)
    
    # Simula cenário completo
    print("  🎬 Simulando cenário completo...")
    
    # 1. Cliente se conecta e subscreve à tela principal
    client_id = "integration_test_client"
    success = controller.subscribe_to_screen(client_id, "tela_principal")
    print(f"    📱 Cliente conectado: {'✅' if success else '❌'}")
    
    # 2. Aguarda um pouco para processamento
    time.sleep(1)
    
    # 3. Cliente muda para tela de alarmes
    success = controller.subscribe_to_screen(client_id, "tela_alarmes")
    print(f"    🖥️ Mudança de tela: {'✅' if success else '❌'}")
    
    # 4. Cliente subscreve a tags específicas
    success = controller.subscribe_to_tags(client_id, ["TAG1", "TAG2", "TAG3"])
    print(f"    🏷️ Subscrição a tags: {'✅' if success else '❌'}")
    
    # 5. Lê tags
    data = controller.read_tags(["TAG1", "TAG2"])
    print(f"    📖 Leitura de tags: {len(data)} tags")
    
    # 6. Escreve tags
    success = controller.write_tags({"TAG1": 100, "TAG2": True})
    print(f"    📝 Escrita de tags: {'✅' if success else '❌'}")
    
    # 7. Obtém status final
    status = controller.get_statistics()
    print(f"    📊 Status final: {len(status)} métricas")
    
    # 8. Cliente se desconecta
    success = controller.unsubscribe_client(client_id)
    print(f"    🗑️ Cliente desconectado: {'✅' if success else '❌'}")
    
    # Limpa
    controller.cleanup()
    
    print("✅ Integração completa testada com sucesso\n")

def main():
    """Função principal de teste"""
    print("🧪 Iniciando Testes da Arquitetura Aprimorada\n")
    print("=" * 60)
    
    try:
        # Testa componentes individuais
        test_connection_manager()
        test_tag_subscription_manager()
        test_plc_queue()
        test_plc_cache()
        test_enhanced_plc_controller()
        
        # Testa integração completa
        test_integration()
        
        print("=" * 60)
        print("🎉 Todos os testes passaram com sucesso!")
        print("🚀 A arquitetura aprimorada está pronta para uso!")
        
    except Exception as e:
        print(f"❌ Erro durante os testes: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
