# app/plc_drivers/siemens_s7.py
import random
import time
from .base import BasePLC

try:
    import snap7
    HAS_SNAP7 = True
except Exception:
    HAS_SNAP7 = False

class SiemensS7Driver(BasePLC):
    def __init__(self, ip, config):
        super().__init__(ip, config)
        if not HAS_SNAP7:
            raise RuntimeError('snap7 not installed')
        self.client = snap7.client.Client()

    def connect(self):
        try:
            self.client.connect(self.ip, 0, 2)
            return self.client.get_connected()
        except Exception as e:
            print('snap7 connect error:', e)
            return False

    def disconnect(self):
        try:
            self.client.disconnect()
        except Exception:
            pass

    def read_telemetry(self):
        return {'time': time.time(), 'source': 'siemens_s7', 'value': random.randint(0, 100)}

class MockSiemensDriver(BasePLC):
    def __init__(self, ip, config):
        super().__init__(ip, config)
        self._connected = False

    def connect(self):
        self._connected = True
        return True

    def disconnect(self):
        self._connected = False

    def read_telemetry(self):
        import time, random
        return {
            'time': time.time(),
            'source': 'mock_siemens',
            'embaladoras': self.config.get('embaladoras', 0),
            'speed': random.randint(0, 120),
            'accumulator': random.randint(0, 100)
        }
