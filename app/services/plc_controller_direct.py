# Controlador PLC direto - solução alternativa para leitura de tags de velocidade

import threading
import time
import json
import os
from ..plc_drivers import create_driver_for_config

class DirectPLCController:
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        self.current_machine = None
        self.active_config = None
        self.driver = None
        self.running = False
        self.polling_thread = None
        
        # Cache de dados
        self._data_cache = {}
        self._cache_timeout = 5.0
        self._last_cache_update = 0
        
        # Threading
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        
        # Tags de velocidade específicas
        self.velocity_tags = {
            'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL': {
                'area': 'DB',
                'db': 1,
                'offset': 124,
                'type': 'REAL',
                'description': 'Velocidade Real'
            },
            'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG': {
                'area': 'DB',
                'db': 1,
                'offset': 152,
                'type': 'REAL',
                'description': 'Velocidade Programada'
            }
        }
        
        print("[DIRECT] Controlador PLC direto inicializado")

    def set_machine(self, machine_name):
        """Define a máquina ativa"""
        if machine_name not in [m['name'] for m in self.machines_config]:
            print(f"[DIRECT] ❌ Máquina {machine_name} não encontrada")
            return False
            
        self.current_machine = machine_name
        self.active_config = next(m for m in self.machines_config if m['name'] == machine_name)
        print(f"[DIRECT] ✅ Máquina definida: {machine_name}")
        
        if not self.running:
            self.start()
            
        return True

    def set_active_machine(self, machine_name):
        """Alias para set_machine para compatibilidade"""
        return self.set_machine(machine_name)

    def start(self):
        """Inicia o controlador"""
        if self.running:
            print("[DIRECT] ⚠️ Controlador já está rodando")
            return
            
        print("[DIRECT] 🚀 Iniciando controlador direto...")
        self.running = True
        self._stop_event.clear()
        self.polling_thread = threading.Thread(target=self._polling_loop, daemon=True)
        self.polling_thread.start()
        print("[DIRECT] ✅ Controlador iniciado com sucesso")

    def stop(self):
        """Para o controlador"""
        self.running = False
        self._stop_event.set()
        
        if self.driver:
            self.driver.disconnect()
            
        if self.polling_thread and self.polling_thread.is_alive():
            self.polling_thread.join(timeout=2)
            
        print("[DIRECT] ⏹️ Controlador parado")

    def _polling_loop(self):
        """Loop principal de polling"""
        print("[DIRECT] 🔄 Loop de polling direto iniciado")
        while self.running and not self._stop_event.is_set():
            try:
                if self.current_machine and self.active_config:
                    print(f"[DIRECT] 🔍 Executando polling para máquina: {self.current_machine}")
                    self._try_connect_and_read()
                else:
                    print("[DIRECT] ⚠️ Nenhuma máquina configurada, aguardando...")
                    time.sleep(1)
                    continue
                    
                # Intervalo de polling
                time.sleep(2.0)
                
            except Exception as e:
                print(f"[DIRECT] ❌ Erro no loop de polling: {e}")
                time.sleep(5)

    def _try_connect_and_read(self):
        """Tenta conectar e ler dados"""
        try:
            # Verifica se precisa conectar
            if not self.driver or not self.driver.is_connected():
                self._try_connect()
                
            # Se conectado, lê dados
            if self.driver and self.driver.is_connected():
                self._read_velocity_tags()
                
        except Exception as e:
            print(f"[DIRECT] ❌ Erro ao tentar conectar e ler: {e}")

    def _try_connect(self):
        """Tenta conectar ao PLC"""
        try:
            if not self.driver:
                self.driver = create_driver_for_config(self.active_config)
                print(f"[DIRECT] 🔌 Driver criado para {self.current_machine}")
                
            if not self.driver.is_connected():
                self.driver.connect()
                print(f"[DIRECT] ✅ Conectado ao PLC {self.active_config.get('default_plc_ip')}")
                
        except Exception as e:
            print(f"[DIRECT] ❌ Erro ao conectar: {e}")

    def _read_velocity_tags(self):
        """Lê especificamente as tags de velocidade"""
        try:
            if not self.driver or not self.driver.is_connected():
                return
                
            print("[DIRECT] 🔍 Lendo tags de velocidade...")
            
            # Converte as definições para o formato esperado pelo driver
            tag_definitions = []
            for tag_name, tag_info in self.velocity_tags.items():
                tag_definitions.append({
                    'name': tag_name,
                    'area': tag_info['area'],
                    'db': tag_info['db'],
                    'offset': tag_info['offset'],
                    'type': tag_info['type']
                })
            
            # Lê as tags
            values = self.driver.read_tags(tag_definitions)
            print(f"[DIRECT] 📊 Valores lidos: {values}")
            
            if values:
                self._update_data_cache(values)
                self._send_data_to_frontend(values)
                print(f"[DIRECT] ✅ Cache atualizado com {len(values)} valores")
            else:
                print("[DIRECT] ❌ Nenhum valor retornado pelo driver")
                
        except Exception as e:
            print(f"[DIRECT] ❌ Erro ao ler tags de velocidade: {e}")

    def _update_data_cache(self, values):
        """Atualiza o cache de dados"""
        current_time = time.time()
        for key, value in values.items():
            self._data_cache[key] = {
                'value': value,
                'timestamp': current_time
            }
        self._last_cache_update = current_time

    def _send_data_to_frontend(self, values):
        """Envia dados para o frontend"""
        try:
            self.socketio.emit('plc_data', {
                'machine': self.current_machine,
                'values': values,
                'timestamp': time.time()
            })
        except Exception as e:
            print(f"[DIRECT] ❌ Erro ao enviar dados: {e}")

    def _get_cached_data(self, key):
        """Obtém dados do cache se ainda válidos"""
        if key in self._data_cache:
            data = self._data_cache[key]
            if time.time() - data['timestamp'] < self._cache_timeout:
                return data['value']
        return None

    def read_tags_by_name(self, tag_names):
        """Lê tags por nome"""
        print(f"[DIRECT] 🔍 Lendo tags: {tag_names}")
        print(f"[DIRECT] 🔍 Driver conectado: {self.driver and self.driver.is_connected() if self.driver else False}")
        
        if not self.driver or not self.driver.is_connected():
            print("[DIRECT] ⚠️ Driver não conectado, retornando cache")
            return {name: self._get_cached_data(name) for name in tag_names}
            
        try:
            # Filtra apenas as tags de velocidade que conhecemos
            known_tags = {}
            for tag_name in tag_names:
                if tag_name in self.velocity_tags:
                    known_tags[tag_name] = self.velocity_tags[tag_name]
                    print(f"[DIRECT] ✅ Tag {tag_name} encontrada")
                else:
                    print(f"[DIRECT] ❌ Tag {tag_name} NÃO encontrada")
            
            if known_tags:
                print(f"[DIRECT] 🔍 Processando {len(known_tags)} tags conhecidas")
                # Converte para o formato esperado pelo driver
                tag_definitions = []
                for tag_name, tag_info in known_tags.items():
                    tag_definitions.append({
                        'name': tag_name,
                        'area': tag_info['area'],
                        'db': tag_info['db'],
                        'offset': tag_info['offset'],
                        'type': tag_info['type']
                    })
                
                print(f"[DIRECT] 🔍 Enviando {len(tag_definitions)} tags para o driver")
                values = self.driver.read_tags(tag_definitions)
                print(f"[DIRECT] 📊 Valores retornados pelo driver: {values}")
                
                if values:
                    self._update_data_cache(values)
                    return values
                else:
                    print("[DIRECT] ⚠️ Nenhum valor retornado, usando cache")
                    return {name: self._get_cached_data(name) for name in tag_names}
            else:
                print("[DIRECT] ⚠️ Nenhuma tag conhecida, usando cache")
                return {name: self._get_cached_data(name) for name in tag_names}
                
        except Exception as e:
            print(f"[DIRECT] ❌ Erro ao ler tags: {e}")
            return {name: self._get_cached_data(name) for name in tag_names}

    def read_tags(self, tag_names):
        """Alias para read_tags_by_name para compatibilidade"""
        return self.read_tags_by_name(tag_names)

    def get_active_alarms(self):
        """Retorna alarmes ativos (implementação básica)"""
        return []

    def is_connected(self):
        """Verifica se está conectado"""
        return self.driver and self.driver.is_connected()

    def get_connection_status(self):
        """Retorna status da conexão"""
        return {
            'connected': self.is_connected(),
            'machine': self.current_machine,
            'last_read': self._last_cache_update
        }
