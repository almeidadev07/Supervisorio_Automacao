# app/services/plc_controller_block.py
# Controlador PLC otimizado com comunicação por agrupamento de bloco
# Resolve problemas de queda de conexão por comunicação tag a tag

import threading
import time
import json
import os
import queue
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass
from collections import defaultdict
import socket
import struct

from ..plc_drivers import create_driver_for_config
from .alarm_processor import alarm_processor
from .priority_manager import PriorityManager, TagPriority
from .write_verifier import WriteVerifier

class BlockPLCController:
    """
    Controlador PLC otimizado com comunicação por agrupamento de bloco
    
    Características:
    - Lê dados por blocos de DB em vez de tag por tag
    - Reduz drasticamente o número de chamadas ao PLC
    - Melhora estabilidade da conexão
    - Cache inteligente com TTL
    - Polling otimizado
    - Sistema de prioridades
    """
    
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        
        # Estado do controlador
        self._lock = threading.Lock()
        self._active_machine = None
        self._comm_map_by_machine = {}
        self._tags_by_plc_ip = {}
        
        # Atributos de compatibilidade com controladores antigos
        self.active_config = None  # Configuração da máquina ativa
        self.active_machine = None  # Nome da máquina ativa
        self.driver = None  # Driver ativo (será criado quando necessário)
        self._active_subscriptions = {}  # Subscrições ativas
        self._subscription_lock = threading.Lock()  # Lock para subscrições
        
        # Componentes especializados
        self.priority_manager = PriorityManager()
        self.write_verifier = WriteVerifier(self._read_from_plc)
        
        # Sistema de conexão única dedicada por IP (máxima estabilidade)
        self._dedicated_connections = {}  # {ip: driver}
        self._connection_locks = {}  # {ip: threading.Lock()} - 1 lock por IP
        self._connection_usage = {}  # {ip: {'last_used': timestamp, 'use_count': int}}
        self._pool_lock = threading.Lock()  # Lock global para gerenciar o dicionário
        self._connection_timeout = 60.0  # 60s de timeout para reconexão
        
        # Sistema de filas com prioridade
        self._request_queue = queue.PriorityQueue(maxsize=1000)
        self._worker_threads = []
        self._max_workers = 2  # Máximo 2 workers simultâneos
        self._stop_workers = threading.Event()
        
        # Cache inteligente
        self._cache = {}  # {tag_name: {'value': value, 'timestamp': time, 'ttl': ttl}}
        self._cache_lock = threading.Lock()
        self._cache_ttl = 10.0  # 10 segundos de TTL para cache - aumentado drasticamente
        
        # Configurações de otimização - ajustadas para máxima estabilidade
        self._batch_size = 1  # Uma tag por vez para máxima estabilidade
        self._critical_interval = 1.0  # 1s para operações críticas
        self._normal_interval = 3.0  # 3s para operações normais
        self._health_check_interval = 120.0  # 2min para verificação de saúde
        
        # Sistema de polling inteligente
        self._polling_thread = None
        self._stop_polling = threading.Event()
        self._last_poll_time = 0
        self._polling_interval = 0.1  # 100ms para polling
        
        # Estatísticas
        self._stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'connection_errors': 0,
            'write_verifications': 0,
            'critical_operations': 0,
            'throttled_operations': 0
        }
        
        # Sistema de subscrições
        self._subscriptions = {}  # {client_id: {'tags': [], 'last_heartbeat': timestamp}}
        self._subscription_lock = threading.Lock()
        self._heartbeat_timeout = 30.0  # 30s sem heartbeat = remove subscrição
        
        # Carrega configurações
        self._load_comm_maps()
        
        # Inicia componentes
        self._start_components()
        
        print("[BLOCK] 🚀 Controlador PLC Block inicializado")
    
    def _normalize_comm_map(self, data):
        """Normaliza o comm_map aceitando dois formatos:
        - Lista de itens {name, area, db, offset, type}
        - Objeto agrupado por DB: { "1": [ {name, start|offset, type}, ... ], ... }
        Retorna sempre uma lista de dicionários no formato antigo.
        """
        try:
            # Se já for lista, checa rapidamente
            if isinstance(data, list):
                return [d for d in data if isinstance(d, dict)]
            # Se for dict agrupado
            if isinstance(data, dict):
                # Algumas variantes vêm como { items: [...] }
                if 'items' in data and isinstance(data['items'], list):
                    return [d for d in data['items'] if isinstance(d, dict)]
                flat = []
                for db_key, arr in data.items():
                    try:
                        db_num = int(db_key)
                    except Exception:
                        continue
                    if not isinstance(arr, list):
                        continue
                    for it in arr:
                        if not isinstance(it, dict):
                            continue
                        name = it.get('name')
                        start = it.get('start', it.get('offset'))
                        type_ = it.get('type')
                        if not name or start is None or not type_:
                            continue
                        item = {
                            'name': name,
                            'area': 'DB',
                            'db': db_num,
                            'offset': int(start),
                            'type': str(type_).upper(),
                        }
                        # Preserva byte/bit se existirem
                        if 'byte' in it:
                            item['byte'] = int(it.get('byte'))
                        if 'bit' in it:
                            item['bit'] = int(it.get('bit'))
                        flat.append(item)
                return flat
        except Exception:
            pass
        # Fallback seguro
        return []

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
                        comm_map_raw = json.load(f)
                    comm_map = self._normalize_comm_map(comm_map_raw)
                    self._comm_map_by_machine[machine_name] = comm_map
                    
                    # Registra tags no gerenciador de prioridades
                    for tag_def in comm_map:
                        if 'name' in tag_def:
                            tag_name = tag_def['name']
                            is_writable = tag_def.get('type', 'REAL') in ['REAL', 'WORD', 'BOOL']
                            self.priority_manager.register_tag(tag_name, is_writable)
                    
                    print(f"[BLOCK] 📋 Comm map carregado para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[BLOCK] ❌ Erro ao carregar comm_map para {machine_name}: {e}")
                    self._comm_map_by_machine[machine_name] = []
            else:
                print(f"[BLOCK] ⚠️ Comm map não encontrado para {machine_name}")
                self._comm_map_by_machine[machine_name] = []
    
    def _start_components(self):
        """Inicia todos os componentes"""
        try:
            # Inicia workers
            self._start_workers()
            
            # Inicia polling
            self._start_polling()
            
            print("[BLOCK] 🚀 Todos os componentes iniciados")
            
        except Exception as e:
            print(f"[BLOCK] ❌ Erro ao iniciar componentes: {e}")
    
    def _start_workers(self):
        """Inicia workers para processar requisições"""
        for i in range(self._max_workers):
            worker = threading.Thread(
                target=self._worker_loop,
                daemon=True,
                name=f"BlockPLCWorker-{i}"
            )
            worker.start()
            self._worker_threads.append(worker)
        
        print(f"[BLOCK] 👷 {self._max_workers} workers iniciados")
    
    def _start_polling(self):
        """Inicia polling de dados"""
        if self._polling_thread and self._polling_thread.is_alive():
            return
        
        self._stop_polling.clear()
        self._polling_thread = threading.Thread(
            target=self._polling_loop,
            daemon=True,
            name="BlockPLCPolling"
        )
        self._polling_thread.start()
        print("[BLOCK] 🔄 Polling iniciado")
    
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
                print(f"[BLOCK] ❌ Erro no worker: {e}")
                time.sleep(0.1)
    
    def _polling_loop(self):
        """Loop de polling inteligente"""
        while not self._stop_polling.is_set():
            try:
                current_time = time.time()
                
                # Verifica se é hora de fazer polling - intervalo reduzido para melhor responsividade
                polling_interval = 10.0  # 10 segundos entre polls - reduzido para melhor responsividade
                if current_time - self._last_poll_time < polling_interval:
                    time.sleep(1.0)  # Aguarda 1s antes de verificar novamente
                    continue
                
                # Obtém tags subscritas
                subscribed_tags = self.get_subscribed_tags()
                
                # Adiciona tags de alarme automaticamente
                alarm_tags = self._get_alarm_tags()
                all_tags = list(set(subscribed_tags + alarm_tags))
                
                if not all_tags:
                    time.sleep(0.1)
                    continue
                
                # Filtra tags que podem ser lidas (throttling)
                readable_tags = [tag for tag in all_tags if self.priority_manager.can_read(tag)]
                
                if not readable_tags:
                    time.sleep(0.01)
                    continue
                
                # Lê dados do PLC usando BlockReader
                data = self._read_from_plc(readable_tags)
                
                if data:
                    # Atualiza cache
                    self._update_cache(data)
                    
                    # Processa alarmes
                    if self._active_machine:
                        try:
                            active_alarms = alarm_processor.process_alarm_data(data, self._active_machine['name'])
                            alarm_summary = alarm_processor.get_alarm_summary(active_alarms)
                            data['active_alarms'] = active_alarms
                            data['alarm_summary'] = alarm_summary
                        except Exception as e:
                            print(f"[BLOCK] ❌ Erro no processamento de alarmes: {e}")
                    
                    # Envia para frontend
                    if self.socketio:
                        self.socketio.emit('telemetry', data)
                
                self._last_poll_time = current_time
                
            except Exception as e:
                print(f"[BLOCK] ❌ Erro no polling: {e}")
                time.sleep(0.1)
    
    def _process_request(self, request):
        """Processa uma requisição individual"""
        try:
            if request['operation'] == 'read':
                self._process_read_request(request)
            elif request['operation'] == 'write':
                self._process_write_request(request)
            
            with self._lock:
                self._stats['total_requests'] += 1
                self._stats['successful_requests'] += 1
                
        except Exception as e:
            print(f"[BLOCK] ❌ Erro ao processar requisição: {e}")
            with self._lock:
                self._stats['failed_requests'] += 1
    
    def _process_read_request(self, request):
        """Processa requisição de leitura"""
        tags = request.get('tags', [])
        
        # Verifica cache primeiro
        cached_data = self._get_cached_data(tags)
        uncached_tags = [tag for tag in tags if tag not in cached_data]
        
        if not uncached_tags:
            # Todos os dados estão no cache
            with self._lock:
                self._stats['cache_hits'] += len(tags)
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
    
    def _process_write_request(self, request):
        """Processa requisição de escrita com verificação"""
        tag_values = request.get('values', {})
        
        # Filtra tags que podem ser escritas (throttling)
        writable_values = {tag: value for tag, value in tag_values.items() 
                          if self.priority_manager.can_write(tag)}
        
        if not writable_values:
            print("[BLOCK] ⚠️ Nenhuma tag pode ser escrita no momento (throttling)")
            return False
        
        # Escreve no PLC
        success = self._write_to_plc(writable_values)
        
        if success:
            # Agenda verificação de escrita
            request_id = request.get('request_id', f"write_{int(time.time() * 1000)}")
            self.write_verifier.schedule_verification(
                request_id, 
                writable_values,
                callback=self._on_write_verification
            )
            
            # Invalida cache para as tags escritas
            self._invalidate_cache(list(writable_values.keys()))
            
            print(f"[BLOCK] ✅ Escrita confirmada: {list(writable_values.keys())}")
        else:
            print(f"[BLOCK] ❌ Falha na escrita: {list(writable_values.keys())}")
        
        return success
    
    def _on_write_verification(self, request_id: str, success: bool, tag_values: Dict[str, Any]):
        """Callback para verificação de escrita"""
        if success:
            print(f"[BLOCK] ✅ Verificação de escrita bem-sucedida: {request_id}")
            with self._lock:
                self._stats['write_verifications'] += 1
        else:
            print(f"[BLOCK] ❌ Verificação de escrita falhou: {request_id}")
    
    def _get_connection(self, ip: str):
        """
        Obtém conexão dedicada para o IP (1 conexão por IP, reutilizada com lock)
        Sistema completamente reescrito para máxima estabilidade
        """
        # Cria lock para este IP se não existir
        with self._pool_lock:
            if ip not in self._connection_locks:
                self._connection_locks[ip] = threading.Lock()
            ip_lock = self._connection_locks[ip]
        
        # Aguarda lock do IP com timeout (evita deadlock)
        acquired = ip_lock.acquire(timeout=3.0)  # 3s timeout
        if not acquired:
            print(f"[BLOCK] ⏱️ Timeout ao aguardar lock para {ip}")
            return None
        
        try:
            # Verifica se já existe conexão para este IP
            if ip in self._dedicated_connections:
                driver = self._dedicated_connections[ip]
                
                # Testa se ainda está conectada
                try:
                    if driver.is_connected():
                        # Atualiza estatísticas de uso
                        with self._pool_lock:
                            if ip not in self._connection_usage:
                                self._connection_usage[ip] = {'last_used': time.time(), 'use_count': 0}
                            self._connection_usage[ip]['last_used'] = time.time()
                            self._connection_usage[ip]['use_count'] += 1
                        return driver
                    else:
                        # Conexão perdida, remove e recria
                        print(f"[BLOCK] ⚠️ Conexão {ip} perdida, reconectando...")
                        with self._pool_lock:
                            del self._dedicated_connections[ip]
                except Exception as e:
                    print(f"[BLOCK] ❌ Erro ao verificar conexão {ip}: {e}")
                    with self._pool_lock:
                        if ip in self._dedicated_connections:
                            del self._dedicated_connections[ip]
            
            # Cria nova conexão dedicada para este IP
            try:
                machine_config = self._find_machine_by_ip(ip)
                if not machine_config:
                    print(f"[BLOCK] ❌ Configuração não encontrada para {ip}")
                    return None
                
                # Cria driver BlockReader
                machine_config['plc_type'] = 'block_reader'
                driver = create_driver_for_config(machine_config)
                
                if driver and driver.connect():
                    with self._pool_lock:
                        self._dedicated_connections[ip] = driver
                        self._connection_usage[ip] = {'last_used': time.time(), 'use_count': 1}
                    print(f"[BLOCK] 🔌 Conexão dedicada criada para {ip}")
                    return driver
                else:
                    print(f"[BLOCK] ❌ Falha ao conectar {ip}")
                    with self._lock:
                        self._stats['connection_errors'] += 1
                    return None
            except Exception as e:
                print(f"[BLOCK] ❌ Erro ao criar conexão para {ip}: {e}")
                with self._lock:
                    self._stats['connection_errors'] += 1
                return None
        finally:
            # Garante que o lock seja liberado
            ip_lock.release()
    
    def _release_connection(self, ip: str):
        """
        Libera conexão (não faz nada, conexão é mantida)
        Sistema de conexão dedicada não precisa liberar
        """
        # Apenas atualiza last_used para monitoramento
        with self._pool_lock:
            if ip in self._connection_usage:
                self._connection_usage[ip]['last_used'] = time.time()
    
    def _find_machine_by_ip(self, ip: str):
        """Encontra configuração da máquina por IP"""
        for machine_config in self.machines_config:
            if machine_config.get('default_plc_ip') == ip:
                return machine_config
        return None
    
    def _read_from_plc(self, tags: List[str]) -> Dict[str, Any]:
        """Lê tags do PLC de forma otimizada usando BlockReader"""
        if not tags:
            return {}
        
        # Se não há máquina ativa, retorna vazio
        if not self._active_machine:
            print("[BLOCK] ⚠️ Nenhuma máquina ativa para leitura")
            return {}
        
        # Agrupa tags por IP
        tags_by_ip = self._group_tags_by_ip(tags)
        all_data = {}
        
        for ip, ip_tags in tags_by_ip.items():
            try:
                # Obtém conexão
                driver = self._get_connection(ip)
                if not driver:
                    print(f"[BLOCK] ⚠️ Não foi possível obter conexão para {ip}")
                    continue
                
                # Obtém definições das tags
                tag_defs = self._get_tag_definitions(ip_tags, ip)
                if not tag_defs:
                    print(f"[BLOCK] ⚠️ Nenhuma definição encontrada para tags em {ip}")
                    continue
                
                print(f"[BLOCK] 📖 Lendo {len(tag_defs)} tags do {ip}")
                
                # Lê do PLC usando BlockReader
                plc_data = driver.read_tags(tag_defs)
                if plc_data:
                    all_data.update(plc_data)
                    print(f"[BLOCK] ✅ Lidas {len(plc_data)} tags do {ip}")
                else:
                    print(f"[BLOCK] ⚠️ Nenhum dado retornado do {ip}")
                
                # Libera conexão
                self._release_connection(ip)
                
            except Exception as e:
                print(f"[BLOCK] ❌ Erro ao ler do {ip}: {e}")
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
                
                # Escreve no PLC
                result = driver.write_tags(ip_values)
                if not result:
                    success = False
                
                # Libera conexão
                self._release_connection(ip)
                
            except Exception as e:
                print(f"[BLOCK] ❌ Erro ao escrever no {ip}: {e}")
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
        # Se há máquina ativa, usa seu IP
        if self._active_machine:
            return self._active_machine.get('default_plc_ip')
        
        # Busca em todas as máquinas
        for machine_name, comm_map in self._comm_map_by_machine.items():
            for tag_def in comm_map:
                if tag_def.get('name') == tag_name:
                    return tag_def.get('plc_ip')
        
        return None
    
    def _get_tag_definitions(self, tag_names: List[str], ip: str) -> List[Dict]:
        """Obtém definições das tags para um IP específico"""
        tag_defs = []
        
        # Se há máquina ativa, busca apenas nela
        if self._active_machine:
            machine_name = self._active_machine.get('name')
            if machine_name in self._comm_map_by_machine:
                comm_map = self._comm_map_by_machine[machine_name]
                for tag_def in comm_map:
                    if tag_def.get('name') in tag_names:
                        tag_defs.append(tag_def)
        else:
            # Busca em todas as máquinas
            for machine_name, comm_map in self._comm_map_by_machine.items():
                for tag_def in comm_map:
                    if (tag_def.get('name') in tag_names and 
                        tag_def.get('plc_ip', ip) == ip):
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
        try:
            with self._lock:
                self._active_machine = cfg
                # Atualiza atributos de compatibilidade
                self.active_config = cfg
                self.active_machine = cfg.get('name')
                print(f"[BLOCK] 🏭 Máquina ativa: {cfg.get('name')}")
            return True, f"Máquina {cfg.get('name')} configurada com sucesso"
        except Exception as e:
            print(f"[BLOCK] ❌ Erro ao configurar máquina: {e}")
            return False, str(e)
    
    def read_tags(self, tag_names: List[str]) -> Dict[str, Any]:
        """Lê tags específicas"""
        if not tag_names:
            return {}
        
        # Lê dados diretamente do PLC (modo síncrono para compatibilidade)
        try:
            data = self._read_from_plc(tag_names)
            if data:
                # Atualiza cache
                self._update_cache(data)
                return data
            else:
                # Se não conseguiu ler do PLC, tenta cache
                return self._get_cached_data(tag_names)
        except Exception as e:
            print(f"[BLOCK] ❌ Erro ao ler tags: {e}")
            # Fallback para cache
            return self._get_cached_data(tag_names)
    
    def write_tags(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags específicas com prioridade máxima"""
        if not tag_values:
            return True
        
        # Cria requisição de escrita com prioridade crítica
        request = {
            'request_id': f"write_{int(time.time() * 1000)}",
            'operation': 'write',
            'values': tag_values,
            'priority': 1  # CRITICAL
        }
        
        # Adiciona à fila com prioridade máxima
        self._request_queue.put((request['priority'], request))
        
        return True
    
    def subscribe_tags(self, client_id: str, tag_names: List[str]) -> bool:
        """Registra subscrição de tags para um cliente"""
        with self._subscription_lock:
            current_time = time.time()
            self._subscriptions[client_id] = {
                'tags': tag_names,
                'last_heartbeat': current_time
            }
            print(f"[BLOCK] 📋 Cliente {client_id} subscrito a {len(tag_names)} tags")
            return True
    
    def unsubscribe_client(self, client_id: str) -> bool:
        """Remove subscrição de um cliente"""
        with self._subscription_lock:
            if client_id in self._subscriptions:
                del self._subscriptions[client_id]
                print(f"[BLOCK] 🗑️ Cliente {client_id} removido das subscrições")
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
                print(f"[BLOCK] ⏰ Cliente {client_id} expirado por timeout")
            
            return list(active_tags)
    
    def _get_alarm_tags(self) -> List[str]:
        """Retorna lista de tags de alarme para leitura automática"""
        if not self._active_machine:
            return []
        
        # Tags de alarme importantes que devem ser lidas sempre
        # Removido XLCLASS_DB10_PARTIDA_DIRETA_ALARMES_TERMICOS devido a erro "Address out of range"
        alarm_tags = [
            'XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_XLCLASS_EMB14',
            'XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_EMB15_EMB30',
            'XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_LAVADORA_EST_INTEL',
            'XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_XLCLASS_EMB14',
            'XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_EMB15_EMB30',
            'XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_LAVADORA_EST_INTEL',
            'XLCLASS_DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS',
            'XLCLASS_DB1_PRINCIPAL_ALARME_CLASSIFICADORA'
        ]
        
        # Filtra apenas tags que existem no comm_map da máquina ativa
        machine_name = self._active_machine.get('name')
        if machine_name in self._comm_map_by_machine:
            comm_map = self._comm_map_by_machine[machine_name]
            available_tags = {tag.get('name') for tag in comm_map if 'name' in tag}
            return [tag for tag in alarm_tags if tag in available_tags]
        
        return []
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do controlador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'active_connections': len(self._connection_pool),
            'pending_verifications': len(self.write_verifier.get_pending_verifications()),
            'cache_size': len(self._cache),
            'queue_size': self._request_queue.qsize(),
            'subscriptions': len(self._subscriptions),
            'priority_stats': self.priority_manager.get_statistics(),
            'verifier_stats': self.write_verifier.get_statistics()
        })
        
        return stats
    
    def cleanup(self):
        """Limpeza completa"""
        self._stop_workers.set()
        self._stop_polling.set()
        
        # Limpa componentes
        self.priority_manager.cleanup()
        self.write_verifier.cleanup()
        
        # Fecha todas as conexões
        with self._pool_lock:
            for ip, conn_info in self._connection_pool.items():
                try:
                    conn_info['driver'].disconnect()
                except Exception:
                    pass
            self._connection_pool.clear()
        
        print("[BLOCK] 🧹 Cleanup completo realizado")
    
    # Métodos de compatibilidade com controladores antigos
    
    def reload_comm_map_for_active(self):
        """Recarrega comm_map da máquina ativa"""
        if not self._active_machine:
            return False, "Nenhuma máquina ativa"
        
        try:
            machine_name = self._active_machine.get('name')
            comm_map_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'comm_map')
            comm_map_file = os.path.join(comm_map_dir, f'{machine_name}.json')
            
            if os.path.exists(comm_map_file):
                with open(comm_map_file, 'r', encoding='utf-8') as f:
                    comm_map_raw = json.load(f)
                comm_map = self._normalize_comm_map(comm_map_raw)
                self._comm_map_by_machine[machine_name] = comm_map
                print(f"[BLOCK] 🔄 Comm map recarregado para {machine_name}")
                return True, f"Comm map recarregado para {machine_name}"
            else:
                return False, f"Arquivo comm_map não encontrado para {machine_name}"
        except Exception as e:
            return False, str(e)
    
    def force_reconnect(self):
        """Força reconexão com o PLC"""
        try:
            print("[BLOCK] 🔄 Reconexão forçada")
            # Limpa pool de conexões
            with self._pool_lock:
                for ip, conn_info in self._connection_pool.items():
                    try:
                        conn_info['driver'].disconnect()
                    except Exception:
                        pass
                self._connection_pool.clear()
            
            # Limpa cache
            with self._cache_lock:
                self._cache.clear()
            
            return True, "Reconexão forçada realizada"
        except Exception as e:
            return False, str(e)
    
    def _detect_and_switch_to_available_plc(self):
        """Detecta e muda para PLC disponível"""
        # Para o BlockReader, sempre retorna True pois usa pool de conexões
        return True
