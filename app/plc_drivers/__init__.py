# app/plc_drivers/__init__.py
from .base import BasePLC
from .siemens_s7 import SiemensS7Driver, MockSiemensDriver

def create_driver_for_config(cfg):
    plc_type = cfg.get('plc_type', 'siemens_s7')
    ip = cfg.get('default_plc_ip')
    if plc_type == 'siemens_s7':
        try:
            print(f"[DRIVER] Criando SiemensS7Driver para {cfg.get('name')} em {ip}")
            return SiemensS7Driver(ip, cfg)
        except Exception as e:
            print(f"[DRIVER] ❌ Erro ao criar SiemensS7Driver para {cfg.get('name')}: {e}")
            # Não cria mock automaticamente - deixa o erro ser tratado pelo chamador
            raise e
    raise ValueError('unknown plc type')
