# app/utils.py
import socket
import ipaddress

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def find_machine_config(local_ip, configs):
    try:
        ip_obj = ipaddress.ip_address(local_ip)
        for c in configs:
            for net in c.get('ip_ranges', []):
                if ip_obj in ipaddress.ip_network(net):
                    return c
    except Exception:
        return None
    return None
