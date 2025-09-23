# app/services/enhanced_plc_controller.py
import threading
import time
import json
import os
from typing import Dict, List, Optional, Any
from .connection_manager import ConnectionManager
from .tag_subscription_manager import TagSubscriptionManager
from .plc_queue import PLCQueue, Priority, OperationType
from .plc_cache import PLCCache
from .alarm_processor import alarm_processor

class EnhancedPLCController:
    """
    Controlador PLC Aprimorado com Nova Arquitetura
    
    Integra:
    - ConnectionManager: Descoberta automática e gerenciamento de múltiplos PLCs
    - TagSubscriptionManager: Controle dinâmico de tags por tela
    - PLCQueue: Sistema de fila com priorização
    - PLCCache: Cache inteligente para otimização
    """
    
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        
        # Componentes da nova arquitetura
        self.connection_manager = ConnectionManager(machines_config, socketio)
        self.tag_manager = TagSubscriptionManager()
        self.plc_queue = PLCQueue(max_queue_size=2000)
        self.plc_cache = PLCCache(default_ttl=30.0, max_size=15000)
        
        # Estado do controlador
        self._lock = threading.Lock()
        self._active_machine = None
        self._comm_map_by_machine = {}
        self._tags_by_plc_ip = {}
        
        # Configurações de polling
        self._polling_interval = 0.5  # 500ms para tela ativa
        self._background_interval = 5.0  # 5s para telas em background
        self._poll_thread = None
        self._stop_polling = threading.Event()
        
        # Configurações de otimização
        self._batch_size = 25
        self._max_concurrent_reads = 3
        
        # Estatísticas
        self._stats = {
            'total_reads': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'batch_operations': 0,
            'connection_changes': 0,
            'screen_changes': 0
        }
        
        # Configura callbacks
        self._setup_callbacks()
        
        # Carrega configurações
        self._load_comm_maps()
        
        # Inicia componentes
        self._start_components()
    
    def _setup_callbacks(self):
        """Configura callbacks entre componentes"""
        # ConnectionManager callbacks
        self.connection_manager.set_callbacks(
            on_connection_change=self._on_connection_change,
            on_plc_detected=self._on_plc_detected
        )
        
        # TagSubscriptionManager callbacks
        self.tag_manager.set_callbacks(
            on_subscription_change=self._on_subscription_change,
            on_screen_change=self._on_screen_change
        )
        
        # PLCQueue callbacks
        self.plc_queue.set_callbacks(
            on_batch_ready=self._on_batch_ready,
            on_request_processed=self._on_request_processed,
            on_request_failed=self._on_request_failed
        )
        
        # PLCCache callbacks
        self.plc_cache.set_callbacks(
            on_value_changed=self._on_value_changed,
            on_cache_eviction=self._on_cache_eviction
        )
    
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
                    print(f"[ENHANCED] 📋 Comm map carregado para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[ENHANCED] ❌ Erro ao carregar comm_map para {machine_name}: {e}")
                    self._comm_map_by_machine[machine_name] = []
            else:
                print(f"[ENHANCED] ⚠️ Comm map não encontrado para {machine_name}")
                self._comm_map_by_machine[machine_name] = []
    
    def _start_components(self):
        """Inicia todos os componentes"""
        try:
            # Inicia descoberta de conexões
            self.connection_manager.start_discovery()
            
            # Inicia processamento da fila
            self.plc_queue.start_processing()
            
            print("[ENHANCED] 🚀 Todos os componentes iniciados")
            
        except Exception as e:
            print(f"[ENHANCED] ❌ Erro ao iniciar componentes: {e}")
    
    def _on_connection_change(self, group: str, ip: str, machine: str, connected: bool):
        """Callback para mudança de conexão"""
        with self._lock:
            self._stats['connection_changes'] += 1
        
        print(f"[ENHANCED] 🔌 Conexão {group}: {ip} ({machine}) - {'conectado' if connected else 'desconectado'}")
        
        # Notifica frontend
        if self.socketio:
            self.socketio.emit('plc_connection_changed', {
                'group': group,
                'ip': ip,
                'machine': machine,
                'connected': connected,
                'timestamp': time.time()
            })
    
    def _on_plc_detected(self, group: str, ip: str, machine: str):
        """Callback para PLC detectado"""
        print(f"[ENHANCED] 🎯 PLC detectado: {group} - {ip} ({machine})")
        
        # Notifica frontend
        if self.socketio:
            self.socketio.emit('plc_detected', {
                'group': group,
                'ip': ip,
                'machine': machine,
                'timestamp': time.time()
            })
    
    def _on_subscription_change(self, subscribed_tags: List[str]):
        """Callback para mudança de subscrições"""
        print(f"[ENHANCED] 📊 Subscrições atualizadas: {len(subscribed_tags)} tags")
        
        # Inicia/para polling baseado nas subscrições
        if subscribed_tags:
            self._start_polling()
        else:
            self._stop_polling()
    
    def _on_screen_change(self, client_id: str, screen_name: str, tags: List[str]):
        """Callback para mudança de tela"""
        with self._lock:
            self._stats['screen_changes'] += 1
        
        print(f"[ENHANCED] 🖥️ Cliente {client_id} mudou para tela '{screen_name}' ({len(tags)} tags)")
        
        # Notifica frontend
        if self.socketio:
            self.socketio.emit('screen_changed', {
                'client_id': client_id,
                'screen': screen_name,
                'tags_count': len(tags),
                'timestamp': time.time()
            })
    
    def _on_batch_ready(self, operation: str, data: Any) -> Any:
        """Callback para processamento de lote"""
        try:
            if operation == 'batch_read':
                return self._process_batch_read(data)
            elif operation == 'batch_write':
                return self._process_batch_write(data)
            elif operation == 'read':
                return self._process_single_read(data)
            elif operation == 'write':
                return self._process_single_write(data)
            else:
                raise ValueError(f"Operação não suportada: {operation}")
        except Exception as e:
            print(f"[ENHANCED] ❌ Erro no processamento de lote {operation}: {e}")
            return None
    
    def _process_batch_read(self, tags: List[str]) -> Dict[str, Any]:
        """Processa leitura em lote"""
        with self._lock:
            self._stats['batch_operations'] += 1
        
        # Verifica cache primeiro
        cached_data = self.plc_cache.get_multiple(tags)
        uncached_tags = [tag for tag in tags if tag not in cached_data]
        
        if not uncached_tags:
            # Todos os dados estão no cache
            with self._lock:
                self._stats['cache_hits'] += len(tags)
            return cached_data
        
        # Lê dados não cacheados do PLC
        plc_data = self._read_from_plcs(uncached_tags)
        
        # Atualiza cache
        if plc_data:
            self.plc_cache.set_multiple(plc_data)
            with self._lock:
                self._stats['cache_misses'] += len(plc_data)
        
        # Combina dados do cache e do PLC
        result = cached_data.copy()
        result.update(plc_data)
        
        return result
    
    def _process_batch_write(self, tag_values: Dict[str, Any]) -> bool:
        """Processa escrita em lote"""
        with self._lock:
            self._stats['batch_operations'] += 1
        
        # Escreve no PLC
        success = self._write_to_plcs(tag_values)
        
        if success:
            # Invalida cache para as tags escritas
            self.plc_cache.invalidate_multiple(list(tag_values.keys()))
        
        return success
    
    def _process_single_read(self, tags: List[str]) -> Dict[str, Any]:
        """Processa leitura individual"""
        return self._process_batch_read(tags)
    
    def _process_single_write(self, tag_values: Dict[str, Any]) -> bool:
        """Processa escrita individual"""
        return self._process_batch_write(tag_values)
    
    def _read_from_plcs(self, tags: List[str]) -> Dict[str, Any]:
        """Lê tags dos PLCs conectados"""
        if not tags:
            return {}
        
        # Obtém conexões ativas
        active_connections = self.connection_manager.get_all_active_connections()
        
        if not active_connections:
            print("[ENHANCED] ⚠️ Nenhuma conexão ativa para leitura")
            return {}
        
        # Agrupa tags por IP do PLC
        tags_by_ip = self._group_tags_by_plc_ip(tags)
        
        all_data = {}
        
        # Lê de cada PLC
        for group, (ip, driver) in active_connections.items():
            group_tags = tags_by_ip.get(ip, [])
            if not group_tags:
                continue
            
            try:
                # Obtém definições das tags
                tag_defs = self._get_tag_definitions(group_tags, ip)
                if not tag_defs:
                    continue
                
                # Lê do PLC
                plc_data = driver.read_tags(tag_defs)
                if plc_data:
                    all_data.update(plc_data)
                    print(f"[ENHANCED] 📖 Lidas {len(plc_data)} tags do {group} ({ip})")
                
            except Exception as e:
                print(f"[ENHANCED] ❌ Erro ao ler do {group} ({ip}): {e}")
        
        return all_data
    
    def _write_to_plcs(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags nos PLCs conectados"""
        if not tag_values:
            return True
        
        # Obtém conexões ativas
        active_connections = self.connection_manager.get_all_active_connections()
        
        if not active_connections:
            print("[ENHANCED] ⚠️ Nenhuma conexão ativa para escrita")
            return False
        
        # Agrupa valores por IP do PLC
        values_by_ip = self._group_values_by_plc_ip(tag_values)
        
        success = True
        
        # Escreve em cada PLC
        for group, (ip, driver) in active_connections.items():
            group_values = values_by_ip.get(ip, {})
            if not group_values:
                continue
            
            try:
                # Obtém definições das tags
                tag_defs = self._get_tag_definitions(list(group_values.keys()), ip)
                if not tag_defs:
                    continue
                
                # Escreve no PLC
                result = driver.write_tags(group_values)
                if result:
                    print(f"[ENHANCED] 📝 Escritas {len(group_values)} tags no {group} ({ip})")
                else:
                    success = False
                    print(f"[ENHANCED] ❌ Falha na escrita no {group} ({ip})")
                
            except Exception as e:
                print(f"[ENHANCED] ❌ Erro ao escrever no {group} ({ip}): {e}")
                success = False
        
        return success
    
    def _group_tags_by_plc_ip(self, tags: List[str]) -> Dict[str, List[str]]:
        """Agrupa tags por IP do PLC"""
        tags_by_ip = defaultdict(list)
        
        for tag in tags:
            # Encontra IP do PLC para esta tag
            plc_ip = self._find_plc_ip_for_tag(tag)
            if plc_ip:
                tags_by_ip[plc_ip].append(tag)
        
        return dict(tags_by_ip)
    
    def _group_values_by_plc_ip(self, tag_values: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Agrupa valores de tags por IP do PLC"""
        values_by_ip = defaultdict(dict)
        
        for tag, value in tag_values.items():
            # Encontra IP do PLC para esta tag
            plc_ip = self._find_plc_ip_for_tag(tag)
            if plc_ip:
                values_by_ip[plc_ip][tag] = value
        
        return dict(values_by_ip)
    
    def _find_plc_ip_for_tag(self, tag_name: str) -> Optional[str]:
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
    
    def _get_tag_definitions(self, tag_names: List[str], plc_ip: str) -> List[Dict]:
        """Obtém definições das tags para um IP específico"""
        tag_defs = []
        
        for machine_name, comm_map in self._comm_map_by_machine.items():
            for tag_def in comm_map:
                if (tag_def.get('name') in tag_names and 
                    tag_def.get('plc_ip', self._active_machine.get('default_plc_ip')) == plc_ip):
                    tag_defs.append(tag_def)
        
        return tag_defs
    
    def _on_request_processed(self, request, result):
        """Callback para requisição processada"""
        with self._lock:
            self._stats['total_reads'] += 1
    
    def _on_request_failed(self, request, error):
        """Callback para requisição falhada"""
        print(f"[ENHANCED] ❌ Requisição falhada: {error}")
    
    def _on_value_changed(self, tag_name: str, old_value: Any, new_value: Any):
        """Callback para mudança de valor no cache"""
        # Notifica frontend sobre mudança de valor
        if self.socketio:
            self.socketio.emit('tag_value_changed', {
                'tag': tag_name,
                'old_value': old_value,
                'new_value': new_value,
                'timestamp': time.time()
            })
    
    def _on_cache_eviction(self, tag_name: str):
        """Callback para eviction do cache"""
        print(f"[ENHANCED] 🗑️ Tag {tag_name} removida do cache")
    
    def _start_polling(self):
        """Inicia polling de dados"""
        if self._poll_thread and self._poll_thread.is_alive():
            return
        
        self._stop_polling.clear()
        self._poll_thread = threading.Thread(
            target=self._poll_loop,
            daemon=True,
            name="EnhancedPLCPolling"
        )
        self._poll_thread.start()
        print("[ENHANCED] 🔄 Polling iniciado")
    
    def _stop_polling(self):
        """Para polling de dados"""
        self._stop_polling.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=2)
        self._poll_thread = None
        print("[ENHANCED] 🛑 Polling parado")
    
    def _poll_loop(self):
        """Loop principal de polling"""
        while not self._stop_polling.is_set():
            try:
                # Obtém tags subscritas
                subscribed_tags = self.tag_manager.get_subscribed_tags()
                
                if not subscribed_tags:
                    time.sleep(1.0)
                    continue
                
                # Adiciona requisição de leitura em lote à fila
                self.plc_queue.add_batch_read_request(
                    tags=subscribed_tags,
                    priority=Priority.NORMAL
                )
                
                # Aguarda intervalo de polling
                time.sleep(self._polling_interval)
                
            except Exception as e:
                print(f"[ENHANCED] ❌ Erro no loop de polling: {e}")
                time.sleep(1.0)
    
    # Métodos públicos da API
    
    def subscribe_to_screen(self, client_id: str, screen_name: str) -> bool:
        """Subscreve cliente a uma tela"""
        return self.tag_manager.subscribe_to_screen(client_id, screen_name)
    
    def subscribe_to_tags(self, client_id: str, tag_names: List[str]) -> bool:
        """Subscreve cliente a tags específicas"""
        return self.tag_manager.subscribe_to_tags(client_id, tag_names)
    
    def unsubscribe_client(self, client_id: str) -> bool:
        """Remove subscrição de um cliente"""
        return self.tag_manager.unsubscribe_client(client_id)
    
    def heartbeat_client(self, client_id: str) -> bool:
        """Atualiza heartbeat de um cliente"""
        return self.tag_manager.heartbeat_client(client_id)
    
    def read_tags(self, tag_names: List[str]) -> Dict[str, Any]:
        """Lê tags específicas"""
        if not tag_names:
            return {}
        
        # Verifica cache primeiro
        cached_data = self.plc_cache.get_multiple(tag_names)
        uncached_tags = [tag for tag in tag_names if tag not in cached_data]
        
        if not uncached_tags:
            return cached_data
        
        # Lê dados não cacheados
        plc_data = self._read_from_plcs(uncached_tags)
        
        # Atualiza cache
        if plc_data:
            self.plc_cache.set_multiple(plc_data)
        
        # Combina resultados
        result = cached_data.copy()
        result.update(plc_data)
        
        return result
    
    def write_tags(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags específicas"""
        if not tag_values:
            return True
        
        # Adiciona à fila de escrita
        request_id = self.plc_queue.add_batch_write_request(
            tag_values=tag_values,
            priority=Priority.HIGH
        )
        
        return request_id is not None
    
    def get_connection_status(self) -> Dict:
        """Retorna status das conexões"""
        return self.connection_manager.get_connection_status()
    
    def get_subscription_status(self) -> Dict:
        """Retorna status das subscrições"""
        return self.tag_manager.get_all_subscriptions()
    
    def get_queue_status(self) -> Dict:
        """Retorna status da fila"""
        return self.plc_queue.get_statistics()
    
    def get_cache_status(self) -> Dict:
        """Retorna status do cache"""
        return self.plc_cache.get_statistics()
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas gerais"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'connection_status': self.get_connection_status(),
            'subscription_status': self.get_subscription_status(),
            'queue_status': self.get_queue_status(),
            'cache_status': self.get_cache_status()
        })
        
        return stats
    
    def force_reconnect(self, group: str = None):
        """Força reconexão de PLCs"""
        self.connection_manager.force_reconnect(group)
    
    def cleanup(self):
        """Limpeza completa"""
        self._stop_polling()
        
        # Limpa componentes
        self.connection_manager.cleanup()
        self.tag_manager.cleanup()
        self.plc_queue.cleanup()
        self.plc_cache.cleanup()
        
        print("[ENHANCED] 🧹 Cleanup completo realizado")
