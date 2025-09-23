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

def ping_ip(ip_address: str, timeout_ms: int = 1000) -> bool:
    """Ping an IP address once. Returns True if reachable.
    Works on Windows and Unix. Timeout in milliseconds.
    """
    try:
        system_name = platform.system().lower()
        if 'windows' in system_name:
            # -n 1 (one echo), -w timeout in ms
            result = subprocess.run(['ping', '-n', '1', '-w', str(timeout_ms), ip_address],
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL,
                                    timeout=timeout_ms/1000 + 5)  # Timeout adicional para o processo
        else:
            # -c 1 (one echo), -W timeout in seconds
            sec = max(1, int(timeout_ms / 1000))
            result = subprocess.run(['ping', '-c', '1', '-W', str(sec), ip_address],
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL,
                                    timeout=sec + 5)  # Timeout adicional para o processo
        return result.returncode == 0
    except Exception as e:
        print(f"[PING] Erro ao fazer ping em {ip_address}: {e}")
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
    print(f"[DETECT] 🔍 Verificando {len(configs)} configurações de PLC...")
    
    for c in configs or []:
        ip = c.get('default_plc_ip')
        name = c.get('name', 'Unknown')
        
        if not ip:
            print(f"[DETECT] ⚠️ {name}: Sem IP configurado")
            continue
        
        print(f"[DETECT] 🔍 Verificando {name} ({ip})...")
        
        # Primeiro tenta ping, se falhar tenta conectar diretamente via snap7
        # (alguns PLCs podem estar configurados para não responder ao ping)
        ping_ok = ping_ip(ip, timeout_ms=1000)  # Ping com timeout maior
        
        if ping_ok:
            print(f"[DETECT] ✅ {name} ({ip}) responde ao ping")
        else:
            print(f"[DETECT] ⚠️ {name} ({ip}) não responde ao ping, tentando conectar diretamente...")
        
        # Tenta conectar via snap7 para confirmar que é realmente um PLC
        if _is_real_plc(ip):
            reachable.append({'name': name, 'ip': ip})
            print(f"[DETECT] ✅ {name} ({ip}) é um PLC válido")
        elif ping_ok:
            print(f"[DETECT] ❌ {name} ({ip}) responde ao ping mas não é um PLC válido")
        else:
            print(f"[DETECT] ❌ {name} ({ip}) não é um PLC válido")
    
    # Prioriza PLCs reais (não mock) na seguinte ordem:
    # 1. 700CX (mais prioritário)
    # 2. 400CX 
    # 3. 200CX
    # 4. Outros PLCs reais
    # 5. Mock apenas se não houver nenhum PLC real
    
    priority_order = ['700CX', '400CX', '200CX']
    detected = None
    
    print(f"[DETECT] 📊 {len(reachable)} PLCs alcançáveis encontrados: {[r['name'] for r in reachable]}")
    
    # Primeiro tenta encontrar um PLC real prioritário
    for priority_name in priority_order:
        for r in reachable:
            if r['name'] == priority_name:
                detected = r['name']
                print(f"[DETECT] 🎯 PLC prioritário detectado: {detected}")
                break
        if detected:
            break
    
    # Se não encontrou um prioritário, usa qualquer PLC real (não mock)
    if not detected:
        for r in reachable:
            if not r['name'].lower().startswith('mock'):
                detected = r['name']
                print(f"[DETECT] 🎯 PLC real detectado: {detected}")
                break
    
    # Se ainda não encontrou, usa o primeiro disponível (incluindo mock)
    if not detected and reachable:
        detected = reachable[0]['name']
        print(f"[DETECT] 🎯 Primeiro PLC disponível detectado: {detected}")
    
    # Se não há nenhum PLC alcançável, retorna None (não detecta nada)
    if not reachable:
        detected = None
        print("[DETECT] ❌ Nenhum PLC alcançável encontrado")
    
    return detected, reachable

def _is_real_plc(ip):
    """Verifica se um IP é realmente um PLC tentando conectar via snap7"""
    try:
        import snap7
        client = snap7.client.Client()
        
        # Tenta apenas as configurações mais comuns primeiro (S7-1500 é mais comum)
        configs = [
            (0, 1),  # S7-1500: rack=0, slot=1 (mais comum)
            (0, 2),  # S7-300/400: rack=0, slot=2
        ]
        
        for rack, slot in configs:
            try:
                print(f"[DETECT] 🔌 Tentando conectar em {ip} rack={rack} slot={slot}...")
                client.connect(ip, rack, slot)
                connected = client.get_connected()
                if connected:
                    print(f"[DETECT] ✅ PLC válido encontrado em {ip} rack={rack} slot={slot}")
                    client.disconnect()
                    return True
                else:
                    print(f"[DETECT] ❌ Conexão falhou em {ip} rack={rack} slot={slot}")
                client.disconnect()
            except Exception as e:
                print(f"[DETECT] ❌ Erro ao conectar em {ip} rack={rack} slot={slot}: {e}")
                try:
                    client.disconnect()
                except:
                    pass
                continue
        
        print(f"[DETECT] ❌ {ip} não é um PLC válido")
        return False
        
    except Exception as e:
        print(f"[DETECT] ❌ Erro ao verificar PLC em {ip}: {e}")
        return False
