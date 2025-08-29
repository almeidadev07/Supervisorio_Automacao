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
            # Priorizar S7-1500: rack=0, slot=1
            print('snap7 trying rack=0, slot=1 (S7-1500 default)')
            self.client.connect(self.ip, 0, 1)
            if self.client.get_connected():
                print('snap7 connected using rack=0, slot=1')
                return True
            try:
                self.client.disconnect()
            except Exception:
                pass
            # Fallback S7-300/400: rack=0, slot=2
            print('snap7 trying rack=0, slot=2 (fallback)')
            self.client.connect(self.ip, 0, 2)
            ok = self.client.get_connected()
            if ok:
                print('snap7 connected using rack=0, slot=2')
            return ok
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

    def read_tags(self, tag_definitions):
        """Read a list of tag defs from comm_map and return {name:value}.
        Minimal example using snap7; types supported: BOOL (byte/bit), REAL (offset float).
        """
        result = {}
        for tag in tag_definitions:
            try:
                name = tag.get('name')
                area = (tag.get('area') or '').upper()
                db = int(tag.get('db') or 0)
                if area != 'DB':
                    continue
                t = (tag.get('type') or '').upper()
                if t == 'BOOL':
                    start = int(tag.get('byte') or 0)
                    bit = int(tag.get('bit') or 0)
                    data = self.client.db_read(db, start, 1)
                    val = (data[0] >> bit) & 1
                    result[name] = bool(val)
                elif t == 'REAL':
                    offset = int(tag.get('offset') or 0)
                    data = self.client.db_read(db, offset, 4)
                    import struct
                    result[name] = struct.unpack('>f', data)[0]
            except Exception as e:
                print(f'read_tags error for {tag}:', e)
        return result

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

    def read_tags(self, tag_definitions):
        import random
        result = {}
        for tag in tag_definitions:
            name = tag.get('name')
            t = (tag.get('type') or '').upper()
            if t == 'BOOL':
                result[name] = bool(random.getrandbits(1))
            elif t == 'REAL':
                result[name] = round(random.uniform(0, 100), 2)
            else:
                result[name] = None
        return result
