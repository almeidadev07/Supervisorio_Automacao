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
            print(f"[S7] ERRO ao criar cliente snap7: {e}")
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
                    print('[S7] Conectado usando rack=0, slot=1')
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
                    print('[S7] Conectado usando rack=0, slot=2')
                    self._connection_retry_count = 0  # Reset contador de retry
                    return True
                    
            except Exception as e:
                print(f'[S7] ERRO na tentativa {attempt + 1}: {e}')
                self._connection_retry_count += 1
                
            # Aguarda antes da próxima tentativa (backoff exponencial)
            if attempt < max_retries - 1:
                print(f'[S7] Aguardando {retry_delay:.1f}s antes da próxima tentativa...')
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, 30.0)  # Backoff exponencial limitado a 30s
        
        print(f'[S7] ERRO Todas as tentativas de conexao falharam para {self.ip}')
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
            print('[S7] Verificacao de saude OK')
            return True
        except Exception as e:
            print(f'[S7] ERRO Verificacao de saude da conexao falhou: {e}')
            return False

    def reconnect(self) -> bool:
        """Force recreate client and connect again (handles TCP reset by peer)."""
        try:
            print(f'[S7] 🔄 Forçando reconexão para {self.ip} (tentativa {self._connection_retry_count + 1})')
            
            # Verifica se excedeu o número máximo de tentativas
            if self._connection_retry_count >= self._max_connection_retries:
                print(f'[S7] ERRO Maximo de tentativas de reconexao atingido ({self._max_connection_retries})')
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
                print('[S7] Novo cliente snap7 criado')
            except Exception as e:
                print(f'[S7] ERRO ao criar novo cliente: {e}')
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
            print(f'[S7] ERRO na reconexao: {e}')
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

        # Ordena DBs por quantidade de tags (lê DBs com mais tags primeiro para melhor cache hit)
        sorted_dbs = sorted(by_db.items(), key=lambda x: len(x[1]), reverse=True)

        # Lê por DB em bloco (ordenado por quantidade de tags)
        now_ts = time.time()
        for db, db_tags in sorted_dbs:
            # Respeita backoff por DB (exceto DB10 que precisa sempre tentar)
            if db != 10:
                db_until = self._db_backoff_until.get(db, 0)
                if db_until and now_ts < db_until:
                    for tag in db_tags:
                        name = tag.get('name')
                        if name:
                            result[name] = None
                    continue

            # ESTRATÉGIA OTIMIZADA: Leitura em chunks/faixas para evitar erros de conexão
            # Divide a DB em chunks adaptativos baseados na quantidade de tags
            # Chunks maiores = menos chamadas ao PLC = melhor performance
            num_tags = len(db_tags)
            if num_tags <= 5:
                # Poucas tags: chunk pequeno
                CHUNK_SIZE = 50
                MAX_CHUNK_SIZE = 100
            elif num_tags <= 20:
                # Quantidade média: chunk médio
                CHUNK_SIZE = 100
                MAX_CHUNK_SIZE = 200
            else:
                # Muitas tags: chunk maior (mais eficiente)
                CHUNK_SIZE = 200
                MAX_CHUNK_SIZE = 400
            
            # Mapeia tags por offset para facilitar agrupamento em chunks
            tags_by_offset = {}
            string_tags = []  # Tags STRING precisam de tratamento especial
            
            for tag in db_tags:
                t = (tag.get('type') or '').upper()
                if t == 'BOOL':
                    start = int(tag.get('byte') or tag.get('offset') or 0)
                    end = start + 1
                elif t == 'REAL':
                    start = int(tag.get('offset') or 0)
                    end = start + 4
                elif t == 'WORD':
                    start = int(tag.get('offset') or 0)
                    end = start + 2
                elif t == 'DWORD' or t == 'DINT':
                    start = int(tag.get('offset') or 0)
                    end = start + 4
                elif t == 'INT':
                    start = int(tag.get('offset') or 0)
                    end = start + 2
                elif t == 'BYTE':
                    start = int(tag.get('offset') or 0)
                    end = start + 1
                elif t == 'STRING':
                    start = int(tag.get('offset') or 0)
                    end = start + 2  # Apenas header para cálculo
                    string_tags.append(tag)
                else:
                    name = tag.get('name')
                    if name:
                        result[name] = None
                    continue
                
                # Agrupa tags por range de 100 bytes (0-99, 100-199, etc.)
                chunk_start = (start // CHUNK_SIZE) * CHUNK_SIZE
                if chunk_start not in tags_by_offset:
                    tags_by_offset[chunk_start] = []
                tags_by_offset[chunk_start].append((tag, start, end))

            if not tags_by_offset:
                # Nada válido
                for tag in db_tags:
                    name = tag.get('name')
                    if name:
                        result[name] = None
                continue
            
            # Lê cada chunk separadamente para evitar erros de conexão
            # Combina todos os chunks em um único buffer para extração
            all_chunks = {}  # {chunk_start: (data, chunk_size)}
            failed_chunks = set()
            
            # Ordena chunks por offset
            sorted_chunks = sorted(tags_by_offset.keys())
            
            for chunk_start in sorted_chunks:
                chunk_tags = tags_by_offset[chunk_start]
                
                # Calcula o range necessário para este chunk
                chunk_min = min(start for _, start, _ in chunk_tags)
                chunk_max = max(end for _, _, end in chunk_tags)
                chunk_read_start = max(0, chunk_min)
                chunk_read_size = chunk_max - chunk_read_start
                # Arredonda para múltiplo de 2 e adiciona margem
                chunk_read_size = max(10, ((chunk_read_size + 10) // 2) * 2)
                chunk_read_size = min(chunk_read_size, MAX_CHUNK_SIZE)
                
                # Tenta ler o chunk
                chunk_data = None
                try:
                    chunk_data = self._read_with_retry(lambda: self.client.db_read(db, chunk_read_start, chunk_read_size))
                    if chunk_data:
                        all_chunks[chunk_start] = (chunk_data, chunk_read_start, chunk_read_size)
                        # Log apenas para DBs importantes ou primeiro chunk
                        if db == 1 or db == 10 or chunk_start == sorted_chunks[0]:
                            print(f"[S7] Chunk DB{db} [{chunk_read_start}-{chunk_read_start+chunk_read_size}] lido: {len(chunk_data)} bytes")
                except Exception as e:
                    error_msg = str(e)
                    # Log apenas uma vez a cada 10 segundos por chunk
                    if not hasattr(self, '_chunk_error_log'):
                        self._chunk_error_log = {}
                    chunk_key = f"{db}_{chunk_start}"
                    last_log = self._chunk_error_log.get(chunk_key, 0)
                    if time.time() - last_log > 10:
                        print(f"[S7] WARN Chunk DB{db} [{chunk_read_start}-{chunk_read_start+chunk_read_size}] falhou: {error_msg[:50]}")
                        self._chunk_error_log[chunk_key] = time.time()
                    failed_chunks.add(chunk_start)
                    
                    # Fallback: tenta ler tags individuais deste chunk
                    for tag, start, end in chunk_tags:
                        tag_name = tag.get('name')
                        if not tag_name:
                            continue
                        t = (tag.get('type') or '').upper()
                        try:
                            # Tenta ler apenas esta tag
                            tag_size = end - start
                            tag_size = max(2, ((tag_size + 1) // 2) * 2)  # Mínimo 2 bytes, múltiplo de 2
                            tag_data = self._read_with_retry(lambda: self.client.db_read(db, start, tag_size))
                            if tag_data:
                                # Armazena individualmente
                                if chunk_start not in all_chunks:
                                    all_chunks[chunk_start] = ({}, start, start)  # Buffer vazio, será usado para extração individual
                                if not isinstance(all_chunks[chunk_start][0], dict):
                                    # Converte para dict se necessário
                                    all_chunks[chunk_start] = ({}, start, start)
                                all_chunks[chunk_start][0][tag_name] = (tag_data, start, tag_size)
                        except Exception:
                            pass  # Ignora erros individuais
            
            # Processa chunks lidos e extrai valores das tags
            import struct
            
            if not all_chunks:
                # Nenhum chunk foi lido com sucesso - aplica fallback
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
                # Demais DBs: aplica backoff normal (mas não reconecta - apenas marca como problemático)
                if db != 10:
                    # Aumenta backoff progressivamente para DBs problemáticos
                    current_backoff = self._db_backoff_until.get(db, 0)
                    if current_backoff and time.time() < current_backoff:
                        # Já está em backoff, aumenta tempo
                        self._db_backoff_until[db] = time.time() + min(self._db_backoff_seconds * 2, 60.0)
                    else:
                        self._db_backoff_until[db] = time.time() + self._db_backoff_seconds
                    
                    # Log apenas uma vez a cada 10 segundos para evitar spam
                    if not hasattr(self, '_db_error_log') or time.time() - self._db_error_log.get(db, 0) > 10:
                        print(f"[S7] WARN DB{db} em backoff por {self._db_backoff_seconds}s (erro: Address out of range)")
                        if not hasattr(self, '_db_error_log'):
                            self._db_error_log = {}
                        self._db_error_log[db] = time.time()
                
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
                
                # Processa tags de cada chunk lido
                for chunk_start in sorted_chunks:
                    if chunk_start not in all_chunks:
                        # Chunk falhou, marca tags como None
                        for tag, _, _ in tags_by_offset.get(chunk_start, []):
                            name = tag.get('name')
                            if name:
                                result[name] = None
                        continue
                    
                    chunk_info = all_chunks[chunk_start]
                    chunk_data_or_dict = chunk_info[0]
                    chunk_read_start = chunk_info[1]
                    
                    # Verifica se é dict (tags individuais) ou buffer (chunk completo)
                    if isinstance(chunk_data_or_dict, dict):
                        # Processa tags individuais
                        for tag_name, (tag_data, tag_start, _) in chunk_data_or_dict.items():
                            # Extrai valor da tag individual
                            tag = next((t for t, _, _ in tags_by_offset.get(chunk_start, []) if t.get('name') == tag_name), None)
                            if not tag:
                                continue
                            t = (tag.get('type') or '').upper()
                            try:
                                if t == 'WORD':
                                    result[tag_name] = int.from_bytes(tag_data[:2], byteorder='big')
                                elif t == 'INT':
                                    result[tag_name] = int.from_bytes(tag_data[:2], byteorder='big', signed=True)
                                elif t == 'REAL':
                                    result[tag_name] = struct.unpack('>f', tag_data[:4])[0]
                                elif t == 'DWORD':
                                    result[tag_name] = int.from_bytes(tag_data[:4], byteorder='big')
                                elif t == 'DINT':
                                    result[tag_name] = int.from_bytes(tag_data[:4], byteorder='big', signed=True)
                                elif t == 'BYTE':
                                    result[tag_name] = tag_data[0] if len(tag_data) > 0 else None
                                elif t == 'BOOL':
                                    byte_offset = int(tag.get('byte') or tag.get('offset') or 0)
                                    bit = int(tag.get('bit') or 0)
                                    buffer_offset = byte_offset - tag_start
                                    if 0 <= buffer_offset < len(tag_data):
                                        val = (tag_data[buffer_offset] >> bit) & 1
                                        result[tag_name] = bool(val)
                                    else:
                                        result[tag_name] = None
                            except Exception:
                                result[tag_name] = None
                    else:
                        # Processa chunk completo
                        chunk_data = chunk_data_or_dict
                        chunk_read_size = chunk_info[2]
                        
                        # Processa todas as tags deste chunk
                        for tag, start, end in tags_by_offset.get(chunk_start, []):
                            name = tag.get('name')
                            if not name:
                                continue
                            t = (tag.get('type') or '').upper()
                            
                            try:
                                # Calcula offset relativo ao chunk
                                buffer_offset = start - chunk_read_start
                                
                                if t == 'BOOL':
                                    byte_offset = int(tag.get('byte') or tag.get('offset') or 0)
                                    bit = int(tag.get('bit') or 0)
                                    if 0 <= buffer_offset < len(chunk_data):
                                        val = (chunk_data[buffer_offset] >> bit) & 1
                                        result[name] = bool(val)
                                    else:
                                        result[name] = None
                                elif t == 'REAL':
                                    if 0 <= buffer_offset and buffer_offset + 4 <= len(chunk_data):
                                        result[name] = struct.unpack('>f', chunk_data[buffer_offset:buffer_offset+4])[0]
                                    else:
                                        result[name] = None
                                elif t == 'WORD':
                                    if 0 <= buffer_offset and buffer_offset + 2 <= len(chunk_data):
                                        result[name] = int.from_bytes(chunk_data[buffer_offset:buffer_offset+2], byteorder='big')
                                    else:
                                        result[name] = None
                                elif t == 'INT':
                                    if 0 <= buffer_offset and buffer_offset + 2 <= len(chunk_data):
                                        result[name] = int.from_bytes(chunk_data[buffer_offset:buffer_offset+2], byteorder='big', signed=True)
                                    else:
                                        result[name] = None
                                elif t == 'DWORD' or t == 'DINT':
                                    if 0 <= buffer_offset and buffer_offset + 4 <= len(chunk_data):
                                        if t == 'DWORD':
                                            result[name] = int.from_bytes(chunk_data[buffer_offset:buffer_offset+4], byteorder='big')
                                        else:
                                            result[name] = int.from_bytes(chunk_data[buffer_offset:buffer_offset+4], byteorder='big', signed=True)
                                    else:
                                        result[name] = None
                                elif t == 'BYTE':
                                    if 0 <= buffer_offset < len(chunk_data):
                                        result[name] = chunk_data[buffer_offset]
                                    else:
                                        result[name] = None
                                else:
                                    result[name] = None
                                
                                # Limpa backoff por tag em sucesso
                                if name in self._tag_backoff_until:
                                    try:
                                        del self._tag_backoff_until[name]
                                    except Exception:
                                        self._tag_backoff_until[name] = 0
                            except Exception as e:
                                result[name] = None
            
            # Log periódico para depuração
            if db == 1 or db == 10:
                chunks_read = len([c for c in all_chunks.values() if not isinstance(c[0], dict)])
                tags_indiv = sum(len(c[0]) if isinstance(c[0], dict) else 0 for c in all_chunks.values())
                print(f"[S7] DB{db} processada: {chunks_read} chunks, {tags_indiv} tags individuais, {len(db_tags)} tags total")
                    
            # Processa tags STRING separadamente (se necessário)
            for tag in string_tags:
                name = tag.get('name')
                if not name:
                    continue
                offset = int(tag.get('offset') or 0)
                
                # Tenta encontrar STRING em algum chunk
                found = False
                for chunk_start in sorted_chunks:
                    if chunk_start not in all_chunks:
                        continue
                    chunk_info = all_chunks[chunk_start]
                    chunk_data_or_dict = chunk_info[0]
                    chunk_read_start = chunk_info[1]
                    
                    if isinstance(chunk_data_or_dict, dict):
                        continue  # Tags individuais não têm STRING
                    
                    chunk_data = chunk_data_or_dict
                    buffer_offset = offset - chunk_read_start
                    
                    if 0 <= buffer_offset and buffer_offset + 256 <= len(chunk_data):
                        try:
                            max_len = chunk_data[buffer_offset]
                            actual_len = chunk_data[buffer_offset + 1]
                            if max_len > 254:
                                max_len = 254
                            if actual_len > max_len:
                                actual_len = max_len
                            raw = bytes(chunk_data[buffer_offset + 2: buffer_offset + 2 + actual_len])
                            try:
                                text = raw.decode('utf-8', errors='ignore')
                            except Exception:
                                text = raw.decode('latin-1', errors='ignore')
                            result[name] = text
                            found = True
                            if name in self._tag_backoff_until:
                                try:
                                    del self._tag_backoff_until[name]
                                except Exception:
                                    self._tag_backoff_until[name] = 0
                            break
                        except Exception:
                            pass
                
                if not found:
                    # Tenta ler STRING separadamente
                    try:
                        str_header = self._read_with_retry(lambda: self.client.db_read(db, offset, 2))
                        if str_header and len(str_header) >= 2:
                            max_len = str_header[0]
                            actual_len = str_header[1]
                            if max_len > 254:
                                max_len = 254
                            if actual_len > max_len:
                                actual_len = max_len
                            if actual_len > 0:
                                str_data = self._read_with_retry(lambda: self.client.db_read(db, offset + 2, actual_len))
                                if str_data:
                                    try:
                                        text = str_data.decode('utf-8', errors='ignore')
                                    except Exception:
                                        text = str_data.decode('latin-1', errors='ignore')
                                    result[name] = text
                                    if name in self._tag_backoff_until:
                                        try:
                                            del self._tag_backoff_until[name]
                                        except Exception:
                                            self._tag_backoff_until[name] = 0
                                else:
                                    result[name] = None
                            else:
                                result[name] = ""
                        else:
                            result[name] = None
                    except Exception:
                        result[name] = None

        return result
    
    def _read_with_retry(self, read_func, max_retries=1):
        """Executa uma operação de leitura com retry mínimo e logs com rate limit"""
        try:
            # Verifica se ainda está conectado antes de tentar ler
            if not self.is_connected():
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
            # Se for erro específico do PLC (CPU not available ou Job pending), retorna None silenciosamente
            if ("CPU : Item not available" in error_msg or 
                "Item not available" in error_msg or
                "CLI : Job pending" in error_msg or
                "timeout" in error_msg.lower() or
                "CPU not available" in error_msg):
                # Esses erros são esperados quando o PLC está ocupado - não loga para evitar spam
                return None
            
            # Para outros erros, loga uma vez por 5s e retorna None sem reconectar
            now = time.time()
            if now - self._last_noise_log > 5.0:
                print(f'[S7] ERRO de leitura: {error_msg[:80]}')
                self._last_noise_log = now
            return None

    def write_tags(self, tag_values):
        """Escreve valores nas tags do PLC"""
        if not self.is_connected():
            print(f"[S7] ERRO Nao conectado, nao e possivel escrever")
            return False
        
        if not tag_values:
            return True
        
        try:
            # Busca as definições das tags no comm_map
            comm_map = self.config.get('comm_map', [])
            
            # Normaliza comm_map para formato array (suporta ambos os formatos)
            from app.utils_comm_map.comm_map_loader import normalize_comm_map_to_array
            comm_map_array = normalize_comm_map_to_array(comm_map)
            
            # Filtra apenas entradas que têm a chave 'name' (ignora seções)
            tag_definitions = {tag['name']: tag for tag in comm_map_array if isinstance(tag, dict) and 'name' in tag}
            
            print(f"[S7] 📝 Iniciando escrita de {len(tag_values)} tags")
            print(f"[S7] 📋 Comm_map normalizado: {len(comm_map_array)} tags, tag_definitions: {len(tag_definitions)} tags")
            
            for tag_name, value in tag_values.items():
                print(f"[S7] 🔍 Procurando tag: {tag_name}")
                if tag_name not in tag_definitions:
                    print(f"[S7] ERRO Tag {tag_name} nao encontrada no comm_map")
                    print(f"[S7] 🔍 Tags disponíveis (primeiras 10): {list(tag_definitions.keys())[:10]}")
                    continue
                
                tag_def = tag_definitions[tag_name]
                area = tag_def.get('area', 'DB')
                db = tag_def.get('db', 0)
                offset = tag_def.get('offset', 0)
                tag_type = tag_def.get('type', 'REAL')
                
                print(f"[S7] 📝 Escrevendo {tag_name} = {value} (DB{db}, offset {offset}, tipo {tag_type})")
                print(f"[S7] 🔍 Tag def completa: {tag_def}")
                
                # Converte o valor para bytes baseado no tipo
                try:
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
                    elif tag_type == 'STRING':
                        max_len = 254
                        if value is None:
                            value = ''
                        try:
                            encoded = str(value).encode('utf-8')
                        except Exception:
                            encoded = str(value).encode('latin-1', errors='ignore')
                        actual_len = min(len(encoded), max_len)
                        header = bytes([max_len, actual_len])
                        body = encoded[:actual_len]
                        padding = bytes(max_len - actual_len)
                        value_bytes = header + body + padding
                    else:
                        print(f"[S7] ERRO Tipo {tag_type} nao suportado para escrita")
                        continue
                    
                    print(f"[S7] Bytes gerados: {value_bytes.hex().upper()}")
                    
                except Exception as e:
                    print(f"[S7] ERRO ao converter valor {value} para bytes: {e}")
                    continue
                
                # Escreve no PLC
                try:
                    if area == 'DB':
                        print(f"[S7] Chamando db_write(DB{db}, offset {offset}, {len(value_bytes)} bytes)")
                        self.client.db_write(db, offset, value_bytes)
                        print(f"[S7] {tag_name} = {value} escrito com sucesso")
                    else:
                        print(f"[S7] ERRO Area {area} nao suportada para escrita")
                        continue
                        
                except Exception as e:
                    print(f"[S7] ERRO ao escrever {tag_name} no PLC: {e}")
                    # Continua com as outras tags mesmo se uma falhar
                    continue
            
            print(f"[S7] Escrita de tags concluida")
            return True
            
        except Exception as e:
            print(f"[S7] ERRO geral ao escrever tags: {e}")
            import traceback
            print(f"[S7] Traceback: {traceback.format_exc()}")
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
