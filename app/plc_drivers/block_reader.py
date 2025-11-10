# app/plc_drivers/block_reader.py
# Driver de PLC otimizado com comunicação por agrupamento de bloco
# Resolve problemas de queda de conexão por comunicação tag a tag

import snap7
from snap7.util import get_real, get_int, get_bool, get_dword
from snap7.types import Areas
import json
import time
import threading
from typing import Dict, List, Optional, Any
from collections import defaultdict
import struct

from .base import BasePLC

class BlockReaderPLC(BasePLC):
    """
    Driver de PLC otimizado que lê dados por blocos de DB
    em vez de tag por tag, reduzindo drasticamente o número
    de chamadas ao PLC e melhorando a estabilidade da conexão
    """
    
    def __init__(self, ip, config):
        super().__init__(ip, config)
        
        # Cliente snap7
        self.client = snap7.client.Client()
        self.connected = False
        
        # Configurações de conexão
        self.rack = config.get('rack', 0)
        self.slot = config.get('slot', 1)
        self.poll_interval = config.get('poll_interval', 0.1)
        
        # Mapeamento de tags por DB
        self.db_map = {}  # {db_num: [tag_definitions]}
        self.data_cache = {}  # {db_num: raw_data}
        
        # Thread de polling
        self._polling_thread = None
        self._stop_polling = threading.Event()
        self._polling_lock = threading.Lock()
        
        # Cache de dados com TTL
        self._tag_cache = {}  # {tag_name: {'value': value, 'timestamp': time}}
        self._cache_ttl = 1.0  # 1 segundo de TTL
        
        # Carrega mapeamento de comunicação
        self._load_comm_map()
        
        print(f"[BLOCK] 🚀 BlockReader inicializado para {ip}")
    
    def _load_comm_map(self):
        """Carrega e organiza o comm_map por DB"""
        comm_map = self.config.get('comm_map', [])
        
        for item in comm_map:
            if "name" in item and item.get("area", "").upper() == "DB":
                db_num = item.get("db", 0)
                if db_num not in self.db_map:
                    self.db_map[db_num] = []
                self.db_map[db_num].append(item)
        
        print(f"[BLOCK] 📋 Carregados {len(self.db_map)} DBs com {sum(len(tags) for tags in self.db_map.values())} tags")
    
    def load_comm_map(self, comm_map: List[Dict]):
        """Carrega comm_map externo"""
        self.config['comm_map'] = comm_map
        self.db_map = {}
        self._load_comm_map()
    
    def connect(self):
        """Conecta ao PLC"""
        try:
            self.client.connect(self.ip, self.rack, self.slot)
            self.connected = True
            print(f"[BLOCK] ✅ Conectado ao PLC {self.ip} (rack={self.rack}, slot={self.slot})")
            return True
        except Exception as e:
            self.connected = False
            print(f"[BLOCK] ❌ Falha ao conectar: {e}")
            return False
    
    def disconnect(self):
        """Desconecta do PLC"""
        try:
            self.client.disconnect()
            self.connected = False
            print(f"[BLOCK] 🔌 Desconectado do PLC {self.ip}")
        except Exception as e:
            print(f"[BLOCK] ❌ Erro ao desconectar: {e}")
    
    def is_connected(self) -> bool:
        """Verifica se está conectado"""
        try:
            return self.connected and self.client.get_connected()
        except Exception:
            return False
    
    def reconnect(self) -> bool:
        """Reconecta ao PLC"""
        self.disconnect()
        time.sleep(1)  # Aguarda um pouco antes de reconectar
        return self.connect()
    
    def read_db_block(self, db_num: int) -> bool:
        """Lê um bloco completo de DB"""
        if db_num not in self.db_map:
            print(f"[BLOCK] ⚠️ DB{db_num} não encontrado no mapeamento")
            return False
        
        try:
            # Calcula o tamanho necessário do bloco
            max_offset = 0
            for item in self.db_map[db_num]:
                offset = item.get("offset", 0)
                tag_type = item.get("type", "WORD")
                
                # Calcula tamanho baseado no tipo
                if tag_type == "REAL":
                    size = 4
                elif tag_type == "WORD":
                    size = 2
                elif tag_type == "DWORD":
                    size = 4
                elif tag_type == "BOOL":
                    size = 1
                elif tag_type == "STRING":
                    size = 256
                elif tag_type == "BYTE":
                    size = 1
                else:
                    size = 2  # Default
                
                # Calcula o tamanho real necessário (offset + tamanho do tipo)
                required_size = offset + size
                
                max_offset = max(max_offset, required_size)
            
            # Garante um tamanho mínimo
            max_offset = max(max_offset, 10)
            
            print(f"[BLOCK] 📖 Lendo DB{db_num} (offset: 0, tamanho: {max_offset})")
            
            # Lê o bloco completo com retry para "Job pending"
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    data = self.client.db_read(db_num, 0, max_offset)
                    if not data:
                        print(f"[BLOCK] ❌ Dados vazios lidos do DB{db_num}")
                        return False
                        
                    self.data_cache[db_num] = data
                    print(f"[BLOCK] ✅ DB{db_num} lido com sucesso ({len(data)} bytes)")
                    
                    # Atualiza cache de tags
                    self._update_tag_cache_from_db(db_num, data)
                    
                    return True
                    
                except Exception as e:
                    error_msg = str(e)
                    if "Job pending" in error_msg and attempt < max_retries - 1:
                        print(f"[BLOCK] ⚠️ Job pending no DB{db_num}, tentativa {attempt + 1}/{max_retries}")
                        time.sleep(0.1)  # Aguarda 100ms antes de tentar novamente
                        continue
                    else:
                        print(f"[BLOCK] ❌ Erro lendo DB{db_num}: {e}")
                        return False
                        
        except Exception as e:
            print(f"[BLOCK] ❌ Erro lendo DB{db_num}: {e}")
            return False
    
    def _update_tag_cache_from_db(self, db_num: int, data: bytes):
        """Atualiza cache de tags a partir dos dados do DB"""
        current_time = time.time()
        
        for item in self.db_map[db_num]:
            tag_name = item.get("name")
            if not tag_name:
                continue
            
            try:
                value = self._extract_value_from_data(item, data)
                self._tag_cache[tag_name] = {
                    'value': value,
                    'timestamp': current_time
                }
            except Exception as e:
                print(f"[BLOCK] ❌ Erro extraindo valor de {tag_name}: {e}")
                self._tag_cache[tag_name] = {
                    'value': None,
                    'timestamp': current_time
                }
    
    def _extract_value_from_data(self, tag_def: Dict, data: bytes) -> Any:
        """Extrai valor de uma tag a partir dos dados brutos"""
        tag_type = tag_def.get("type", "REAL")
        offset = tag_def.get("offset", 0)
        
        try:
            if tag_type == "REAL":
                if offset + 4 <= len(data):
                    return get_real(data, offset)
            elif tag_type == "WORD":
                if offset + 2 <= len(data):
                    return get_int(data, offset)
            elif tag_type == "DWORD":
                if offset + 4 <= len(data):
                    return int.from_bytes(data[offset:offset+4], byteorder='big')
            elif tag_type == "BOOL":
                byte_offset = tag_def.get("byte", offset)
                bit_offset = tag_def.get("bit", 0)
                if byte_offset < len(data):
                    return get_bool(data, byte_offset, bit_offset)
            elif tag_type == "STRING":
                if offset + 256 <= len(data):
                    max_len = data[offset]
                    actual_len = data[offset + 1]
                    if actual_len > 0 and actual_len <= max_len:
                        raw = data[offset + 2:offset + 2 + actual_len]
                        return raw.decode('utf-8', errors='ignore')
        except Exception as e:
            print(f"[BLOCK] ❌ Erro extraindo {tag_def.get('name')}: {e}")
        
        return None
    
    def get_value(self, tag_name: str) -> Any:
        """Obtém valor de uma tag específica"""
        # Verifica cache primeiro
        if tag_name in self._tag_cache:
            cache_info = self._tag_cache[tag_name]
            if time.time() - cache_info['timestamp'] < self._cache_ttl:
                return cache_info['value']
        
        # Se não está no cache, retorna None
        return None
    
    def read_tags(self, tag_definitions: List[Dict]) -> Dict[str, Any]:
        """Lê múltiplas tags de forma otimizada"""
        if not tag_definitions:
            return {}
        
        if not self.is_connected():
            print(f"[BLOCK] ❌ Não conectado, não é possível ler")
            return {}
        
        result = {}
        current_time = time.time()
        
        # Agrupa tags por DB para leitura otimizada
        tags_by_db = {}
        for tag_def in tag_definitions:
            tag_name = tag_def.get('name')
            db_num = tag_def.get('db')
            
            if not tag_name or not db_num:
                continue
                
            if db_num not in tags_by_db:
                tags_by_db[db_num] = []
            tags_by_db[db_num].append(tag_def)
        
        # Lê cada DB
        for db_num, db_tags in tags_by_db.items():
            try:
                # Lê bloco do DB
                if not self.read_db_block(db_num):
                    print(f"[BLOCK] ❌ Falha ao ler DB{db_num}")
                    for tag_def in db_tags:
                        result[tag_def.get('name')] = None
                    continue
                
                # Obtém dados do cache
                db_data = self.data_cache.get(db_num)
                if db_data is None:
                    print(f"[BLOCK] ❌ Falha ao ler DB{db_num}")
                    for tag_def in db_tags:
                        result[tag_def.get('name')] = None
                    continue
                
                # Processa cada tag do DB
                for tag_def in db_tags:
                    tag_name = tag_def.get('name')
                    value = self._extract_value_from_db_data(db_data, tag_def)
                    
                    # Atualiza cache
                    self._tag_cache[tag_name] = {
                        'value': value,
                        'timestamp': current_time
                    }
                    
                    result[tag_name] = value
                    
            except Exception as e:
                print(f"[BLOCK] ❌ Erro ao ler DB{db_num}: {e}")
                for tag_def in db_tags:
                    result[tag_def.get('name')] = None
        
        return result
    
    def _extract_value_from_db_data(self, db_data: bytes, tag_def: Dict) -> Any:
        """Extrai valor de uma tag dos dados do DB"""
        try:
            offset = tag_def.get('offset', 0)
            tag_type = tag_def.get('type', 'WORD')
            
            if tag_type == 'REAL':
                return get_real(db_data, offset)
            elif tag_type == 'WORD':
                return get_int(db_data, offset)
            elif tag_type == 'BOOL':
                byte_offset = offset // 8
                bit_offset = offset % 8
                return get_bool(db_data, byte_offset, bit_offset)
            elif tag_type == 'BYTE':
                return db_data[offset]
            elif tag_type == 'DWORD':
                return get_dword(db_data, offset)
            elif tag_type == 'STRING':
                # Para STRING, lê até encontrar null terminator ou tamanho máximo
                max_length = 256  # Tamanho padrão para STRING
                string_data = db_data[offset:offset + max_length]
                # Remove null terminators e decodifica
                null_pos = string_data.find(b'\x00')
                if null_pos != -1:
                    string_data = string_data[:null_pos]
                try:
                    return string_data.decode('utf-8', errors='ignore').strip()
                except:
                    return string_data.decode('latin-1', errors='ignore').strip()
            else:
                print(f"[BLOCK] ⚠️ Tipo {tag_type} não suportado para {tag_def.get('name')}")
                return None
                
        except Exception as e:
            print(f"[BLOCK] ❌ Erro ao extrair valor de {tag_def.get('name')}: {e}")
            return None
    
    def write_tags(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags no PLC"""
        if not self.is_connected():
            print(f"[BLOCK] ❌ Não conectado, não é possível escrever")
            return False
        
        if not tag_values:
            return True
        
        try:
            # Busca definições das tags
            comm_map = self.config.get('comm_map', [])
            tag_definitions = {tag['name']: tag for tag in comm_map if 'name' in tag}
            
            print(f"[BLOCK] 📝 Escrevendo {len(tag_values)} tags")
            
            for tag_name, value in tag_values.items():
                if tag_name not in tag_definitions:
                    print(f"[BLOCK] ❌ Tag {tag_name} não encontrada no comm_map")
                    continue
                
                tag_def = tag_definitions[tag_name]
                area = tag_def.get('area', 'DB')
                db = tag_def.get('db', 0)
                offset = tag_def.get('offset', 0)
                tag_type = tag_def.get('type', 'REAL')
                
                # Converte valor para bytes
                try:
                    if tag_type == 'REAL':
                        value_bytes = struct.pack('>f', float(value))
                    elif tag_type == 'WORD':
                        value_bytes = struct.pack('>H', int(value))
                    elif tag_type == 'DWORD':
                        value_bytes = struct.pack('>I', int(value))
                    elif tag_type == 'BOOL':
                        byte_offset = tag_def.get('byte', offset)
                        bit_offset = tag_def.get('bit', 0)
                        # Para BOOL, precisa ler o byte atual, modificar o bit e escrever de volta
                        current_byte = self.client.db_read(db, byte_offset, 1)[0]
                        if value:
                            current_byte |= (1 << bit_offset)
                        else:
                            current_byte &= ~(1 << bit_offset)
                        value_bytes = bytes([current_byte])
                    else:
                        print(f"[BLOCK] ❌ Tipo {tag_type} não suportado para escrita")
                        continue
                    
                    # Escreve no PLC
                    if area == 'DB':
                        self.client.db_write(db, offset, value_bytes)
                        print(f"[BLOCK] ✅ {tag_name} = {value} escrito com sucesso")
                    else:
                        print(f"[BLOCK] ❌ Área {area} não suportada para escrita")
                        continue
                        
                except Exception as e:
                    print(f"[BLOCK] ❌ Erro ao escrever {tag_name}: {e}")
                    continue
            
            return True
            
        except Exception as e:
            print(f"[BLOCK] ❌ Erro geral ao escrever tags: {e}")
            return False
    
    def start_polling(self):
        """Inicia polling em background"""
        if self._polling_thread and self._polling_thread.is_alive():
            return
        
        self._stop_polling.clear()
        self._polling_thread = threading.Thread(
            target=self._polling_loop,
            daemon=True,
            name="BlockReaderPolling"
        )
        self._polling_thread.start()
        print("[BLOCK] 🔄 Polling iniciado")
    
    def stop_polling(self):
        """Para o polling"""
        self._stop_polling.set()
        if self._polling_thread and self._polling_thread.is_alive():
            self._polling_thread.join(timeout=2)
        print("[BLOCK] ⏹️ Polling parado")
    
    def _polling_loop(self):
        """Loop de polling que lê todos os DBs periodicamente"""
        while not self._stop_polling.is_set():
            try:
                if not self.is_connected():
                    self.connect()
                
                if self.connected:
                    # Lê todos os DBs
                    for db_num in self.db_map:
                        self.read_db_block(db_num)
                
                time.sleep(self.poll_interval)
                
            except Exception as e:
                print(f"[BLOCK] ❌ Erro no polling: {e}")
                time.sleep(1)
    
    def read_telemetry(self):
        """Retorna dados de telemetria"""
        return {
            'time': time.time(),
            'source': 'block_reader',
            'connected': self.is_connected(),
            'db_count': len(self.db_map),
            'tag_count': sum(len(tags) for tags in self.db_map.values())
        }
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do driver"""
        return {
            'connected': self.is_connected(),
            'db_count': len(self.db_map),
            'tag_count': sum(len(tags) for tags in self.db_map.values()),
            'cache_size': len(self._tag_cache),
            'polling_active': self._polling_thread and self._polling_thread.is_alive()
        }
