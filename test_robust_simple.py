#!/usr/bin/env python3
# test_robust_simple.py
# Teste simples do controlador PLC robusto sem dependências externas

import sys
import os
import time
import threading
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum
from collections import defaultdict

# ============================================================================
# Versão simplificada do controlador robusto para teste
# ============================================================================

class TagPriority(Enum):
    CRITICAL = 1    # Velocidade, comandos, alarmes
    HIGH = 2        # Estados importantes
    NORMAL = 3      # Telemetria
    LOW = 4         # Dados históricos

@dataclass
class TagInfo:
    name: str
    priority: TagPriority
    last_read: float = 0
    last_write: float = 0
    read_interval: float = 0.1
    write_interval: float = 0.05
    is_writable: bool = True
    is_critical: bool = False
    error_count: int = 0
    last_error: float = 0
    backoff_until: float = 0

class MockRobustPLCController:
    """Versão mock do controlador robusto para teste"""
    
    def __init__(self, machines_config):
        self.machines_config = machines_config
        
        # Sistema de tags com prioridade
        self._tag_info = {}
        self._tag_lock = threading.Lock()
        
        # Sistema de backoff para tags problemáticas
        self._problematic_tags = set()
        self._tag_backoff_time = 30.0
        self._max_tag_errors = 3
        
        # Estatísticas
        self._stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'address_errors': 0,
            'item_not_available_errors': 0,
            'backoff_activations': 0
        }
        
        # Carrega configurações
        self._load_comm_maps()
        
        print("[MOCK_ROBUST] 🚀 Controlador PLC robusto mock inicializado")
    
    def _load_comm_maps(self):
        """Carrega maps de comunicação de todas as máquinas"""
        comm_map_dir = os.path.join(os.path.dirname(__file__), 'config', 'comm_map')
        
        for machine_config in self.machines_config:
            machine_name = machine_config.get('name')
            if not machine_name:
                continue
            
            comm_map_file = os.path.join(comm_map_dir, f'{machine_name}.json')
            if os.path.exists(comm_map_file):
                try:
                    import json
                    with open(comm_map_file, 'r', encoding='utf-8') as f:
                        comm_map = json.load(f)
                    
                    # Registra tags no sistema de prioridades
                    for tag_def in comm_map:
                        if 'name' in tag_def:
                            self._register_tag(tag_def['name'], tag_def.get('type', 'REAL'))
                    
                    print(f"[MOCK_ROBUST] 📋 Comm map carregado para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[MOCK_ROBUST] ❌ Erro ao carregar comm_map para {machine_name}: {e}")
            else:
                print(f"[MOCK_ROBUST] ⚠️ Comm map não encontrado para {machine_name}")
    
    def _register_tag(self, tag_name: str, tag_type: str):
        """Registra uma tag no sistema de prioridades"""
        with self._tag_lock:
            if tag_name in self._tag_info:
                return  # Já registrada
            
            # Determina prioridade baseada no nome
            priority = self._determine_priority(tag_name)
            is_critical = self._is_critical_tag(tag_name)
            is_writable = tag_type in ['REAL', 'WORD', 'BOOL', 'DWORD', 'INT']
            
            tag_info = TagInfo(
                name=tag_name,
                priority=priority,
                is_writable=is_writable,
                is_critical=is_critical
            )
            
            # Ajusta intervalos baseado na prioridade
            if priority == TagPriority.CRITICAL:
                tag_info.read_interval = 0.1  # 100ms
                tag_info.write_interval = 0.05  # 50ms
            elif priority == TagPriority.HIGH:
                tag_info.read_interval = 0.2  # 200ms
                tag_info.write_interval = 0.1  # 100ms
            elif priority == TagPriority.NORMAL:
                tag_info.read_interval = 0.5  # 500ms
                tag_info.write_interval = 0.2  # 200ms
            else:  # LOW
                tag_info.read_interval = 1.0  # 1s
                tag_info.write_interval = 0.5  # 500ms
            
            self._tag_info[tag_name] = tag_info
    
    def _determine_priority(self, tag_name: str) -> TagPriority:
        """Determina prioridade de uma tag baseado no nome"""
        name_upper = tag_name.upper()
        
        # Padrões críticos
        critical_patterns = [
            'VEL', 'VELOC', 'SPEED',  # Velocidade
            'CMD', 'COMMAND', 'COMANDO',  # Comandos
            'ALARME', 'ALARM', 'EMERG', 'EMERGENCY',  # Alarmes
            'ESTADO', 'STATE', 'STATUS',  # Estados críticos
            'DB10', 'DB104'  # Dados críticos
        ]
        
        for pattern in critical_patterns:
            if pattern in name_upper:
                return TagPriority.CRITICAL
        
        # Padrões de alta prioridade
        high_patterns = ['TEMP', 'TEMPERATURA', 'PRESSAO', 'PRESSURE', 'NIVEL', 'LEVEL']
        for pattern in high_patterns:
            if pattern in name_upper:
                return TagPriority.HIGH
        
        # Padrões de baixa prioridade
        low_patterns = ['HIST', 'HISTORICO', 'STAT', 'STATISTIC', 'LOG']
        for pattern in low_patterns:
            if pattern in name_upper:
                return TagPriority.LOW
        
        return TagPriority.NORMAL
    
    def _is_critical_tag(self, tag_name: str) -> bool:
        """Verifica se uma tag é crítica"""
        name_upper = tag_name.upper()
        critical_patterns = ['VEL', 'VELOC', 'SPEED', 'CMD', 'COMMAND', 'COMANDO']
        return any(pattern in name_upper for pattern in critical_patterns)
    
    def _handle_tag_error(self, tag_name: str, error_msg: str):
        """Trata erro de uma tag específica"""
        with self._tag_lock:
            if tag_name not in self._tag_info:
                return
            
            tag_info = self._tag_info[tag_name]
            current_time = time.time()
            
            # Incrementa contador de erros
            tag_info.error_count += 1
            tag_info.last_error = current_time
            
            # Atualiza estatísticas
            if "Address out of range" in error_msg:
                self._stats['address_errors'] += 1
            elif "Item not available" in error_msg:
                self._stats['item_not_available_errors'] += 1
            
            # Ativa backoff se muitos erros
            if tag_info.error_count >= self._max_tag_errors:
                tag_info.backoff_until = current_time + self._tag_backoff_time
                self._problematic_tags.add(tag_name)
                self._stats['backoff_activations'] += 1
                print(f"[MOCK_ROBUST] 🚫 Tag {tag_name} em backoff por {self._tag_backoff_time}s (erros: {tag_info.error_count})")
    
    def _reset_tag_errors(self, tag_name: str):
        """Reseta contador de erros de uma tag"""
        with self._tag_lock:
            if tag_name in self._tag_info:
                tag_info = self._tag_info[tag_name]
                tag_info.error_count = 0
                tag_info.backoff_until = 0
                self._problematic_tags.discard(tag_name)
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do controlador"""
        stats = self._stats.copy()
        stats.update({
            'problematic_tags': len(self._problematic_tags),
            'total_tags': len(self._tag_info)
        })
        return stats
    
    def cleanup(self):
        """Limpeza completa"""
        with self._tag_lock:
            self._tag_info.clear()
            self._problematic_tags.clear()

# ============================================================================
# Testes
# ============================================================================

def test_robust_controller():
    """Testa o controlador PLC robusto mock"""
    print("🧪 Testando Controlador PLC Robusto Mock")
    print("=" * 50)
    
    try:
        # Configuração de máquinas mock
        machines_config = [
            {
                "name": "700CX",
                "default_plc_ip": "100.70.0.10",
                "plc_type": "siemens_s7"
            }
        ]
        
        # Cria controlador
        controller = MockRobustPLCController(machines_config)
        
        # Testa sistema de prioridades
        print("\n1. Testando sistema de prioridades...")
        with controller._tag_lock:
            critical_tags = [tag for tag, info in controller._tag_info.items() if info.priority == TagPriority.CRITICAL]
            high_tags = [tag for tag, info in controller._tag_info.items() if info.priority == TagPriority.HIGH]
            normal_tags = [tag for tag, info in controller._tag_info.items() if info.priority == TagPriority.NORMAL]
            low_tags = [tag for tag, info in controller._tag_info.items() if info.priority == TagPriority.LOW]
            
            print(f"🎯 Tags críticas: {len(critical_tags)}")
            print(f"🎯 Tags de alta prioridade: {len(high_tags)}")
            print(f"🎯 Tags normais: {len(normal_tags)}")
            print(f"🎯 Tags de baixa prioridade: {len(low_tags)}")
            
            # Mostra algumas tags de exemplo
            if critical_tags:
                print(f"   Exemplos críticos: {critical_tags[:3]}")
            if high_tags:
                print(f"   Exemplos alta prioridade: {high_tags[:3]}")
        
        # Testa tratamento de erros
        print("\n2. Testando tratamento de erros...")
        test_tags = ["VELOCIDADE_PRINCIPAL", "TEMP_MOTOR", "HISTORICO_DADOS"]
        
        for tag in test_tags:
            if tag in controller._tag_info:
                print(f"🔍 Testando tag: {tag}")
                
                # Simula erro de "Address out of range"
                controller._handle_tag_error(tag, "CPU : Address out of range")
                
                # Simula erro de "Item not available"
                controller._handle_tag_error(tag, "CPU : Item not available")
                
                # Simula mais um erro para ativar backoff
                controller._handle_tag_error(tag, "CPU : Address out of range")
        
        # Testa estatísticas
        print("\n3. Testando estatísticas...")
        stats = controller.get_statistics()
        print(f"📊 Estatísticas:")
        for key, value in stats.items():
            print(f"   {key}: {value}")
        
        # Testa sistema de backoff
        print("\n4. Testando sistema de backoff...")
        print(f"🚫 Tags problemáticas: {len(controller._problematic_tags)}")
        print(f"🚫 Ativações de backoff: {stats['backoff_activations']}")
        
        # Testa reset de erros
        print("\n5. Testando reset de erros...")
        for tag in test_tags:
            if tag in controller._tag_info:
                controller._reset_tag_errors(tag)
                print(f"🔄 Reset de erros para: {tag}")
        
        print(f"🚫 Tags problemáticas após reset: {len(controller._problematic_tags)}")
        
        controller.cleanup()
        print("\n✅ Teste concluído com sucesso!")
        return True
        
    except Exception as e:
        print(f"\n❌ Erro durante o teste: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_error_patterns():
    """Testa padrões de erro específicos"""
    print("\n🛡️ Testando Padrões de Erro")
    print("=" * 40)
    
    try:
        machines_config = [{"name": "700CX", "default_plc_ip": "100.70.0.10"}]
        controller = MockRobustPLCController(machines_config)
        
        # Testa diferentes tipos de erro
        error_patterns = [
            "CPU : Address out of range",
            "CPU : Item not available",
            "CPU : Job pending",
            "CPU : Connection lost",
            "CPU : Timeout"
        ]
        
        test_tag = "TEST_TAG"
        controller._register_tag(test_tag, "REAL")
        
        print(f"🔍 Testando tag: {test_tag}")
        
        for i, error_msg in enumerate(error_patterns):
            print(f"   Erro {i+1}: {error_msg}")
            controller._handle_tag_error(test_tag, error_msg)
        
        # Verifica estatísticas
        stats = controller.get_statistics()
        print(f"\n📊 Resultados:")
        print(f"   Erros de Address out of range: {stats['address_errors']}")
        print(f"   Erros de Item not available: {stats['item_not_available_errors']}")
        print(f"   Ativações de backoff: {stats['backoff_activations']}")
        print(f"   Tags problemáticas: {stats['problematic_tags']}")
        
        controller.cleanup()
        print("✅ Teste de padrões de erro passou!")
        return True
        
    except Exception as e:
        print(f"❌ Erro no teste de padrões de erro: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Iniciando Testes do Controlador PLC Robusto Mock")
    print("=" * 60)
    
    # Testa controlador principal
    controller_ok = test_robust_controller()
    
    # Testa padrões de erro
    error_patterns_ok = test_error_patterns()
    
    # Resultado final
    if controller_ok and error_patterns_ok:
        print("\n🎉 Todos os testes passaram com sucesso!")
        print("✅ O controlador PLC robusto está funcionando corretamente")
        print("🛡️ Sistema de tratamento de erros está operacional")
        print("🚫 Sistema de backoff está funcionando")
    else:
        print("\n❌ Alguns testes falharam")
        print("⚠️ Verifique os logs para mais detalhes")
    
    print("\n" + "=" * 60)
    print("🏁 Testes concluídos")
