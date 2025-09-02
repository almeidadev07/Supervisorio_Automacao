# app/services/plc_controller.py
import threading
import time
import json
import os
from ..plc_drivers import create_driver_for_config

class PLCController:
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        self.active_config = None
        self.driver = None

        self._poll_thread = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._io_lock = threading.Lock()  # Para serializar acessos Snap7
        self._plc_connected_state = None
        self.comm_map_by_machine = {}
        self._load_comm_maps()

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
                        self.comm_map_by_machine[machine_name] = json.load(f)
                    print(f"[PLC] Carregado comm_map para {machine_name}: {len(self.comm_map_by_machine[machine_name])} tags")
                except Exception as e:
                    print(f"[PLC] Erro ao carregar comm_map para {machine_name}: {e}")
                    self.comm_map_by_machine[machine_name] = []
            else:
                print(f"[PLC] Comm_map não encontrado para {machine_name}: {comm_map_file}")
                self.comm_map_by_machine[machine_name] = []

    def set_active_machine(self, cfg):
        """Troca a máquina ativa, cria driver e inicia polling."""
        with self._lock:
            self._stop_polling()

            if self.driver:
                try:
                    self.driver.disconnect()
                except Exception:
                    pass
                self.driver = None

            self.active_config = cfg
            try:
                self.driver = create_driver_for_config(cfg)
                print(f"[PLC] Criando driver para {cfg.get('name')} em {cfg.get('default_plc_ip')}")
                connected = self.driver.connect()
                print(f"[PLC] Conectado -> {connected}")
            except Exception as e:
                return False, f'Falha ao criar/conectar driver: {e}'

            # Emite evento socketio para front
            try:
                if self.socketio:
                    self.socketio.emit('machine_changed', {
                        'name': cfg['name'],
                        'connected': bool(self.driver and self.driver.is_connected())
                    })
                    # Força reload da página para reconhecer nova máquina
                    self.socketio.emit('force_reload', {'reason': 'machine_changed', 'machine': cfg['name']})
            except Exception:
                pass

            self._start_polling()
            print("[PLC] Polling iniciado")
            return True, 'ok'

    def _start_polling(self):
        self._stop_event.clear()
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def _stop_polling(self):
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=1)
        self._poll_thread = None

    def read_tags(self, names=None):
        """Leitura de tags pelo comm_map"""
        if not self.driver or not self.active_config:
            return {}
        machine = self.active_config.get('name')
        tag_defs = self.comm_map_by_machine.get(machine, [])
        if names:
            names_set = set(names)
            tag_defs = [t for t in tag_defs if t.get('name') in names_set]
        with self._io_lock:
            return self.driver.read_tags(tag_defs)

    def _poll_loop(self):
        """Loop de polling contínuo para telemetria"""
        while not self._stop_event.is_set():
            try:
                if not self.driver or not self.driver.is_connected():
                    # tenta reconectar
                    self._try_reconnect()
                    time.sleep(1)
                    continue

                telemetry = {}
                with self._io_lock:
                    telemetry = self.driver.read_telemetry() or {}

                    # leitura de tags
                    machine = self.active_config.get('name') if self.active_config else None
                    tag_defs = self.comm_map_by_machine.get(machine, [])
                    if tag_defs:
                        telemetry.update(self.driver.read_tags(tag_defs))

                connected_now = bool(self.driver.is_connected())
                telemetry['plc_connected'] = connected_now

                # envia socketio se mudou estado de conexão
                if self.socketio:
                    self.socketio.emit('telemetry', telemetry)
                    if self._plc_connected_state is None or connected_now != self._plc_connected_state:
                        self._plc_connected_state = connected_now
                        self.socketio.emit('plc_connection_changed', {'connected': connected_now})
                        if connected_now:
                            self.socketio.emit('force_reload', {'ts': time.time()})

            except Exception as e:
                print('Polling error:', e)

            time.sleep(0.5)

    def _try_reconnect(self):
        """Tenta reconectar o driver se ele estiver desconectado"""
        if not self.active_config:
            return
        try:
            if self.driver:
                self.driver.disconnect()
            self.driver = create_driver_for_config(self.active_config)
            connected = self.driver.connect()
            print(f"[PLC] Reconexão -> {connected}")
        except Exception as e:
            print(f"[PLC] Falha ao reconectar: {e}")
