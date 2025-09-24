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
            
        self._connection_timeout = 10.0  # Timeout para conexão em segundos
        self._read_timeout = 5.0  # Timeout para leitura em segundos
        self._last_health_check = 0
        self._health_check_interval = 15.0  # Verifica saúde com um pouco mais de frequência
        self._connection_retry_count = 0
        self._max_connection_retries = 5
        self._base_retry_delay = 2.0  # Delay base para retry em segundos
        # Rate limit para logs ruidosos (e.g., Job pending)
        self._last_noise_log = 0.0
        # Backoff por tag para erros recorrentes (Item not available / Address out of range)
        self._tag_backoff_until = {}
        self._tag_backoff_seconds = 1.0
        # Backoff por DB para otimizar acessos
        self._db_backoff_until = {}
        self._db_backoff_seconds = 1.0

    def connect(self):
        max_retries = 5
        retry_delay = self._base_retry_delay
        
        for attempt in range(max_retries):
            try:
                print(f'[S7] Tentativa de conexão {attempt + 1}/{max_retries} para {self.ip}')
                
                # Priorizar S7-1500: rack=0, slot=1
                print('[S7] Tentando rack=0, slot=1 (S7-1500 default)')
                self.client.connect(self.ip, 0, 1)
                if self.client.get_connected():
                    print('[S7] ✅ Conectado usando rack=0, slot=1')
                    self._connection_retry_count = 0  # Reset contador de retry
                    return True
                try:
                    self.client.disconnect()
                except Exception:
                    pass
                
                # Fallback S7-300/400: rack=0, slot=2
                print('[S7] Tentando rack=0, slot=2 (fallback)')
                self.client.connect(self.ip, 0, 2)
                ok = self.client.get_connected()
                if ok:
                    print('[S7] ✅ Conectado usando rack=0, slot=2')
                    self._connection_retry_count = 0  # Reset contador de retry
                    return True
                    
            except Exception as e:
                print(f'[S7] ❌ Erro na tentativa {attempt + 1}: {e}')
                self._connection_retry_count += 1
                
            # Aguarda antes da próxima tentativa (backoff exponencial)
            if attempt < max_retries - 1:
                print(f'[S7] Aguardando {retry_delay:.1f}s antes da próxima tentativa...')
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, 30.0)  # Backoff exponencial limitado a 30s
        
        print(f'[S7] ❌ Todas as tentativas de conexão falharam para {self.ip}')
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
                print('[S7] Cliente snap7 reporta desconectado')
                return False
            
            # Verifica saúde da conexão periodicamente (menos frequente)
            current_time = time.time()
            if current_time - self._last_health_check > self._health_check_interval:
                self._last_health_check = current_time
                health_ok = self._check_connection_health()
                if not health_ok:
                    print('[S7] Verificação de saúde da conexão falhou')
                return health_ok
            
            return True
        except Exception as e:
            print(f'[S7] Erro ao verificar conexão: {e}')
            return False
    
    def _check_connection_health(self) -> bool:
        """Verifica a saúde da conexão realizando uma chamada leve no cliente.
        python-snap7 retorna um objeto S7CpuInfo (não dict). Se a chamada
        não lançar exceção, consideramos a conexão saudável.
        """
        try:
            _ = self.client.get_cpu_info()  # Pode retornar S7CpuInfo
            print('[S7] ✅ Verificação de saúde OK')
            return True
        except Exception as e:
            print(f'[S7] ❌ Verificação de saúde da conexão falhou: {e}')
            return False

    def reconnect(self) -> bool:
        """Force recreate client and connect again (handles TCP reset by peer)."""
        try:
            print(f'[S7] 🔄 Forçando reconexão para {self.ip} (tentativa {self._connection_retry_count + 1})')
            
            # Verifica se excedeu o número máximo de tentativas
            if self._connection_retry_count >= self._max_connection_retries:
                print(f'[S7] ❌ Máximo de tentativas de reconexão atingido ({self._max_connection_retries})')
                return False
            
            # Força desconexão completa
            try:
                self.client.disconnect()
            except Exception:
                pass
            
            # Aguarda um pouco para garantir que a conexão anterior foi limpa
            time.sleep(1.0)
            
            # Cria um novo cliente snap7 para limpar qualquer estado interno
            try:
                import snap7 as _snap7
                self.client = _snap7.client.Client()
                print('[S7] ✅ Novo cliente snap7 criado')
            except Exception as e:
                print(f'[S7] ❌ Erro ao criar novo cliente: {e}')
                # fallback to existing client
                pass
            
            # Reset do contador de verificação de saúde
            self._last_health_check = 0
            
            # Tenta conectar com backoff exponencial
            success = self.connect()
            if success:
                self._connection_retry_count = 0  # Reset contador em caso de sucesso
            else:
                self._connection_retry_count += 1
                
            return success
        except Exception as e:
            print(f'[S7] ❌ Erro na reconexão: {e}')
            self._connection_retry_count += 1
            return False

    def read_telemetry(self):
        return {'time': time.time(), 'source': 'siemens_s7', 'value': random.randint(0, 100)}

    def read_tags(self, tag_definitions):
        """Read tags in batches per DB to reduce snap7 calls. Return {name: value}."""
        result = {}
        if not tag_definitions:
            return result

        # Garante conexão
        if not self.is_connected():
            # Retorna None para cada tag pedida
            if isinstance(tag_definitions[0], str):
                return {tag: None for tag in tag_definitions}
            else:
                return {tag.get('name'): None for tag in tag_definitions}

        # Filtra apenas dicts com area DB
        tags = []
        for tag in tag_definitions:
            if isinstance(tag, dict):
                if (tag.get('area') or '').upper() == 'DB':
                    name = tag.get('name')
                    if name:
                        # Checa backoff por tag
                        until = self._tag_backoff_until.get(name, 0)
                        if until and time.time() < until:
                            result[name] = None
                            continue
                        tags.append(tag)
            elif isinstance(tag, str):
                # Não temos definição, devolve None
                result[tag] = None

        if not tags:
            return result

        # Agrupa por DB
        by_db = {}
        for tag in tags:
            db = int(tag.get('db') or 0)
            by_db.setdefault(db, []).append(tag)

        # Lê por DB em bloco
        now_ts = time.time()
        for db, db_tags in by_db.items():
            # Respeita backoff por DB (exceto DB10 que precisa sempre tentar)
            if db != 10:
                db_until = self._db_backoff_until.get(db, 0)
                if db_until and now_ts < db_until:
                    for tag in db_tags:
                        name = tag.get('name')
                        if name:
                            result[name] = None
                    continue

            # Calcula janela mínima
            min_start = None
            max_end = None
            for tag in db_tags:
                t = (tag.get('type') or '').upper()
                if t == 'BOOL':
                    start = int(tag.get('byte') or 0)
                    end = start + 1
                elif t == 'REAL':
                    start = int(tag.get('offset') or 0)
                    end = start + 4
                elif t == 'WORD':
                    start = int(tag.get('offset') or 0)
                    end = start + 2
                else:
                    # Tipo não suportado; marcar None
                    name = tag.get('name')
                    if name:
                        result[name] = None
                    continue
                if min_start is None or start < min_start:
                    min_start = start
                if max_end is None or end > max_end:
                    max_end = end

            if min_start is None or max_end is None:
                # Nada válido
                for tag in db_tags:
                    name = tag.get('name')
                    if name:
                        result[name] = None
                continue

            size = max_end - min_start
            # Lê bloco único do DB
            try:
                data = self._read_with_retry(lambda: self.client.db_read(db, min_start, size))
            except Exception as e:
                # Log detalhado para investigar DBs problemáticos (ex.: DB10)
                try:
                    print(f"[S7] ❌ db_read falhou (DB{db}, start={min_start}, size={size}): {e}")
                except Exception:
                    pass
                data = None
            if data is None:
                # TENTATIVAS EXTRAS PARA DBs ESPECÍFICOS
                #
                # DB10: algumas versões têm deslocamento diferente.
                # Faz leituras individuais de 2 bytes em offsets candidatos e preenche os WORDs.
                if db == 10:
                    candidate_offsets = [0, 2, 10]
                    for tag in db_tags:
                        name = tag.get('name')
                        t = (tag.get('type') or '').upper()
                        if not name:
                            continue
                        if t == 'WORD':
                            value = None
                            for off in candidate_offsets:
                                try:
                                    chunk = self._read_with_retry(lambda: self.client.db_read(db, off, 2))
                                except Exception as e:
                                    chunk = None
                                if chunk is not None and len(chunk) == 2:
                                    try:
                                        value = int.from_bytes(chunk, byteorder='big')
                                        print(f"[S7 DEBUG] DB10 fallback OK tag={name} off={off} val={value}")
                                        break
                                    except Exception:
                                        value = None
                            result[name] = value
                            # limpa backoff para DB10 se alguma leitura funcionou
                            if value is not None and db in self._db_backoff_until:
                                try:
                                    del self._db_backoff_until[db]
                                except Exception:
                                    self._db_backoff_until[db] = 0
                        else:
                            result[name] = None
                    # Já tratamos DB10; segue para próximo DB
                    continue
                # DB104: em caso de erro, tenta ler WORD por WORD no offset de cada tag
                elif db == 104:
                    for tag in db_tags:
                        name = tag.get('name')
                        t = (tag.get('type') or '').upper()
                        if not name:
                            continue
                        if t == 'WORD':
                            value = None
                            base_off = int(tag.get('offset') or 0)
                            for off in [base_off, base_off + 2, max(0, base_off - 2)]:
                                try:
                                    chunk = self._read_with_retry(lambda: self.client.db_read(db, off, 2))
                                except Exception:
                                    chunk = None
                                if chunk is not None and len(chunk) == 2:
                                    try:
                                        value = int.from_bytes(chunk, byteorder='big')
                                        print(f"[S7 DEBUG] DB104 fallback OK tag={name} off={off} val={value}")
                                        break
                                    except Exception:
                                        value = None
                            result[name] = value
                            if value is not None and db in self._db_backoff_until:
                                try:
                                    del self._db_backoff_until[db]
                                except Exception:
                                    self._db_backoff_until[db] = 0
                        else:
                            result[name] = None
                    continue
                # Demais DBs: aplica backoff normal
                if db != 10:
                    self._db_backoff_until[db] = time.time() + self._db_backoff_seconds
                for tag in db_tags:
                    name = tag.get('name')
                    if name:
                        result[name] = None
                continue
            else:
                # Limpa backoff do DB em caso de sucesso
                if db in self._db_backoff_until:
                    try:
                        del self._db_backoff_until[db]
                    except Exception:
                        self._db_backoff_until[db] = 0

            # Extrai valores de cada tag a partir do bloco
            import struct
            # Log de depuração para DB10: confirma janela e tamanho lido
            try:
                if db == 10:
                    print(f"[S7 DEBUG] DB10 janela lida: start={min_start}, size={size}, len(data)={len(data) if data is not None else 'None'}")
            except Exception:
                pass
            for tag in db_tags:
                name = tag.get('name')
                t = (tag.get('type') or '').upper()
                try:
                    if t == 'BOOL':
                        start = int(tag.get('byte') or 0)
                        bit = int(tag.get('bit') or 0)
                        idx = start - min_start
                        if 0 <= idx < len(data):
                            val = (data[idx] >> bit) & 1
                            result[name] = bool(val)
                            # Limpa backoff por tag em sucesso
                            if name in self._tag_backoff_until:
                                try:
                                    del self._tag_backoff_until[name]
                                except Exception:
                                    self._tag_backoff_until[name] = 0
                        else:
                            result[name] = None
                    elif t == 'REAL':
                        offset = int(tag.get('offset') or 0)
                        idx = offset - min_start
                        if 0 <= idx and idx + 4 <= len(data):
                            result[name] = struct.unpack('>f', data[idx:idx+4])[0]
                            if name in self._tag_backoff_until:
                                try:
                                    del self._tag_backoff_until[name]
                                except Exception:
                                    self._tag_backoff_until[name] = 0
                        else:
                            result[name] = None
                    elif t == 'WORD':
                        offset = int(tag.get('offset') or 0)
                        idx = offset - min_start
                        if 0 <= idx and idx + 2 <= len(data):
                            # Siemens armazena WORD em big-endian
                            result[name] = int.from_bytes(data[idx:idx+2], byteorder='big')
                            # Limpa backoff por tag em sucesso
                            if name in self._tag_backoff_until:
                                try:
                                    del self._tag_backoff_until[name]
                                except Exception:
                                    self._tag_backoff_until[name] = 0
                        else:
                            result[name] = None
                    else:
                        result[name] = None
                except Exception as e:
                    msg = str(e)
                    if name and ("Item not available" in msg or "Address out of range" in msg):
                        self._tag_backoff_until[name] = time.time() + self._tag_backoff_seconds
                    result[name] = None

        return result
    
    def _read_with_retry(self, read_func, max_retries=1):
        """Executa uma operação de leitura com retry mínimo e logs com rate limit"""
        try:
            # Verifica se ainda está conectado antes de tentar ler
            if not self.is_connected():
                print('[S7] Desconectado durante leitura')
                return None
            
            # Tenta executar a operação de leitura
            result = read_func()
            if result is not None:
                return result
            else:
                # Silencia logs de None para reduzir ruído
                return None
                
        except Exception as e:
            error_msg = str(e)
            # Se for erro específico do PLC (CPU not available ou Job pending), retorna None sem reconectar
            if ("CPU : Item not available" in error_msg or 
                "Item not available" in error_msg or
                "CLI : Job pending" in error_msg):
                return None
            
            # Para outros erros, loga uma vez por 2s e retorna None sem reconectar
            now = time.time()
            if now - self._last_noise_log > 2.0:
                print(f'[S7] ❌ Erro de leitura: {e} - continuando sem reconexão')
                self._last_noise_log = now
            return None

    def write_tags(self, tag_values):
        """Escreve valores nas tags do PLC"""
        if not self.is_connected():
            print(f"[S7] ❌ Não conectado, não é possível escrever")
            return False
        
        if not tag_values:
            return True
        
        try:
            # Busca as definições das tags no comm_map
            comm_map = self.config.get('comm_map', [])
            tag_definitions = {tag['name']: tag for tag in comm_map}
            
            for tag_name, value in tag_values.items():
                if tag_name not in tag_definitions:
                    print(f"[S7] ❌ Tag {tag_name} não encontrada no comm_map")
                    continue
                
                tag_def = tag_definitions[tag_name]
                area = tag_def.get('area', 'DB')
                db = tag_def.get('db', 0)
                offset = tag_def.get('offset', 0)
                tag_type = tag_def.get('type', 'REAL')
                
                print(f"[S7] 📝 Escrevendo {tag_name} = {value} (DB{db}, offset {offset}, tipo {tag_type})")
                
                # Converte o valor para bytes baseado no tipo
                if tag_type == 'REAL':
                    import struct
                    # Converte float para bytes (big-endian)
                    value_bytes = struct.pack('>f', float(value))
                elif tag_type == 'WORD':
                    import struct
                    # Converte int para bytes (big-endian)
                    value_bytes = struct.pack('>H', int(value))
                elif tag_type == 'DWORD':
                    import struct
                    # Converte int para bytes (big-endian)
                    value_bytes = struct.pack('>I', int(value))
                else:
                    print(f"[S7] ❌ Tipo {tag_type} não suportado para escrita")
                    continue
                
                # Escreve no PLC
                if area == 'DB':
                    self.client.db_write(db, offset, value_bytes)
                    print(f"[S7] ✅ {tag_name} = {value} escrito com sucesso")
                else:
                    print(f"[S7] ❌ Área {area} não suportada para escrita")
            
            return True
            
        except Exception as e:
            print(f"[S7] ❌ Erro ao escrever tags: {e}")
            return False

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
