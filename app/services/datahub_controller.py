# app/services/datahub_controller.py
# Controlador que busca dados do DataHub via HTTP
# Substitui comunicação direta com PLC

import threading
import time
import json
import requests
from typing import Dict, List, Optional, Any
from collections import defaultdict

# URL do DataHub
DATAHUB_URL = "http://localhost:8000"

class DataHubController:
    """
    Controlador que busca dados do DataHub em vez de conectar direto no PLC.
    
    Mantém a mesma interface do StandalonePLCController para compatibilidade.
    """
    
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        
        # Estado do controlador
        self._lock = threading.Lock()
        self._active_machine = None
        self._comm_map_by_machine = {}
        
        # Cache de dados
        self._cache = {}
        self._cache_lock = threading.Lock()
        
        # URL do DataHub
        self._datahub_url = DATAHUB_URL
        
        # Sistema de polling
        self._polling_thread = None
        self._stop_polling = threading.Event()
        self._polling_interval = 3.0  # ✅ 3 segundos (era 2s - reduz ainda mais a carga)
        
        # Estatísticas
        self._stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'last_update': None,
            'datahub_connected': False
        }
        
        # Compatibilidade: subscrições (não usado, mas mantido para API antiga)
        self._subscription_lock = threading.Lock()
        self._active_subscriptions = {}
        self._heartbeat_timeout = 30
        
        # Carrega comm_maps
        self._load_comm_maps()
        
        print("[DATAHUB_CONTROLLER] Inicializado - Busca dados do DataHub")
    
    def _load_comm_maps(self):
        """Carrega comm_maps de cada máquina."""
        import os
        try:
            comm_map_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'comm_map')
            comm_map_dir = os.path.abspath(comm_map_dir)
            
            for machine in self.machines_config:
                name = machine.get('name')
                if not name:
                    continue
                
                candidates = [f"{name}.json", f"{name.lower()}.json", f"{name.upper()}.json"]
                for fname in candidates:
                    path = os.path.join(comm_map_dir, fname)
                    if os.path.exists(path):
                        with open(path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        
                        # Converte formato agrupado para lista
                        if isinstance(data, dict):
                            if data.get('_format') == 'grouped_by_db' or any(key.isdigit() for key in data.keys() if not key.startswith('_')):
                                # Formato agrupado: {"1": [...], "202": [...]} ou {"_format": "grouped_by_db", "1": [...]}
                                tags_list = []
                                for key, value in data.items():
                                    if key.startswith('_'):  # Pula metadados
                                        continue
                                    try:
                                        db_number = int(key)
                                        if isinstance(value, list):
                                            # IMPORTANTE: Adiciona o campo 'db' a cada tag
                                            for tag in value:
                                                if isinstance(tag, dict) and 'db' not in tag:
                                                    tag['db'] = db_number
                                            tags_list.extend(value)
                                    except (ValueError, TypeError):
                                        # Se não for um número, ignora
                                        continue
                                self._comm_map_by_machine[name] = tags_list
                                print(f"[DATAHUB_CONTROLLER] Formato agrupado por DB: adicionado campo 'db' a {len(tags_list)} tags")
                            else:
                                # Formato desconhecido, tenta usar como está
                                self._comm_map_by_machine[name] = data
                        elif isinstance(data, list):
                            # Formato lista direto
                            self._comm_map_by_machine[name] = data
                        else:
                            # Formato desconhecido, tenta usar como está
                            self._comm_map_by_machine[name] = data
                        
                        print(f"[DATAHUB_CONTROLLER] Comm_map carregado: {name} ({len(self._comm_map_by_machine[name])} tags)")
                        break
        except Exception as e:
            print(f"[DATAHUB_CONTROLLER] Erro ao carregar comm_maps: {e}")
    
    def set_active_machine(self, machine_config):
        """Define a máquina ativa."""
        with self._lock:
            self._active_machine = machine_config
            machine_name = machine_config.get('name', 'Unknown')
            print(f"[DATAHUB_CONTROLLER] Máquina ativa: {machine_name}")
            
            # Inicia polling se não estiver rodando
            if not self._polling_thread or not self._polling_thread.is_alive():
                self._start_polling()
            
            return True, f"Máquina {machine_name} configurada"
    
    def _start_polling(self):
        """Inicia thread de polling."""
        if self._polling_thread and self._polling_thread.is_alive():
            return
        
        self._stop_polling.clear()
        self._polling_thread = threading.Thread(target=self._polling_loop, daemon=True)
        self._polling_thread.start()
        print("[DATAHUB_CONTROLLER] Polling iniciado")
    
    def _polling_loop(self):
        """Loop principal de polling."""
        print("[DATAHUB_CONTROLLER] Loop de polling iniciado")
        
        consecutive_failures = 0
        max_consecutive_failures = 5
        
        while not self._stop_polling.is_set():
            try:
                # ✅ LOG DE DIAGNÓSTICO: Mostra a cada 20 ciclos
                if self._stats['total_requests'] > 0 and self._stats['total_requests'] % 20 == 0:
                    success_rate = (self._stats['successful_requests'] / self._stats['total_requests']) * 100
                    print(f"[DATAHUB_CONTROLLER] 📊 Stats: {self._stats['successful_requests']}/{self._stats['total_requests']} OK ({success_rate:.1f}%), cache: {len(self._cache)} tags")
                
                # Busca dados do DataHub (sempre tenta buscar para atualizar status)
                # O método _fetch_from_datahub() atualiza o status internamente
                data = self._fetch_from_datahub()
                
                # ✅ VERIFICA STATUS APÓS BUSCAR (status foi atualizado em _fetch_from_datahub)
                datahub_connected = self._stats.get('datahub_connected', False)
                
                # Se DataHub está desconectado, emite status offline e pula processamento
                if not datahub_connected:
                    print(f"[DATAHUB_CONTROLLER] ⚠️ DataHub desconectado após verificação - emitindo status offline")
                    machine_name = self._active_machine.get('name') if self._active_machine else 'Unknown'
                    if self.socketio:
                        self.socketio.emit('telemetry', {
                            'machine': machine_name,
                            'timestamp': time.time(),
                            'plc_connected': False,
                            'active_alarms': [],
                            'alarm_summary': {
                                'emergency': 0,
                                'nr12': 0,
                                'drives': 0,
                                'thermal': 0,
                                'hardware': 0,
                                'process': 0,
                                'total': 0
                            }
                        })
                    consecutive_failures += 1
                    self._stats['failed_requests'] += 1
                    self._stats['total_requests'] += 1
                    time.sleep(self._polling_interval)
                    continue  # Pula para próximo ciclo
                
                if data:
                    # Se chegou aqui, datahub_connected já foi verificado como True acima
                    # DataHub conectado - atualiza cache e emite dados
                    with self._cache_lock:
                        self._cache = data
                        self._stats['last_update'] = time.time()
                        self._stats['successful_requests'] += 1
                    
                    # Reset contador de falhas consecutivas
                    consecutive_failures = 0
                    
                    # Envia via SocketIO
                    self._emit_data(data)
                else:
                    # ✅ CORREÇÃO: Quando não consegue ler dados, SEMPRE emite status de desconexão
                    self._stats['failed_requests'] += 1
                    consecutive_failures += 1
                    
                    # Verifica se DataHub está conectado
                    datahub_connected = self._stats.get('datahub_connected', False)
                    
                    # ✅ CORREÇÃO CRÍTICA: Se DataHub está desconectado, SEMPRE emite offline
                    # Não importa se há cache - se está desconectado, não deve emitir dados antigos
                    if not datahub_connected:
                        # DataHub desconectado - SEMPRE emite status offline (ignora cache)
                        print(f"[DATAHUB_CONTROLLER] ⚠️ DataHub desconectado - emitindo status offline (ignorando cache)")
                        machine_name = self._active_machine.get('name') if self._active_machine else 'Unknown'
                        if self.socketio:
                            self.socketio.emit('telemetry', {
                                'machine': machine_name,
                                'timestamp': time.time(),
                                'plc_connected': False,
                                'active_alarms': [],
                                'alarm_summary': {
                                    'emergency': 0,
                                    'nr12': 0,
                                    'drives': 0,
                                    'thermal': 0,
                                    'hardware': 0,
                                    'process': 0,
                                    'total': 0
                                }
                            })
                    else:
                        # ✅ CORREÇÃO: Quando desconectado, NUNCA emite cache - sempre emite status offline
                        # Isso evita que valores antigos apareçam quando o cabo está desconectado
                        print(f"[DATAHUB_CONTROLLER] ⚠️ DataHub desconectado - emitindo status offline (NÃO emitindo cache)")
                        machine_name = self._active_machine.get('name') if self._active_machine else 'Unknown'
                        if self.socketio:
                            self.socketio.emit('telemetry', {
                                'machine': machine_name,
                                'timestamp': time.time(),
                                'plc_connected': False,
                                'active_alarms': [],
                                'alarm_summary': {
                                    'emergency': 0,
                                    'nr12': 0,
                                    'drives': 0,
                                    'thermal': 0,
                                    'hardware': 0,
                                    'process': 0,
                                    'total': 0
                                }
                            })
                    
                    # Se muitas falhas consecutivas, aguarda mais antes de tentar novamente
                    if consecutive_failures >= max_consecutive_failures:
                        print(f"[DATAHUB_CONTROLLER] ⚠️ {max_consecutive_failures} falhas consecutivas - aguardando 10s antes de continuar")
                        time.sleep(10)
                        consecutive_failures = 0  # Reset após pausa
                
                self._stats['total_requests'] += 1
                
            except Exception as e:
                print(f"[DATAHUB_CONTROLLER] ❌ Erro no polling: {e}")
                import traceback
                traceback.print_exc()
                self._stats['failed_requests'] += 1
                consecutive_failures += 1
                
                # Aguarda antes de tentar novamente se houver exceções
                time.sleep(5)
            
            # Aguarda próximo ciclo
            time.sleep(self._polling_interval)
    
    def _fetch_from_datahub(self):
        """
        Busca dados do DataHub.
        
        CORREÇÃO: Timeout aumentado de 2s para 5s para dar tempo ao DataHub
        processar 30+ DBs sem falhar intermitentemente.
        """
        try:
            # ✅ CORREÇÃO: Timeout aumentado (5s → 10s)
            # DataHub precisa ler 30+ DBs, 5s pode ser insuficiente em picos de carga
            status_response = requests.get(f'{DATAHUB_URL}/api/status', timeout=10)
            status = status_response.json()
            
            # ✅ ATUALIZA STATUS IMEDIATAMENTE
            datahub_connected = status.get('connected', False)
            self._stats['datahub_connected'] = datahub_connected
            
            if not datahub_connected:
                print(f"[DATAHUB_CONTROLLER] ⚠️ DataHub reporta PLC desconectado (status.connected={datahub_connected}) - NÃO buscando dados")
                # ✅ IMPORTANTE: Garante que status está atualizado e retorna None imediatamente
                # NÃO tenta buscar dados quando desconectado
                return None
            
            # ✅ CORREÇÃO: Timeout aumentado (5s → 10s)
            # Só busca dados se DataHub está conectado
            data_response = requests.get(f'{DATAHUB_URL}/api/data', timeout=10)
            
            if data_response.status_code != 200:
                print(f"[DATAHUB_CONTROLLER] ❌ HTTP {data_response.status_code}: {data_response.text[:100]}")
                # Atualiza status como desconectado se falhou
                self._stats['datahub_connected'] = False
                return None
            
            datahub_data = data_response.json()
            
            # ✅ VERIFICAÇÃO ADICIONAL: Se dados vieram vazios ou None, considera desconectado
            if not datahub_data or not datahub_data.get('data'):
                print(f"[DATAHUB_CONTROLLER] ⚠️ DataHub retornou dados vazios - considerando desconectado")
                self._stats['datahub_connected'] = False
                return None
            
            # Converte dados do DataHub para formato esperado
            converted_data = self._convert_datahub_to_plc_format(datahub_data)
            
            # ✅ CORREÇÃO: Valida se dados convertidos são suficientes
            if converted_data is None:
                print("[DATAHUB_CONTROLLER] ❌ Conversão retornou None - dados incompletos")
                return None
            
            return converted_data
            
        except requests.exceptions.Timeout:
            print(f"[DATAHUB_CONTROLLER] ⏱️ Timeout ao conectar DataHub (>10s)")
            self._stats['datahub_connected'] = False
            return None
        except requests.exceptions.ConnectionError as e:
            print(f"[DATAHUB_CONTROLLER] 🔌 Erro de conexão com DataHub: {e}")
            self._stats['datahub_connected'] = False
            return None
        except requests.exceptions.RequestException as e:
            print(f"[DATAHUB_CONTROLLER] ❌ Erro HTTP ao buscar do DataHub: {e}")
            self._stats['datahub_connected'] = False
            return None
        except Exception as e:
            print(f"[DATAHUB_CONTROLLER] ❌ Erro inesperado: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _convert_datahub_to_plc_format(self, datahub_data):
        """
        Converte dados do DataHub para o formato esperado pelo supervisório.
        
        DataHub retorna: {"data": {"db1": {"size": 200, "data": [...]}, ...}}
        Precisamos extrair tags específicas do comm_map.
        """
        if not self._active_machine:
            print("[DATAHUB_CONTROLLER] WARN: Nenhuma máquina ativa")
            return {}
        
        machine_name = self._active_machine.get('name')
        comm_map = self._comm_map_by_machine.get(machine_name, [])
        
        if not comm_map:
            print(f"[DATAHUB_CONTROLLER] WARN: Comm_map vazio para {machine_name}")
            return {}
        
        # Dados das DBs
        db_data = datahub_data.get('data', {})
        
        if not db_data:
            print("[DATAHUB_CONTROLLER] WARN: DataHub retornou dados vazios")
            return {}
        
        print(f"[DATAHUB_CONTROLLER] Convertendo {len(db_data)} DBs para {len(comm_map)} tags")
        print(f"[DATAHUB_CONTROLLER] DBs disponíveis no DataHub: {list(db_data.keys())}")
        
        # Extrai valores das tags
        result = {}
        converted_count = 0
        missing_dbs = set()
        
        for tag in comm_map:
            tag_name = tag.get('name')
            db_number = tag.get('db')
            offset = tag.get('offset')
            data_type = tag.get('type', 'BOOL')
            bit = tag.get('bit')
            
            if not tag_name or db_number is None or offset is None:
                continue
            
            # Nome da DB no formato do DataHub
            db_key = f'db{db_number}'
            
            if db_key not in db_data:
                missing_dbs.add(db_number)
                continue
            
            db_bytes = db_data[db_key].get('data', [])
            
            if offset >= len(db_bytes):
                continue
            
            # Lê o valor baseado no tipo
            try:
                if data_type == 'BOOL':
                    byte_value = db_bytes[offset]
                    if bit is not None:
                        value = bool(byte_value & (1 << bit))
                    else:
                        value = bool(byte_value)
                    result[tag_name] = value
                    converted_count += 1
                    
                elif data_type == 'BYTE':
                    result[tag_name] = db_bytes[offset]
                    converted_count += 1
                    
                elif data_type == 'INT' or data_type == 'WORD':
                    if offset + 1 < len(db_bytes):
                        value = (db_bytes[offset] << 8) | db_bytes[offset + 1]
                        # Se INT (com sinal)
                        if data_type == 'INT' and value >= 32768:
                            value = value - 65536
                        result[tag_name] = value
                        converted_count += 1
                    
                elif data_type == 'DINT' or data_type == 'DWORD':
                    if offset + 3 < len(db_bytes):
                        value = (db_bytes[offset] << 24) | (db_bytes[offset + 1] << 16) | \
                                (db_bytes[offset + 2] << 8) | db_bytes[offset + 3]
                        # Se DINT (com sinal)
                        if data_type == 'DINT' and value >= 2147483648:
                            value = value - 4294967296
                        result[tag_name] = value
                        converted_count += 1
                    
                elif data_type == 'REAL':
                    if offset + 3 < len(db_bytes):
                        import struct
                        bytes_data = bytes(db_bytes[offset:offset+4])
                        value = struct.unpack('>f', bytes_data)[0]
                        result[tag_name] = value
                        converted_count += 1
                
                elif data_type == 'STRING':
                    # STRING no S7-1200/1500: 
                    # - Byte 0 (offset): tamanho máximo (geralmente 254 para STRING[254])
                    # - Byte 1 (offset+1): tamanho atual (quantos caracteres estão sendo usados)
                    # - Bytes 2+ (offset+2 até offset+1+current_length): os caracteres
                    if offset + 1 < len(db_bytes):
                        max_length = db_bytes[offset]
                        current_length = min(db_bytes[offset + 1], max_length) if offset + 1 < len(db_bytes) else 0
                        
                        # Limita o tamanho para não ultrapassar os dados disponíveis
                        available_bytes = len(db_bytes) - offset - 2
                        read_length = min(current_length, available_bytes)
                        
                        if read_length > 0:
                            # Lê os caracteres (a partir do offset + 2)
                            string_bytes = db_bytes[offset + 2:offset + 2 + read_length]
                            try:
                                # Tenta decodificar como UTF-8, substituindo caracteres inválidos
                                # Remove null terminators e espaços em branco
                                value = bytes(string_bytes).decode('utf-8', errors='replace')
                                # Remove null bytes e espaços em branco no início/fim
                                value = value.replace('\x00', '').strip()
                                result[tag_name] = value
                                converted_count += 1
                            except Exception as e:
                                print(f"[DATAHUB_CONTROLLER] Erro ao decodificar STRING {tag_name}: {e}")
                                result[tag_name] = ''  # Retorna string vazia em caso de erro
                                converted_count += 1
                        else:
                            result[tag_name] = ''  # String vazia
                            converted_count += 1
                    else:
                        result[tag_name] = ''  # String vazia se não há dados suficientes
                        converted_count += 1
                        
            except Exception as e:
                print(f"[DATAHUB_CONTROLLER] Erro ao converter tag {tag_name}: {e}")
                continue
        
        # ✅ CORREÇÃO: Valida qualidade dos dados antes de retornar
        # Threshold adaptativo: MUITO PERMISSIVO para evitar rejeições intermitentes
        min_threshold = 0.60  # 60% em operação normal (era 70%)
        cold_start_threshold = 0.30  # 30% no cold start (era 40%) - ultra permissivo
        
        # Detecta cold start (cache vazio ou primeira conversão)
        is_cold_start = len(self._cache) == 0 or not hasattr(self, '_conversion_count') or self._conversion_count == 0
        
        # Usa threshold mais permissivo no cold start
        current_threshold = cold_start_threshold if is_cold_start else min_threshold
        min_required_tags = len(comm_map) * current_threshold
        
        conversion_percent = (converted_count/len(comm_map)*100) if len(comm_map) > 0 else 0
        
        if converted_count < min_required_tags:
            status = "COLD START" if is_cold_start else "NORMAL"
            print(f"[DATAHUB_CONTROLLER] ❌ DADOS INCOMPLETOS [{status}]: {converted_count}/{len(comm_map)} tags ({conversion_percent:.1f}%)")
            print(f"[DATAHUB_CONTROLLER] ❌ Mínimo exigido: {min_required_tags:.0f} tags ({current_threshold*100:.0f}%)")
            print(f"[DATAHUB_CONTROLLER] ❌ Descartando leitura - mantendo cache anterior para evitar oscilação")
            
            if missing_dbs:
                print(f"[DATAHUB_CONTROLLER] 💡 DBs faltando: {sorted(missing_dbs)[:10]}")
            
            return None  # ✅ Retorna None para manter cache anterior consistente
        
        # Log de sucesso
        if not hasattr(self, '_conversion_count'):
            self._conversion_count = 0
        
        self._conversion_count += 1
        
        # Log especial no cold start (primeira conversão)
        if self._conversion_count == 1:
            print(f"[DATAHUB_CONTROLLER] ✅ COLD START OK: {converted_count}/{len(comm_map)} tags ({conversion_percent:.1f}%)")
            if missing_dbs:
                print(f"[DATAHUB_CONTROLLER] 💡 DBs faltando: {sorted(missing_dbs)[:10]}")
        
        # Log periódico durante operação
        if self._conversion_count % 20 == 0:
            print(f"[DATAHUB_CONTROLLER] ✓ Convertidas {converted_count}/{len(comm_map)} tags ({conversion_percent:.1f}%)")
        
        if missing_dbs and self._conversion_count % 50 == 0:
            print(f"[DATAHUB_CONTROLLER] WARN: DBs faltando no DataHub: {sorted(missing_dbs)[:10]}")
            print(f"[DATAHUB_CONTROLLER] Adicione essas DBs ao datahub.py na configuração DBS")
        
        # Log de tags de velocidade para debug (apenas 1x a cada 30 conversões)
        if self._conversion_count % 30 == 0:
            vel_tags = {k: v for k, v in result.items() if 'VELOCIDADE' in k.upper() or 'VELOC' in k.upper()}
            if vel_tags:
                print(f"[DATAHUB_CONTROLLER] Tags de velocidade: {list(vel_tags.keys())[:5]}")
        
        return result
    
    def _emit_data(self, data):
        """Envia dados via SocketIO."""
        if not self._active_machine:
            return
        
        machine_name = self._active_machine.get('name')
        
        try:
            # ✅ VERIFICA STATUS REAL DO DATAHUB COM PLC
            datahub_connected = self._stats.get('datahub_connected', False)
            
            # Se DataHub não está conectado ao PLC, emite status de desconexão
            if not datahub_connected:
                print(f"[DATAHUB_CONTROLLER] ⚠️ DataHub desconectado do PLC - emitindo status offline")
                if self.socketio:
                    self.socketio.emit('telemetry', {
                        'machine': machine_name,
                        'timestamp': time.time(),
                        'plc_connected': False,
                        'active_alarms': [],
                        'alarm_summary': {
                            'emergency': 0,
                            'nr12': 0,
                            'drives': 0,
                            'thermal': 0,
                            'hardware': 0,
                            'process': 0,
                            'total': 0
                        }
                    })
                return
            
            # Processa alarmes usando o alarm_processor
            from ..services.alarm_processor import alarm_processor
            active_alarms = []
            alarm_summary = {
                'emergency': 0,
                'nr12': 0,
                'drives': 0,
                'thermal': 0,
                'hardware': 0,
                'process': 0,
                'total': 0
            }
            
            try:
                active_alarms = alarm_processor.process_alarm_data(data, machine_name)
                alarm_summary = alarm_processor.get_alarm_summary(active_alarms)
                
                if len(active_alarms) > 0:
                    print(f"[DATAHUB_CONTROLLER] 🚨 {len(active_alarms)} alarmes ativos detectados")
                    # Mostra alguns alarmes para debug
                    for i, alarm in enumerate(active_alarms[:3], 1):
                        print(f"  [{i}] {alarm.get('type')}: {alarm.get('description')}")
                        
            except Exception as e:
                print(f"[DATAHUB_CONTROLLER] Erro ao processar alarmes: {e}")
            
            # Monta telemetria completa com alarmes
            telemetry = {
                'machine': machine_name,
                'timestamp': time.time(),
                'active_alarms': active_alarms,
                'alarm_summary': alarm_summary,
                'plc_connected': True  # ✅ Só emite True se DataHub está conectado
            }
            
            # Adiciona todas as tags ao objeto principal
            telemetry.update(data)
            
            # Emite evento telemetry (formato esperado pelo frontend)
            self.socketio.emit('telemetry', telemetry)
            
            # Log de velocidades para debug (sempre mostra, mesmo se 0)
            velocidade_real = None
            velocidade_prog = None
            
            for key, value in data.items():
                if 'VELOCIDADE_REAL' in key.upper() or 'VELOC_REAL' in key.upper():
                    velocidade_real = value
                elif 'VELOCIDADE_PROG' in key.upper() or 'VELOC_PROG' in key.upper():
                    velocidade_prog = value
            
            # Log a cada 5 emissões para não poluir (mas sempre mostra mudanças)
            if not hasattr(self, '_last_vel_log'):
                self._last_vel_log = {'real': None, 'prog': None, 'count': 0}
            
            self._last_vel_log['count'] += 1
            
            # Mostra se mudou ou a cada 5 emissões
            if (velocidade_real != self._last_vel_log['real'] or 
                velocidade_prog != self._last_vel_log['prog'] or 
                self._last_vel_log['count'] >= 5):
                
                print(f"[DATAHUB_CONTROLLER] 📊 Velocidades: Real={velocidade_real}, Prog={velocidade_prog}")
                self._last_vel_log['real'] = velocidade_real
                self._last_vel_log['prog'] = velocidade_prog
                self._last_vel_log['count'] = 0
                
        except Exception as e:
            print(f"[DATAHUB_CONTROLLER] Erro ao emitir dados: {e}")
    
    def get_cached_data(self, machine_name=None):
        """Retorna dados do cache."""
        with self._cache_lock:
            return self._cache.copy()
    
    def read_tags(self, tag_names):
        """
        Lê tags específicas do cache.
        Mantém compatibilidade com a API antiga.
        
        Args:
            tag_names: Lista de nomes de tags ou string separada por vírgulas.
                       Se None ou lista vazia, retorna todo o cache.
            
        Returns:
            Dicionário com {tag_name: valor}
        """
        # Converte para lista se for string
        if isinstance(tag_names, str):
            if ',' in tag_names:
                tag_names = [t.strip() for t in tag_names.split(',')]
            else:
                tag_names = [tag_names]
        
        # Se lista vazia ou None, retorna todo o cache
        with self._cache_lock:
            if not tag_names:
                print(f"[DATAHUB_CONTROLLER] read_tags(): Retornando todo o cache ({len(self._cache)} tags)")
                return self._cache.copy()
            
            # Busca valores específicos do cache
            result = {}
            for tag_name in tag_names:
                result[tag_name] = self._cache.get(tag_name, None)
            
            return result
    
    def _extract_db_from_tag_name(self, tag_name):
        """
        Extrai o número da DB do nome da tag.
        Exemplos:
        - XLCLASS_DB200_CLASSIFICACAO_P1[0] -> 200
        - XLCLASS_DB201_CLASSIFICACAO_P1[0] -> 201
        - DB200_TAG_NAME -> 200
        """
        import re
        # Procura padrões como DB200, DB201, etc.
        match = re.search(r'DB(\d+)', tag_name, re.IGNORECASE)
        if match:
            return int(match.group(1))
        return None
    
    def write_tag(self, tag_name, value):
        """Escreve valor em uma tag via DataHub."""
        try:
            # Busca tag no comm_map
            if not self._active_machine:
                print(f"[DATAHUB_CONTROLLER] Nenhuma máquina ativa para escrever {tag_name}")
                return False
            
            machine_name = self._active_machine.get('name')
            comm_map = self._comm_map_by_machine.get(machine_name, [])
            
            tag = next((t for t in comm_map if t.get('name') == tag_name), None)
            if not tag:
                print(f"[DATAHUB_CONTROLLER] Tag {tag_name} não encontrada no comm_map")
                return False
            
            # Tenta obter DB do campo 'db' ou extrai do nome da tag
            db_number = tag.get('db')
            if db_number is None:
                # Fallback: extrai do nome da tag (ex: XLCLASS_DB200_... -> 200)
                db_number = self._extract_db_from_tag_name(tag_name)
                if db_number is None:
                    print(f"[DATAHUB_CONTROLLER] ❌ Não foi possível determinar DB para tag {tag_name}")
                    return False
                print(f"[DATAHUB_CONTROLLER] 💡 DB extraído do nome da tag: DB{db_number}")
            
            offset = tag.get('offset')
            data_type = tag.get('type', 'INT')
            
            # Para BOOL com bit especificado
            if data_type == 'BOOL' and 'bit' in tag:
                # Codifica bit no valor (TODO: melhorar isso)
                pass
            
            print(f"[DATAHUB_CONTROLLER] Escrevendo {tag_name}: {value} (tipo: {data_type}, DB{db_number}.{offset})")
            
            # ✅ Para STRING, usa JSON body para evitar problemas com encoding de query params
            if data_type == 'STRING':
                # Converte valor para string se necessário
                str_value = str(value) if value is not None else ""
                response = requests.post(
                    f'{self._datahub_url}/api/write/{db_number}',
                    params={'offset': offset, 'data_type': data_type},
                    json={'value': str_value},  # Usa JSON body para strings
                    timeout=5  # Timeout maior para strings que podem ser longas
                )
            else:
                # Para outros tipos, usa query params
                response = requests.post(
                    f'{self._datahub_url}/api/write/{db_number}',
                    params={'offset': offset, 'value': value, 'data_type': data_type},
                    timeout=2
                )
            
            if response.status_code == 200:
                result = response.json()
                success = result.get('success', False)
                if success:
                    print(f"[DATAHUB_CONTROLLER] ✅ Escrita OK: {tag_name} = {value}")
                else:
                    print(f"[DATAHUB_CONTROLLER] ❌ Falha na escrita: {result.get('error')}")
                return success
            else:
                print(f"[DATAHUB_CONTROLLER] ❌ Erro HTTP {response.status_code}: {response.text}")
            
            return False
            
        except Exception as e:
            print(f"[DATAHUB_CONTROLLER] Erro ao escrever tag: {e}")
            return False
    
    def get_stats(self):
        """Retorna estatísticas."""
        with self._lock:
            return self._stats.copy()
    
    def write_tags(self, tag_values):
        """
        Escreve múltiplas tags.
        ✅ OTIMIZADO: Usa threading para paralelizar escritas
        
        Args:
            tag_values: Dicionário {tag_name: value}
            
        Returns:
            Bool indicando sucesso
        """
        if not tag_values:
            return True
        
        # ✅ OTIMIZAÇÃO: Escrita paralela usando threads
        import concurrent.futures
        
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            future_to_tag = {
                executor.submit(self.write_tag, tag_name, value): tag_name 
                for tag_name, value in tag_values.items()
            }
            
            for future in concurrent.futures.as_completed(future_to_tag):
                tag_name = future_to_tag[future]
                try:
                    success = future.result(timeout=5)
                    results.append(success)
                except Exception as e:
                    print(f"[DATAHUB_CONTROLLER] Erro ao escrever {tag_name}: {e}")
                    results.append(False)
        
        # Retorna True se TODAS as escritas foram bem-sucedidas
        return all(results)
    
    def get_active_machine(self):
        """Retorna máquina ativa."""
        with self._lock:
            return self._active_machine
    
    @property
    def active_config(self):
        """Propriedade para compatibilidade - retorna máquina ativa."""
        return self._active_machine
    
    def is_connected(self):
        """Verifica se está conectado."""
        return self._stats.get('datahub_connected', False)

    def _prune_subscriptions(self):
        """Remove inscrições expiradas para evitar crescimento infinito de memória."""
        now = time.time()
        expired = [
            cid for cid, sub in self._active_subscriptions.items()
            if now - sub.get('last_heartbeat', 0) > self._heartbeat_timeout
        ]
        for cid in expired:
            try:
                del self._active_subscriptions[cid]
            except Exception:
                pass
    
    def force_reconnect(self):
        """
        Força reconexão.
        Para DataHub isso não é necessário, mas mantemos para compatibilidade.
        """
        print("[DATAHUB_CONTROLLER] Force reconnect chamado (DataHub gerencia reconexão automaticamente)")
        return True
    
    def subscribe_tags(self, client_id, tags):
        """
        Inscreve tags para monitoramento.
        Para compatibilidade - DataHub já monitora todas as tags automaticamente.
        """
        print(f"[DATAHUB_CONTROLLER] Subscribe tags chamado para client {client_id}: {len(tags) if isinstance(tags, list) else 1} tags")
        
        with self._subscription_lock:
            self._prune_subscriptions()
            self._active_subscriptions[client_id] = {
                'tags': tags if isinstance(tags, list) else [tags],
                'last_heartbeat': time.time()
            }
        
        return True
    
    @property
    def driver(self):
        """
        Propriedade para compatibilidade com código antigo que acessa plc_controller.driver
        Retorna None pois DataHub abstrai o driver.
        """
        return None
    
    def heartbeat_client(self, client_id=None):
        """
        Heartbeat para compatibilidade.
        DataHub gerencia conexão automaticamente.
        """
        if client_id:
            with self._subscription_lock:
                self._prune_subscriptions()
                if client_id in self._active_subscriptions:
                    self._active_subscriptions[client_id]['last_heartbeat'] = time.time()
                    return True
        
        return {
            'connected': self.is_connected(),
            'active_machine': self._active_machine.get('name') if self._active_machine else None,
            'datahub_url': self._datahub_url
        }
    
    def unsubscribe_client(self, client_id):
        """
        Desinscreve cliente.
        Para compatibilidade - DataHub gerencia subscrições automaticamente.
        """
        print(f"[DATAHUB_CONTROLLER] Unsubscribe client {client_id}")
        with self._subscription_lock:
            if client_id in self._active_subscriptions:
                del self._active_subscriptions[client_id]
        return True
    
    def get_subscribed_tags(self):
        """
        Retorna tags inscritas.
        Para compatibilidade.
        """
        with self._subscription_lock:
            self._prune_subscriptions()
            tags = set()
            for sub in self._active_subscriptions.values():
                tags.update(sub.get('tags', []))
            return list(tags)
    
    def reload_comm_map_for_active(self):
        """
        Recarrega comm_map da máquina ativa.
        Para compatibilidade.
        """
        print("[DATAHUB_CONTROLLER] Reload comm_map chamado")
        self._load_comm_maps()
        return (True, "Comm_maps recarregados")
    
    def _detect_and_switch_to_available_plc(self):
        """
        Detecta e troca para PLC disponível.
        Para compatibilidade - DataHub gerencia isso automaticamente.
        """
        print("[DATAHUB_CONTROLLER] Detect and switch PLC chamado (DataHub gerencia automaticamente)")
        return True
    
    def _get_alarm_tags(self):
        """
        Retorna tags de alarme.
        Para compatibilidade.
        """
        if not self._active_machine:
            return []
        
        machine_name = self._active_machine.get('name')
        comm_map = self._comm_map_by_machine.get(machine_name, [])
        
        # Filtra tags de alarme (contêm 'ALARME' no nome)
        alarm_tags = [tag.get('name') for tag in comm_map 
                      if 'ALARME' in tag.get('name', '').upper()]
        
        return alarm_tags
    
    def stop(self):
        """Para o controlador."""
        print("[DATAHUB_CONTROLLER] Parando...")
        self._stop_polling.set()
        if self._polling_thread:
            self._polling_thread.join(timeout=2)
        print("[DATAHUB_CONTROLLER] Parado")
