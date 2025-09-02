
import snap7
from snap7.util import *

ip = '100.70.0.10'
rack = 0
slot = 1  # tente 0 se 1 não funcionar

client = snap7.client.Client()
try:
    client.connect(ip, rack, slot)
    print("Conectado:", client.get_connected())
except Exception as e:
    print("Erro ao conectar:", e)
finally:
    client.disconnect()
