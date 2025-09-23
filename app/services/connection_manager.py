# app/services/connection_manager.py
import threading
import time
import socket
import ipaddress
from typing import Dict, List, Optional, Tuple, Callable
from ..plc_drivers import create_driver_for_config

class ConnectionManager:
    """
    Gerenciador de Conexões para múltiplos PLCs
    
    Responsável por:
    - Discovery automático de PLCs disponíveis
    - Manter uma conexão ativa por grupo (Principal e Lavadora)
    - Reconexão automática quando conexão cai
    - Notificar mudanças de estado via callbacks
    """
    
    def __init__(self, machines_config: List[Dict], socketio=None):
        self.machines_config = machines_config
        self.socketio = socketio
        
        # Estado das conexões
        self._connections = {}  # {group: {ip: driver, status: 'connected'/'disconnected'}}
        self._active_ips = {}   # {group: ip} - IP atualmente ativo por grupo
        self._lock = threading.Lock()
        
        # Configurações de descoberta
        self._discovery_interval = 10.0  # Verifica PLCs a cada 10s
        self._connection_timeout = 3.0   # Timeout para teste de conexão
        self._ping_timeout = 1.0         # Timeout para ping
        
        # Threads de descoberta
        self._discovery_threads = {}
        self._stop_discovery = threading.Event()
        
        # Callbacks para notificações
        self._on_connection_change: Optional[Callable] = None
        self._on_plc_detected: Optional[Callable] = None
        
        # Inicializa grupos de PLCs
        self._init_plc_groups()
        
    def _init_plc_groups(self):
        """Inicializa grupos de PLCs baseado na configuração"""
        self._plc_groups = {
            'principal': {
                'ips': ['100.20.0.10', '100.40.0.10', '100.70.0.10'],
                'machines': ['200CX', '400CX', '700CX']
            },
            'lavadora': {
                'ips': ['100.20.110.10', '100.40.110.10', '100.70.110.10'],
                'machines': ['200CX', '400CX', '700CX']
            }
        }
        
        # Inicializa estado das conexões
        for group in self._plc_groups:
            self._connections[group] = {}
            self._active_ips[group] = None
    
    def set_callbacks(self, on_connection_change=None, on_plc_detected=None):
        """Define callbacks para notificações"""
        self._on_connection_change = on_connection_change
        self._on_plc_detected = on_plc_detected
    
    def start_discovery(self):
        """Inicia descoberta automática de PLCs"""
        if self._discovery_threads:
            return  # Já iniciado
        
        self._stop_discovery.clear()
        
        for group in self._plc_groups:
            thread = threading.Thread(
                target=self._discovery_loop,
                args=(group,),
                daemon=True,
                name=f"Discovery-{group}"
            )
            thread.start()
            self._discovery_threads[group] = thread
        
        print("[CONN] 🔍 Descoberta automática iniciada para todos os grupos")
    
    def stop_discovery(self):
        """Para descoberta automática"""
        self._stop_discovery.set()
        
        for thread in self._discovery_threads.values():
            if thread.is_alive():
                thread.join(timeout=2)
        
        self._discovery_threads.clear()
        print("[CONN] 🛑 Descoberta automática parada")
    
    def _discovery_loop(self, group: str):
        """Loop de descoberta para um grupo específico"""
        print(f"[CONN] 🔍 Iniciando descoberta para grupo {group}")
        
        while not self._stop_discovery.is_set():
            try:
                self._scan_group_plcs(group)
                time.sleep(self._discovery_interval)
            except Exception as e:
                print(f"[CONN] ❌ Erro na descoberta do grupo {group}: {e}")
                time.sleep(5.0)
        
        print(f"[CONN] 🛑 Descoberta parada para grupo {group}")
    
    def _scan_group_plcs(self, group: str):
        """Escaneia PLCs de um grupo específico"""
        group_config = self._plc_groups[group]
        ips = group_config['ips']
        
        # Se já tem conexão ativa, verifica se ainda está funcionando
        active_ip = self._active_ips.get(group)
        if active_ip and self._is_connection_healthy(active_ip, group):
            return  # Conexão ativa e saudável
        
        # Procura por PLCs disponíveis
        for ip in ips:
            if self._stop_discovery.is_set():
                break
                
            if self._test_plc_availability(ip):
                print(f"[CONN] 🎯 PLC disponível encontrado: {ip} (grupo {group})")
                
                if self._connect_to_plc(ip, group):
                    print(f"[CONN] ✅ Conectado ao PLC {ip} (grupo {group})")
                    break
                else:
                    print(f"[CONN] ❌ Falha na conexão com {ip} (grupo {group})")
    
    def _test_plc_availability(self, ip: str) -> bool:
        """Testa se um PLC está disponível via ping e socket"""
        try:
            # Teste de ping (muitos PLCs bloqueiam ICMP, mas tentamos mesmo assim)
            if self._ping_host(ip):
                return True
            
            # Teste de socket na porta 102 (Siemens S7)
            if self._test_socket_connection(ip, 102):
                return True
                
            return False
            
        except Exception as e:
            print(f"[CONN] ⚠️ Erro ao testar {ip}: {e}")
            return False
    
    def _ping_host(self, ip: str) -> bool:
        """Testa conectividade via ping"""
        try:
            import subprocess
            import platform
            
            # Comando ping baseado no OS
            if platform.system().lower() == "windows":
                cmd = ["ping", "-n", "1", "-w", str(int(self._ping_timeout * 1000)), ip]
            else:
                cmd = ["ping", "-c", "1", "-W", str(int(self._ping_timeout)), ip]
            
            result = subprocess.run(cmd, capture_output=True, timeout=self._ping_timeout + 1)
            return result.returncode == 0
            
        except Exception:
            return False
    
    def _test_socket_connection(self, ip: str, port: int) -> bool:
        """Testa conexão via socket"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(self._connection_timeout)
                result = sock.connect_ex((ip, port))
                return result == 0
        except Exception:
            return False
    
    def _is_connection_healthy(self, ip: str, group: str) -> bool:
        """Verifica se uma conexão existente ainda está saudável"""
        with self._lock:
            connection_info = self._connections[group].get(ip)
            if not connection_info:
                return False
            
            driver = connection_info.get('driver')
            if not driver:
                return False
            
            try:
                return driver.is_connected()
            except Exception:
                return False
    
    def _connect_to_plc(self, ip: str, group: str) -> bool:
        """Conecta a um PLC específico"""
        try:
            # Encontra a configuração da máquina baseada no IP
            machine_config = self._find_machine_config_by_ip(ip)
            if not machine_config:
                print(f"[CONN] ❌ Configuração não encontrada para IP {ip}")
                return False
            
            # Cria driver
            driver = create_driver_for_config(machine_config)
            
            # Tenta conectar
            if driver.connect():
                with self._lock:
                    # Desconecta conexão anterior se existir
                    old_ip = self._active_ips.get(group)
                    if old_ip and old_ip != ip:
                        self._disconnect_plc(old_ip, group)
                    
                    # Registra nova conexão
                    self._connections[group][ip] = {
                        'driver': driver,
                        'status': 'connected',
                        'connected_at': time.time(),
                        'machine': machine_config['name']
                    }
                    self._active_ips[group] = ip
                
                # Notifica mudança de conexão
                self._notify_connection_change(group, ip, machine_config['name'], True)
                
                return True
            else:
                print(f"[CONN] ❌ Falha na conexão com {ip}")
                return False
                
        except Exception as e:
            print(f"[CONN] ❌ Erro ao conectar com {ip}: {e}")
            return False
    
    def _find_machine_config_by_ip(self, ip: str) -> Optional[Dict]:
        """Encontra configuração da máquina baseada no IP"""
        for config in self.machines_config:
            # Verifica se é o IP padrão
            if config.get('default_plc_ip') == ip:
                return config
            
            # Verifica se está nos grupos de PLCs
            plc_groups = config.get('plc_groups', {})
            for group_name, group_info in plc_groups.items():
                if ip in group_info.get('ips', []):
                    return config
                    
        return None
    
    def _disconnect_plc(self, ip: str, group: str):
        """Desconecta um PLC específico"""
        try:
            with self._lock:
                connection_info = self._connections[group].get(ip)
                if connection_info:
                    driver = connection_info.get('driver')
                    if driver:
                        driver.disconnect()
                    
                    del self._connections[group][ip]
                    
                    if self._active_ips.get(group) == ip:
                        self._active_ips[group] = None
                    
                    print(f"[CONN] 🔌 Desconectado {ip} (grupo {group})")
                    
        except Exception as e:
            print(f"[CONN] ❌ Erro ao desconectar {ip}: {e}")
    
    def _notify_connection_change(self, group: str, ip: str, machine: str, connected: bool):
        """Notifica mudança de estado de conexão"""
        try:
            if self.socketio:
                self.socketio.emit('plc_connection_changed', {
                    'group': group,
                    'ip': ip,
                    'machine': machine,
                    'connected': connected,
                    'timestamp': time.time()
                })
            
            if self._on_connection_change:
                self._on_connection_change(group, ip, machine, connected)
                
        except Exception as e:
            print(f"[CONN] ❌ Erro ao notificar mudança de conexão: {e}")
    
    def get_active_connection(self, group: str) -> Optional[Tuple[str, object]]:
        """Retorna conexão ativa de um grupo (ip, driver)"""
        with self._lock:
            active_ip = self._active_ips.get(group)
            if not active_ip:
                return None
            
            connection_info = self._connections[group].get(active_ip)
            if not connection_info:
                return None
            
            driver = connection_info.get('driver')
            if not driver or not driver.is_connected():
                return None
            
            return (active_ip, driver)
    
    def get_all_active_connections(self) -> Dict[str, Tuple[str, object]]:
        """Retorna todas as conexões ativas"""
        active_connections = {}
        
        with self._lock:
            for group in self._plc_groups:
                connection = self.get_active_connection(group)
                if connection:
                    active_connections[group] = connection
        
        return active_connections
    
    def force_reconnect(self, group: str = None):
        """Força reconexão de um grupo específico ou todos"""
        if group:
            groups_to_reconnect = [group]
        else:
            groups_to_reconnect = list(self._plc_groups.keys())
        
        for group_name in groups_to_reconnect:
            with self._lock:
                active_ip = self._active_ips.get(group_name)
                if active_ip:
                    self._disconnect_plc(active_ip, group_name)
            
            # Força nova descoberta
            self._scan_group_plcs(group_name)
    
    def get_connection_status(self) -> Dict:
        """Retorna status de todas as conexões"""
        with self._lock:
            status = {}
            for group in self._plc_groups:
                active_ip = self._active_ips.get(group)
                if active_ip:
                    connection_info = self._connections[group].get(active_ip)
                    status[group] = {
                        'active_ip': active_ip,
                        'connected': True,
                        'machine': connection_info.get('machine', 'Unknown'),
                        'connected_at': connection_info.get('connected_at', 0)
                    }
                else:
                    status[group] = {
                        'active_ip': None,
                        'connected': False,
                        'machine': None,
                        'connected_at': None
                    }
            return status
    
    def cleanup(self):
        """Limpeza completa - desconecta todos os PLCs"""
        self.stop_discovery()
        
        with self._lock:
            for group in self._plc_groups:
                for ip in list(self._connections[group].keys()):
                    self._disconnect_plc(ip, group)
        
        print("[CONN] 🧹 Cleanup completo realizado")
