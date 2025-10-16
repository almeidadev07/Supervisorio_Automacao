# app/services/plc_controller_legacy.py
# ARQUIVO LEGADO - NÃO USADO MAIS
# Use plc_controller_final.py em vez deste arquivo
import threading
import time
import json
import os
from ..plc_drivers import create_driver_for_config
from .alarm_processor import alarm_processor

class PLCController:
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        self.active_config = None
        self.driver = None
        self.multi_drivers = {}  # Dicionário para múltiplos drivers por IP

        self._poll_thread = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._io_lock = threading.Lock()  # Para serializar acessos Snap7
        self._plc_connected_state = None
        self.comm_map_by_machine = {}
        self.tags_by_plc_ip = {}  # Agrupa tags por IP do PLC (somente da máquina ativa)
        self._load_comm_maps()
        self._last_connection_attempt = 0
        self._connection_retry_interval = 5.0  # Tenta reconectar a cada 5 segundos quando desconectado
        self._last_plc_detection = 0
        self._plc_detection_interval = 10.0  # Verifica PLCs disponíveis a cada 10 segundos quando sem driver
        self._initial_detection_done = False
        self._stop_detection_when_connected = True  # Para detecção quando conectado
        self._consecutive_failures = 0
        self._max_consecutive_failures = 5
        self._polling_interval = 1.0  # Intervalo base de polling em segundos
        self._connection_stable_count = 0
        self._min_stable_connections = 3  # Mínimo de conexões estáveis antes de considerar estável
        # Cache de últimos valores bons para evitar oscilação no frontend
        self._last_good_telemetry = {}
        self._last_good_timestamp = 0.0
        # Debounce de desconexão: exige N leituras consecutivas sem dados antes de marcar como desconectado
        self._empty_reads_in_row = 0
        self._max_empty_reads_before_disconnect = 8
        # Contador de erros CLI Job pending para ativar modo mock
        self._job_pending_errors = 0
        self._max_job_pending_before_mock = 20  # Ativa mock mais rápido com muitas tags
        self._mock_mode_active = False
        self._mock_mode_start_time = 0
        
        # Sistema de recuperação ULTRA robusta para erros de Address out of range
        self._address_error_count = 0
        self._max_address_errors = 1  # Reduzido para 1 - mais agressivo
        self._last_address_error_time = 0
        self._address_error_cooldown = 30.0  # Aumentado para 30 segundos
        self._connection_health_score = 100  # Score de 0-100, 100 = perfeito
        self._health_check_interval = 5.0
        self._last_health_check = 0
        self._stable_connection_duration = 0
        self._min_stable_duration = 30.0  # 30 segundos de conexão estável antes de confiar
        
        # Sistema de filtro de tags problemáticas ULTRA agressivo
        self._problematic_tags = set()  # Tags que causaram erros de Address out of range
        self._tag_error_count = {}  # Contador de erros por tag
        self._max_tag_errors = 1  # Reduzido para 1 - filtra imediatamente
        self._tag_filter_duration = 120.0  # Aumentado para 120 segundos de filtro
        
        # Sistema de persistência de conexão
        self._connection_persistent = False  # Modo persistente ativo
        self._last_successful_read = 0
        self._persistence_duration = 300.0  # 5 minutos de persistência após última leitura bem-sucedida
        
        # Sistema de subscrições por tela/página
        self._active_subscriptions = {}  # {client_id: {tags: [], last_heartbeat: timestamp}}
        self._subscription_lock = threading.Lock()
        self._heartbeat_timeout = 30.0  # 30s sem heartbeat = remove subscrição

        # Loop crítico (scan class) para alarmes/velocidade com baixa latência
        self._critical_thread = None
        self._critical_stop_event = threading.Event()
        self._critical_interval_sec = 0.15  # ~150ms
        self._critical_enabled = False  # desabilitado por padrão até ajuste fino
        self._last_emit_ts = 0.0  # throttle para emissões de socket

    def _load_comm_maps(self):
        """Carrega os maps de comunicação de todas as máquinas e agrupa tags por IP"""
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
                    self.comm_map_by_machine[machine_name] = comm_map
                    
                    # Não agrupa por IP aqui para não misturar IPs de máquinas diferentes
                    # O agrupamento por IP será feito somente quando a máquina for ativada
                    print(f"[PLC] Carregado comm_map para {machine_name}: {len(comm_map)} tags")
                except Exception as e:
                    print(f"[PLC] Erro ao carregar comm_map para {machine_name}: {e}")
                    self.comm_map_by_machine[machine_name] = []
            else:
                print(f"[PLC] Comm_map não encontrado para {machine_name}: {comm_map_file}")
                self.comm_map_by_machine[machine_name] = []

    def reload_comm_map_for_active(self):
        """Recarrega do disco o comm_map da máquina ativa e atualiza agrupamentos por IP."""
        try:
            if not self.active_config:
                return False, 'Nenhuma máquina ativa'
            machine_name = self.active_config.get('name')
            if not machine_name:
                return False, 'Máquina ativa sem nome'
            comm_map_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'comm_map')
            comm_map_file = os.path.join(comm_map_dir, f'{machine_name}.json')
            if not os.path.exists(comm_map_file):
                return False, f'Arquivo não encontrado: {comm_map_file}'
            with open(comm_map_file, 'r', encoding='utf-8') as f:
                comm_map = json.load(f)
            self.comm_map_by_machine[machine_name] = comm_map
            # Reagrupa tags por IP somente da máquina ativa
            self.tags_by_plc_ip = {}
            self._group_tags_by_plc_ip(machine_name, comm_map, self.active_config)
            print(f"[PLC] 🔄 Comm_map recarregado para {machine_name}: {len(comm_map)} tags")
            return True, 'ok'
        except Exception as e:
            return False, str(e)
    
    def _group_tags_by_plc_ip(self, machine_name, comm_map, machine_config):
        """Agrupa tags por IP do PLC"""
        default_ip = machine_config.get('default_plc_ip')
        
        for tag in comm_map:
            # Se a tag tem plc_ip específico, usa ele; senão usa o IP padrão da máquina
            plc_ip = tag.get('plc_ip', default_ip)
            
            if plc_ip:
                if plc_ip not in self.tags_by_plc_ip:
                    self.tags_by_plc_ip[plc_ip] = []
                self.tags_by_plc_ip[plc_ip].append(tag)
        
        # Log dos IPs encontrados
        for ip, tags in self.tags_by_plc_ip.items():
            if ip == default_ip:
                print(f"[PLC] {machine_name}: {len(tags)} tags para IP padrão {ip}")
            else:
                print(f"[PLC] {machine_name}: {len(tags)} tags para IP adicional {ip}")

    def _get_allowed_ips(self, machine_config):
        """Retorna até 2 IPs permitidos para comunicação simultânea:
        - IP principal (default_plc_ip)
        - Um único IP adicional cujo terceiro octeto seja 110 e compartilhe os dois primeiros octetos
        com o IP principal, e que exista em tags_by_plc_ip.
        """
        default_ip = machine_config.get('default_plc_ip')
        allowed = []
        if default_ip:
            allowed.append(default_ip)

        def _split(ip):
            try:
                parts = [int(p) for p in str(ip).split('.')]
                if len(parts) == 4:
                    return parts
            except Exception:
                pass
            return None

        base = _split(default_ip)
        if base:
            for ip in self.tags_by_plc_ip.keys():
                if ip == default_ip:
                    continue
                parts = _split(ip)
                if not parts:
                    continue
                if parts[0] == base[0] and parts[1] == base[1] and parts[2] == 110:
                    allowed.append(ip)
                    break  # apenas um adicional

        # Garante unicidade e mantém ordem
        seen = set()
        ordered = []
        for ip in allowed:
            if ip and ip not in seen:
                seen.add(ip)
                ordered.append(ip)
        return ordered

    def set_active_machine(self, cfg):
        """Troca a máquina ativa, cria drivers para todos os IPs e inicia polling."""
        with self._lock:
            self._stop_polling()

            # Desconecta todos os drivers existentes
            for ip, driver in self.multi_drivers.items():
                try:
                    driver.disconnect()
                except Exception:
                    pass
            self.multi_drivers = {}
            
            if self.driver:
                try:
                    self.driver.disconnect()
                except Exception:
                    pass
                self.driver = None

            self.active_config = cfg
            
            # Adiciona o comm_map à configuração antes de criar o driver
            machine_name = cfg.get('name')
            if machine_name in self.comm_map_by_machine:
                cfg_with_comm_map = cfg.copy()
                cfg_with_comm_map['comm_map'] = self.comm_map_by_machine[machine_name]
                print(f"[PLC] Comm map adicionado para {machine_name}: {len(cfg_with_comm_map['comm_map'])} tags")
            else:
                cfg_with_comm_map = cfg
                print(f"[PLC] ⚠️ Comm map não encontrado para {machine_name}")
                return False, "Comm map não encontrado"
            
            # Reagrupa tags por IP somente da máquina ativa
            self.tags_by_plc_ip = {}
            self._group_tags_by_plc_ip(machine_name, cfg_with_comm_map['comm_map'], cfg_with_comm_map)

            # Seleciona até 2 IPs permitidos (principal + 110)
            target_ips = self._get_allowed_ips(cfg_with_comm_map)
            # Cria drivers somente para os IPs permitidos
            connected_ips = []
            default_ip = cfg_with_comm_map.get('default_plc_ip')
            for plc_ip in target_ips:
                try:
                    print(f"[PLC] Criando driver para IP {plc_ip}")
                    # Verifica se IP está alcançável rapidamente para evitar longas esperas
                    try:
                        from ..utils import ping_ip
                        # Para o IP principal, tentamos mesmo sem ping responder (muitos PLCs bloqueiam ICMP)
                        if plc_ip != default_ip:
                            if not ping_ip(plc_ip, timeout_ms=1200):
                                print(f"[PLC] ⚠️ IP adicional {plc_ip} não alcançável (ping). Ignorando criação de driver.")
                                continue
                    except Exception:
                        # Se ping falhar por algum motivo, prossegue (fallback)
                        pass
                    
                    # Cria configuração específica para este IP
                    ip_cfg = cfg_with_comm_map.copy()
                    ip_cfg['default_plc_ip'] = plc_ip
                    ip_cfg['name'] = f"{machine_name}_{plc_ip.replace('.', '_')}"
                    
                    # Cria driver
                    driver = create_driver_for_config(ip_cfg)
                    
                    # Tenta conectar
                    connected = driver.connect()
                    if connected:
                        self.multi_drivers[plc_ip] = driver
                        connected_ips.append(plc_ip)
                        print(f"[PLC] ✅ Driver conectado para {plc_ip}")
                    else:
                        print(f"[PLC] ❌ Falha na conexão para {plc_ip}")
                        try:
                            driver.disconnect()
                        except Exception:
                            pass
                        
                except Exception as e:
                    print(f"[PLC] ❌ Erro ao criar driver para {plc_ip}: {e}")
            
            if not connected_ips:
                print(f"[PLC] ❌ Nenhum driver conectado para {machine_name}")
                return False, "Nenhum PLC conectado"
            
            # Mantém o driver principal para compatibilidade (IP padrão)
            default_ip = cfg.get('default_plc_ip')
            if default_ip in self.multi_drivers:
                self.driver = self.multi_drivers[default_ip]
            
            print(f"[PLC] ✅ {len(connected_ips)} drivers conectados: {connected_ips}")

            # Emite evento socketio para front
            try:
                if self.socketio:
                    self.socketio.emit('machine_changed', {
                        'name': cfg['name'],
                        'connected': len(connected_ips) > 0,
                        'connected_ips': connected_ips
                    })
                    # Força reload da página para reconhecer nova máquina
                    self.socketio.emit('force_reload', {'reason': 'machine_changed', 'machine': cfg['name']})
            except Exception:
                pass

            self._start_polling()
            print("[PLC] Polling iniciado")
            return True, 'ok'
    
    def start_polling_if_needed(self):
        """Inicia o polling se ainda não foi iniciado (para casos sem driver inicial)"""
        if not self._poll_thread or not self._poll_thread.is_alive():
            self._start_polling()
            print("[PLC] Polling iniciado (sem driver inicial)")

    def _start_polling(self):
        self._stop_event.clear()
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()
        # Inicia também o loop crítico de baixa latência (apenas se habilitado)
        if self._critical_enabled:
            self._critical_stop_event.clear()
            if not self._critical_thread or not self._critical_thread.is_alive():
                self._critical_thread = threading.Thread(target=self._critical_loop, daemon=True)
                self._critical_thread.start()

    def _stop_polling(self):
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=1)
        self._poll_thread = None
        # Para loop crítico
        self._critical_stop_event.set()
        if self._critical_thread and self._critical_thread.is_alive():
            self._critical_thread.join(timeout=1)
        self._critical_thread = None

    def _is_critical_tag_name(self, name: str) -> bool:
        try:
            n = (name or '').upper()
            if not n:
                return False
            # Palavras-chave de alarme/estado
            critical_kw = (
                'ALARME', 'ALARM', 'EMERG', 'EMERGENCY', 'ERRO', 'ERROR',
                'ESTADO', 'STATE', 'STATUS', 'FALHA', 'FAULT',
                'DB10', 'DB104'
            )
            # Velocidade em tempo real
            speed_kw = ('VEL', 'VELOC', 'SPEED')
            return any(k in n for k in critical_kw) or any(k in n for k in speed_kw)
        except Exception:
            return False

    def _select_critical_defs(self, all_defs, subscribed_names):
        # Filtra por nomes subscritos (quando fornecido) e por heurística de críticos
        try:
            names_set = set(subscribed_names or [])
            selected = []
            for tag in (all_defs or []):
                name = tag.get('name')
                if names_set and name not in names_set:
                    continue
                if self._is_critical_tag_name(name):
                    selected.append(tag)
                # Limite de segurança para evitar sobrecarga
                if len(selected) >= 120:
                    break
            # Se nada bateu, pega pequenos subconjuntos úteis
            if not selected:
                # tenta velocidade e alguns estados
                fallback = []
                for tag in (all_defs or []):
                    name = tag.get('name', '')
                    if any(k in name.upper() for k in ('VEL', 'VELOC', 'SPEED', 'DB10', 'DB104')):
                        fallback.append(tag)
                        if len(fallback) >= 40:
                            break
                selected = fallback
            return selected
        except Exception:
            return []

    def _critical_loop(self):
        """Loop de varredura crítica com baixa latência para alarmes e velocidade.
        Não substitui o loop principal; apenas entrega respostas rápidas.
        """
        print("[PLC] ⚡ Iniciando loop crítico (baixa latência)")
        while not self._critical_stop_event.is_set() and self._critical_enabled:
            start = time.time()
            try:
                # Requisitos mínimos: cliente ativo e driver conectado
                subscribed = self.get_subscribed_tags()
                if not subscribed or not self.driver or not self.driver.is_connected():
                    time.sleep(self._critical_interval_sec)
                    continue

                # Seleciona defs críticos da máquina ativa
                machine = self.active_config.get('name') if self.active_config else None
                if not machine:
                    time.sleep(self._critical_interval_sec)
                    continue
                all_defs = self.comm_map_by_machine.get(machine, [])
                critical_defs = self._select_critical_defs(all_defs, subscribed)
                if not critical_defs:
                    time.sleep(self._critical_interval_sec)
                    continue

                # Leitura serializada (Snap7)
                # Hard cap: evita leituras muito grandes em alta frequência
                max_batch = 50
                subset = critical_defs[:max_batch]

                with self._io_lock:
                    values = self.driver.read_tags(subset)

                if values:
                    telemetry = {'plc_connected': True, 'timestamp': time.time()}
                    telemetry.update(values)
                    # Processa alarmes rapidamente
                    try:
                        active_alarms = alarm_processor.process_alarm_data(telemetry, machine)
                        alarm_summary = alarm_processor.get_alarm_summary(active_alarms)
                        telemetry['active_alarms'] = active_alarms
                        telemetry['alarm_summary'] = alarm_summary
                    except Exception:
                        pass
                    # Emite atualização crítica (throttle ~300ms)
                    try:
                        if self.socketio:
                            now_emit = time.time()
                            if (now_emit - self._last_emit_ts) >= 0.3:
                                self._last_emit_ts = now_emit
                                self.socketio.emit('telemetry', telemetry)
                    except Exception:
                        pass
            except Exception as e:
                print(f"[PLC] ⚠️ Erro no loop crítico: {e}")
            finally:
                # Mantém o período alvo
                elapsed = time.time() - start
                delay = max(0.0, self._critical_interval_sec - elapsed)
                if delay > 0:
                    time.sleep(delay)

    def read_tags(self, names=None):
        """Leitura de tags pelo comm_map com sistema robusto de recuperação"""
        if not self.driver or not self.active_config:
            print(f"[PLC] ❌ Nenhum driver ativo para leitura de tags")
            return {}
        
        # Verifica se está em cooldown por muitos erros de Address out of range
        current_time = time.time()
        if (self._address_error_count >= self._max_address_errors and 
            current_time - self._last_address_error_time < self._address_error_cooldown):
            print(f"[PLC] ⏳ Em cooldown por erros de Address out of range - retornando cache")
            return self._get_cached_tags(names)
        
        machine = self.active_config.get('name')
        tag_defs = self.comm_map_by_machine.get(machine, [])
        
        if names:
            names_set = set(names)
            tag_defs = [t for t in tag_defs if t.get('name') in names_set]
        
        if not tag_defs:
            return {}
        
        # Cache disponível
        cached = self._get_cached_tags(names)
        
        # Usa cache somente em condições específicas (cooldown ou saúde muito baixa)
        in_cooldown = (
            self._address_error_count >= self._max_address_errors and
            (current_time - self._last_address_error_time) < self._address_error_cooldown
        )
        if in_cooldown and cached:
            print(f"[PLC] 📦 Cache por cooldown de Address out of range ({self._connection_health_score}%)")
            return cached
        if self._connection_health_score < 40 and cached and (current_time - self._last_good_timestamp) < 10.0:
            print(f"[PLC] 📦 Cache por baixa saúde de conexão ({self._connection_health_score}%)")
            return cached
        
        # Se todas as tags solicitadas estão no cache e conexão está estável, retorna cache
        if (names and cached and len(cached) == len(names) and 
            self._connection_health_score > 80 and 
            current_time - self._last_good_timestamp < 2.0):
            return cached

        # Filtra tags problemáticas antes de ler do PLC
        filtered_defs = self._filter_problematic_tags(tag_defs, current_time)
        
        # Lê do PLC apenas o que não está cacheado e não é problemático
        with self._io_lock:
            try:
                # Se houver names, filtra os defs faltantes; senão lê todos defs
                missing_defs = filtered_defs
                if names and cached:
                    missing_set = set([t.get('name') for t in filtered_defs if t.get('name') not in cached])
                    missing_defs = [t for t in filtered_defs if t.get('name') in missing_set]
                
                if not missing_defs:
                    return cached
                
                result = self.driver.read_tags(missing_defs)
                
                # Atualiza cache com novos valores
                if result:
                    self._last_good_telemetry.update(result)
                    self._last_good_timestamp = current_time
                    self._last_successful_read = current_time  # Atualiza timestamp de sucesso
                    self._update_connection_health(True)
                    self._address_error_count = 0  # Reset contador de erros em sucesso
                    self._connection_persistent = True  # Ativa modo persistente
                    
                    # Remove tags do filtro se leitura foi bem-sucedida
                    for tag_name in result.keys():
                        if tag_name in self._problematic_tags:
                            self._problematic_tags.discard(tag_name)
                            self._tag_error_count.pop(tag_name, None)
                
                if cached:
                    cached.update(result or {})
                    return cached
                return result
                
            except Exception as e:
                error_msg = str(e)
                print(f"[PLC] ❌ Erro na leitura de tags: {e}")
                
                # Trata especificamente erros de Address out of range
                if "Address out of range" in error_msg or "Item not available" in error_msg:
                    self._handle_address_error(current_time)
                    # Marca tags específicas como problemáticas
                    self._mark_tags_as_problematic(missing_defs, current_time)
                
                self._update_connection_health(False)
                # Retorna cache parcial se existir para evitar queda total
                return cached
    
    def _get_cached_tags(self, names=None):
        """Retorna tags do cache"""
        cached = {}
        try:
            if names:
                for n in names:
                    if n in self._last_good_telemetry and self._last_good_telemetry[n] is not None:
                        cached[n] = self._last_good_telemetry[n]
            else:
                cached = self._last_good_telemetry.copy()
        except Exception:
            cached = {}
        return cached
    
    def _handle_address_error(self, current_time):
        """Trata erros de Address out of range"""
        self._address_error_count += 1
        self._last_address_error_time = current_time
        
        print(f"[PLC] ⚠️ Erro de Address out of range #{self._address_error_count}")
        
        if self._address_error_count >= self._max_address_errors:
            print(f"[PLC] 🚫 Muitos erros de Address out of range - ativando cooldown de {self._address_error_cooldown}s")
            # Força reconexão após cooldown
            threading.Timer(self._address_error_cooldown, self._force_reconnect_after_cooldown).start()
            
            # Notifica frontend sobre problemas de conexão
            if self.socketio:
                self.socketio.emit('plc_connection_changed', {
                    'connected': False, 
                    'reason': 'Address out of range errors',
                    'cooldown': self._address_error_cooldown
                })
    
    def _force_reconnect_after_cooldown(self):
        """Força reconexão após cooldown de erros de Address out of range"""
        print(f"[PLC] 🔄 Forçando reconexão após cooldown de Address out of range")
        self._address_error_count = 0
        self._connection_health_score = 50  # Score baixo para forçar reconexão
        if self.driver:
            try:
                self.driver.disconnect()
            except:
                pass
            self.driver = None
    
    def _update_connection_health(self, success):
        """Atualiza score de saúde da conexão"""
        if success:
            self._connection_health_score = min(100, self._connection_health_score + 5)
            self._stable_connection_duration += 1
        else:
            self._connection_health_score = max(0, self._connection_health_score - 10)
            self._stable_connection_duration = 0
        
        # Log periódico do status
        current_time = time.time()
        if current_time - self._last_health_check > self._health_check_interval:
            self._last_health_check = current_time
            status = "🟢" if self._connection_health_score > 80 else "🟡" if self._connection_health_score > 50 else "🔴"
            print(f"[PLC] {status} Saúde da conexão: {self._connection_health_score}% | Estável: {self._stable_connection_duration}s")
    
    def _filter_problematic_tags(self, tag_defs, current_time):
        """Filtra tags que causaram erros de Address out of range"""
        filtered = []
        for tag_def in tag_defs:
            tag_name = tag_def.get('name')
            if tag_name in self._problematic_tags:
                # Verifica se ainda está no período de filtro
                if (current_time - self._tag_error_count.get(tag_name, {}).get('last_error', 0)) < self._tag_filter_duration:
                    print(f"[PLC] 🚫 Filtrando tag problemática: {tag_name}")
                    continue
                else:
                    # Remove do filtro se passou o tempo
                    self._problematic_tags.discard(tag_name)
                    self._tag_error_count.pop(tag_name, None)
            filtered.append(tag_def)
        return filtered
    
    def _mark_tags_as_problematic(self, tag_defs, current_time):
        """Marca tags como problemáticas após erro de Address out of range"""
        for tag_def in tag_defs:
            tag_name = tag_def.get('name')
            if tag_name:
                if tag_name not in self._tag_error_count:
                    self._tag_error_count[tag_name] = {'count': 0, 'last_error': 0}
                
                self._tag_error_count[tag_name]['count'] += 1
                self._tag_error_count[tag_name]['last_error'] = current_time
                
                if self._tag_error_count[tag_name]['count'] >= self._max_tag_errors:
                    self._problematic_tags.add(tag_name)
                    print(f"[PLC] 🚫 Marcando tag como problemática: {tag_name} (erros: {self._tag_error_count[tag_name]['count']})")

    def write_tags(self, tag_values):
        """Escrita de tags no PLC"""
        if not self.driver or not self.active_config:
            print(f"[PLC] ❌ Nenhum driver ativo para escrita de tags")
            return False
        
        if not tag_values:
            return True
        
        with self._io_lock:
            try:
                result = self.driver.write_tags(tag_values)
                return result
            except Exception as e:
                print(f"[PLC] Erro na escrita de tags: {e}")
                return False

    def _poll_loop(self):
        """Loop de polling contínuo para telemetria - versão ultra estável"""
        print("[PLC] 🔄 Iniciando loop de polling")
        
        while not self._stop_event.is_set():
            try:
                current_time = time.time()
                
                # SOLUÇÃO DEFINITIVA: Verifica se há clientes ativos primeiro
                subscribed_tags = self.get_subscribed_tags()
                
                if not subscribed_tags:
                    # Sem clientes ativos - mantém desconectado
                    print("[PLC] 📭 Sem clientes ativos - drivers desconectados")
                    time.sleep(10.0)  # Verifica a cada 10s
                    continue
                
                # Há clientes ativos - verifica se precisa conectar
                if not self.driver:
                    print("[PLC] 🔌 Clientes ativos detectados - detectando PLC...")
                    self._handle_no_connection(current_time)
                    time.sleep(3.0)
                    continue
                
                if not self.driver.is_connected():
                    print("[PLC] 🔌 Clientes ativos - reconectando driver...")
                    if self._try_reconnect():
                        print("[PLC] ✅ Reconectado com sucesso")
                    else:
                        print("[PLC] ❌ Falha na reconexão - aguardando...")
                        time.sleep(5.0)
                        continue
                
                # Driver conectado e clientes ativos - lê dados
                # VERIFICAÇÃO DUPLA: Só lê se realmente há clientes ativos
                if self.get_subscribed_tags():
                    self._handle_connected_reading(current_time)
                else:
                    print("[PLC] 📭 Clientes desconectaram durante a verificação - pulando leitura")
                
                # Verifica se deve sair do modo mock
                self._check_mock_mode_timeout()
                
                # Intervalo de polling balanceado
                time.sleep(3.0)
                
            except Exception as e:
                print(f"[PLC] ❌ Erro no loop de polling: {e}")
                time.sleep(3.0)
        
        print("[PLC] 🛑 Loop de polling finalizado")
    
    def _handle_no_connection(self, current_time):
        """Lida com situações onde não há conexão ativa"""
        # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, não faz nada
        subscribed_tags = self.get_subscribed_tags()
        if not subscribed_tags:
            print("[PLC] 📭 Nenhum cliente ativo - pulando detecção e reconexão")
            return
        
        # Verifica se deve tentar detectar PLCs
        should_detect = (current_time - self._last_plc_detection) >= self._plc_detection_interval
        
        if should_detect:
            print("[PLC] 🔍 Verificando PLCs disponíveis...")
            self._last_plc_detection = current_time
            
            if self._detect_and_switch_to_available_plc():
                print("[PLC] ✅ PLC detectado e conectado")
                return
        
        # Se tem driver mas está desconectado, tenta reconectar
        if self.driver:
            should_retry = (current_time - self._last_connection_attempt) >= self._connection_retry_interval
            
            if should_retry or self._consecutive_failures >= self._max_consecutive_failures:
                print(f"[PLC] 🔄 Tentando reconectar (falha {self._consecutive_failures}/{self._max_consecutive_failures})")
                self._last_connection_attempt = current_time
                
                if self._try_reconnect():
                    print("[PLC] ✅ Reconexão bem-sucedida!")
                    self._consecutive_failures = 0
                else:
                    print("[PLC] ❌ Falha na reconexão")
    
    def _handle_connected_reading(self, current_time):
        
        """Lê dados quando conectado com cache de últimos valores e debounce de desconexão"""
        try:
            telemetry = {'plc_connected': True, 'timestamp': current_time}
            connected_plcs = 0
            
            # Obtém apenas tags subscritas pelos clientes ativos
            subscribed_tags = self.get_subscribed_tags()
            
            # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, NÃO FAZ NADA
            if not subscribed_tags:
                print("[PLC] 📭 NENHUM CLIENTE ATIVO - PULANDO COMPLETAMENTE A LEITURA")
                return True
            
            # SOLUÇÃO DEFINITIVA: Driver principal só lê se há clientes ativos
            if self.driver and self.driver.is_connected():
                try:
                    # Lê apenas tags subscritas do driver principal
                    main_data = self._read_subscribed_tags_from_driver(self.driver, subscribed_tags, "principal")
                    if main_data:
                        telemetry.update(main_data)
                        connected_plcs += 1
                        print(f"[PLC] 📊 Driver principal: {len(main_data)} tags lidas")
                    else:
                        print(f"[PLC] 📭 Driver principal: nenhuma tag subscrita")
                except Exception as e:
                    print(f"[PLC] ⚠️ Driver principal: {e}")
                    if self.driver and self.driver.is_connected():
                        connected_plcs += 1
            
            # Lê dados de drivers múltiplos (apenas se houver)
            machine = self.active_config.get('name') if self.active_config else None
            
            # SOLUÇÃO DEFINITIVA: Só lê drivers múltiplos se há clientes ativos
            if subscribed_tags:
                for plc_ip, driver in self.multi_drivers.items():
                    if driver and driver.is_connected():
                        try:
                            all_tag_defs = self.tags_by_plc_ip.get(plc_ip, [])
                            if all_tag_defs:
                                # Filtra apenas tags que estão sendo subscritas
                                tag_defs = [tag for tag in all_tag_defs if tag.get('name') in subscribed_tags]
                                if not tag_defs:
                                    print(f"[PLC] 📭 Nenhuma tag subscrita para IP {plc_ip} - pulando leitura")
                                    continue
                                print(f"[PLC] 🎯 Lendo {len(tag_defs)}/{len(all_tag_defs)} tags subscritas do IP {plc_ip}")
                                
                                # Se está em modo mock devido a muitos erros, usa dados simulados
                                if self._mock_mode_active:
                                    ip_data = self._generate_mock_data(tag_defs)
                                    print(f"[PLC] 🎭 Usando dados mock para {plc_ip} (PLC sobrecarregado)")
                                else:
                                    # Lê em lotes menores para reduzir carga
                                    ip_data = self._read_tags_in_batches(driver, tag_defs, plc_ip)
                                
                                if ip_data:
                                    telemetry.update(ip_data)
                                    connected_plcs += 1
                                    # Reset contador de erros se leitura bem-sucedida
                                    if not self._mock_mode_active:
                                        self._job_pending_errors = max(0, self._job_pending_errors - 2)
                        except Exception as e:
                            error_msg = str(e)
                            if "CLI : Job pending" in error_msg:
                                self._job_pending_errors += 1
                                if self._job_pending_errors >= self._max_job_pending_before_mock:
                                    self._activate_mock_mode()
                            
                            print(f"[PLC] ⚠️ IP {plc_ip}: {e}")
                            # Mesmo com erro, considera conectado se o driver ainda está conectado
                            if driver and driver.is_connected():
                                connected_plcs += 1
            
            # SOLUÇÃO DEFINITIVA: Só processa se há clientes ativos
            if subscribed_tags and connected_plcs > 0:
                telemetry['connected_plcs'] = connected_plcs
                # Se não veio quase dado nenhum das leituras (muitos None), usa cache anterior
                has_meaningful_data = any(v is not None for k, v in telemetry.items() if k not in ('plc_connected','timestamp','connected_plcs'))
                if has_meaningful_data:
                    self._last_good_telemetry = telemetry.copy()
                    self._last_good_timestamp = current_time
                    self._empty_reads_in_row = 0
                else:
                    self._empty_reads_in_row += 1
                    # Reutiliza últimos dados bons por até 5 segundos
                    if current_time - self._last_good_timestamp <= 5.0 and self._last_good_telemetry:
                        telemetry = self._last_good_telemetry.copy()
                        telemetry['timestamp'] = current_time
                        telemetry['stale'] = True
                    
                # Processa alarmes se conectado
                if machine:
                    try:
                        active_alarms = alarm_processor.process_alarm_data(telemetry, machine)
                        alarm_summary = alarm_processor.get_alarm_summary(active_alarms)
                        
                        telemetry['active_alarms'] = active_alarms
                        telemetry['alarm_summary'] = alarm_summary
                        
                        if len(active_alarms) > 0:
                            print(f"[ALARM] 🚨 {len(active_alarms)} alarmes ativos")
                    except Exception as e:
                        print(f"[ALARM] ❌ Erro no processamento de alarmes: {e}")
                        telemetry['active_alarms'] = []
                        telemetry['alarm_summary'] = {"emergency": 0, "drives": 0, "thermal": 0, "hardware": 0, "process": 0, "total": 0}
                
                    # Envia dados via Socket.IO
                    if self.socketio:
                        self.socketio.emit('telemetry', telemetry)
                        
                        # Notifica mudança de estado de conexão
                        if self._plc_connected_state is None or not self._plc_connected_state:
                            self._plc_connected_state = True
                            self.socketio.emit('plc_connection_changed', {'connected': True})
                            print("[PLC] 🔔 Notificando frontend: PLC conectado")
                    
                    return True
                else:
                    # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, não faz nada
                    print("[PLC] 📭 Nenhum cliente ativo - pulando processamento")
                    return True
                
        except Exception as e:
            print(f"[PLC] ❌ Erro na leitura de dados: {e}")
            # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, não faz nada
            subscribed_tags = self.get_subscribed_tags()
            if not subscribed_tags:
                print("[PLC] 📭 Nenhum cliente ativo - pulando processamento de erro")
                return True
            return False

    def _try_reconnect(self):
        """Tenta reconectar o driver se ele estiver desconectado - versão simplificada"""
        # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, não reconecta
        subscribed_tags = self.get_subscribed_tags()
        if not subscribed_tags:
            print("[PLC] 📭 Nenhum cliente ativo - pulando reconexão")
            return True
        
        if not self.active_config:
            print("[PLC] ❌ Nenhuma configuração ativa para reconexão")
            return False
        
        try:
            print("[PLC] 🔄 Tentativa de reconexão...")
            
            # Força desconexão completa
            if self.driver:
                try:
                    self.driver.disconnect()
                except Exception:
                    pass
                self.driver = None
            
            # Desconecta drivers múltiplos
            for ip, driver in self.multi_drivers.items():
                try:
                    driver.disconnect()
                except Exception:
                    pass
            self.multi_drivers = {}
            
            # Aguarda um pouco
            time.sleep(1.0)
            
            # Tenta reconectar usando o método set_active_machine
            success, message = self.set_active_machine(self.active_config)
            
            if success:
                print("[PLC] ✅ Reconexão bem-sucedida")
                return True
            else:
                print(f"[PLC] ❌ Falha na reconexão: {message}")
                return False
                
        except Exception as e:
            print(f"[PLC] ❌ Erro na reconexão: {e}")
            # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, não faz nada
            subscribed_tags = self.get_subscribed_tags()
            if not subscribed_tags:
                print("[PLC] 📭 Nenhum cliente ativo - pulando processamento de erro de reconexão")
                return True
            return False
    
    def force_reconnect(self):
        """Força uma tentativa de reconexão imediata"""
        # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, não reconecta
        subscribed_tags = self.get_subscribed_tags()
        if not subscribed_tags:
            print("[PLC] 📭 Nenhum cliente ativo - pulando reconexão forçada")
            return True, "Nenhum cliente ativo - reconexão desnecessária"
        
        if not self.active_config:
            return False, "Nenhuma máquina ativa configurada"
        
        print("[PLC] Reconexão forçada solicitada")
        self._last_connection_attempt = 0  # Reset do timer para tentar imediatamente
        success = self._try_reconnect()
        
        if success:
            return True, "Reconexão bem-sucedida"
        else:
            return False, "Falha na reconexão"
    
    def _detect_and_switch_to_available_plc(self):
        """Detecta PLCs disponíveis e troca automaticamente se encontrar um melhor"""
        # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, não detecta
        subscribed_tags = self.get_subscribed_tags()
        if not subscribed_tags:
            print("[PLC] 📭 Nenhum cliente ativo - pulando detecção de PLC")
            return True
        
        try:
            from ..utils import detect_by_reachable_plc
            
            # Detecta PLCs disponíveis
            detected_name, reachable_plcs = detect_by_reachable_plc(self.machines_config)
            
            if not detected_name:
                return False
            
            # Verifica se o PLC detectado é diferente do atual
            current_machine = self.active_config.get('name') if self.active_config else None
            
            # Se não há driver inicial ou se detectou um PLC diferente
            if not self.driver or detected_name != current_machine:
                if not self.driver:
                    print(f"[PLC] Detectado PLC disponível: {detected_name} (sem driver inicial)")
                else:
                    print(f"[PLC] Detectado PLC disponível: {detected_name} (atual: {current_machine})")
                
                # Encontra a configuração da máquina detectada
                new_config = next((m for m in self.machines_config if m['name'] == detected_name), None)
                
                if new_config:
                    print(f"[PLC] Configuração encontrada para {detected_name}: IP={new_config.get('default_plc_ip')}")
                    if not self.driver:
                        print(f"[PLC] Criando driver para {detected_name}")
                    else:
                        print(f"[PLC] Trocando automaticamente para {detected_name}")
                    
                    # Cria o driver diretamente na thread de polling (mais simples)
                    print(f"[PLC] PLC {detected_name} detectado - criando driver diretamente")
                    try:
                        # Cria o driver sem usar set_active_machine para evitar threading
                        from ..plc_drivers import create_driver_for_config
                        
                        # Para o polling atual
                        self._stop_polling()
                        
                        # Limpa driver atual se existir
                        if self.driver:
                            try:
                                self.driver.disconnect()
                            except Exception:
                                pass
                            self.driver = None
                        
                        # Adiciona o comm_map à configuração
                        machine_name = new_config.get('name')
                        if machine_name in self.comm_map_by_machine:
                            new_config_with_comm_map = new_config.copy()
                            new_config_with_comm_map['comm_map'] = self.comm_map_by_machine[machine_name]
                            print(f"[PLC] Comm map adicionado para {machine_name}: {len(new_config_with_comm_map['comm_map'])} tags")
                        else:
                            new_config_with_comm_map = new_config
                            print(f"[PLC] ⚠️ Comm map não encontrado para {machine_name}")
                        
                        # Cria novo driver
                        self.active_config = new_config
                        self.driver = create_driver_for_config(new_config_with_comm_map)
                        print(f"[PLC] Driver criado para {detected_name}")
                        
                        # Conecta
                        connected = self.driver.connect()
                        if connected:
                            print(f"[PLC] ✅ Driver conectado com sucesso para {detected_name}")
                            
                            # Emite eventos para o frontend
                            if self.socketio:
                                try:
                                    print(f"[PLC] 🔔 Emitindo eventos Socket.IO para {detected_name}")
                                    self.socketio.emit('plc_detected', {
                                        'machine': detected_name,
                                        'ip': new_config.get('default_plc_ip'),
                                        'message': f'PLC {detected_name} detectado e conectado automaticamente',
                                        'timestamp': time.time()
                                    })
                                    print(f"[PLC] 🎯 Frontend notificado sobre detecção de {detected_name}")
                                except Exception as e:
                                    print(f"[PLC] ❌ Erro ao notificar frontend: {e}")
                            
                            # Reinicia o polling
                            self._start_polling()
                            return True
                        else:
                            print(f"[PLC] ❌ Falha na conexão para {detected_name}")
                            self.driver = None
                            self._start_polling()
                            return False
                            
                    except Exception as e:
                        print(f"[PLC] ❌ Erro ao criar driver para {detected_name}: {e}")
                        self.driver = None
                        self._start_polling()
                        return False
            
            return False
            
        except Exception as e:
            print(f"[PLC] Erro na detecção automática: {e}")
            # SOLUÇÃO DEFINITIVA: Se não há clientes ativos, não faz nada
            subscribed_tags = self.get_subscribed_tags()
            if not subscribed_tags:
                print("[PLC] 📭 Nenhum cliente ativo - pulando processamento de erro de detecção")
                return True
            return False
    
    def _read_subscribed_tags_from_driver(self, driver, subscribed_tags, driver_name):
        """Lê apenas tags subscritas de um driver específico"""
        try:
            # SOLUÇÃO DEFINITIVA: Se não há tags subscritas, NÃO FAZ NADA
            if not subscribed_tags:
                return {}
            
            # SOLUÇÃO DEFINITIVA: Se não há driver, NÃO FAZ NADA
            if not driver:
                return {}
            
            # Encontra as definições das tags subscritas para este driver
            all_tag_defs = []
            if driver_name == "principal":
                # Para driver principal, busca em todas as configurações
                for machine_name, config in self.machines_config.items():
                    comm_map = config.get('comm_map', {})
                    if comm_map:
                        all_tag_defs.extend(comm_map.get('tags', []))
            else:
                # Para drivers múltiplos, busca no IP específico
                all_tag_defs = self.tags_by_plc_ip.get(driver_name, [])
            
            # Filtra apenas as tags subscritas
            subscribed_defs = [tag for tag in all_tag_defs if tag.get('name') in subscribed_tags]
            
            # SOLUÇÃO DEFINITIVA: Se não há tags subscritas, NÃO FAZ NADA
            if not subscribed_defs:
                return {}
            
            # SOLUÇÃO DEFINITIVA: Se não há driver conectado, NÃO FAZ NADA
            if not driver.is_connected():
                return {}
            
            # Lê apenas as tags subscritas
            return driver.read_tags(subscribed_defs)
            
        except Exception as e:
            print(f"[PLC] ❌ Erro ao ler tags subscritas do {driver_name}: {e}")
            return {}
    
    def _read_tags_in_batches(self, driver, tag_defs, plc_ip):
        """Lê tags em lotes menores para reduzir carga no PLC"""
        # SOLUÇÃO DEFINITIVA: Se não há tags para ler, NÃO FAZ NADA
        if not tag_defs:
            return {}
        
        # SOLUÇÃO DEFINITIVA: Se não há driver, NÃO FAZ NADA
        if not driver:
            return {}
        
        # SOLUÇÃO DEFINITIVA: Se não há driver conectado, NÃO FAZ NADA
        if not driver.is_connected():
            return {}
        
        # Se há muitos erros Job pending, lê apenas tags críticas
        if self._job_pending_errors > 10:
            critical_tags = self._filter_critical_tags(tag_defs)
            if critical_tags:
                print(f"[PLC] ⚠️ PLC sobrecarregado - lendo apenas {len(critical_tags)} tags críticas de {len(tag_defs)}")
                tag_defs = critical_tags
        
        batch_size = 20  # Lotes muito menores para PLC sobrecarregado
        all_data = {}
        
        for i in range(0, len(tag_defs), batch_size):
            batch = tag_defs[i:i+batch_size]
            try:
                batch_data = driver.read_tags(batch)
                if batch_data:
                    all_data.update(batch_data)
                # Pausa entre lotes para reduzir carga na CPU/PLC
                time.sleep(0.2)
            except Exception as e:
                error_msg = str(e)
                if "CLI : Job pending" in error_msg:
                    self._job_pending_errors += 1
                print(f"[PLC] ⚠️ Erro no lote {i//batch_size + 1} para {plc_ip}: {e}")
                # Para de ler se muitos erros Job pending
                if "CLI : Job pending" in error_msg and self._job_pending_errors > 15:
                    print(f"[PLC] 🛑 Parando leitura - PLC muito sobrecarregado")
                    break
                continue
        
        if all_data:
            print(f"[PLC] 📊 Lidas {len(all_data)} tags do IP {plc_ip} em {len(range(0, len(tag_defs), batch_size))} lotes")
        
        return all_data
    
    def _filter_critical_tags(self, tag_defs):
        """Filtra apenas tags críticas (alarmes e estados importantes)"""
        critical_tags = []
        critical_keywords = [
            'ALARME', 'ALARM', 'EMERG', 'EMERGENCY', 'ERRO', 'ERROR', 
            'ESTADO', 'STATE', 'STATUS', 'FALHA', 'FAULT',
            'PRINCIPAL', 'MAIN', 'CRITICO', 'CRITICAL',
            'DB10_PARTIDA_DIRETA', 'DB104_INFO_DISPOSITIVOS', 'TERMICOS', 'THERMAL'
        ]
        
        for tag in tag_defs:
            name = tag.get('name', '').upper()
            # Prioriza tags de alarme e estados críticos
            if any(keyword in name for keyword in critical_keywords):
                critical_tags.append(tag)
            # Força inclusão de DB10 e DB104 sempre
            elif 'DB10' in name or 'DB104' in name:
                critical_tags.append(tag)
            # Limita a 100 tags críticas máximo
            if len(critical_tags) >= 100:
                break
        
        # Se não encontrou tags críticas, pega as primeiras 50
        if not critical_tags:
            critical_tags = tag_defs[:50]
        
        return critical_tags
    
    def _generate_mock_data(self, tag_defs):
        """Gera dados mock baseados nos últimos dados bons ou padrões"""
        import random
        mock_data = {}
        
        for tag in tag_defs:
            name = tag.get('name')
            tag_type = (tag.get('type') or '').upper()
            
            # Usa último valor bom se disponível
            if name in self._last_good_telemetry:
                last_value = self._last_good_telemetry[name]
                if last_value is not None:
                    # Adiciona pequena variação
                    if isinstance(last_value, (int, float)):
                        variation = last_value * 0.05  # 5% de variação
                        mock_data[name] = last_value + random.uniform(-variation, variation)
                    else:
                        mock_data[name] = last_value
                    continue
            
            # Valores padrão por tipo
            if tag_type == 'BOOL':
                mock_data[name] = random.choice([True, False])
            elif tag_type == 'REAL':
                mock_data[name] = round(random.uniform(0, 100), 2)
            elif tag_type == 'WORD':
                mock_data[name] = random.randint(0, 65535)
            else:
                mock_data[name] = None
        
        return mock_data
    
    def _activate_mock_mode(self):
        """Ativa modo mock temporário quando PLC está sobrecarregado"""
        if not self._mock_mode_active:
            self._mock_mode_active = True
            self._mock_mode_start_time = time.time()
            print(f"[PLC] 🎭 Ativando modo mock - PLC sobrecarregado com {self._job_pending_errors} erros CLI Job pending")
    
    def _check_mock_mode_timeout(self):
        """Verifica se deve sair do modo mock após um tempo"""
        if self._mock_mode_active:
            elapsed = time.time() - self._mock_mode_start_time
            if elapsed > 60.0:  # Tenta voltar ao modo real após 1 minuto
                self._mock_mode_active = False
                self._job_pending_errors = 0
                print("[PLC] 🎭 Saindo do modo mock - tentando comunicação real novamente")
    
    def subscribe_tags(self, client_id, tag_names):
        """Registra quais tags um cliente (tela) precisa receber"""
        with self._subscription_lock:
            current_time = time.time()
            self._active_subscriptions[client_id] = {
                'tags': tag_names,
                'last_heartbeat': current_time
            }
            print(f"[SUB] 📋 Cliente {client_id} subscrito a {len(tag_names)} tags")
            return True
    
    def unsubscribe_client(self, client_id):
        """Remove todas as subscrições de um cliente"""
        with self._subscription_lock:
            if client_id in self._active_subscriptions:
                del self._active_subscriptions[client_id]
                print(f"[SUB] 🗑️ Cliente {client_id} removido das subscrições")
                return True
            return False
    
    def heartbeat_client(self, client_id):
        """Atualiza o heartbeat de um cliente para manter sua subscrição ativa"""
        with self._subscription_lock:
            if client_id in self._active_subscriptions:
                self._active_subscriptions[client_id]['last_heartbeat'] = time.time()
                return True
            return False
    
    def get_subscribed_tags(self):
        """Retorna todas as tags que estão sendo subscritas por algum cliente ativo"""
        with self._subscription_lock:
            current_time = time.time()
            active_tags = set()
            
            # Remove clientes inativos (sem heartbeat)
            expired_clients = []
            for client_id, sub_info in self._active_subscriptions.items():
                if current_time - sub_info['last_heartbeat'] > self._heartbeat_timeout:
                    expired_clients.append(client_id)
                else:
                    active_tags.update(sub_info['tags'])
            
            # Remove clientes expirados
            for client_id in expired_clients:
                del self._active_subscriptions[client_id]
                print(f"[SUB] ⏰ Cliente {client_id} expirado por timeout")
            
            return list(active_tags)
