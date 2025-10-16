# app/services/priority_manager.py
# Gerenciador de Prioridades para Comunicação com PLC
# Baseado na arquitetura AVEVA Edge para máxima eficiência

import time
import threading
from typing import Dict, List, Any, Optional
from enum import Enum
from dataclasses import dataclass
from collections import defaultdict, deque

class TagPriority(Enum):
    CRITICAL = 1    # Velocidade, comandos de emergência, alarmes
    HIGH = 2        # Estados de máquina, parâmetros de processo
    NORMAL = 3      # Telemetria, dados de monitoramento
    LOW = 4         # Dados históricos, estatísticas

@dataclass
class TagInfo:
    name: str
    priority: TagPriority
    last_read: float = 0
    last_write: float = 0
    read_interval: float = 0.1  # 100ms para críticos
    write_interval: float = 0.05  # 50ms para críticos
    is_writable: bool = True
    is_critical: bool = False

class PriorityManager:
    """
    Gerenciador de Prioridades para Comunicação com PLC
    
    Características:
    - Priorização inteligente baseada no tipo de tag
    - Intervalos dinâmicos de leitura/escrita
    - Detecção automática de tags críticas
    - Throttling para evitar sobrecarga
    - Verificação de escrita garantida
    """
    
    def __init__(self):
        self._tag_info = {}  # {tag_name: TagInfo}
        self._priority_queues = {
            TagPriority.CRITICAL: deque(),
            TagPriority.HIGH: deque(),
            TagPriority.NORMAL: deque(),
            TagPriority.LOW: deque()
        }
        self._lock = threading.Lock()
        
        # Configurações de throttling
        self._throttle_limits = {
            TagPriority.CRITICAL: 0.05,  # 50ms mínimo entre operações
            TagPriority.HIGH: 0.1,       # 100ms mínimo entre operações
            TagPriority.NORMAL: 0.2,     # 200ms mínimo entre operações
            TagPriority.LOW: 0.5         # 500ms mínimo entre operações
        }
        
        # Estatísticas
        self._stats = {
            'critical_operations': 0,
            'high_operations': 0,
            'normal_operations': 0,
            'low_operations': 0,
            'throttled_operations': 0,
            'total_operations': 0
        }
        
        # Inicializa tags críticas conhecidas
        self._init_critical_tags()
    
    def _init_critical_tags(self):
        """Inicializa tags críticas conhecidas"""
        critical_patterns = [
            'VEL', 'VELOC', 'SPEED',  # Velocidade
            'CMD', 'COMMAND', 'COMANDO',  # Comandos
            'ALARME', 'ALARM', 'EMERG', 'EMERGENCY',  # Alarmes
            'ESTADO', 'STATE', 'STATUS',  # Estados críticos
            'DB10', 'DB104',  # Dados críticos
            'PRINCIPAL', 'MAIN', 'CRITICO', 'CRITICAL'  # Tags principais
        ]
        
        # Padrões de tags de escrita crítica
        write_critical_patterns = [
            'VEL', 'VELOC', 'SPEED',  # Velocidade
            'CMD', 'COMMAND', 'COMANDO',  # Comandos
            'SET', 'CONFIG', 'PARAM'  # Parâmetros
        ]
        
        self._critical_patterns = critical_patterns
        self._write_critical_patterns = write_critical_patterns
    
    def register_tag(self, tag_name: str, is_writable: bool = True) -> TagInfo:
        """Registra uma nova tag com prioridade automática"""
        priority = self._determine_priority(tag_name)
        is_critical = self._is_critical_tag(tag_name)
        
        tag_info = TagInfo(
            name=tag_name,
            priority=priority,
            is_writable=is_writable,
            is_critical=is_critical
        )
        
        # Ajusta intervalos baseado na prioridade
        if priority == TagPriority.CRITICAL:
            tag_info.read_interval = 0.05  # 50ms
            tag_info.write_interval = 0.02  # 20ms
        elif priority == TagPriority.HIGH:
            tag_info.read_interval = 0.1   # 100ms
            tag_info.write_interval = 0.05  # 50ms
        elif priority == TagPriority.NORMAL:
            tag_info.read_interval = 0.2   # 200ms
            tag_info.write_interval = 0.1   # 100ms
        else:  # LOW
            tag_info.read_interval = 0.5   # 500ms
            tag_info.write_interval = 0.2   # 200ms
        
        with self._lock:
            self._tag_info[tag_name] = tag_info
        
        return tag_info
    
    def _determine_priority(self, tag_name: str) -> TagPriority:
        """Determina prioridade de uma tag baseado no nome"""
        name_upper = tag_name.upper()
        
        # Verifica padrões críticos
        for pattern in self._critical_patterns:
            if pattern in name_upper:
                return TagPriority.CRITICAL
        
        # Verifica padrões de alta prioridade
        high_patterns = ['TEMP', 'TEMPERATURA', 'PRESSAO', 'PRESSURE', 'NIVEL', 'LEVEL']
        for pattern in high_patterns:
            if pattern in name_upper:
                return TagPriority.HIGH
        
        # Verifica padrões de baixa prioridade
        low_patterns = ['HIST', 'HISTORICO', 'STAT', 'STATISTIC', 'LOG']
        for pattern in low_patterns:
            if pattern in name_upper:
                return TagPriority.LOW
        
        # Padrão normal
        return TagPriority.NORMAL
    
    def _is_critical_tag(self, tag_name: str) -> bool:
        """Verifica se uma tag é crítica"""
        name_upper = tag_name.upper()
        
        # Verifica padrões de escrita crítica
        for pattern in self._write_critical_patterns:
            if pattern in name_upper:
                return True
        
        return False
    
    def can_read(self, tag_name: str) -> bool:
        """Verifica se uma tag pode ser lida agora (throttling)"""
        with self._lock:
            if tag_name not in self._tag_info:
                return True  # Tag não registrada, permite leitura
            
            tag_info = self._tag_info[tag_name]
            current_time = time.time()
            
            # Verifica throttling
            if current_time - tag_info.last_read < tag_info.read_interval:
                self._stats['throttled_operations'] += 1
                return False
            
            # Atualiza timestamp
            tag_info.last_read = current_time
            self._stats['total_operations'] += 1
            
            # Atualiza estatísticas por prioridade
            if tag_info.priority == TagPriority.CRITICAL:
                self._stats['critical_operations'] += 1
            elif tag_info.priority == TagPriority.HIGH:
                self._stats['high_operations'] += 1
            elif tag_info.priority == TagPriority.NORMAL:
                self._stats['normal_operations'] += 1
            else:
                self._stats['low_operations'] += 1
            
            return True
    
    def can_write(self, tag_name: str) -> bool:
        """Verifica se uma tag pode ser escrita agora (throttling)"""
        with self._lock:
            if tag_name not in self._tag_info:
                return True  # Tag não registrada, permite escrita
            
            tag_info = self._tag_info[tag_name]
            current_time = time.time()
            
            # Verifica se tag é gravável
            if not tag_info.is_writable:
                return False
            
            # Verifica throttling
            if current_time - tag_info.last_write < tag_info.write_interval:
                self._stats['throttled_operations'] += 1
                return False
            
            # Atualiza timestamp
            tag_info.last_write = current_time
            self._stats['total_operations'] += 1
            
            # Atualiza estatísticas por prioridade
            if tag_info.priority == TagPriority.CRITICAL:
                self._stats['critical_operations'] += 1
            elif tag_info.priority == TagPriority.HIGH:
                self._stats['high_operations'] += 1
            elif tag_info.priority == TagPriority.NORMAL:
                self._stats['normal_operations'] += 1
            else:
                self._stats['low_operations'] += 1
            
            return True
    
    def get_read_priority(self, tag_names: List[str]) -> List[str]:
        """Retorna tags ordenadas por prioridade para leitura"""
        with self._lock:
            # Agrupa tags por prioridade
            priority_groups = defaultdict(list)
            
            for tag_name in tag_names:
                if tag_name in self._tag_info:
                    tag_info = self._tag_info[tag_name]
                    priority_groups[tag_info.priority].append(tag_name)
                else:
                    # Tag não registrada, assume prioridade normal
                    priority_groups[TagPriority.NORMAL].append(tag_name)
            
            # Ordena por prioridade (CRITICAL primeiro)
            ordered_tags = []
            for priority in [TagPriority.CRITICAL, TagPriority.HIGH, TagPriority.NORMAL, TagPriority.LOW]:
                if priority in priority_groups:
                    ordered_tags.extend(priority_groups[priority])
            
            return ordered_tags
    
    def get_write_priority(self, tag_values: Dict[str, Any]) -> List[Tuple[str, Any]]:
        """Retorna tags ordenadas por prioridade para escrita"""
        with self._lock:
            # Agrupa tags por prioridade
            priority_groups = defaultdict(list)
            
            for tag_name, value in tag_values.items():
                if tag_name in self._tag_info:
                    tag_info = self._tag_info[tag_name]
                    priority_groups[tag_info.priority].append((tag_name, value))
                else:
                    # Tag não registrada, assume prioridade normal
                    priority_groups[TagPriority.NORMAL].append((tag_name, value))
            
            # Ordena por prioridade (CRITICAL primeiro)
            ordered_tags = []
            for priority in [TagPriority.CRITICAL, TagPriority.HIGH, TagPriority.NORMAL, TagPriority.LOW]:
                if priority in priority_groups:
                    ordered_tags.extend(priority_groups[priority])
            
            return ordered_tags
    
    def get_critical_tags(self) -> List[str]:
        """Retorna lista de tags críticas"""
        with self._lock:
            return [tag_name for tag_name, tag_info in self._tag_info.items() 
                   if tag_info.is_critical]
    
    def get_writable_tags(self) -> List[str]:
        """Retorna lista de tags graváveis"""
        with self._lock:
            return [tag_name for tag_name, tag_info in self._tag_info.items() 
                   if tag_info.is_writable]
    
    def update_tag_priority(self, tag_name: str, new_priority: TagPriority):
        """Atualiza prioridade de uma tag"""
        with self._lock:
            if tag_name in self._tag_info:
                self._tag_info[tag_name].priority = new_priority
                
                # Ajusta intervalos baseado na nova prioridade
                tag_info = self._tag_info[tag_name]
                if new_priority == TagPriority.CRITICAL:
                    tag_info.read_interval = 0.05
                    tag_info.write_interval = 0.02
                elif new_priority == TagPriority.HIGH:
                    tag_info.read_interval = 0.1
                    tag_info.write_interval = 0.05
                elif new_priority == TagPriority.NORMAL:
                    tag_info.read_interval = 0.2
                    tag_info.write_interval = 0.1
                else:  # LOW
                    tag_info.read_interval = 0.5
                    tag_info.write_interval = 0.2
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do gerenciador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'total_tags': len(self._tag_info),
            'critical_tags': len(self.get_critical_tags()),
            'writable_tags': len(self.get_writable_tags())
        })
        
        return stats
    
    def reset_statistics(self):
        """Reseta estatísticas"""
        with self._lock:
            self._stats = {
                'critical_operations': 0,
                'high_operations': 0,
                'normal_operations': 0,
                'low_operations': 0,
                'throttled_operations': 0,
                'total_operations': 0
            }
    
    def cleanup(self):
        """Limpeza completa"""
        with self._lock:
            self._tag_info.clear()
            for queue in self._priority_queues.values():
                queue.clear()
        
        print("[PRIORITY] 🧹 Cleanup completo realizado")
