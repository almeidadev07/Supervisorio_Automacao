# app/plc_drivers/__init__.py
from .base import BasePLC
from .siemens_s7 import SiemensS7Driver, MockSiemensDriver

def create_driver_for_config(cfg):
    plc_type = cfg.get('plc_type', 'siemens_s7')
    ip = cfg.get('default_plc_ip')
    if plc_type == 'siemens_s7':
        try:
            return SiemensS7Driver(ip, cfg)
        except Exception:
            return MockSiemensDriver(ip, cfg)
    raise ValueError('unknown plc type')
