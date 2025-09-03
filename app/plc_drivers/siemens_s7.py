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
        
        # Cria o cliente snap7 de forma thread-safe
        try:
            self.client = snap7.client.Client()
            print(f"[S7] Cliente snap7 criado para {ip}")
        except Exception as e:
            print(f"[S7] ❌ Erro ao criar cliente snap7: {e}")
            raise e
            
        self._connection_timeout = 5.0  # Timeout para conexão em segundos
        self._read_timeout = 2.0  # Timeout para leitura em segundos
        self._last_health_check = 0
        self._health_check_interval = 10.0  # Verifica saúde da conexão a cada 10 segundos

    def connect(self):
        max_retries = 3
        retry_delay = 1.0
        
        for attempt in range(max_retries):
            try:
                print(f'[S7] Tentativa de conexão {attempt + 1}/{max_retries} para {self.ip}')
                
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
                    return True
                    
            except Exception as e:
                print(f'[S7] Erro na tentativa {attempt + 1}: {e}')
                
            # Aguarda antes da próxima tentativa (backoff exponencial)
            if attempt < max_retries - 1:
                print(f'[S7] Aguardando {retry_delay}s antes da próxima tentativa...')
                time.sleep(retry_delay)
                retry_delay *= 2  # Backoff exponencial
        
        print(f'[S7] Todas as tentativas de conexão falharam para {self.ip}')
        return False

    def disconnect(self):
        try:
            self.client.disconnect()
        except Exception:
            pass

    def is_connected(self) -> bool:
        try:
            # Verifica se o cliente snap7 reporta como conectado
            if not self.client.get_connected():
                return False
            
            # Verifica saúde da conexão periodicamente
            current_time = time.time()
            if current_time - self._last_health_check > self._health_check_interval:
                self._last_health_check = current_time
                return self._check_connection_health()
            
            return True
        except Exception:
            return False
    
    def _check_connection_health(self) -> bool:
        """Verifica a saúde da conexão TCP fazendo uma operação simples"""
        try:
            # Tenta ler informações básicas do PLC para verificar se a conexão está realmente funcional
            # Isso detecta conexões TCP "mortas" que o snap7 ainda reporta como conectadas
            self.client.get_cpu_info()
            return True
        except Exception as e:
            print(f'[S7] Verificação de saúde da conexão falhou: {e}')
            return False

    def reconnect(self) -> bool:
        """Force recreate client and connect again (handles TCP reset by peer)."""
        try:
            print(f'[S7] Forçando reconexão para {self.ip}')
            
            # Força desconexão completa
            try:
                self.client.disconnect()
            except Exception:
                pass
            
            # Aguarda um pouco para garantir que a conexão anterior foi limpa
            time.sleep(0.5)
            
            # Cria um novo cliente snap7 para limpar qualquer estado interno
            try:
                import snap7 as _snap7
                self.client = _snap7.client.Client()
                print('[S7] Novo cliente snap7 criado')
            except Exception as e:
                print(f'[S7] Erro ao criar novo cliente: {e}')
                # fallback to existing client
                pass
            
            # Reset do contador de verificação de saúde
            self._last_health_check = 0
            
            return self.connect()
        except Exception as e:
            print(f'[S7] Erro na reconexão: {e}')
            return False

    def read_telemetry(self):
        return {'time': time.time(), 'source': 'siemens_s7', 'value': random.randint(0, 100)}

    def read_tags(self, tag_definitions):
        """Read a list of tag defs from comm_map and return {name:value}.
        Minimal example using snap7; types supported: BOOL (byte/bit), REAL (offset float).
        """
        result = {}
        
        # ensure connection before reading
        if not self.is_connected():
            if not self.reconnect():
                return {tag.get('name'): None for tag in tag_definitions}
        
        for tag in tag_definitions:
            name = tag.get('name')
            try:
                area = (tag.get('area') or '').upper()
                db = int(tag.get('db') or 0)
                if area != 'DB':
                    continue
                    
                t = (tag.get('type') or '').upper()
                if t == 'BOOL':
                    start = int(tag.get('byte') or 0)
                    bit = int(tag.get('bit') or 0)
                    
                    # Tenta ler com retry automático
                    data = self._read_with_retry(lambda: self.client.db_read(db, start, 1))
                    if data is not None:
                        val = (data[0] >> bit) & 1
                        result[name] = bool(val)
                    else:
                        result[name] = None
                        
                elif t == 'REAL':
                    offset = int(tag.get('offset') or 0)
                    
                    # Tenta ler com retry automático
                    data = self._read_with_retry(lambda: self.client.db_read(db, offset, 4))
                    if data is not None:
                        import struct
                        result[name] = struct.unpack('>f', data)[0]
                    else:
                        result[name] = None
                        
            except Exception as e:
                result[name] = None
        
        return result
    
    def _read_with_retry(self, read_func, max_retries=2):
        """Executa uma operação de leitura com retry automático"""
        for attempt in range(max_retries):
            try:
                return read_func()
            except Exception as e:
                print(f'[S7] Erro na leitura (tentativa {attempt + 1}): {e}')
                if attempt < max_retries - 1:
                    print('[S7] Tentando reconectar...')
                    if self.reconnect():
                        continue
                    else:
                        break
                else:
                    print('[S7] Todas as tentativas de leitura falharam')
        return None

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
