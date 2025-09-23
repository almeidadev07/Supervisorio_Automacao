# app/services/plc_controller_simple.py
# Controlador PLC simples e estável - sem oscilações

import threading
import time
import json
import os
from ..plc_drivers import create_driver_for_config
from .alarm_processor import alarm_processor

class SimplePLCController:
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        self.current_machine = None
        self.active_config = None
        self.driver = None
        self.running = False
        self.polling_thread = None
        self.alarm_processor = alarm_processor
        
        # Sistema de estabilidade
        self._connection_stable = False
        self._last_successful_read = 0
        self._connection_stable_time = 10.0  # 10 segundos para considerar estável
        self._max_connection_instability = 2  # Máximo 2 instabilidades antes de forçar reconexão
        self._connection_instability_count = 0
        self._last_connection_attempt = 0
        self._connection_retry_interval = 5.0  # Tenta reconectar a cada 5 segundos
        self._consecutive_failures = 0
        self._max_consecutive_failures = 3
        self._polling_interval = 2.0  # Intervalo de polling em segundos
        self._connection_stable_count = 0
        self._min_stable_connections = 2  # Mínimo de conexões estáveis antes de considerar estável
        
        # Cache de dados para evitar oscilações
        self._data_cache = {}
        self._cache_timeout = 5.0  # Cache válido por 5 segundos
        self._last_cache_update = 0
        
        # Threading
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        
        # Comm maps
        self.comm_map_by_machine = {}
        self._load_comm_maps()
        
        print("[PLC] Controlador PLC simples inicializado")

    def _load_comm_maps(self):
        """Carrega os maps de comunicação de todas as máquinas"""
        comm_map_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'comm_map')
        
        for machine_config in self.machines_config:
            machine_name = machine_config.get('name')
            if not machine_name:
                continue
                
            # Tenta diferentes nomes de arquivo
            possible_names = [
                f'{machine_name}.json',
                f'{machine_name.lower()}.json',
                f'{machine_name.upper()}.json'
            ]
            
            comm_map_loaded = False
            for comm_map_file in possible_names:
                comm_map_path = os.path.join(comm_map_dir, comm_map_file)
            if os.path.exists(comm_map_path):
                    try:
                        with open(comm_map_path, 'r', encoding='utf-8') as f:
                            comm_map = json.load(f)

                        # Normaliza: se vier como lista, converte para dict {name: def}
                        if isinstance(comm_map, list):
                            normalized = {}
                            for tag in comm_map:
                                try:
                                    name = tag.get('name') if isinstance(tag, dict) else None
                                    if name:
                                        normalized[name] = tag
                                except Exception:
                                    continue
                            comm_map = normalized

                        if not isinstance(comm_map, dict):
                            print(f"[PLC] ❌ Comm map inválido para {machine_name} (esperado dict)")
                            continue

                        self.comm_map_by_machine[machine_name] = comm_map
                        print(f"[PLC] ✅ Comm map carregado para {machine_name}: {len(comm_map)} tags")
                        comm_map_loaded = True
                        break
                    except Exception as e:
                        print(f"[PLC] ❌ Erro ao carregar comm map {comm_map_file}: {e}")
                        continue
            
            if not comm_map_loaded:
                print(f"[PLC] ❌ Comm map não encontrado para {machine_name}")

    def set_machine(self, machine_name):
        """Define a máquina ativa"""
        if machine_name not in [m['name'] for m in self.machines_config]:
            print(f"[PLC] ❌ Máquina {machine_name} não encontrada")
            return False
            
        self.current_machine = machine_name
        self.active_config = next(m for m in self.machines_config if m['name'] == machine_name)
        print(f"[PLC] ✅ Máquina definida: {machine_name}")
        
        # Inicia conexão se não estiver rodando
        if not self.running:
            self.start()
            
        return True

    def set_active_machine(self, machine_name):
        """Alias para set_machine para compatibilidade"""
        return self.set_machine(machine_name)

    def start(self):
        """Inicia o controlador"""
        if self.running:
            return
            
        self.running = True
        self._stop_event.clear()
        self.polling_thread = threading.Thread(target=self._polling_loop, daemon=True)
        self.polling_thread.start()
        print("[PLC] 🚀 Controlador iniciado")

    def stop(self):
        """Para o controlador"""
        self.running = False
        self._stop_event.set()
        if self.polling_thread:
            self.polling_thread.join(timeout=2)
        if self.driver:
            self.driver.disconnect()
        print("[PLC] ⏹️ Controlador parado")

    def _polling_loop(self):
        """Loop principal de polling"""
        while self.running and not self._stop_event.is_set():
            try:
                if self.current_machine and self.active_config:
                    self._maintain_connection()
                    self._read_data()
                else:
                    time.sleep(1)
                    continue
                    
                time.sleep(self._polling_interval)
                
            except Exception as e:
                print(f"[PLC] ❌ Erro no loop de polling: {e}")
                time.sleep(5)

    def _maintain_connection(self):
        """Mantém a conexão estável"""
        current_time = time.time()
        
        # Se não há driver, tenta criar
        if not self.driver:
            self._create_driver()
            return
            
        # Se não está conectado, tenta reconectar
        if not self.driver.is_connected():
            if current_time - self._last_connection_attempt > self._connection_retry_interval:
                self._reconnect()
            return
            
        # Verifica estabilidade da conexão
        if current_time - self._last_successful_read > self._connection_stable_time:
            if self._connection_stable:
                print("[PLC] ⚠️ Conexão instável detectada")
                self._connection_stable = False
                self._connection_instability_count += 1
                
                # Se muitas instabilidades, força reconexão
                if self._connection_instability_count >= self._max_connection_instability:
                    print("[PLC] 🔄 Forçando reconexão devido a instabilidade")
                    self._reconnect()
                    self._connection_instability_count = 0
        else:
            # Conexão estável
            if not self._connection_stable:
                self._connection_stable_count += 1
                if self._connection_stable_count >= self._min_stable_connections:
                    print("[PLC] ✅ Conexão estável estabelecida")
                    self._connection_stable = True
                    self._connection_instability_count = 0

    def _create_driver(self):
        """Cria o driver para a máquina atual"""
        if not self.active_config:
            return
            
        try:
            self.driver = create_driver_for_config(self.active_config)
            print(f"[PLC] 🔌 Driver criado para {self.current_machine}")
        except Exception as e:
            print(f"[PLC] ❌ Erro ao criar driver: {e}")

    def _reconnect(self):
        """Reconecta ao PLC"""
        current_time = time.time()
        self._last_connection_attempt = current_time
        
        if not self.driver:
            self._create_driver()
            return
            
        try:
            print(f"[PLC] 🔄 Tentando reconectar...")
            self.driver.disconnect()
            time.sleep(1)
            
            if self.driver.connect():
                print(f"[PLC] ✅ Reconectado com sucesso")
                self._connection_stable = False
                self._connection_stable_count = 0
                self._consecutive_failures = 0
            else:
                print(f"[PLC] ❌ Falha na reconexão")
                self._consecutive_failures += 1
                
        except Exception as e:
            print(f"[PLC] ❌ Erro na reconexão: {e}")
            self._consecutive_failures += 1

    def _read_data(self):
        """Lê dados do PLC"""
        if not self.driver or not self.driver.is_connected():
            return
            
        try:
            # Lê tags do comm map
            comm_map = self.comm_map_by_machine.get(self.current_machine, {})
            if not comm_map:
                return
                
            # Lê apenas algumas tags importantes para evitar sobrecarga
            important_tags = []
            for tag_name, tag_info in comm_map.items():
                if isinstance(tag_info, dict) and tag_info.get('important', False):
                    important_tags.append(tag_name)
                    
            # Se não há tags importantes, lê algumas aleatórias
            if not important_tags:
                important_tags = list(comm_map.keys())[:10]
                
            if not important_tags:
                return
                
            # Lê as tags
            tag_definitions = [comm_map[tag] for tag in important_tags if tag in comm_map]
            values = self.driver.read_tags(tag_definitions)
            
            if values:
                self._last_successful_read = time.time()
                self._update_data_cache(values)
                self._send_data_to_frontend(values)
                
        except Exception as e:
            print(f"[PLC] ❌ Erro ao ler dados: {e}")
            self._consecutive_failures += 1

    def _update_data_cache(self, values):
        """Atualiza o cache de dados"""
        current_time = time.time()
        self._data_cache.update(values)
        self._last_cache_update = current_time

    def _send_data_to_frontend(self, values):
        """Envia dados para o frontend"""
        try:
            # Envia dados via Socket.IO
            self.socketio.emit('plc_data', {
                'machine': self.current_machine,
                'values': values,
                'timestamp': time.time()
            })
        except Exception as e:
            print(f"[PLC] ❌ Erro ao enviar dados: {e}")

    def get_active_alarms(self):
        """Retorna alarmes ativos"""
        if not self.alarm_processor:
            return []
            
        try:
            return self.alarm_processor.get_active_alarms()
        except Exception as e:
            print(f"[PLC] ❌ Erro ao obter alarmes: {e}")
            return []

    def read_tags_by_name(self, tag_names):
        """Lê tags por nome"""
        if not self.driver or not self.driver.is_connected():
            # Retorna dados do cache se disponível
            return {name: self._data_cache.get(name) for name in tag_names}
            
        try:
            comm_map = self.comm_map_by_machine.get(self.current_machine, {})
            tag_definitions = []
            
            for name in tag_names:
                if name in comm_map:
                    tag_definitions.append(comm_map[name])
                else:
                    # Se não está no comm map, cria uma definição simples
                    tag_definitions.append({'name': name})
                    
            if tag_definitions:
                values = self.driver.read_tags(tag_definitions)
                if values:
                    self._update_data_cache(values)
                return values
            else:
                return {}
                
        except Exception as e:
            print(f"[PLC] ❌ Erro ao ler tags: {e}")
            return {name: self._data_cache.get(name) for name in tag_names}

    def read_tags(self, tag_names):
        """Alias para read_tags_by_name para compatibilidade"""
        return self.read_tags_by_name(tag_names)
            
        try:
            values = self.driver.read_tags(tag_definitions)
            if values:
                self._update_data_cache(values)
            return values
        except Exception as e:
            print(f"[PLC] ❌ Erro ao ler tags: {e}")
            return {}

    def is_connected(self):
        """Verifica se está conectado"""
        return self.driver and self.driver.is_connected()

    def get_connection_status(self):
        """Retorna status da conexão"""
        return {
            'connected': self.is_connected(),
            'machine': self.current_machine,
            'stable': self._connection_stable,
            'last_read': self._last_successful_read,
            'consecutive_failures': self._consecutive_failures
        }
