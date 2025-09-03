# app/services/plc_controller.py
import threading
import time
import json
import os
from ..plc_drivers import create_driver_for_config

class PLCController:
    def __init__(self, socketio, machines_config):
        self.socketio = socketio
        self.machines_config = machines_config
        self.active_config = None
        self.driver = None

        self._poll_thread = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._io_lock = threading.Lock()  # Para serializar acessos Snap7
        self._plc_connected_state = None
        self.comm_map_by_machine = {}
        self._load_comm_maps()
        self._last_connection_attempt = 0
        self._connection_retry_interval = 2.0  # Tenta reconectar a cada 2 segundos quando desconectado
        self._last_plc_detection = 0
        self._plc_detection_interval = 2.0  # Verifica PLCs disponíveis a cada 2 segundos quando sem driver
        self._initial_detection_done = False
        self._stop_detection_when_connected = True  # Para detecção quando conectado

    def _load_comm_maps(self):
        """Carrega os maps de comunicação de todas as máquinas"""
        comm_map_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'comm_map')
        
        for machine_config in self.machines_config:
            machine_name = machine_config.get('name')
            if not machine_name:
                continue
                
            comm_map_file = os.path.join(comm_map_dir, f'{machine_name}.json')
            if os.path.exists(comm_map_file):
                try:
                    with open(comm_map_file, 'r', encoding='utf-8') as f:
                        self.comm_map_by_machine[machine_name] = json.load(f)
                    print(f"[PLC] Carregado comm_map para {machine_name}: {len(self.comm_map_by_machine[machine_name])} tags")
                except Exception as e:
                    print(f"[PLC] Erro ao carregar comm_map para {machine_name}: {e}")
                    self.comm_map_by_machine[machine_name] = []
            else:
                print(f"[PLC] Comm_map não encontrado para {machine_name}: {comm_map_file}")
                self.comm_map_by_machine[machine_name] = []

    def set_active_machine(self, cfg):
        """Troca a máquina ativa, cria driver e inicia polling."""
        with self._lock:
            self._stop_polling()

            if self.driver:
                try:
                    self.driver.disconnect()
                except Exception:
                    pass
                self.driver = None

            self.active_config = cfg
            try:
                print(f"[PLC] Criando driver para {cfg.get('name')} em {cfg.get('default_plc_ip')}")
                # Cria o driver de forma mais segura para threading
                self.driver = create_driver_for_config(cfg)
                
                # Conecta de forma mais robusta
                connected = self.driver.connect()
                print(f"[PLC] Conectado -> {connected}")
                if connected:
                    print(f"[PLC] ✅ Driver criado com sucesso para {cfg.get('name')} ({cfg.get('default_plc_ip')})")
                else:
                    print(f"[PLC] ❌ Falha na conexão para {cfg.get('name')} ({cfg.get('default_plc_ip')})")
                    self.driver = None
                    return False, "Falha na conexão"
            except Exception as e:
                print(f"[PLC] ❌ Erro ao criar driver para {cfg.get('name')}: {e}")
                self.driver = None
                return False, f'Falha ao criar/conectar driver: {e}'

            # Emite evento socketio para front
            try:
                if self.socketio:
                    self.socketio.emit('machine_changed', {
                        'name': cfg['name'],
                        'connected': bool(self.driver and self.driver.is_connected())
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

    def _stop_polling(self):
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=1)
        self._poll_thread = None

    def read_tags(self, names=None):
        """Leitura de tags pelo comm_map"""
        if not self.driver or not self.active_config:
            print(f"[PLC] ❌ Nenhum driver ativo para leitura de tags")
            return {}
        
        machine = self.active_config.get('name')
        
        tag_defs = self.comm_map_by_machine.get(machine, [])
        
        if names:
            names_set = set(names)
            tag_defs = [t for t in tag_defs if t.get('name') in names_set]
        
        if not tag_defs:
            return {}
        
        with self._io_lock:
            try:
                result = self.driver.read_tags(tag_defs)
                return result
            except Exception as e:
                print(f"[PLC] ❌ Erro na leitura de tags: {e}")
                return {}

    def _poll_loop(self):
        """Loop de polling contínuo para telemetria"""
        consecutive_failures = 0
        max_consecutive_failures = 3
        
        while not self._stop_event.is_set():
            try:

                
                # Se não há driver, tenta detectar PLCs disponíveis
                if not self.driver:
                    current_time = time.time()
                    should_detect_plc = (current_time - self._last_plc_detection) >= self._plc_detection_interval
                    
                    if should_detect_plc:
                        print("[PLC] Sem driver - verificando PLCs disponíveis...")
                        self._last_plc_detection = current_time
                        
                        # Tenta detectar e criar driver para um PLC disponível
                        if self._detect_and_switch_to_available_plc():
                            consecutive_failures = 0
                            continue  # Se criou driver com sucesso, continua o loop
                        else:
                            time.sleep(1)  # Aguarda antes da próxima verificação
                            continue
                    else:
                        time.sleep(1)
                        continue
                
                # Verifica se o driver existe e está conectado
                if not self.driver or not self.driver.is_connected():
                    consecutive_failures += 1
                    current_time = time.time()
                    
                    # Reinicia varredura de IPs quando conexão cai
                    should_detect_plc = (current_time - self._last_plc_detection) >= self._plc_detection_interval
                    
                    if should_detect_plc:
                        print("[PLC] Conexão perdida - verificando PLCs disponíveis...")
                        self._last_plc_detection = current_time
                        
                        # Tenta detectar e trocar para um PLC disponível
                        if self._detect_and_switch_to_available_plc():
                            consecutive_failures = 0
                            continue  # Se trocou com sucesso, continua o loop
                    
                    # Tenta reconectar periodicamente quando desconectado
                    should_retry = (current_time - self._last_connection_attempt) >= self._connection_retry_interval
                    
                    if should_retry or consecutive_failures >= max_consecutive_failures:
                        print(f"[PLC] Tentando reconectar (falha {consecutive_failures}/{max_consecutive_failures})")
                        self._last_connection_attempt = current_time
                        
                        if self._try_reconnect():
                            consecutive_failures = 0
                            print("[PLC] Reconexão bem-sucedida!")
                        else:
                            print("[PLC] Falha na reconexão, tentando novamente em 5 segundos...")
                            time.sleep(2)  # Aguarda mais tempo se a reconexão falhou
                    else:
                        time.sleep(1)
                    continue

                # Quando conectado, não faz varredura de IPs - apenas monitora a conexão atual
                # A varredura só será reiniciada se a conexão cair
                # Pula para o final do loop para não fazer mais verificações
                if self._stop_detection_when_connected:
                    time.sleep(0.5)
                    continue

                # Tenta ler dados do PLC
                telemetry = {}
                connection_ok = True
                
                try:
                    with self._io_lock:
                        telemetry = self.driver.read_telemetry() or {}

                        # leitura de tags
                        machine = self.active_config.get('name') if self.active_config else None
                        tag_defs = self.comm_map_by_machine.get(machine, [])
                        if tag_defs:
                            telemetry.update(self.driver.read_tags(tag_defs))
                    
                    # Se chegou até aqui, a conexão está funcionando
                    consecutive_failures = 0
                    
                except Exception as e:
                    print(f"[PLC] Erro na leitura de dados: {e}")
                    connection_ok = False
                    consecutive_failures += 1

                connected_now = bool(self.driver and self.driver.is_connected() and connection_ok)
                telemetry['plc_connected'] = connected_now

                # envia socketio se mudou estado de conexão
                if self.socketio:
                    self.socketio.emit('telemetry', telemetry)
                    if self._plc_connected_state is None or connected_now != self._plc_connected_state:
                        self._plc_connected_state = connected_now
                        self.socketio.emit('plc_connection_changed', {'connected': connected_now})
                        if connected_now:
                            self.socketio.emit('force_reload', {'ts': time.time()})

            except Exception as e:
                print('Polling error:', e)
                consecutive_failures += 1

            time.sleep(0.5)

    def _try_reconnect(self):
        """Tenta reconectar o driver se ele estiver desconectado"""
        if not self.active_config:
            return
        
        max_retries = 3
        retry_delay = 1.0
        
        for attempt in range(max_retries):
            try:
                print(f"[PLC] Tentativa de reconexão {attempt + 1}/{max_retries}")
                
                # Força desconexão completa
                if self.driver:
                    try:
                        self.driver.disconnect()
                    except Exception:
                        pass
                    self.driver = None
                
                # Pequena pausa para garantir que a conexão anterior foi limpa
                time.sleep(0.5)
                
                # Cria novo driver
                self.driver = create_driver_for_config(self.active_config)
                connected = self.driver.connect()
                
                if connected:
                    print(f"[PLC] Reconexão bem-sucedida na tentativa {attempt + 1}")
                    # Emite evento de reconexão
                    if self.socketio:
                        self.socketio.emit('plc_reconnected', {
                            'machine': self.active_config.get('name'),
                            'ip': self.active_config.get('default_plc_ip')
                        })
                    return True
                else:
                    print(f"[PLC] Falha na reconexão tentativa {attempt + 1}")
                    
            except Exception as e:
                print(f"[PLC] Erro na reconexão tentativa {attempt + 1}: {e}")
            
            # Aguarda antes da próxima tentativa (backoff exponencial)
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 2  # Backoff exponencial
        
        print(f"[PLC] Todas as tentativas de reconexão falharam")
        return False
    
    def force_reconnect(self):
        """Força uma tentativa de reconexão imediata"""
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
                        
                        # Cria novo driver
                        self.active_config = new_config
                        self.driver = create_driver_for_config(new_config)
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
            return False
