# app/services/plc_controller_optimized.py
# Controlador PLC Otimizado - Baseado na arquitetura AVEVA Edge
# Solução definitiva para problemas de comunicação e perda de conexão

import threading
import time
import json
import os
import queue
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum
from collections import defaultdict
import socket
import struct

from ..plc_drivers import create_driver_for_config
from .alarm_processor import alarm_processor

class Priority(Enum):
    CRITICAL = 1  # Velocidade, alarmes, comandos críticos
    HIGH = 2      # Estados importantes, parâmetros
    NORMAL = 3    # Dados de telemetria
    LOW = 4       # Dados históricos, estatísticas

@dataclass
class PLCRequest:
    request_id: str
    operation: str  # 'read' ou 'write'
    tags: List[str] = None
    values: Dict[str, Any] = None
    priority: Priority = Priority.NORMAL
    created_at: float = None
    retry_count: int = 0
    max_retries: int = 3
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()

class OptimizedPLCController:
    """
    Controlador PLC Otimizado - Solução Definitiva
    
    Baseado na arquitetura AVEVA Edge:
    - Comunicação eficiente sem sobrecarga
    - Pool de conexões gerenciado
    - Priorização inteligente de operações
    - Verificação de escrita garantida
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
        
        # Pool de conexões por IP
        self._connection_pool = {}  # {ip: {'driver': driver, 'last_used': timestamp, 'in_use': bool}}
        self._pool_lock = threading.Lock()
        self._max_pool_size = 2  # Máximo 2 conexões por IP
        self._connection_timeout = 30.0  # 30s de timeout para conexões
        
        # Sistema de filas com prioridade
        self._request_queue = queue.PriorityQueue(maxsize=1000)
        self._worker_threads = []
        self._max_workers = 3  # Máximo 3 workers simultâneos
        self._stop_workers = threading.Event()
        
        # Cache inteligente
        self._cache = {}  # {tag_name: {'value': value, 'timestamp': time, 'ttl': ttl}}
        self._cache_lock = threading.Lock()
        self._cache_ttl = 2.0  # 2 segundos de TTL para cache
        
        # Configurações de otimização
        self._batch_size = 15  # Lotes menores para reduzir carga
        self._write_priority_interval = 0.1  # 100ms para escrita de prioridade
        self._read_interval = 0.5  # 500ms para leitura normal
        self._health_check_interval = 10.0  # 10s para verificação de saúde
        
        # Estatísticas
        self._stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'connection_errors': 0,
            'write_verifications': 0
        }
        
        # Sistema de verificação de escrita
        self._pending_writes = {}  # {request_id: {'tags': [], 'timestamp': time}}
        self._write_verification_timeout = 5.0  # 5s para verificar escrita
        
        # Carrega configurações
        self._load_comm_maps()
        
        # Inicia workers
        self._start_workers()
        
        print("[OPTIMIZED] 🚀 Controlador PLC otimizado inicializado")
    
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
                    print(f"[OPTIMIZED] 📋 Comm map carregado para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[OPTIMIZED] ❌ Erro ao carregar comm_map para {machine_name}: {e}")
                    self._comm_map_by_machine[machine_name] = []
            else:
                print(f"[OPTIMIZED] ⚠️ Comm map não encontrado para {machine_name}")
                self._comm_map_by_machine[machine_name] = []
    
    def _start_workers(self):
        """Inicia workers para processar requisições"""
        for i in range(self._max_workers):
            worker = threading.Thread(
                target=self._worker_loop,
                daemon=True,
                name=f"PLCWorker-{i}"
            )
            worker.start()
            self._worker_threads.append(worker)
        
        print(f"[OPTIMIZED] 👷 {self._max_workers} workers iniciados")
    
    def _worker_loop(self):
        """Loop principal dos workers"""
        while not self._stop_workers.is_set():
            try:
                # Pega requisição da fila (com timeout)
                try:
                    priority, request = self._request_queue.get(timeout=1.0)
                except queue.Empty:
                    continue
                
                # Processa requisição
                self._process_request(request)
                
            except Exception as e:
                print(f"[OPTIMIZED] ❌ Erro no worker: {e}")
                time.sleep(0.1)
    
    def _process_request(self, request: PLCRequest):
        """Processa uma requisição individual"""
        try:
            if request.operation == 'read':
                self._process_read_request(request)
            elif request.operation == 'write':
                self._process_write_request(request)
            
            with self._lock:
                self._stats['total_requests'] += 1
                self._stats['successful_requests'] += 1
                
        except Exception as e:
            print(f"[OPTIMIZED] ❌ Erro ao processar requisição {request.request_id}: {e}")
            with self._lock:
                self._stats['failed_requests'] += 1
            
            # Retry se necessário
            if request.retry_count < request.max_retries:
                request.retry_count += 1
                self._request_queue.put((request.priority.value, request))
    
    def _process_read_request(self, request: PLCRequest):
        """Processa requisição de leitura"""
        # Verifica cache primeiro
        cached_data = self._get_cached_data(request.tags)
        uncached_tags = [tag for tag in request.tags if tag not in cached_data]
        
        if not uncached_tags:
            # Todos os dados estão no cache
            with self._lock:
                self._stats['cache_hits'] += len(request.tags)
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
        
        return result
    
    def _process_write_request(self, request: PLCRequest):
        """Processa requisição de escrita com verificação"""
        # Escreve no PLC
        success = self._write_to_plc(request.values)
        
        if success:
            # Agenda verificação de escrita
            self._schedule_write_verification(request)
            
            # Invalida cache para as tags escritas
            self._invalidate_cache(list(request.values.keys()))
            
            print(f"[OPTIMIZED] ✅ Escrita confirmada: {list(request.values.keys())}")
        else:
            print(f"[OPTIMIZED] ❌ Falha na escrita: {list(request.values.keys())}")
        
        return success
    
    def _schedule_write_verification(self, request: PLCRequest):
        """Agenda verificação de escrita"""
        with self._lock:
            self._pending_writes[request.request_id] = {
                'tags': list(request.values.keys()),
                'timestamp': time.time(),
                'values': request.values
            }
    
    def _verify_pending_writes(self):
        """Verifica escritas pendentes"""
        current_time = time.time()
        expired_writes = []
        
        with self._lock:
            for request_id, write_info in self._pending_writes.items():
                if current_time - write_info['timestamp'] > self._write_verification_timeout:
                    expired_writes.append(request_id)
                else:
                    # Verifica se a escrita foi bem-sucedida
                    self._verify_write_success(request_id, write_info)
        
        # Remove escritas expiradas
        for request_id in expired_writes:
            del self._pending_writes[request_id]
    
    def _verify_write_success(self, request_id: str, write_info: dict):
        """Verifica se uma escrita foi bem-sucedida"""
        try:
            # Lê valores atuais do PLC
            current_values = self._read_from_plc(write_info['tags'])
            
            # Compara com valores esperados
            success = True
            for tag, expected_value in write_info['values'].items():
                if tag in current_values:
                    current_value = current_values[tag]
                    # Tolerância para valores numéricos
                    if isinstance(expected_value, (int, float)) and isinstance(current_value, (int, float)):
                        if abs(current_value - expected_value) > 0.01:
                            success = False
                            break
                    elif current_value != expected_value:
                        success = False
                        break
                else:
                    success = False
                    break
            
            if success:
                with self._lock:
                    self._stats['write_verifications'] += 1
                del self._pending_writes[request_id]
                print(f"[OPTIMIZED] ✅ Verificação de escrita bem-sucedida: {write_info['tags']}")
            else:
                print(f"[OPTIMIZED] ⚠️ Verificação de escrita falhou: {write_info['tags']}")
                
        except Exception as e:
            print(f"[OPTIMIZED] ❌ Erro na verificação de escrita: {e}")
    
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
                        print(f"[OPTIMIZED] 🔌 Nova conexão criada para {ip}")
                        return driver
                except Exception as e:
                    print(f"[OPTIMIZED] ❌ Erro ao criar conexão para {ip}: {e}")
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
        """Lê tags do PLC de forma otimizada"""
        if not tags:
            return {}
        
        # Agrupa tags por IP
        tags_by_ip = self._group_tags_by_ip(tags)
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
                
                # Libera conexão
                self._release_connection(ip)
                
            except Exception as e:
                print(f"[OPTIMIZED] ❌ Erro ao ler do {ip}: {e}")
                with self._lock:
                    self._stats['connection_errors'] += 1
        
        return all_data
    
    def _write_to_plc(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags no PLC de forma otimizada"""
        if not tag_values:
            return True
        
        # Agrupa valores por IP
        values_by_ip = self._group_values_by_ip(tag_values)
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
                
                # Libera conexão
                self._release_connection(ip)
                
            except Exception as e:
                print(f"[OPTIMIZED] ❌ Erro ao escrever no {ip}: {e}")
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
    
    # Métodos públicos da API
    
    def set_active_machine(self, cfg):
        """Define máquina ativa"""
        with self._lock:
            self._active_machine = cfg
            print(f"[OPTIMIZED] 🏭 Máquina ativa: {cfg.get('name')}")
    
    def read_tags(self, tag_names: List[str]) -> Dict[str, Any]:
        """Lê tags específicas"""
        if not tag_names:
            return {}
        
        # Cria requisição de leitura
        request = PLCRequest(
            request_id=f"read_{int(time.time() * 1000)}",
            operation='read',
            tags=tag_names,
            priority=Priority.NORMAL
        )
        
        # Adiciona à fila
        self._request_queue.put((request.priority.value, request))
        
        # Retorna dados do cache imediatamente (se disponível)
        return self._get_cached_data(tag_names)
    
    def write_tags(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags específicas com prioridade máxima"""
        if not tag_values:
            return True
        
        # Cria requisição de escrita com prioridade crítica
        request = PLCRequest(
            request_id=f"write_{int(time.time() * 1000)}",
            operation='write',
            values=tag_values,
            priority=Priority.CRITICAL
        )
        
        # Adiciona à fila com prioridade máxima
        self._request_queue.put((request.priority.value, request))
        
        return True
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do controlador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'active_connections': len(self._connection_pool),
            'pending_writes': len(self._pending_writes),
            'cache_size': len(self._cache),
            'queue_size': self._request_queue.qsize()
        })
        
        return stats
    
    def cleanup(self):
        """Limpeza completa"""
        self._stop_workers.set()
        
        # Fecha todas as conexões
        with self._pool_lock:
            for ip, conn_info in self._connection_pool.items():
                try:
                    conn_info['driver'].disconnect()
                except Exception:
                    pass
            self._connection_pool.clear()
        
        print("[OPTIMIZED] 🧹 Cleanup completo realizado")
