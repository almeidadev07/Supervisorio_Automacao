# app/services/plc_controller_final.py
# Controlador PLC final e estável - sem oscilações

import threading
import time
import json
import os
from ..plc_drivers import create_driver_for_config
from .alarm_processor import alarm_processor

class FinalPLCController:
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
        self._connection_stable_time = 15.0  # 15 segundos para considerar estável
        self._max_connection_instability = 2  # Máximo 2 instabilidades antes de forçar reconexão
        self._connection_instability_count = 0
        self._last_connection_attempt = 0
        self._connection_retry_interval = 10.0  # 10 segundos entre tentativas de reconexão
        
        # Cache de dados
        self._data_cache = {}
        self._cache_timeout = 5.0  # 5 segundos de cache
        
        # Threading
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        
        # Compatibilidade com sistema antigo
        self.comm_map_by_machine = {}
        self._load_comm_maps()
        
        print("[PLC] Controlador PLC final inicializado")

    def _load_comm_maps(self):
        """Carrega os maps de comunicação de todas as máquinas"""
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
                    self.comm_map_by_machine[machine_name] = comm_map
                    print(f"[PLC] ✅ Comm map carregado para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[PLC] ❌ Erro ao carregar comm map para {machine_name}: {e}")
            else:
                print(f"[PLC] ❌ Comm map não encontrado: {comm_map_file}")

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
            print("[PLC] ⚠️ Controlador já está rodando")
            return
            
        print("[PLC] 🚀 Iniciando controlador...")
        self.running = True
        self._stop_event.clear()
        self.polling_thread = threading.Thread(target=self._polling_loop, daemon=True)
        self.polling_thread.start()
        print("[PLC] ✅ Controlador iniciado com sucesso")

    def stop(self):
        """Para o controlador"""
        self.running = False
        self._stop_event.set()
        
        if self.driver:
            self.driver.disconnect()
            
        if self.polling_thread and self.polling_thread.is_alive():
            self.polling_thread.join(timeout=2)
            
        print("[PLC] ⏹️ Controlador parado")

    def _polling_loop(self):
        """Loop principal de polling"""
        print("[PLC] 🔄 Loop de polling iniciado")
        while self.running and not self._stop_event.is_set():
            try:
                if self.current_machine and self.active_config:
                    print(f"[PLC] 🔍 Executando polling para máquina: {self.current_machine}")
                    self._try_connect_and_read()
                else:
                    print("[PLC] ⚠️ Nenhuma máquina configurada, aguardando...")
                    time.sleep(1)
                    continue
                    
                # Intervalo de polling
                time.sleep(2.0)
                
            except Exception as e:
                print(f"[PLC] ❌ Erro no loop de polling: {e}")
                time.sleep(5)

    def _try_connect_and_read(self):
        """Tenta conectar e ler dados"""
        try:
            # Verifica se precisa conectar
            if not self.driver or not self.driver.is_connected():
                self._try_connect()
                
            # Se conectado, lê dados
            if self.driver and self.driver.is_connected():
                self._read_data()
                self._connection_instability_count = 0
                self._connection_stable = True
            else:
                self._handle_connection_failure()
                
        except Exception as e:
            print(f"[PLC] ❌ Erro ao tentar conectar e ler: {e}")
            self._handle_connection_failure()

    def _try_connect(self):
        """Tenta conectar ao PLC"""
        current_time = time.time()
        
        # Verifica se pode tentar conectar
        if current_time - self._last_connection_attempt < self._connection_retry_interval:
            return
            
        self._last_connection_attempt = current_time
        
        try:
            if not self.driver:
                self.driver = create_driver_for_config(self.active_config)
                print(f"[PLC] 🔌 Driver criado para {self.current_machine}")
                
            if not self.driver.is_connected():
                self.driver.connect()
                print(f"[PLC] ✅ Conectado ao PLC {self.active_config.get('default_plc_ip')}")
                
        except Exception as e:
            print(f"[PLC] ❌ Erro ao conectar: {e}")

    def _read_data(self):
        """Lê dados do PLC"""
        try:
            comm_map = self.comm_map_by_machine.get(self.current_machine, {})
            if not comm_map:
                print("[PLC] ❌ Comm map vazio")
                return
                
            # Lê apenas algumas tags essenciais para evitar sobrecarga
            essential_tags = [
                'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL',
                'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG'
            ]
            
            tag_definitions = []
            for tag_name in essential_tags:
                if tag_name in comm_map:
                    tag_definitions.append(comm_map[tag_name])
                    print(f"[PLC] ✅ Tag {tag_name} encontrada no comm_map")
                else:
                    print(f"[PLC] ❌ Tag {tag_name} NÃO encontrada no comm_map")
                    
            if tag_definitions:
                print(f"[PLC] 🔍 Lendo {len(tag_definitions)} tags do PLC...")
                values = self.driver.read_tags(tag_definitions)
                print(f"[PLC] 📊 Valores lidos: {values}")
                if values:
                    self._update_data_cache(values)
                    self._last_successful_read = time.time()
                    print(f"[PLC] ✅ Cache atualizado com {len(values)} valores")
                else:
                    print("[PLC] ❌ Nenhum valor retornado pelo driver")
            else:
                print("[PLC] ❌ Nenhuma tag definition encontrada")
                    
        except Exception as e:
            print(f"[PLC] ❌ Erro ao ler dados: {e}")

    def _handle_connection_failure(self):
        """Trata falhas de conexão"""
        self._connection_instability_count += 1
        
        if self._connection_instability_count >= self._max_connection_instability:
            print(f"[PLC] 🔄 Forçando reconexão após {self._connection_instability_count} instabilidades")
            self._force_reconnect()
            self._connection_instability_count = 0

    def _force_reconnect(self):
        """Força reconexão"""
        try:
            if self.driver:
                self.driver.disconnect()
            self.driver = None
            print("[PLC] 🔄 Tentando reconectar...")
        except Exception as e:
            print(f"[PLC] ❌ Erro ao forçar reconexão: {e}")

    def _update_data_cache(self, values):
        """Atualiza cache de dados"""
        current_time = time.time()
        for key, value in values.items():
            self._data_cache[key] = {
                'value': value,
                'timestamp': current_time
            }

    def _get_cached_data(self, key):
        """Obtém dados do cache se ainda válidos"""
        if key in self._data_cache:
            data = self._data_cache[key]
            if time.time() - data['timestamp'] < self._cache_timeout:
                return data['value']
        return None

    def read_tags_by_name(self, tag_names):
        """Lê tags por nome"""
        if not self.driver or not self.driver.is_connected():
            # Retorna dados do cache se disponível
            return {name: self._get_cached_data(name) for name in tag_names}
            
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
                    return {name: self._get_cached_data(name) for name in tag_names}
            else:
                return {name: self._get_cached_data(name) for name in tag_names}
                
        except Exception as e:
            print(f"[PLC] ❌ Erro ao ler tags: {e}")
            return {name: self._get_cached_data(name) for name in tag_names}

    def read_tags(self, tag_names):
        """Alias para read_tags_by_name para compatibilidade"""
        return self.read_tags_by_name(tag_names)

    def get_active_alarms(self):
        """Obtém alarmes ativos"""
        try:
            if not self.current_machine:
                return []
                
            comm_map = self.comm_map_by_machine.get(self.current_machine, {})
            if not comm_map:
                return []
                
            # Lê tags de alarme
            alarm_tags = []
            for tag_name, tag_def in comm_map.items():
                if 'ALARME' in tag_name.upper():
                    alarm_tags.append(tag_def)
                    
            if not alarm_tags:
                return []
                
            if self.driver and self.driver.is_connected():
                alarm_values = self.driver.read_tags(alarm_tags)
                if alarm_values:
                    return self.alarm_processor.process_alarms(alarm_values)
                    
            return []
            
        except Exception as e:
            print(f"[PLC] ❌ Erro ao obter alarmes: {e}")
            return []

    def is_connected(self):
        """Verifica se está conectado"""
        return self.driver and self.driver.is_connected()

    def get_connection_status(self):
        """Obtém status da conexão"""
        if not self.driver:
            return "Desconectado"
        elif self.driver.is_connected():
            return "Conectado"
        else:
            return "Desconectado"
