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
                connected = self.driver.connect()
            except Exception as e:
                return False, f'failed to create/connect driver: {e}'

            try:
                if self.socketio:
                    self.socketio.emit('machine_changed', {'name': cfg['name'], 'connected': bool(connected)})
            except Exception:
                pass

            self._start_polling()
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

    def _poll_loop(self):
        while not self._stop_event.is_set():
            try:
                if not self.driver:
                    time.sleep(1)
                    continue
                telemetry = self.driver.read_telemetry()
                if self.socketio:
                    self.socketio.emit('telemetry', telemetry)
            except Exception as e:
                print('polling error:', e)
            time.sleep(0.5)
