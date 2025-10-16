# app/services/plc_controller_simple_robust.py
# Controlador PLC Simples e Robusto - Versão Estável
# Resolve problemas de comunicação sem complexidade excessiva

import threading
import time
import json
import os
from typing import Dict, List, Optional, Any
from collections import defaultdict

from ..plc_drivers import create_driver_for_config

# Importa alarm_processor de forma segura
try:
    from .alarm_processor import alarm_processor
except ImportError:
    alarm_processor = None

class SimpleRobustPLCController:
    """
    Controlador PLC Simples e Robusto
    
    Características:
    - Comunicação estável sem oscilações
    - Tratamento de erros "Address out of range"
    - Reconexão automática
    - Cache inteligente
    - Detecção automática de máquinas
    """
    
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        
        # Estado do controlador
        self._lock = threading.Lock()
        self._active_machine = None
        self._comm_map_by_machine = {}
        self._driver = None
        
        # Sistema de reconexão
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._reconnect_delay = 5.0
        self._last_reconnect_attempt = 0
        self._connection_stable = False
        self._last_successful_read = 0
        
        # Cache de dados
        self._cache = {}
        self._cache_lock = threading.Lock()
        self._cache_ttl = 2.0  # 2 segundos
        
        # Sistema de polling
        self._polling_thread = None
        self._stop_polling = threading.Event()
        self._polling_interval = 1.0  # 1 segundo
        
        # Sistema de subscrições
        self._subscriptions = {}
        self._subscription_lock = threading.Lock()
        self._heartbeat_timeout = 30.0
        
        # Estatísticas
        self._stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'connection_errors': 0,
            'address_errors': 0,
            'reconnections': 0
        }
        
        # Carrega configurações
        self._load_comm_maps()
        
        # Inicia polling
        self._start_polling()
        
        print("[SIMPLE_ROBUST] 🚀 Controlador PLC simples e robusto inicializado")
    
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
                    print(f"[SIMPLE_ROBUST] 📋 Comm map carregado para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[SIMPLE_ROBUST] ❌ Erro ao carregar comm_map para {machine_name}: {e}")
                    self._comm_map_by_machine[machine_name] = []
            else:
                print(f"[SIMPLE_ROBUST] ⚠️ Comm map não encontrado para {machine_name}")
                self._comm_map_by_machine[machine_name] = []
    
    def _create_driver(self):
        """Cria driver para a máquina ativa"""
        if not self._active_machine:
            return False
        
        try:
            print(f"[SIMPLE_ROBUST] 🔌 Criando driver para {self._active_machine['name']}")
            self._driver = create_driver_for_config(self._active_machine)
            
            if self._driver.connect():
                print(f"[SIMPLE_ROBUST] ✅ Driver conectado com sucesso")
                self._connection_stable = True
                self._last_successful_read = time.time()
                self._reconnect_attempts = 0
                return True
            else:
                print(f"[SIMPLE_ROBUST] ❌ Falha na conexão do driver")
                self._driver = None
                return False
                
        except Exception as e:
            print(f"[SIMPLE_ROBUST] ❌ Erro ao criar driver: {e}")
            self._driver = None
            return False
    
    def _attempt_reconnection(self):
        """Tenta reconectar ao PLC"""
        current_time = time.time()
        
        if current_time - self._last_reconnect_attempt < self._reconnect_delay:
            return False
        
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            print(f"[SIMPLE_ROBUST] ❌ Máximo de tentativas de reconexão atingido")
            return False
        
        self._reconnect_attempts += 1
        self._last_reconnect_attempt = current_time
        
        print(f"[SIMPLE_ROBUST] 🔄 Tentativa de reconexão {self._reconnect_attempts}/{self._max_reconnect_attempts}")
        
        try:
            # Fecha driver existente
            if self._driver:
                try:
                    self._driver.disconnect()
                except Exception:
                    pass
                self._driver = None
            
            # Aguarda um pouco
            time.sleep(2.0)
            
            # Tenta criar novo driver
            if self._create_driver():
                print(f"[SIMPLE_ROBUST] ✅ Reconectado com sucesso")
                self._stats['reconnections'] += 1
                return True
            else:
                print(f"[SIMPLE_ROBUST] ❌ Falha na reconexão")
                return False
            
        except Exception as e:
            print(f"[SIMPLE_ROBUST] ❌ Erro na reconexão: {e}")
            return False
    
    def _start_polling(self):
        """Inicia polling de dados"""
        if self._polling_thread and self._polling_thread.is_alive():
            return
        
        self._stop_polling.clear()
        self._polling_thread = threading.Thread(
            target=self._polling_loop,
            daemon=True,
            name="SimpleRobustPLCPolling"
        )
        self._polling_thread.start()
        print("[SIMPLE_ROBUST] 🔄 Polling iniciado")
    
    def _polling_loop(self):
        """Loop de polling simples e robusto"""
        while not self._stop_polling.is_set():
            try:
                current_time = time.time()
                
                # Verifica se precisa conectar
                if not self._driver or not self._driver.is_connected():
                    if self._active_machine:
                        if not self._create_driver():
                            time.sleep(5.0)
                            continue
                    else:
                        time.sleep(1.0)
                        continue
                
                # Obtém tags subscritas
                subscribed_tags = self.get_subscribed_tags()
                if not subscribed_tags:
                    time.sleep(1.0)
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
                            print(f"[SIMPLE_ROBUST] ❌ Erro no processamento de alarmes: {e}")
                    
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
                
                # Aguarda intervalo de polling
                time.sleep(self._polling_interval)
                
            except Exception as e:
                print(f"[SIMPLE_ROBUST] ❌ Erro no polling: {e}")
                time.sleep(1.0)
    
    def _read_from_plc(self, tags: List[str]) -> Dict[str, Any]:
        """Lê tags do PLC de forma simples e robusta"""
        if not tags or not self._driver:
            return {}
        
        try:
            # Obtém definições das tags
            tag_defs = self._get_tag_definitions(tags)
            if not tag_defs:
                return {}
            
            # Lê do PLC
            plc_data = self._driver.read_tags(tag_defs)
            
            if plc_data:
                # Reseta contador de erros em caso de sucesso
                with self._lock:
                    self._stats['total_requests'] += 1
                
                return plc_data
            else:
                return {}
                
        except Exception as e:
            error_msg = str(e)
            print(f"[SIMPLE_ROBUST] ❌ Erro ao ler do PLC: {error_msg}")
            
            # Trata erros específicos
            if "Address out of range" in error_msg:
                with self._lock:
                    self._stats['address_errors'] += 1
            elif "Item not available" in error_msg:
                with self._lock:
                    self._stats['connection_errors'] += 1
            
            return {}
    
    def _write_to_plc(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags no PLC de forma simples e robusta"""
        if not tag_values or not self._driver:
            return False
        
        try:
            # Obtém definições das tags
            tag_defs = self._get_tag_definitions(list(tag_values.keys()))
            if not tag_defs:
                return False
            
            # Escreve no PLC
            result = self._driver.write_tags(tag_values)
            
            if result:
                # Invalida cache para as tags escritas
                self._invalidate_cache(list(tag_values.keys()))
                print(f"[SIMPLE_ROBUST] ✅ Escrita confirmada: {list(tag_values.keys())}")
            
            return result
            
        except Exception as e:
            error_msg = str(e)
            print(f"[SIMPLE_ROBUST] ❌ Erro ao escrever no PLC: {error_msg}")
            
            # Trata erros específicos
            if "Address out of range" in error_msg:
                with self._lock:
                    self._stats['address_errors'] += 1
            elif "Item not available" in error_msg:
                with self._lock:
                    self._stats['connection_errors'] += 1
            
            return False
    
    def _get_tag_definitions(self, tag_names: List[str]) -> List[Dict]:
        """Obtém definições das tags"""
        if not self._active_machine:
            return []
        
        machine_name = self._active_machine['name']
        comm_map = self._comm_map_by_machine.get(machine_name, [])
        
        tag_defs = []
        for tag_def in comm_map:
            if tag_def.get('name') in tag_names:
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
            print(f"[SIMPLE_ROBUST] 🏭 Máquina ativa: {cfg.get('name')}")
            
            # Fecha driver existente
            if self._driver:
                try:
                    self._driver.disconnect()
                except Exception:
                    pass
                self._driver = None
            
            # Cria novo driver
            self._create_driver()
            
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
                self._stats['total_requests'] += 1
            return cached_data
        
        # Lê dados não cacheados do PLC
        plc_data = self._read_from_plc(uncached_tags)
        
        # Atualiza cache
        if plc_data:
            self._update_cache(plc_data)
        
        # Combina dados do cache e do PLC
        result = cached_data.copy()
        result.update(plc_data)
        
        return result
    
    def write_tags(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags específicas"""
        if not tag_values:
            return True
        
        success = self._write_to_plc(tag_values)
        return success
    
    def subscribe_tags(self, client_id: str, tag_names: List[str]) -> bool:
        """Registra subscrição de tags para um cliente"""
        with self._subscription_lock:
            current_time = time.time()
            self._subscriptions[client_id] = {
                'tags': tag_names,
                'last_heartbeat': current_time
            }
            print(f"[SIMPLE_ROBUST] 📋 Cliente {client_id} subscrito a {len(tag_names)} tags")
            return True
    
    def unsubscribe_client(self, client_id: str) -> bool:
        """Remove subscrição de um cliente"""
        with self._subscription_lock:
            if client_id in self._subscriptions:
                del self._subscriptions[client_id]
                print(f"[SIMPLE_ROBUST] 🗑️ Cliente {client_id} removido das subscrições")
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
                print(f"[SIMPLE_ROBUST] ⏰ Cliente {client_id} expirado por timeout")
            
            return list(active_tags)
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do controlador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'cache_size': len(self._cache),
            'subscriptions': len(self._subscriptions),
            'connection_stable': self._connection_stable,
            'reconnect_attempts': self._reconnect_attempts,
            'driver_connected': self._driver is not None and self._driver.is_connected() if self._driver else False
        })
        
        return stats
    
    def cleanup(self):
        """Limpeza completa"""
        self._stop_polling.set()
        
        if self._driver:
            try:
                self._driver.disconnect()
            except Exception:
                pass
            self._driver = None
        
        print("[SIMPLE_ROBUST] 🧹 Cleanup completo realizado")
