# app/services/plc_controller_stable.py
# Controlador PLC com sistema de reconexão estável

import threading
import time
import json
import os
from ..plc_drivers import create_driver_for_config
from .alarm_processor import alarm_processor

class StablePLCController:
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        self.current_machine = None
        self.active_config = None  # Para compatibilidade
        self.driver = None
        self.running = False
        self.polling_thread = None
        self.alarm_processor = alarm_processor
        
        # Sistema de estabilidade de conexão
        self._connection_stable = False
        self._last_successful_read = 0
        self._connection_stable_time = 15.0  # 15 segundos para considerar estável
        self._max_connection_instability = 3  # Máximo de instabilidades antes de forçar reconexão
        self._connection_instability_count = 0
        
        # Configurações de reconexão
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 3
        self._reconnect_delay = 10.0  # 10 segundos entre tentativas
        self._last_connection_attempt = 0
        
        # Configurações de polling
        self._polling_interval = 2.0  # 2 segundos
        self._health_check_interval = 30.0  # 30 segundos
        self._last_health_check = 0
        
        # Cache de dados
        self._last_good_data = {}
        self._last_good_timestamp = 0
        self._data_cache_timeout = 10.0  # 10 segundos
        
        # Threading
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        
        # Compatibilidade com sistema antigo
        self.comm_map_by_machine = {}
        self._load_comm_maps()
        
        print("[PLC] Controlador PLC estável inicializado")

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
                    print(f"[PLC] Carregado comm_map para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[PLC] Erro ao carregar comm_map para {machine_name}: {e}")
                    self.comm_map_by_machine[machine_name] = []
            else:
                print(f"[PLC] Comm_map não encontrado para {machine_name}: {comm_map_file}")
                self.comm_map_by_machine[machine_name] = []

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

    def set_active_machine(self, config):
        """Define a máquina ativa (compatibilidade)"""
        return self.set_machine(config['name'])

    def start(self):
        """Inicia o controlador"""
        if self.running:
            print("[PLC] ⚠️ Controlador já está rodando")
            return
            
        if not self.current_machine:
            print("[PLC] ❌ Nenhuma máquina selecionada")
            return
            
        self.running = True
        self._stop_event.clear()
        self.polling_thread = threading.Thread(target=self._polling_loop, daemon=True)
        self.polling_thread.start()
        print(f"[PLC] 🚀 Controlador iniciado para {self.current_machine}")

    def stop(self):
        """Para o controlador"""
        self.running = False
        self._stop_event.set()
        if self.polling_thread:
            self.polling_thread.join(timeout=5)
        print("[PLC] 🛑 Controlador parado")

    def _polling_loop(self):
        """Loop principal de polling com sistema de estabilidade"""
        print("[PLC] 🔄 Iniciando loop de polling estável")
        
        while not self._stop_event.is_set():
            try:
                if not self.current_machine:
                    time.sleep(1)
                    continue
                
                # Verifica saúde da conexão
                if time.time() - self._last_health_check > self._health_check_interval:
                    self._health_check()
                    self._last_health_check = time.time()
                
                # Tenta conectar se necessário
                if not self._is_connected():
                    self._attempt_reconnection()
                    time.sleep(self._reconnect_delay)
                    continue
                
                # Lê dados se conectado
                self._read_data()
                
                # Verifica estabilidade da conexão
                self._check_connection_stability()
                
                time.sleep(self._polling_interval)
                
            except Exception as e:
                print(f"[PLC] ❌ Erro no loop de polling: {e}")
                time.sleep(2)

    def _is_connected(self):
        """Verifica se há conexão ativa"""
        if not self.driver:
            return False
        return self.driver.is_connected()

    def _attempt_reconnection(self):
        """Tenta reconectar ao PLC com sistema de retry inteligente"""
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            print(f"[PLC] ❌ Máximo de tentativas de reconexão atingido ({self._max_reconnect_attempts})")
            return False
            
        self._reconnect_attempts += 1
        print(f"[PLC] 🔄 Tentativa de reconexão {self._reconnect_attempts}/{self._max_reconnect_attempts}")
        
        try:
            # Desconecta driver existente
            if self.driver:
                self.driver.disconnect()
                self.driver = None
            
            # Cria novo driver
            machine_config = next(m for m in self.machines_config if m['name'] == self.current_machine)
            self.driver = create_driver_for_config(machine_config)
            
            if self.driver.connect():
                print(f"[PLC] ✅ Reconectado com sucesso")
                self._reconnect_attempts = 0  # Reset contador
                self._connection_stable = False
                self._last_successful_read = time.time()
                return True
            else:
                print(f"[PLC] ❌ Falha na reconexão")
                return False
                
        except Exception as e:
            print(f"[PLC] ❌ Erro na reconexão: {e}")
            return False

    def _read_data(self):
        """Lê dados do PLC com sistema de cache"""
        try:
            if not self._is_connected():
                return
                
            # Lê tags principais
            comm_map_path = f"config/comm_map/{self.current_machine.lower()}_comm_map.json"
            if not os.path.exists(comm_map_path):
                print(f"[PLC] ❌ Comm map não encontrado: {comm_map_path}")
                return
                
            with open(comm_map_path, 'r', encoding='utf-8') as f:
                comm_map = json.load(f)
            
            # Lê tags em lotes para melhor performance
            tag_batches = self._create_tag_batches(comm_map, batch_size=30)
            
            all_data = {}
            for batch in tag_batches:
                try:
                    values = self.driver.read_tags(batch)
                    if values:
                        all_data.update(values)
                        self._last_successful_read = time.time()
                except Exception as e:
                    print(f"[PLC] ❌ Erro ao ler lote de tags: {e}")
                    continue
            
            if all_data:
                # Atualiza cache de dados bons
                self._last_good_data = all_data.copy()
                self._last_good_timestamp = time.time()
                
                # Processa e envia dados
                self._process_data(all_data)
                
                # Reset contador de instabilidade
                self._connection_instability_count = 0
            else:
                # Dados vazios - verifica se deve usar cache
                self._handle_empty_data()
            
            # Processa alarmes
            self._process_alarms()
            
        except Exception as e:
            print(f"[PLC] ❌ Erro na leitura de dados: {e}")
            self._connection_instability_count += 1

    def _create_tag_batches(self, comm_map, batch_size=30):
        """Cria lotes de tags para leitura otimizada"""
        batches = []
        current_batch = []
        
        for tag_name, tag_config in comm_map.items():
            current_batch.append(tag_config)
            
            if len(current_batch) >= batch_size:
                batches.append(current_batch)
                current_batch = []
        
        if current_batch:
            batches.append(current_batch)
            
        return batches

    def _process_data(self, data):
        """Processa e envia dados via WebSocket"""
        try:
            # Envia dados via WebSocket
            self.socketio.emit('plc_data', {
                'machine': self.current_machine,
                'values': data,
                'timestamp': time.time(),
                'stable': self._connection_stable
            })
            
            # Log apenas se houver valores válidos
            valid_values = {k: v for k, v in data.items() if v is not None}
            if valid_values:
                print(f"[PLC] 📊 {len(valid_values)} tags lidas com sucesso")
                
        except Exception as e:
            print(f"[PLC] ❌ Erro ao processar dados: {e}")

    def _handle_empty_data(self):
        """Lida com dados vazios usando cache se disponível"""
        current_time = time.time()
        
        # Se tem cache recente, usa ele
        if (self._last_good_data and 
            current_time - self._last_good_timestamp < self._data_cache_timeout):
            
            print(f"[PLC] 📭 Dados vazios - usando cache (idade: {current_time - self._last_good_timestamp:.1f}s)")
            
            # Envia dados do cache
            self.socketio.emit('plc_data', {
                'machine': self.current_machine,
                'values': self._last_good_data,
                'timestamp': current_time,
                'stable': self._connection_stable,
                'cached': True
            })
        else:
            print(f"[PLC] 📭 Dados vazios - sem cache disponível")

    def _process_alarms(self):
        """Processa alarmes"""
        try:
            if not self._is_connected():
                return
                
            machine_config = next(m for m in self.machines_config if m['name'] == self.current_machine)
            alarms = self.alarm_processor.get_active_alarms(self.driver, machine_config)
            
            if alarms:
                self.socketio.emit('alarms', {
                    'machine': self.current_machine,
                    'alarms': alarms,
                    'timestamp': time.time()
                })
                print(f"[PLC] 🚨 {len(alarms)} alarmes ativos")
                
        except Exception as e:
            print(f"[PLC] ❌ Erro ao processar alarmes: {e}")

    def _health_check(self):
        """Verifica saúde da conexão"""
        try:
            if not self._is_connected():
                return
                
            # Testa conexão com uma leitura simples
            test_values = self.driver.read_tags([{
                'name': 'test', 
                'area': 'DB', 
                'db': 1, 
                'byte': 0, 
                'bit': 0, 
                'type': 'BOOL'
            }])
            
            if test_values:
                print(f"[PLC] ✅ Health check OK")
                self._last_successful_read = time.time()
            else:
                print(f"[PLC] ⚠️ Health check falhou")
                
        except Exception as e:
            print(f"[PLC] ❌ Health check erro: {e}")

    def _check_connection_stability(self):
        """Verifica se a conexão está estável"""
        current_time = time.time()
        
        if not self._connection_stable and self._last_successful_read > 0:
            time_since_last_read = current_time - self._last_successful_read
            
            if time_since_last_read < self._connection_stable_time:
                self._connection_stable = True
                print(f"[PLC] 🔒 Conexão estabilizada")
            elif time_since_last_read > self._connection_stable_time * 2:
                # Conexão instável por muito tempo, força reconexão
                print(f"[PLC] ⚠️ Conexão instável, forçando reconexão")
                self._connection_stable = False
                self._connection_instability_count += 1
                
                if self._connection_instability_count >= self._max_connection_instability:
                    print(f"[PLC] 🔄 Forçando reconexão devido a instabilidade")
                    if self.driver:
                        self.driver.disconnect()
                        self.driver = None
                    self._connection_instability_count = 0

    def get_alarms(self):
        """Retorna alarmes ativos"""
        try:
            if not self._is_connected():
                return []
                
            machine_config = next(m for m in self.machines_config if m['name'] == self.current_machine)
            return self.alarm_processor.get_active_alarms(self.driver, machine_config)
            
        except Exception as e:
            print(f"[PLC] ❌ Erro ao obter alarmes: {e}")
            return []

    def read_tags(self, tag_names):
        """Lê tags específicas"""
        try:
            if not self._is_connected():
                return {}
                
            # Converte nomes para configurações de tags
            comm_map_path = f"config/comm_map/{self.current_machine.lower()}_comm_map.json"
            if not os.path.exists(comm_map_path):
                return {}
                
            with open(comm_map_path, 'r', encoding='utf-8') as f:
                comm_map = json.load(f)
            
            tag_configs = []
            for name in tag_names:
                if name in comm_map:
                    tag_configs.append(comm_map[name])
            
            if not tag_configs:
                return {}
                
            return self.driver.read_tags(tag_configs)
            
        except Exception as e:
            print(f"[PLC] ❌ Erro ao ler tags: {e}")
            return {}
