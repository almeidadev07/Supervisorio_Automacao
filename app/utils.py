# app/utils.py
import socket
import ipaddress
import platform
import subprocess

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

def ping_ip(ip_address: str, timeout_ms: int = 800) -> bool:
    """Ping an IP address once. Returns True if reachable.
    Works on Windows and Unix. Timeout in milliseconds.
    """
    try:
        system_name = platform.system().lower()
        if 'windows' in system_name:
            # -n 1 (one echo), -w timeout in ms
            result = subprocess.run(['ping', '-n', '1', '-w', str(timeout_ms), ip_address],
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL)
        else:
            # -c 1 (one echo), -W timeout in seconds
            sec = max(1, int(timeout_ms / 1000))
            result = subprocess.run(['ping', '-c', '1', '-W', str(sec), ip_address],
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL)
        return result.returncode == 0
    except Exception:
        return False

def find_machine_by_plc_ip(plc_ip: str, configs):
    """Return machine config whose default_plc_ip matches plc_ip exactly."""
    for c in configs or []:
        if c.get('default_plc_ip') == plc_ip:
            return c
    return None

def detect_by_reachable_plc(configs):
    """Ping known PLC IPs from configs and return first reachable config name and list of reachable."""
    reachable = []
    for c in configs or []:
        ip = c.get('default_plc_ip')
        if not ip:
            continue
        if ping_ip(ip):
            reachable.append({'name': c.get('name'), 'ip': ip})
    detected = reachable[0]['name'] if reachable else None
    return detected, reachable
