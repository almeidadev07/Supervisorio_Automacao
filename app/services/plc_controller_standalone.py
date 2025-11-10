# app/services/plc_controller_standalone.py
# Controlador PLC Standalone - Versão Independente
# Resolve problemas de comunicação sem dependências complexas

import threading
import time
import json
import os
from typing import Dict, List, Optional, Any
from collections import defaultdict

# Importa o driver real do PLC
try:
    from ..plc_drivers import create_driver_for_config
    print("[STANDALONE_PLC] Driver real do PLC importado com sucesso")
except ImportError as e:
    print(f"[STANDALONE_PLC] ERRO ao importar driver real: {e}")
    # Fallback para mock se não conseguir importar
    def create_driver_for_config(config):
        class MockDriver:
            def __init__(self, config):
                self.config = config
                self.connected = False
                self.read_count = 0
                self.write_count = 0
            
            def connect(self):
                print(f"[MOCK_DRIVER] Conectando ao PLC {self.config.get('name', 'Unknown')}")
                self.connected = True
                return True
            
            def disconnect(self):
                print("[MOCK_DRIVER] Desconectando do PLC")
                self.connected = False
            
            def is_connected(self):
                return self.connected
            
            def read_tags(self, tag_defs):
                if not self.connected:
                    return {}
                
                self.read_count += 1
                data = {}
                
                for tag_def in tag_defs:
                    tag_name = tag_def.get('name', 'unknown')
                    # Simula dados baseados no tipo
                    if 'VELOCIDADE' in tag_name.upper():
                        data[tag_name] = 100.0 + (self.read_count % 10)
                    elif 'COMANDO' in tag_name.upper():
                        data[tag_name] = 1 if self.read_count % 2 == 0 else 0
                    elif 'ALARME' in tag_name.upper():
                        data[tag_name] = 0
                    else:
                        data[tag_name] = self.read_count % 100
                
                print(f"[MOCK_DRIVER] Lendo {len(data)} tags (leitura #{self.read_count})")
                return data
            
            def write_tags(self, tag_values):
                if not self.connected:
                    return False
                
                self.write_count += 1
                print(f"[MOCK_DRIVER] Escrevendo {len(tag_values)} tags (escrita #{self.write_count})")
                return True
        
        return MockDriver(config)

# Importa AlarmProcessor real
try:
    from .alarm_processor import AlarmProcessor
    alarm_processor = AlarmProcessor()
    print("[STANDALONE_PLC] AlarmProcessor importado com sucesso")
except Exception as e:
    print(f"[STANDALONE_PLC] WARN Erro ao importar AlarmProcessor: {e}")
    # Fallback para mock
    class MockAlarmProcessor:
        def process_alarm_data(self, data, machine):
            return []
        
        def get_alarm_summary(self, alarms):
            return {'total': 0, 'critical': 0, 'warning': 0}
    alarm_processor = MockAlarmProcessor()

