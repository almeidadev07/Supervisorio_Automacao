# app/services/plc_controller.py
import threading
import time
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
        self.comm_map_by_machine = {}
        self._last_reconnect_attempt = 0.0
        self._plc_connected_state = None
        self._reconnect_failures = 0

    def set_active_machine(self, cfg):
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
                print(f"[PLC] Creating driver for {cfg.get('name')} at {cfg.get('default_plc_ip')}")
                connected = self.driver.connect()
                print(f"[PLC] connect() -> {connected}")
            except Exception as e:
                return False, f'failed to create/connect driver: {e}'

            try:
                if self.socketio:
                    self.socketio.emit('machine_changed', {'name': cfg['name'], 'connected': bool(connected)})
            except Exception:
                pass

            self._start_polling()
            print("[PLC] Polling started")
            return True, 'ok'

    def set_comm_map(self, comm_map_by_machine):
        self.comm_map_by_machine = comm_map_by_machine or {}

    def read_tags(self, names=None):
        if not self.driver or not self.active_config:
            return {}
        machine = self.active_config.get('name')
        tag_defs = (self.comm_map_by_machine.get(machine) or [])
        if names:
            names_set = set(names)
            tag_defs = [t for t in tag_defs if t.get('name') in names_set]
        return self.driver.read_tags(tag_defs)

    def _start_polling(self):
        self._stop_event.clear()
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def _stop_polling(self):
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=1)
        self._poll_thread = None

    def _poll_loop(self):
        while not self._stop_event.is_set():
            try:
                if not self.driver:
                    time.sleep(1)
                    continue
                # tenta reconectar caso a conexão caia (sem precisar recarregar a página)
                try:
                    if hasattr(self.driver, 'is_connected') and not self.driver.is_connected():
                        now = time.time()
                        if now - self._last_reconnect_attempt > 2.0:
                            self._last_reconnect_attempt = now
                            try:
                                self.driver.disconnect()
                            except Exception:
                                pass
                            ok = False
                            for _ in range(3):
                                try:
                                    ok = bool(self.driver.connect())
                                except Exception:
                                    ok = False
                                if ok:
                                    break
                                time.sleep(0.5)
                            if ok:
                                self._reconnect_failures = 0
                            else:
                                self._reconnect_failures += 1
                                # após algumas falhas, recriar o driver inteiro
                                if self._reconnect_failures >= 5:
                                    try:
                                        print('[PLC] Recreating snap7 client after repeated failures')
                                        self.driver.disconnect()
                                    except Exception:
                                        pass
                                    try:
                                        self.driver = create_driver_for_config(self.active_config)
                                        ok = bool(self.driver.connect())
                                        print('[PLC] Recreated driver connect ->', ok)
                                    except Exception as _:
                                        ok = False
                                    self._reconnect_failures = 0 if ok else self._reconnect_failures
                except Exception:
                    pass
                telemetry = self.driver.read_telemetry()
                # status de conexão
                try:
                    connected_now = bool(self.driver.is_connected())
                    telemetry['plc_connected'] = connected_now
                except Exception:
                    connected_now = False
                    telemetry['plc_connected'] = False
                # Also read all tags from comm map for the active machine
                try:
                    machine = self.active_config.get('name') if self.active_config else None
                    tag_defs = (self.comm_map_by_machine.get(machine) or [])
                    if tag_defs:
                        tag_values = self.driver.read_tags(tag_defs)
                        telemetry.update(tag_values)
                except Exception as e:
                    print('read_tags during poll error:', e)
                if self.socketio:
                    self.socketio.emit('telemetry', telemetry)
                    # Emitir evento de mudança de estado de conexão
                    prev_state = self._plc_connected_state
                    if prev_state is None or connected_now != prev_state:
                        self._plc_connected_state = connected_now
                        try:
                            self.socketio.emit('plc_connection_changed', {'connected': connected_now})
                            # Ao reconectar, envie imediatamente um pacote de tags e peça reload da UI
                            if connected_now:
                                try:
                                    machine = self.active_config.get('name') if self.active_config else None
                                    tag_defs = (self.comm_map_by_machine.get(machine) or [])
                                    tag_values = {}
                                    if tag_defs:
                                        tag_values = self.driver.read_tags(tag_defs)
                                    instant_telem = {'plc_connected': True}
                                    instant_telem.update(tag_values)
                                    self.socketio.emit('telemetry', instant_telem)
                                except Exception:
                                    pass
                                # Se estava desconectado e voltou, forçar recarregar clientes
                                if prev_state is False:
                                    try:
                                        self.socketio.emit('force_reload', {'ts': time.time()})
                                    except Exception:
                                        pass
                        except Exception:
                            pass
            except Exception as e:
                print('polling error:', e)
            time.sleep(0.5)
