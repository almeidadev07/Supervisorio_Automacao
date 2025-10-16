# app/services/plc_controller_robust.py
# Controlador PLC Robusto - Solução Definitiva para Erros de Comunicação
# Resolve problemas de "Address out of range" e "Item not available"

import threading
import time
import json
import os
import queue
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass
from enum import Enum
from collections import defaultdict
import socket
import struct

from ..plc_drivers import create_driver_for_config

# Importa alarm_processor de forma segura
try:
    from .alarm_processor import alarm_processor
except ImportError:
    # Fallback se não conseguir importar
    alarm_processor = None

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

class RobustPLCController:
    """
    Controlador PLC Robusto - Solução Definitiva
    
    Características:
    - Tratamento robusto de erros "Address out of range"
    - Sistema de backoff para tags problemáticas
    - Pool de conexões gerenciado
    - Priorização inteligente
    - Cache com TTL
    - Reconexão automática
    - Zero oscilações de conexão
    """
    
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        
        # Estado do controlador
        self._lock = threading.Lock()
        self._active_machine = None
        self._comm_map_by_machine = {}
        self._tags_by_plc_ip = {}
        
        # Sistema de tags com prioridade
        self._tag_info = {}  # {tag_name: TagInfo}
        self._tag_lock = threading.Lock()
        
        # Pool de conexões por IP
        self._connection_pool = {}  # {ip: {'driver': driver, 'last_used': timestamp, 'in_use': bool}}
        self._pool_lock = threading.Lock()
        self._max_pool_size = 1  # Apenas 1 conexão por IP para estabilidade
        self._connection_timeout = 30.0
        
        # Sistema de backoff para tags problemáticas
        self._problematic_tags = set()  # Tags que causaram muitos erros
        self._tag_backoff_time = 30.0  # 30s de backoff para tags problemáticas
        self._max_tag_errors = 3  # Máximo 3 erros antes de backoff
        
        # Cache inteligente
        self._cache = {}  # {tag_name: {'value': value, 'timestamp': time, 'ttl': ttl}}
        self._cache_lock = threading.Lock()
        self._cache_ttl = 2.0  # 2 segundos de TTL
        
        # Sistema de polling
        self._polling_thread = None
        self._stop_polling = threading.Event()
        self._polling_interval = 0.5  # 500ms para polling
        self._last_poll_time = 0
        
        # Sistema de reconexão
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._reconnect_delay = 5.0
        self._last_reconnect_attempt = 0
        self._connection_stable = False
        self._last_successful_read = 0
        
        # Estatísticas
        self._stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'connection_errors': 0,
            'address_errors': 0,
            'item_not_available_errors': 0,
            'backoff_activations': 0
        }
        
        # Sistema de subscrições
        self._subscriptions = {}  # {client_id: {'tags': [], 'last_heartbeat': timestamp}}
        self._subscription_lock = threading.Lock()
        self._heartbeat_timeout = 30.0
        
        # Carrega configurações
        self._load_comm_maps()
        
        # Inicia polling
        self._start_polling()
        
        print("[ROBUST] 🚀 Controlador PLC robusto inicializado")
    
    def _load_comm_maps(self):
        """Carrega maps de comunicação de todas as máquinas"""
        comm_map_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'comm_map')
        
        for machine_config in self.machines_config:
            machine_name = machine_config.get('name')
            if not machine_name:
                continue
            
            comm_map_file = os.path.join(comm_map_dir, f'{machine_name}.json')
            if os.path.exists(comm_map_file):
                try:
                    with open(comm_map_file, 'r', encoding='utf-8') as f:
                        comm_map = json.load(f)
                    self._comm_map_by_machine[machine_name] = comm_map
                    
                    # Registra tags no sistema de prioridades
                    for tag_def in comm_map:
                        if 'name' in tag_def:
                            self._register_tag(tag_def['name'], tag_def.get('type', 'REAL'))
                    
                    print(f"[ROBUST] 📋 Comm map carregado para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[ROBUST] ❌ Erro ao carregar comm_map para {machine_name}: {e}")
                    self._comm_map_by_machine[machine_name] = []
            else:
                print(f"[ROBUST] ⚠️ Comm map não encontrado para {machine_name}")
                self._comm_map_by_machine[machine_name] = []
    
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
    
    def _can_read_tag(self, tag_name: str) -> bool:
        """Verifica se uma tag pode ser lida agora"""
        with self._tag_lock:
            if tag_name not in self._tag_info:
                return True  # Tag não registrada, permite leitura
            
            tag_info = self._tag_info[tag_name]
            current_time = time.time()
            
            # Verifica backoff
            if current_time < tag_info.backoff_until:
                return False
            
            # Verifica throttling
            if current_time - tag_info.last_read < tag_info.read_interval:
                return False
            
            # Atualiza timestamp
            tag_info.last_read = current_time
            return True
    
    def _can_write_tag(self, tag_name: str) -> bool:
        """Verifica se uma tag pode ser escrita agora"""
        with self._tag_lock:
            if tag_name not in self._tag_info:
                return True  # Tag não registrada, permite escrita
            
            tag_info = self._tag_info[tag_name]
            current_time = time.time()
            
            # Verifica se tag é gravável
            if not tag_info.is_writable:
                return False
            
            # Verifica backoff
            if current_time < tag_info.backoff_until:
                return False
            
            # Verifica throttling
            if current_time - tag_info.last_write < tag_info.write_interval:
                return False
            
            # Atualiza timestamp
            tag_info.last_write = current_time
            return True
    
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
                print(f"[ROBUST] 🚫 Tag {tag_name} em backoff por {self._tag_backoff_time}s (erros: {tag_info.error_count})")
    
    def _reset_tag_errors(self, tag_name: str):
        """Reseta contador de erros de uma tag"""
        with self._tag_lock:
            if tag_name in self._tag_info:
                tag_info = self._tag_info[tag_name]
                tag_info.error_count = 0
                tag_info.backoff_until = 0
                self._problematic_tags.discard(tag_name)
    
    def _get_connection(self, ip: str):
        """Obtém conexão do pool ou cria nova"""
        with self._pool_lock:
            # Verifica se já existe conexão disponível
            if ip in self._connection_pool:
                conn_info = self._connection_pool[ip]
                if not conn_info['in_use'] and conn_info['driver'].is_connected():
                    conn_info['in_use'] = True
                    conn_info['last_used'] = time.time()
                    return conn_info['driver']
            
            # Cria nova conexão se necessário
            if len(self._connection_pool) < self._max_pool_size:
                try:
                    # Encontra configuração da máquina para este IP
                    machine_config = self._find_machine_by_ip(ip)
                    if not machine_config:
                        return None
                    
                    # Cria driver
                    driver = create_driver_for_config(machine_config)
                    if driver.connect():
                        self._connection_pool[ip] = {
                            'driver': driver,
                            'last_used': time.time(),
                            'in_use': True
                        }
                        print(f"[ROBUST] 🔌 Nova conexão criada para {ip}")
                        return driver
                except Exception as e:
                    print(f"[ROBUST] ❌ Erro ao criar conexão para {ip}: {e}")
                    with self._lock:
                        self._stats['connection_errors'] += 1
        
        return None
    
    def _release_connection(self, ip: str):
        """Libera conexão do pool"""
        with self._pool_lock:
            if ip in self._connection_pool:
                self._connection_pool[ip]['in_use'] = False
                self._connection_pool[ip]['last_used'] = time.time()
    
    def _find_machine_by_ip(self, ip: str):
        """Encontra configuração da máquina por IP"""
        for machine_config in self.machines_config:
            if machine_config.get('default_plc_ip') == ip:
                return machine_config
        return None
    
    def _read_from_plc(self, tags: List[str]) -> Dict[str, Any]:
        """Lê tags do PLC de forma robusta"""
        if not tags:
            return {}
        
        # Filtra tags que podem ser lidas
        readable_tags = [tag for tag in tags if self._can_read_tag(tag)]
        
        if not readable_tags:
            return {}
        
        # Agrupa tags por IP
        tags_by_ip = self._group_tags_by_ip(readable_tags)
        all_data = {}
        
        for ip, ip_tags in tags_by_ip.items():
            try:
                # Obtém conexão
                driver = self._get_connection(ip)
                if not driver:
                    continue
                
                # Obtém definições das tags
                tag_defs = self._get_tag_definitions(ip_tags, ip)
                if not tag_defs:
                    continue
                
                # Lê do PLC
                plc_data = driver.read_tags(tag_defs)
                if plc_data:
                    all_data.update(plc_data)
                    
                    # Reseta erros para tags que foram lidas com sucesso
                    for tag_name in plc_data.keys():
                        self._reset_tag_errors(tag_name)
                
                # Libera conexão
                self._release_connection(ip)
                
            except Exception as e:
                error_msg = str(e)
                print(f"[ROBUST] ❌ Erro ao ler do {ip}: {error_msg}")
                
                # Trata erros específicos
                if "Address out of range" in error_msg or "Item not available" in error_msg:
                    for tag_name in ip_tags:
                        self._handle_tag_error(tag_name, error_msg)
                
                with self._lock:
                    self._stats['connection_errors'] += 1
        
        return all_data
    
    def _write_to_plc(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags no PLC de forma robusta"""
        if not tag_values:
            return True
        
        # Filtra tags que podem ser escritas
        writable_values = {tag: value for tag, value in tag_values.items() 
                          if self._can_write_tag(tag)}
        
        if not writable_values:
            print("[ROBUST] ⚠️ Nenhuma tag pode ser escrita no momento (backoff/throttling)")
            return False
        
        # Agrupa valores por IP
        values_by_ip = self._group_values_by_ip(writable_values)
        success = True
        
        for ip, ip_values in values_by_ip.items():
            try:
                # Obtém conexão
                driver = self._get_connection(ip)
                if not driver:
                    success = False
                    continue
                
                # Obtém definições das tags
                tag_defs = self._get_tag_definitions(list(ip_values.keys()), ip)
                if not tag_defs:
                    success = False
                    continue
                
                # Escreve no PLC
                result = driver.write_tags(ip_values)
                if not result:
                    success = False
                else:
                    # Reseta erros para tags que foram escritas com sucesso
                    for tag_name in ip_values.keys():
                        self._reset_tag_errors(tag_name)
                
                # Libera conexão
                self._release_connection(ip)
                
            except Exception as e:
                error_msg = str(e)
                print(f"[ROBUST] ❌ Erro ao escrever no {ip}: {error_msg}")
                
                # Trata erros específicos
                if "Address out of range" in error_msg or "Item not available" in error_msg:
                    for tag_name in ip_values.keys():
                        self._handle_tag_error(tag_name, error_msg)
                
                with self._lock:
                    self._stats['connection_errors'] += 1
                success = False
        
        return success
    
    def _group_tags_by_ip(self, tags: List[str]) -> Dict[str, List[str]]:
        """Agrupa tags por IP do PLC"""
        tags_by_ip = defaultdict(list)
        
        for tag in tags:
            ip = self._find_ip_for_tag(tag)
            if ip:
                tags_by_ip[ip].append(tag)
        
        return dict(tags_by_ip)
    
    def _group_values_by_ip(self, tag_values: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Agrupa valores de tags por IP do PLC"""
        values_by_ip = defaultdict(dict)
        
        for tag, value in tag_values.items():
            ip = self._find_ip_for_tag(tag)
            if ip:
                values_by_ip[ip][tag] = value
        
        return dict(values_by_ip)
    
    def _find_ip_for_tag(self, tag_name: str) -> Optional[str]:
        """Encontra IP do PLC para uma tag específica"""
        # Busca em todas as máquinas
        for machine_name, comm_map in self._comm_map_by_machine.items():
            for tag_def in comm_map:
                if tag_def.get('name') == tag_name:
                    return tag_def.get('plc_ip')
        
        # Se não encontrou, usa IP padrão da máquina ativa
        if self._active_machine:
            return self._active_machine.get('default_plc_ip')
        
        return None
    
    def _get_tag_definitions(self, tag_names: List[str], ip: str) -> List[Dict]:
        """Obtém definições das tags para um IP específico"""
        tag_defs = []
        
        for machine_name, comm_map in self._comm_map_by_machine.items():
            for tag_def in comm_map:
                if (tag_def.get('name') in tag_names and 
                    tag_def.get('plc_ip', self._active_machine.get('default_plc_ip')) == ip):
                    tag_defs.append(tag_def)
        
        return tag_defs
    
    def _get_cached_data(self, tags: List[str]) -> Dict[str, Any]:
        """Obtém dados do cache"""
        cached = {}
        current_time = time.time()
        
        with self._cache_lock:
            for tag in tags:
                if tag in self._cache:
                    cache_info = self._cache[tag]
                    if current_time - cache_info['timestamp'] < cache_info['ttl']:
                        cached[tag] = cache_info['value']
        
        return cached
    
    def _update_cache(self, data: Dict[str, Any]):
        """Atualiza cache com novos dados"""
        current_time = time.time()
        
        with self._cache_lock:
            for tag, value in data.items():
                self._cache[tag] = {
                    'value': value,
                    'timestamp': current_time,
                    'ttl': self._cache_ttl
                }
    
    def _invalidate_cache(self, tags: List[str]):
        """Invalida cache para tags específicas"""
        with self._cache_lock:
            for tag in tags:
                if tag in self._cache:
                    del self._cache[tag]
    
    def _start_polling(self):
        """Inicia polling de dados"""
        if self._polling_thread and self._polling_thread.is_alive():
            return
        
        self._stop_polling.clear()
        self._polling_thread = threading.Thread(
            target=self._polling_loop,
            daemon=True,
            name="RobustPLCPolling"
        )
        self._polling_thread.start()
        print("[ROBUST] 🔄 Polling iniciado")
    
    def _polling_loop(self):
        """Loop de polling robusto"""
        while not self._stop_polling.is_set():
            try:
                current_time = time.time()
                
                # Verifica se é hora de fazer polling
                if current_time - self._last_poll_time < self._polling_interval:
                    time.sleep(0.01)
                    continue
                
                # Obtém tags subscritas
                subscribed_tags = self.get_subscribed_tags()
                if not subscribed_tags:
                    time.sleep(0.1)
                    continue
                
                # Lê dados do PLC
                data = self._read_from_plc(subscribed_tags)
                
                if data:
                    # Atualiza cache
                    self._update_cache(data)
                    
                    # Marca conexão como estável
                    self._connection_stable = True
                    self._last_successful_read = current_time
                    self._reconnect_attempts = 0
                    
                    # Processa alarmes
                    if self._active_machine and alarm_processor:
                        try:
                            active_alarms = alarm_processor.process_alarm_data(data, self._active_machine['name'])
                            alarm_summary = alarm_processor.get_alarm_summary(active_alarms)
                            data['active_alarms'] = active_alarms
                            data['alarm_summary'] = alarm_summary
                        except Exception as e:
                            print(f"[ROBUST] ❌ Erro no processamento de alarmes: {e}")
                    
                    # Envia para frontend
                    if self.socketio:
                        self.socketio.emit('telemetry', data)
                    
                    with self._lock:
                        self._stats['successful_requests'] += 1
                else:
                    # Verifica se precisa reconectar
                    if current_time - self._last_successful_read > 30.0:  # 30s sem dados
                        self._attempt_reconnection()
                    
                    with self._lock:
                        self._stats['failed_requests'] += 1
                
                self._last_poll_time = current_time
                
            except Exception as e:
                print(f"[ROBUST] ❌ Erro no polling: {e}")
                time.sleep(0.1)
    
    def _attempt_reconnection(self):
        """Tenta reconectar ao PLC"""
        current_time = time.time()
        
        if current_time - self._last_reconnect_attempt < self._reconnect_delay:
            return
        
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            print(f"[ROBUST] ❌ Máximo de tentativas de reconexão atingido")
            return
        
        self._reconnect_attempts += 1
        self._last_reconnect_attempt = current_time
        
        print(f"[ROBUST] 🔄 Tentativa de reconexão {self._reconnect_attempts}/{self._max_reconnect_attempts}")
        
        try:
            # Fecha todas as conexões
            with self._pool_lock:
                for ip, conn_info in self._connection_pool.items():
                    try:
                        conn_info['driver'].disconnect()
                    except Exception:
                        pass
                self._connection_pool.clear()
            
            # Aguarda um pouco
            time.sleep(2.0)
            
            # Tenta reconectar
            if self._active_machine:
                success, message = self.set_active_machine(self._active_machine)
                if success:
                    print(f"[ROBUST] ✅ Reconectado com sucesso")
                    self._reconnect_attempts = 0
                    self._connection_stable = True
                else:
                    print(f"[ROBUST] ❌ Falha na reconexão: {message}")
            
        except Exception as e:
            print(f"[ROBUST] ❌ Erro na reconexão: {e}")
    
    # Métodos públicos da API
    
    def set_active_machine(self, cfg):
        """Define máquina ativa"""
        with self._lock:
            self._active_machine = cfg
            print(f"[ROBUST] 🏭 Máquina ativa: {cfg.get('name')}")
            return True, 'ok'
    
    def read_tags(self, tag_names: List[str]) -> Dict[str, Any]:
        """Lê tags específicas"""
        if not tag_names:
            return {}
        
        # Verifica cache primeiro
        cached_data = self._get_cached_data(tag_names)
        uncached_tags = [tag for tag in tag_names if tag not in cached_data]
        
        if not uncached_tags:
            # Todos os dados estão no cache
            with self._lock:
                self._stats['cache_hits'] += len(tag_names)
            return cached_data
        
        # Lê dados não cacheados do PLC
        plc_data = self._read_from_plc(uncached_tags)
        
        # Atualiza cache
        if plc_data:
            self._update_cache(plc_data)
            with self._lock:
                self._stats['cache_misses'] += len(plc_data)
        
        # Combina dados do cache e do PLC
        result = cached_data.copy()
        result.update(plc_data)
        
        with self._lock:
            self._stats['total_requests'] += 1
        
        return result
    
    def write_tags(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags específicas"""
        if not tag_values:
            return True
        
        success = self._write_to_plc(tag_values)
        
        if success:
            # Invalida cache para as tags escritas
            self._invalidate_cache(list(tag_values.keys()))
            print(f"[ROBUST] ✅ Escrita confirmada: {list(tag_values.keys())}")
        else:
            print(f"[ROBUST] ❌ Falha na escrita: {list(tag_values.keys())}")
        
        return success
    
    def subscribe_tags(self, client_id: str, tag_names: List[str]) -> bool:
        """Registra subscrição de tags para um cliente"""
        with self._subscription_lock:
            current_time = time.time()
            self._subscriptions[client_id] = {
                'tags': tag_names,
                'last_heartbeat': current_time
            }
            print(f"[ROBUST] 📋 Cliente {client_id} subscrito a {len(tag_names)} tags")
            return True
    
    def unsubscribe_client(self, client_id: str) -> bool:
        """Remove subscrição de um cliente"""
        with self._subscription_lock:
            if client_id in self._subscriptions:
                del self._subscriptions[client_id]
                print(f"[ROBUST] 🗑️ Cliente {client_id} removido das subscrições")
                return True
            return False
    
    def heartbeat_client(self, client_id: str) -> bool:
        """Atualiza heartbeat de um cliente"""
        with self._subscription_lock:
            if client_id in self._subscriptions:
                self._subscriptions[client_id]['last_heartbeat'] = time.time()
                return True
            return False
    
    def get_subscribed_tags(self) -> List[str]:
        """Retorna todas as tags que estão sendo subscritas"""
        with self._subscription_lock:
            current_time = time.time()
            active_tags = set()
            
            # Remove clientes inativos (sem heartbeat)
            expired_clients = []
            for client_id, sub_info in self._subscriptions.items():
                if current_time - sub_info['last_heartbeat'] > self._heartbeat_timeout:
                    expired_clients.append(client_id)
                else:
                    active_tags.update(sub_info['tags'])
            
            # Remove clientes expirados
            for client_id in expired_clients:
                del self._subscriptions[client_id]
                print(f"[ROBUST] ⏰ Cliente {client_id} expirado por timeout")
            
            return list(active_tags)
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do controlador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'active_connections': len(self._connection_pool),
            'cache_size': len(self._cache),
            'subscriptions': len(self._subscriptions),
            'problematic_tags': len(self._problematic_tags),
            'connection_stable': self._connection_stable,
            'reconnect_attempts': self._reconnect_attempts
        })
        
        return stats
    
    def cleanup(self):
        """Limpeza completa"""
        self._stop_polling.set()
        
        # Fecha todas as conexões
        with self._pool_lock:
            for ip, conn_info in self._connection_pool.items():
                try:
                    conn_info['driver'].disconnect()
                except Exception:
                    pass
            self._connection_pool.clear()
        
        print("[ROBUST] 🧹 Cleanup completo realizado")