class StandalonePLCController:
    """
    Controlador PLC Standalone
    
    Características:
    - Comunicação estável sem oscilações
    - Tratamento de erros "Address out of range"
    - Reconexão automática
    - Cache inteligente
    - Detecção automática de máquinas
    - Sem dependências externas
    """
    
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        
        # Estado do controlador
        self._lock = threading.Lock()
        self._active_machine = None
        self._comm_map_by_machine = {}
        self._driver = None
        
        # Sistema de reconexão
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._reconnect_delay = 5.0
        self._last_reconnect_attempt = 0
        self._connection_stable = False
        self._last_successful_read = 0
        
        # Cache de dados
        self._cache = {}
        self._cache_lock = threading.Lock()
        self._cache_ttl = 2.0  # 2 segundos
        
        # Sistema de polling
        self._polling_thread = None
        self._stop_polling = threading.Event()
        self._polling_interval = 2.0  # 2 segundos para reduzir carga no PLC
        
        # Sistema de adaptação automática (anti-queda)
        self._consecutive_failures = 0
        self._max_consecutive_failures = 3  # Após 3 falhas, entra em modo degradado
        self._degraded_mode = False
        self._degraded_mode_until = 0
        self._degraded_mode_duration = 30.0  # Fica em modo degradado por 30s
        self._base_max_tags = 100  # Valor base de max_tags_per_cycle
        self._current_max_tags = 100  # Valor atual (pode ser reduzido dinamicamente)
        self._min_max_tags = 20  # Mínimo absoluto de tags por ciclo
        self._last_error_time = 0
        self._error_cooldown = 5.0  # Cooldown após erro antes de aumentar carga novamente
        
        # Sistema de subscrições
        self._subscriptions = {}
        self._subscription_lock = threading.Lock()
        self._heartbeat_timeout = 30.0
        
        # Estatísticas
        self._stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'connection_errors': 0,
            'address_errors': 0,
            'reconnections': 0
        }
        
        # Filtros de leitura (ativação por etapas)
        # Lidos de config/tag_filters.json se existir
        self._tag_filters = {
            'enabled_alarm_dbs': [],            # Ex.: [1, 4]
            'velocity_tag_patterns': [          # Padrões para encontrar tags de velocidade
                'VELOCIDADE', 'VELOC', 'SPEED'
            ],
            'additional_velocity_tags': [],     # Lista explícita de nomes de tags, se necessário
            'max_tags_per_cycle': 200           # Máximo de tags lidas por ciclo
        }
        try:
            project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
            tag_filters_path = os.path.join(project_root, 'config', 'tag_filters.json')
            if os.path.exists(tag_filters_path):
                with open(tag_filters_path, 'r', encoding='utf-8') as f:
                    cfg = json.load(f)
                if isinstance(cfg, dict):
                    self._global_tag_filters = cfg
                else:
                    self._global_tag_filters = {}
            else:
                self._global_tag_filters = {}
        except Exception as e:
            print(f"[STANDALONE_PLC] WARN Não foi possível carregar tag_filters.json: {e}")
            self._global_tag_filters = {}
        
        # Ajusta polling interval a partir de app/config/connection_config.json (se existir)
        try:
            conn_cfg_path = os.path.join(os.path.dirname(__file__), 'config', 'connection_config.json')
            # esse caminho é relativo a app/services; o arquivo está em app/config
            conn_cfg_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'config', 'connection_config.json'))
            if os.path.exists(conn_cfg_path):
                with open(conn_cfg_path, 'r', encoding='utf-8') as f:
                    cdata = json.load(f)
                ps = ((cdata or {}).get('connection_settings') or {}).get('polling_settings') or {}
                base = float(ps.get('base_interval', 3.0))
                min_i = float(ps.get('min_interval', 0.5))
                max_i = float(ps.get('max_interval', 5.0))
                # define dentro dos limites
                desired = max(min(base, max_i), min_i)
                self._polling_interval = desired
                print(f"[STANDALONE_PLC] Polling interval configurado para {self._polling_interval}s")
        except Exception as e:
            print(f"[STANDALONE_PLC] WARN Não foi possível aplicar polling_settings: {e}")
        
        # Inicializa max_tags a partir do config ou usa base
        try:
            cfg_max = int(self._tag_filters.get('max_tags_per_cycle') or self._base_max_tags)
            self._base_max_tags = cfg_max
            self._current_max_tags = cfg_max
        except Exception:
            pass
        
        # Cursor para leitura em janelas (chunking)
        self._tag_read_cursor = 0

        # Índices e estados de alarmes por DB (gating dinâmico)
        self._alarm_tags_by_db = {}            # db:int -> List[str]
        self._alarm_db_state = {}              # db:int -> {active: bool, last_active_ts: float, next_probe_at: float}
        self._alarm_probe_cursors = {}         # db:int -> int (rotação de sondas)
        self._alarm_probe_defaults = {
            'alarm_probe_per_cycle': 16,
            'alarm_deactivate_grace_s': 10.0,
            'alarm_probe_min_interval_s': 2.0
        }
        # parâmetros podem vir de tag_filters.json
        try:
            apc = int(self._global_tag_filters.get('alarm_probe_per_cycle')) if hasattr(self, '_global_tag_filters') else None
            if apc is not None and apc > 0:
                self._alarm_probe_defaults['alarm_probe_per_cycle'] = apc
            grace = float(self._global_tag_filters.get('alarm_deactivate_grace_s')) if hasattr(self, '_global_tag_filters') else None
            if grace is not None and grace > 0:
                self._alarm_probe_defaults['alarm_deactivate_grace_s'] = grace
        except Exception:
            pass
        
        # Carrega configurações
        self._load_comm_maps()
        
        # Inicia polling
        self._start_polling()
        
        print("[STANDALONE_PLC] Controlador PLC standalone inicializado")
    
    def _load_comm_maps(self):
        """Carrega maps de comunicação de todas as máquinas"""
        from app.utils_comm_map.comm_map_loader import normalize_comm_map_to_array
        
        comm_map_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'comm_map')
        
        for machine_config in self.machines_config:
            machine_name = machine_config.get('name')
            if not machine_name:
                continue
            
            comm_map_file = os.path.join(comm_map_dir, f'{machine_name}.json')
            if os.path.exists(comm_map_file):
                try:
                    with open(comm_map_file, 'r', encoding='utf-8') as f:
                        comm_map = json.load(f)
                    self._comm_map_by_machine[machine_name] = comm_map
                    # Normaliza para contar tags (suporta ambos os formatos)
                    comm_map_array = normalize_comm_map_to_array(comm_map)
                    print(f"[STANDALONE_PLC] Comm map carregado para {machine_name}: {len(comm_map_array)} tags")
                except Exception as e:
                    print(f"[STANDALONE_PLC] ERRO ao carregar comm_map para {machine_name}: {e}")
                    self._comm_map_by_machine[machine_name] = []
            else:
                print(f"[STANDALONE_PLC] WARN Comm map não encontrado para {machine_name}")
                self._comm_map_by_machine[machine_name] = []
    
    def _create_driver(self):
        """Cria driver para a máquina ativa"""
        if not self._active_machine:
            return False
        
        try:
            print(f"[STANDALONE_PLC] Criando driver real para {self._active_machine['name']}")
            print(f"[STANDALONE_PLC] IP: {self._active_machine.get('default_plc_ip')}")
            print(f"[STANDALONE_PLC] Tipo: {self._active_machine.get('plc_type')}")
            
            # Adiciona comm_map à configuração do driver
            machine_name = self._active_machine['name']
            driver_config = self._active_machine.copy()
            driver_config['comm_map'] = self._comm_map_by_machine.get(machine_name, [])
            
            self._driver = create_driver_for_config(driver_config)
            
            if self._driver.connect():
                print(f"[STANDALONE_PLC] Driver real conectado com sucesso ao PLC")
                self._connection_stable = True
                self._last_successful_read = time.time()
                self._reconnect_attempts = 0
                return True
            else:
                print(f"[STANDALONE_PLC] ERRO Falha na conexão do driver real")
                self._driver = None
                return False
                
        except Exception as e:
            print(f"[STANDALONE_PLC] ERRO ao criar driver real: {e}")
            self._driver = None
            return False
    
    def _attempt_reconnection(self):
        """Tenta reconectar ao PLC"""
        current_time = time.time()
        
        if current_time - self._last_reconnect_attempt < self._reconnect_delay:
            return False
        
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            print(f"[STANDALONE_PLC] ERRO Máximo de tentativas de reconexão atingido")
            return False
        
        self._reconnect_attempts += 1
        self._last_reconnect_attempt = current_time
        
        print(f"[STANDALONE_PLC] Tentativa de reconexão {self._reconnect_attempts}/{self._max_reconnect_attempts}")
        
        try:
            # Fecha driver existente
            if self._driver:
                try:
                    self._driver.disconnect()
                except Exception:
                    pass
                self._driver = None
            
            # Aguarda um pouco
            time.sleep(2.0)
            
            # Tenta criar novo driver
            if self._create_driver():
                print(f"[STANDALONE_PLC] Reconectado com sucesso")
                self._stats['reconnections'] += 1
                return True
            else:
                print(f"[STANDALONE_PLC] ERRO Falha na reconexão")
                return False
            
        except Exception as e:
            print(f"[STANDALONE_PLC] ERRO na reconexão: {e}")
            return False
    
    def _start_polling(self):
        """Inicia polling de dados"""
        if self._polling_thread and self._polling_thread.is_alive():
            return
        
        self._stop_polling.clear()
        self._polling_thread = threading.Thread(
            target=self._polling_loop,
            daemon=True,
            name="StandalonePLCPolling"
        )
        self._polling_thread.start()
        print("[STANDALONE_PLC] Polling iniciado")
    
    def _polling_loop(self):
        """Loop de polling simples e robusto"""
        while not self._stop_polling.is_set():
            try:
                current_time = time.time()
                
                # Verifica se precisa conectar
                if not self._driver or not self._driver.is_connected():
                    if self._active_machine:
                        if not self._create_driver():
                            time.sleep(5.0)
                            continue
                    else:
                        time.sleep(1.0)
                        continue
                
                # Obtém tags subscritas
                subscribed_tags = self.get_subscribed_tags()
                
                # Adiciona automaticamente tags essenciais (alarmes filtrados e velocidades)
                alarm_tags = self._get_alarm_tags()
                velocity_tags = self._get_velocity_tags()
                # Conjunto total sem duplicatas
                total_tags = list(dict.fromkeys(subscribed_tags + alarm_tags + velocity_tags))

                # Sondas leves de DBs de alarme inativos
                probe_tags = self._get_alarm_probe_tags(current_time)
                if probe_tags:
                    # Alta prioridade, mas orçamento pequeno
                    total_tags = list(dict.fromkeys(probe_tags + total_tags))
                
                # Define orçamento de leitura por ciclo (com adaptação automática)
                try:
                    base_max = int(self._tag_filters.get('max_tags_per_cycle') or self._base_max_tags)
                    self._base_max_tags = base_max
                except Exception:
                    base_max = self._base_max_tags
                
                # Aplica modo degradado se necessário
                if self._degraded_mode:
                    if current_time < self._degraded_mode_until:
                        # Ainda em modo degradado: reduz drasticamente
                        max_tags = max(self._min_max_tags, int(self._current_max_tags * 0.5))
                    else:
                        # Saiu do modo degradado: volta gradualmente
                        self._degraded_mode = False
                        self._consecutive_failures = 0
                        max_tags = min(base_max, int(self._current_max_tags * 1.2))
                        self._current_max_tags = max_tags
                else:
                    # Modo normal: usa valor atual ou base
                    max_tags = self._current_max_tags
                
                # Garante limites
                max_tags = max(self._min_max_tags, min(max_tags, base_max))
                self._current_max_tags = max_tags
                
                # Prioriza: 1) alarmes, 2) velocidades, 3) demais (subscritas)
                priority_alarm = list(dict.fromkeys(alarm_tags))
                priority_velocity = [t for t in list(dict.fromkeys(velocity_tags)) if t not in priority_alarm]
                # coloca probes antes de outros
                priority_probe = [t for t in list(dict.fromkeys(probe_tags)) if t not in priority_alarm and t not in priority_velocity] if probe_tags else []
                others = [t for t in total_tags if t not in priority_alarm and t not in priority_velocity and t not in priority_probe]
                
                # Garante alarmes e velocidades dentro do orçamento
                budget = max_tags
                selected = []
                for group in (priority_alarm, priority_velocity, priority_probe):
                    if not group:
                        continue
                    take = group[:budget]
                    selected.extend(take)
                    budget -= len(take)
                    if budget <= 0:
                        break
                
                # Preenche orçamento restante com janela rotativa das demais
                if budget > 0 and others:
                    start = self._tag_read_cursor % len(others)
                    # fatia circular
                    window = others[start:start+budget]
                    if len(window) < budget and start > 0:
                        window += others[0:max(0, budget - len(window))]
                    selected.extend(window)
                    # avança cursor
                    self._tag_read_cursor = (start + len(window)) % len(others)
                
                all_tags_to_read = selected
                
                if not all_tags_to_read:
                    time.sleep(1.0)
                    continue
                
                # Lê dados do PLC (incluindo tags de alarme)
                data = self._read_from_plc(all_tags_to_read)
                
                if data and len(data) > 0:
                    # Sucesso: reset contadores de falha
                    self._consecutive_failures = 0
                    self._last_error_time = 0
                    
                    # Se estava em modo degradado e teve sucesso, pode começar a sair
                    if self._degraded_mode and current_time > self._degraded_mode_until:
                        self._degraded_mode = False
                        print(f"[STANDALONE_PLC] Saindo do modo degradado, aumentando carga gradualmente")
                    
                    # Atualiza estados de DBs de alarme com base nos resultados dos probes e leituras completas
                    self._process_alarm_probe_results(current_time, data)
                    # Atualiza cache
                    self._update_cache(data)
                    
                    # Marca conexão como estável
                    self._connection_stable = True
                    self._last_successful_read = current_time
                    self._reconnect_attempts = 0
                    
                    # Processa alarmes
                    if self._active_machine:
                        try:
                            active_alarms = alarm_processor.process_alarm_data(data, self._active_machine['name'])
                            alarm_summary = alarm_processor.get_alarm_summary(active_alarms)
                            data['active_alarms'] = active_alarms
                            data['alarm_summary'] = alarm_summary
                            if len(active_alarms) > 0:
                                print(f"[STANDALONE_PLC] {len(active_alarms)} alarmes ativos processados")
                        except Exception as e:
                            print(f"[STANDALONE_PLC] ERRO no processamento de alarmes: {e}")
                            import traceback
                            print(f"[STANDALONE_PLC] Traceback: {traceback.format_exc()}")
                    
                    # Envia para frontend
                    if self.socketio:
                        self.socketio.emit('telemetry', data)
                    
                    with self._lock:
                        self._stats['successful_requests'] += 1
                else:
                    # Falha na leitura: incrementa contador
                    self._consecutive_failures += 1
                    self._last_error_time = current_time
                    
                    # Se acumulou muitas falhas, entra em modo degradado
                    if self._consecutive_failures >= self._max_consecutive_failures and not self._degraded_mode:
                        self._degraded_mode = True
                        self._degraded_mode_until = current_time + self._degraded_mode_duration
                        self._current_max_tags = max(self._min_max_tags, int(self._current_max_tags * 0.3))
                        print(f"[STANDALONE_PLC] MODO DEGRADADO ATIVADO: {self._consecutive_failures} falhas consecutivas. Reduzindo carga para {self._current_max_tags} tags/ciclo por {self._degraded_mode_duration}s")
                    
                    # Verifica se precisa reconectar (mas só se não estiver em modo degradado recente)
                    if not self._degraded_mode and current_time - self._last_successful_read > 30.0:  # 30s sem dados
                        self._attempt_reconnection()
                    
                    with self._lock:
                        self._stats['failed_requests'] += 1
                
                # Aguarda intervalo de polling (aumenta em modo degradado)
                sleep_time = self._polling_interval
                if self._degraded_mode:
                    # Em modo degradado, aumenta intervalo para dar mais tempo ao PLC
                    sleep_time = min(sleep_time * 1.5, 5.0)
                time.sleep(sleep_time)
                
            except Exception as e:
                print(f"[STANDALONE_PLC] ERRO no polling: {e}")
                time.sleep(1.0)
    
    def _read_from_plc(self, tags: List[str]) -> Dict[str, Any]:
        """Lê tags do PLC de forma simples e robusta com tratamento de erros melhorado"""
        if not tags or not self._driver:
            return {}
        
        # Verifica se driver está conectado antes de tentar
        try:
            if not self._driver.is_connected():
                return {}
        except Exception:
            return {}
        
        try:
            # Obtém definições das tags
            tag_defs = self._get_tag_definitions(tags)
            if not tag_defs:
                return {}
            
            # Lê do PLC com timeout implícito
            plc_data = self._driver.read_tags(tag_defs)
            
            if plc_data and len(plc_data) > 0:
                # Verifica se pelo menos algumas tags retornaram valores válidos
                valid_count = sum(1 for v in plc_data.values() if v is not None)
                if valid_count > 0:
                    # Reseta contador de erros em caso de sucesso
                    with self._lock:
                        self._stats['total_requests'] += 1
                    return plc_data
                else:
                    # Todas as tags retornaram None - pode ser problema de conexão
                    return {}
            else:
                return {}
                
        except Exception as e:
            error_msg = str(e)
            
            # Log apenas erros críticos (não timeouts/CPU busy que são esperados)
            if "timeout" not in error_msg.lower() and "cpu" not in error_msg.lower() and "job pending" not in error_msg.lower():
                print(f"[STANDALONE_PLC] ERRO ao ler do PLC: {error_msg[:100]}")
            
            # Trata erros específicos
            if "Address out of range" in error_msg:
                with self._lock:
                    self._stats['address_errors'] += 1
            elif "Item not available" in error_msg or "CPU" in error_msg or "timeout" in error_msg.lower():
                with self._lock:
                    self._stats['connection_errors'] += 1
            
            return {}
    
    def _write_to_plc(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags no PLC de forma simples e robusta"""
        if not tag_values or not self._driver:
            print(f"[STANDALONE_PLC] WARN write_to_plc: tag_values={tag_values}, driver={self._driver}")
            return False
        
        try:
            print(f"[STANDALONE_PLC] Tentando escrever {len(tag_values)} tags: {list(tag_values.keys())}")
            
            # Obtém definições das tags
            tag_defs = self._get_tag_definitions(list(tag_values.keys()))
            print(f"[STANDALONE_PLC] Definições encontradas: {len(tag_defs)} tags")
            if not tag_defs:
                print(f"[STANDALONE_PLC] ERRO Nenhuma definição encontrada para as tags solicitadas")
                return False
            
            # Escreve no PLC
            print(f"[STANDALONE_PLC] Chamando driver.write_tags com {len(tag_values)} tags")
            result = self._driver.write_tags(tag_values)
            
            if result:
                # Invalida cache para as tags escritas
                self._invalidate_cache(list(tag_values.keys()))
                print(f"[STANDALONE_PLC] Escrita confirmada: {list(tag_values.keys())}")
            else:
                print(f"[STANDALONE_PLC] ERRO Escrita falhou para: {list(tag_values.keys())}")
            
            return result
            
        except Exception as e:
            error_msg = str(e)
            print(f"[STANDALONE_PLC] ERRO ao escrever no PLC: {error_msg}")
            
            # Trata erros específicos
            if "Address out of range" in error_msg:
                with self._lock:
                    self._stats['address_errors'] += 1
            elif "Item not available" in error_msg:
                with self._lock:
                    self._stats['connection_errors'] += 1
            
            return False
    
    def _get_tag_definitions(self, tag_names: List[str]) -> List[Dict]:
        """Obtém definições das tags"""
        if not self._active_machine:
            return []
        
        from app.utils_comm_map.comm_map_loader import normalize_comm_map_to_array
        
        machine_name = self._active_machine['name']
        comm_map = self._comm_map_by_machine.get(machine_name, [])
        
        # Normaliza para formato array (suporta ambos os formatos)
        comm_map_array = normalize_comm_map_to_array(comm_map)
        
        tag_defs = []
        for tag_def in comm_map_array:
            if isinstance(tag_def, dict) and tag_def.get('name') in tag_names:
                tag_defs.append(tag_def)
        
        return tag_defs
    
    def _get_alarm_tags(self) -> List[str]:
        """Obtém tags de alarme do comm_map, respeitando filtros opcionais (enabled_alarm_dbs)."""
        if not self._active_machine:
            return []
        
        from app.utils_comm_map.comm_map_loader import normalize_comm_map_to_array
        
        machine_name = self._active_machine['name']
        comm_map = self._comm_map_by_machine.get(machine_name, [])
        
        # Normaliza comm_map para formato array (suporta ambos os formatos)
        comm_map_array = normalize_comm_map_to_array(comm_map)
        
        alarm_tags = []
        alarm_markers = ('ALARM', 'ALARME', 'ALARMES', 'EMERG')
        
        # Aplicar filtro por DB se configurado
        enabled_dbs = set()
        try:
            enabled_dbs = set(int(x) for x in (self._tag_filters.get('enabled_alarm_dbs') or []))
        except Exception:
            enabled_dbs = set()

        # Ativa índice por DB caso ainda não esteja construído
        if not self._alarm_tags_by_db:
            self._build_alarm_index(comm_map_array, alarm_markers)

        # Se houver estados, retorna apenas das DBs marcadas ativas
        active_dbs = {db for db, st in self._alarm_db_state.items() if st.get('active')}

        for tag_def in comm_map_array:
            if not isinstance(tag_def, dict):
                continue
            
            tag_name = tag_def.get('name', '')
            if not tag_name:
                continue
            
            # Verifica se é uma tag de alarme
            upper_name = tag_name.upper()
            if any(marker in upper_name for marker in alarm_markers):
                db_num = tag_def.get('db')
                if enabled_dbs:
                    try:
                        if db_num in enabled_dbs and (not active_dbs or db_num in active_dbs):
                            alarm_tags.append(tag_name)
                    except Exception:
                        pass
                else:
                    if not active_dbs or db_num in active_dbs:
                        alarm_tags.append(tag_name)
        
        return alarm_tags

    def _get_velocity_tags(self) -> List[str]:
        """Seleciona tags de velocidade com base em padrões e lista adicional.
        Útil para ativação gradual (ex.: velocidades do grid)."""
        if not self._active_machine:
            return []
        
        from app.utils_comm_map.comm_map_loader import normalize_comm_map_to_array
        
        machine_name = self._active_machine['name']
        comm_map = self._comm_map_by_machine.get(machine_name, [])
        comm_map_array = normalize_comm_map_to_array(comm_map)
        
        patterns = [p.upper() for p in (self._tag_filters.get('velocity_tag_patterns') or [])]
        additional = set(self._tag_filters.get('additional_velocity_tags') or [])
        
        velocity_tags: List[str] = []
        for tag_def in comm_map_array:
            if not isinstance(tag_def, dict):
                continue
            name = tag_def.get('name') or ''
            if not name:
                continue
            uname = name.upper()
            if any(pat in uname for pat in patterns):
                velocity_tags.append(name)
        for n in additional:
            if isinstance(n, str):
                velocity_tags.append(n)
        
        return list(dict.fromkeys(velocity_tags))

    # --- Alarm DB gating helpers ---
    def _build_alarm_index(self, comm_map_array: List[Dict], alarm_markers: tuple):
        self._alarm_tags_by_db = {}
        self._alarm_db_state = {}
        self._alarm_probe_cursors = {}
        for tag_def in comm_map_array:
            if not isinstance(tag_def, dict):
                continue
            name = tag_def.get('name') or ''
            if not name:
                continue
            if not any(m in name.upper() for m in alarm_markers):
                continue
            db = tag_def.get('db')
            if db is None:
                continue
            try:
                db = int(db)
            except Exception:
                continue
            self._alarm_tags_by_db.setdefault(db, []).append(name)
        # Inicialmente, todos inativos com próxima sonda imediata
        now = time.time()
        for db in self._alarm_tags_by_db.keys():
            self._alarm_db_state[db] = {
                'active': False,
                'last_active_ts': 0.0,
                'next_probe_at': now
            }
            self._alarm_probe_cursors[db] = 0

    def _get_alarm_probe_tags(self, current_time: float) -> List[str]:
        if not self._alarm_tags_by_db:
            return []
        per_cycle = int(self._alarm_probe_defaults.get('alarm_probe_per_cycle', 16))
        min_interval = float(self._alarm_probe_defaults.get('alarm_probe_min_interval_s', 2.0))
        tags: List[str] = []
        # Sonda apenas DBs inativos e que estão no tempo de sonda
        for db, state in self._alarm_db_state.items():
            if state.get('active'):
                continue
            if current_time < state.get('next_probe_at', 0):
                continue
            db_tags = self._alarm_tags_by_db.get(db) or []
            if not db_tags:
                continue
            cursor = self._alarm_probe_cursors.get(db, 0)
            window = db_tags[cursor:cursor+per_cycle]
            if len(window) < per_cycle and cursor > 0:
                window += db_tags[0:max(0, per_cycle - len(window))]
            self._alarm_probe_cursors[db] = (cursor + len(window)) % len(db_tags)
            tags.extend(window)
            # define próximo momento mínimo de sonda para esse DB
            state['next_probe_at'] = current_time + min_interval
        return tags

    def _process_alarm_probe_results(self, current_time: float, data: Dict[str, Any]):
        if not self._alarm_tags_by_db:
            return
        grace = float(self._alarm_probe_defaults.get('alarm_deactivate_grace_s', 10.0))
        # Atualiza DBs que ficaram ativos neste ciclo (qualquer tag true)
        for db, tags in self._alarm_tags_by_db.items():
            # Se DB já ativo, verificamos se continua com alguma ativa
            has_active = False
            for t in tags:
                if t in data:
                    v = data.get(t)
                    try:
                        if isinstance(v, (int, float)):
                            if v != 0:
                                has_active = True
                                break
                        elif isinstance(v, bool):
                            if v:
                                has_active = True
                                break
                    except Exception:
                        pass
            state = self._alarm_db_state.get(db)
            if not state:
                continue
            if has_active:
                state['active'] = True
                state['last_active_ts'] = current_time
            else:
                # Se está ativo e passou do grace sem nenhuma ativa, desativa
                if state.get('active') and (current_time - state.get('last_active_ts', 0) > grace):
                    state['active'] = False
                    # próxima sonda pode ser imediata
                    state['next_probe_at'] = current_time
    
    def _get_cached_data(self, tags: List[str]) -> Dict[str, Any]:
        """Obtém dados do cache"""
        cached = {}
        current_time = time.time()
        
        with self._cache_lock:
            for tag in tags:
                if tag in self._cache:
                    cache_info = self._cache[tag]
                    if current_time - cache_info['timestamp'] < cache_info['ttl']:
                        cached[tag] = cache_info['value']
        
        return cached
    
    def _update_cache(self, data: Dict[str, Any]):
        """Atualiza cache com novos dados"""
        current_time = time.time()
        
        with self._cache_lock:
            for tag, value in data.items():
                self._cache[tag] = {
                    'value': value,
                    'timestamp': current_time,
                    'ttl': self._cache_ttl
                }
    
    def _invalidate_cache(self, tags: List[str]):
        """Invalida cache para tags específicas"""
        with self._cache_lock:
            for tag in tags:
                if tag in self._cache:
                    del self._cache[tag]
    
    # Métodos públicos da API
    
    def set_active_machine(self, cfg):
        """Define máquina ativa"""
        with self._lock:
            self._active_machine = cfg
            print(f"[STANDALONE_PLC] Maquina ativa: {cfg.get('name')}")
            # Atualiza filtros específicos da máquina, se houver
            try:
                machine_name = (cfg or {}).get('name')
                if machine_name and isinstance(getattr(self, '_global_tag_filters', {}), dict):
                    per_machine = self._global_tag_filters.get('per_machine', {}) if hasattr(self, '_global_tag_filters') else {}
                    machine_filters = per_machine.get(machine_name, {})
                    base_filters = {
                        'enabled_alarm_dbs': self._global_tag_filters.get('enabled_alarm_dbs', []),
                        'velocity_tag_patterns': self._global_tag_filters.get('velocity_tag_patterns', self._tag_filters['velocity_tag_patterns']),
                        'additional_velocity_tags': self._global_tag_filters.get('additional_velocity_tags', [])
                    }
                    for k, v in machine_filters.items():
                        if k in base_filters and isinstance(base_filters[k], list) and isinstance(v, list):
                            base_filters[k] = v
                        else:
                            base_filters[k] = v
                    self._tag_filters = base_filters
                    print(f"[STANDALONE_PLC] 🔎 Filtros aplicados: {self._tag_filters}")
            except Exception as e:
                print(f"[STANDALONE_PLC] WARN Erro aplicando filtros por maquina: {e}")
            
            # Fecha driver existente
            if self._driver:
                try:
                    self._driver.disconnect()
                except Exception:
                    pass
            
            self._driver = None
            
            # Cria novo driver
            self._create_driver()
            
            return True, 'ok'
    
    @property
    def active_config(self):
        """Retorna a configuração da máquina ativa (compatibilidade com API)"""
        return self._active_machine
    
    @property
    def driver(self):
        """Retorna o driver (compatibilidade com API)"""
        return self._driver
    
    def read_tags(self, tag_names: List[str]) -> Dict[str, Any]:
        """Lê tags específicas"""
        if not tag_names:
            # Se não especificar tags, retorna dados do cache (incluindo alarmes que já foram lidos)
            with self._cache_lock:
                return {tag: info['value'] for tag, info in self._cache.items()}
        
        # Adiciona automaticamente tags de alarme para garantir que sejam lidas
        alarm_tags = self._get_alarm_tags()
        all_tags = list(set(tag_names + alarm_tags))
        
        # Verifica cache primeiro
        cached_data = self._get_cached_data(all_tags)
        uncached_tags = [tag for tag in all_tags if tag not in cached_data]
        
        if not uncached_tags:
            # Todos os dados estão no cache
            with self._lock:
                self._stats['total_requests'] += 1
            return cached_data
        
        # Lê dados não cacheados do PLC
        plc_data = self._read_from_plc(uncached_tags)
        
        # Atualiza cache
        if plc_data:
            self._update_cache(plc_data)
        
        # Combina dados do cache e do PLC
        result = cached_data.copy()
        result.update(plc_data)
        
        return result
    
    def write_tags(self, tag_values: Dict[str, Any]) -> bool:
        """Escreve tags específicas"""
        if not tag_values:
            return True
        
        success = self._write_to_plc(tag_values)
        return success
    
    def subscribe_tags(self, client_id: str, tag_names: List[str]) -> bool:
        """Registra subscrição de tags para um cliente"""
        with self._subscription_lock:
            current_time = time.time()
            self._subscriptions[client_id] = {
                'tags': tag_names,
                'last_heartbeat': current_time
            }
            print(f"[STANDALONE_PLC] Cliente {client_id} subscrito a {len(tag_names)} tags")
            return True
    
    def unsubscribe_client(self, client_id: str) -> bool:
        """Remove subscrição de um cliente"""
        with self._subscription_lock:
            if client_id in self._subscriptions:
                del self._subscriptions[client_id]
                print(f"[STANDALONE_PLC] Cliente {client_id} removido das subscricoes")
                return True
            return False
    
    def heartbeat_client(self, client_id: str) -> bool:
        """Atualiza heartbeat de um cliente"""
        with self._subscription_lock:
            if client_id in self._subscriptions:
                self._subscriptions[client_id]['last_heartbeat'] = time.time()
                return True
            return False
    
    def get_subscribed_tags(self) -> List[str]:
        """Retorna todas as tags que estão sendo subscritas"""
        with self._subscription_lock:
            current_time = time.time()
            active_tags = set()
            
            # Remove clientes inativos (sem heartbeat)
            expired_clients = []
            for client_id, sub_info in self._subscriptions.items():
                if current_time - sub_info['last_heartbeat'] > self._heartbeat_timeout:
                    expired_clients.append(client_id)
                else:
                    active_tags.update(sub_info['tags'])
            
            # Remove clientes expirados
            for client_id in expired_clients:
                del self._subscriptions[client_id]
                print(f"[STANDALONE_PLC] Cliente {client_id} expirado por timeout")
            
            return list(active_tags)
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do controlador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'cache_size': len(self._cache),
            'subscriptions': len(self._subscriptions),
            'connection_stable': self._connection_stable,
            'reconnect_attempts': self._reconnect_attempts,
            'driver_connected': self._driver is not None and self._driver.is_connected() if self._driver else False
        })
        
        return stats
    
    def cleanup(self):
        """Limpeza completa"""
        self._stop_polling.set()
        
        if self._driver:
            try:
                self._driver.disconnect()
            except Exception:
                pass
            self._driver = None
        
        print("[STANDALONE_PLC] 🧹 Cleanup completo realizado")
