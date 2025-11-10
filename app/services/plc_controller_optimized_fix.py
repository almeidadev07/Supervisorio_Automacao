# app/services/plc_controller_optimized_fix.py
# Controlador PLC Otimizado - Solução para problemas de "Job pending" e conexão

import threading
import time
import json
import os
from typing import Dict, List, Optional, Any
from collections import defaultdict
import queue

# Importa o driver real do PLC
try:
    from ..plc_drivers import create_driver_for_config
    print("[OPTIMIZED_PLC] ✅ Driver real do PLC importado com sucesso")
except ImportError as e:
    print(f"[OPTIMIZED_PLC] ❌ Erro ao importar driver real: {e}")
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

# Importa o processador de alarmes
try:
    from .alarm_processor import AlarmProcessor
    alarm_processor = AlarmProcessor()
    print("[OPTIMIZED_PLC] ✅ Processador de alarmes importado com sucesso")
except ImportError as e:
    print(f"[OPTIMIZED_PLC] ❌ Erro ao importar processador de alarmes: {e}")
    # Mock do alarm_processor
    class MockAlarmProcessor:
        def process_alarm_data(self, data, machine):
            return []
        
        def get_alarm_summary(self, alarms):
            return {'total': 0, 'critical': 0, 'warning': 0}
    
    alarm_processor = MockAlarmProcessor()

class OptimizedPLCController:
    """
    Controlador PLC Otimizado - Solução para problemas de "Job pending"
    
    Características:
    - Throttling inteligente para evitar sobrecarga do PLC
    - Pool de conexões com rate limiting
    - Cache com TTL para reduzir leituras desnecessárias
    - Tratamento robusto de erros "Job pending"
    - Reconexão automática com backoff exponencial
    - Priorização de operações críticas
    """
    
    def __init__(self, socketio, machines_config):
        print("[OPTIMIZED_PLC] 🔧 Inicializando controlador otimizado...")
        self.socketio = socketio
        self.machines_config = machines_config
        print(f"[OPTIMIZED_PLC] 📊 Configurações de máquinas carregadas: {len(machines_config)} máquinas")
        
        # Estado do controlador
        self._lock = threading.Lock()
        self._active_machine = None
        self._comm_map_by_machine = {}
        self._driver = None
        self._poll_thread = None
        self._stop_event = threading.Event()
        # Subscrições por cliente (para ler apenas o que a tela usa)
        self._subscription_lock = threading.Lock()
        self._active_subscriptions = {}
        self._heartbeat_timeout = 30.0
        
        # Configurações de throttling
        self._last_read_time = 0
        self._min_read_interval = 0.5  # Mínimo 500ms entre leituras
        self._max_reads_per_second = 2  # Máximo 2 leituras por segundo
        
        # Cache inteligente
        self._cache = {}
        self._cache_ttl = 2.0  # TTL de 2 segundos
        self._last_cache_cleanup = 0
        # Buffer de tags solicitadas via API a priorizar no próximo ciclo
        self._extra_read_tags = set()
        # Round-robin por DB para reduzir carga por ciclo
        self._db_index = 0
        self._dbs_per_cycle = 4
        self._critical_dbs = {1, 10, 104}
        self._db_list = []  # preenchido ao ativar máquina
        
        # Controle de erros "Job pending" - mais conservador
        self._job_pending_count = 0
        self._max_job_pending = 3  # Reduzido drasticamente
        self._job_pending_backoff = 5.0  # Backoff de 5 segundos
        self._last_job_pending_time = 0
        
        # Circuit breaker para evitar degradação - mais agressivo
        self._circuit_breaker_open = False
        self._circuit_breaker_failures = 0
        self._max_circuit_breaker_failures = 3  # 3 falhas para ativar (equilibrado)
        self._circuit_breaker_timeout = 30.0  # 30 segundos de timeout
        self._circuit_breaker_reset_time = 0
        
        # Monitor de saúde da conexão
        self._connection_health_score = 100  # 0-100, 100 = perfeito
        self._last_health_check = 0
        self._health_check_interval = 30.0  # Verifica saúde a cada 30 segundos
        
        # Pool de conexões
        self._connection_pool = {}
        self._max_connections_per_ip = 2
        self._connection_timeout = 30.0
        
        # Telemetria
        self._telemetry_data = {}
        self._last_telemetry_update = 0
        self._telemetry_interval = 2.0  # Atualiza telemetria a cada 2 segundos (mais responsivo)
        
        # Alarmes
        self._alarm_data = {}
        self._last_alarm_update = 0
        self._alarm_interval = 10.0  # Atualiza alarmes a cada 10 segundos (equilibrado)
        
        # Carrega configurações
        self._load_comm_maps()
        
        print("[OPTIMIZED_PLC] ✅ Controlador otimizado inicializado")

    @property
    def active_config(self):
        """Compatibilidade com blueprints antigos: expõe a máquina ativa."""
        return self._active_machine

    @property
    def driver(self):
        """Compatibilidade com blueprints antigos: expõe o driver atual."""
        return self._driver

    # --- Compat helpers usados por rotas antigas ---
    def heartbeat_client(self, client_id: str) -> bool:
        """Atualiza heartbeat do cliente para manter subscrição ativa"""
        try:
            with self._subscription_lock:
                if client_id in self._active_subscriptions:
                    self._active_subscriptions[client_id]['last_heartbeat'] = time.time()
            return True
        except Exception:
            return False

    def subscribe_tags(self, client_id: str, tag_names: List[str]) -> bool:
        """Registra subscrição de tags para um cliente (tela atual)"""
        try:
            current_time = time.time()
            with self._subscription_lock:
                self._active_subscriptions[client_id] = {
                    'tags': list(tag_names or []),
                    'last_heartbeat': current_time
                }
            print(f"[OPTIMIZED_PLC] 📋 Cliente {client_id} subscrito a {len(tag_names or [])} tags")
            return True
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro em subscribe_tags: {e}")
            return False

    def unsubscribe_client(self, client_id: str) -> bool:
        """Remove subscrição de um cliente"""
        try:
            with self._subscription_lock:
                if client_id in self._active_subscriptions:
                    del self._active_subscriptions[client_id]
                    print(f"[OPTIMIZED_PLC] 🗑️ Cliente {client_id} removido das subscrições")
            return True
        except Exception:
            return False

    def get_subscribed_tags(self) -> List[str]:
        """Retorna a união das tags ativas nas telas (clientes com heartbeat válido)"""
        now = time.time()
        tags = set()
        try:
            with self._subscription_lock:
                for client_id, sub in list(self._active_subscriptions.items()):
                    if now - sub.get('last_heartbeat', 0) > self._heartbeat_timeout:
                        # expira subscrição antiga
                        continue
                    for t in sub.get('tags', []) or []:
                        if isinstance(t, str) and t:
                            tags.add(t)
        except Exception:
            pass
        result = list(tags)
        if 'VELOC_PROG' in str(result):
            print(f"[OPTIMIZED_PLC] ✅ Velocidade programada encontrada nas tags subscritas: {result}")
        return result

    def force_reconnect(self):
        """Tenta reconectar o driver atual. Retorna (ok, mensagem)."""
        try:
            if not self._active_machine:
                return False, 'no active machine'
            if not self._driver:
                self._driver = create_driver_for_config(self._active_machine)
            # Desconecta e reconecta
            try:
                self._driver.disconnect()
            except Exception:
                pass
            ok = self._driver.connect()
            return (True, 'reconnected') if ok else (False, 'connect failed')
        except Exception as e:
            return False, str(e)

    def _detect_and_switch_to_available_plc(self) -> bool:
        """Placeholder de compatibilidade: não faz auto-detecção neste controlador.
        Retorna False indicando que não trocou automaticamente.
        """
        return False
    
    def _load_comm_maps(self):
        """Carrega os mapas de comunicação para cada máquina"""
        comm_map_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'comm_map')
        
        for machine in self.machines_config:
            machine_name = machine.get('name')
            if not machine_name:
                continue
                
            # Tenta carregar o arquivo de comm_map
            comm_map_file = os.path.join(comm_map_dir, f"{machine_name}.json")
            if os.path.exists(comm_map_file):
                try:
                    with open(comm_map_file, 'r', encoding='utf-8') as f:
                        comm_map = json.load(f)
                    self._comm_map_by_machine[machine_name] = comm_map
                    print(f"[OPTIMIZED_PLC] ✅ Comm_map carregado para {machine_name}")
                except Exception as e:
                    print(f"[OPTIMIZED_PLC] ❌ Erro ao carregar comm_map para {machine_name}: {e}")
                    self._comm_map_by_machine[machine_name] = []
            else:
                print(f"[OPTIMIZED_PLC] ⚠️ Comm_map não encontrado para {machine_name}")
                self._comm_map_by_machine[machine_name] = []
    
    def set_active_machine(self, machine_config):
        """Define a máquina ativa"""
        with self._lock:
            try:
                # Para o polling anterior se estiver rodando
                if self._poll_thread and self._poll_thread.is_alive():
                    self._stop_event.set()
                    self._poll_thread.join(timeout=2)
                
                # Desconecta driver anterior
                if self._driver:
                    try:
                        self._driver.disconnect()
                    except Exception:
                        pass
                
                # Configura nova máquina
                self._active_machine = machine_config
                machine_name = machine_config.get('name', 'Unknown')
                # Reconstroi lista de DBs para round-robin
                try:
                    comm_map = self._comm_map_by_machine.get(machine_name, []) or []
                    dbs = set()
                    for t in comm_map:
                        if isinstance(t, dict) and (t.get('area') or '').upper() == 'DB':
                            try:
                                dbs.add(int(t.get('db') or 0))
                            except Exception:
                                pass
                    # Remove críticos que já são sempre incluídos
                    dbs = [db for db in dbs if db not in self._critical_dbs]
                    self._db_list = sorted(dbs)
                    self._db_index = 0
                except Exception:
                    self._db_list = []
                    self._db_index = 0
                
                # Garante que o comm_map esteja disponível no config do driver
                try:
                    cm = self._comm_map_by_machine.get(machine_name, []) or []
                    machine_config = dict(machine_config)
                    machine_config['comm_map'] = cm
                except Exception:
                    pass
                # Cria novo driver
                print(f"[OPTIMIZED_PLC] 🔧 Criando driver para {machine_name}")
                self._driver = create_driver_for_config(machine_config)
                print(f"[OPTIMIZED_PLC] ✅ Driver criado: {type(self._driver).__name__}")
                
                # Conecta
                if self._driver.connect():
                    print(f"[OPTIMIZED_PLC] ✅ Conectado à máquina {machine_name}")
                    
                    # Inicia leitura otimizada no driver
                    success = False
                    print(f"[OPTIMIZED_PLC] 🔍 Verificando se driver suporta leitura otimizada...")
                    print(f"[OPTIMIZED_PLC] 🔍 Driver type: {type(self._driver)}")
                    print(f"[OPTIMIZED_PLC] 🔍 Driver methods: {[m for m in dir(self._driver) if 'optimized' in m.lower()]}")
                    
                    if hasattr(self._driver, 'start_optimized_reading'):
                        print(f"[OPTIMIZED_PLC] 🚀 Driver suporta leitura otimizada - iniciando...")
                        try:
                            success = self._driver.start_optimized_reading(comm_map, interval=0.2)
                            print(f"[OPTIMIZED_PLC] 🔍 Resultado start_optimized_reading: {success}")
                            if success:
                                print(f"[OPTIMIZED_PLC] ✅ Leitura otimizada iniciada com sucesso")
                            else:
                                print(f"[OPTIMIZED_PLC] ⚠️ Falha ao iniciar leitura otimizada, usando método legado")
                        except Exception as e:
                            print(f"[OPTIMIZED_PLC] ❌ Erro ao iniciar leitura otimizada: {e}")
                            success = False
                    else:
                        print(f"[OPTIMIZED_PLC] ⚠️ Driver não suporta leitura otimizada, usando método legado")
                    
                    # Inicia polling para telemetria e alarmes
                    self._stop_event.clear()
                    
                    # Usa método otimizado se disponível, senão usa legado
                    print(f"[OPTIMIZED_PLC] 🔍 Decidindo qual loop usar...")
                    print(f"[OPTIMIZED_PLC] 🔍 Success = {success}")
                    if success:
                        self._poll_thread = threading.Thread(target=self._optimized_poll_loop, daemon=True)
                        print(f"[OPTIMIZED_PLC] 🔄 Usando loop otimizado (agrupamento DB) para {machine_name}")
                    else:
                        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
                        print(f"[OPTIMIZED_PLC] 🔄 Usando loop legado para {machine_name}")
                    
                    print(f"[OPTIMIZED_PLC] 🚀 Iniciando thread de polling...")
                    self._poll_thread.start()
                    print(f"[OPTIMIZED_PLC] ✅ Thread de polling iniciada")
                    
                    # Testa comunicação básica
                    print(f"[OPTIMIZED_PLC] 🧪 Testando comunicação básica...")
                    test_result = self.test_communication()
                    if test_result:
                        print(f"[OPTIMIZED_PLC] ✅ Comunicação básica funcionando")
                    else:
                        print(f"[OPTIMIZED_PLC] ❌ Problema na comunicação básica")
                    
                    # Testa leitura de tags específicas
                    print(f"[OPTIMIZED_PLC] 🧪 Testando leitura de tags específicas...")
                    test_tags = [
                        {'name': 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL', 'area': 'DB', 'db': 1, 'offset': 0, 'type': 'REAL'},
                        {'name': 'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG', 'area': 'DB', 'db': 1, 'offset': 4, 'type': 'REAL'}
                    ]
                    tag_data = self._driver.read_tags(test_tags)
                    if tag_data:
                        print(f"[OPTIMIZED_PLC] ✅ Tags lidas: {tag_data}")
                        # Emite dados de teste via Socket.IO
                        self.socketio.emit('telemetry', {
                            'machine': machine_name,
                            'timestamp': time.time(),
                            'plc_connected': True,
                            **tag_data
                        })
                        print(f"[OPTIMIZED_PLC] 📡 Dados de teste emitidos via Socket.IO")
                    else:
                        print(f"[OPTIMIZED_PLC] ❌ Falha ao ler tags específicas")
                    
                    # Testa Socket.IO
                    print(f"[OPTIMIZED_PLC] 🧪 Testando Socket.IO...")
                    socketio_result = self.test_socketio_emission()
                    if socketio_result:
                        print(f"[OPTIMIZED_PLC] ✅ Socket.IO funcionando")
                    else:
                        print(f"[OPTIMIZED_PLC] ❌ Problema no Socket.IO")
                    
                    # Aguarda um pouco para o loop de polling se estabilizar
                    print(f"[OPTIMIZED_PLC] ⏳ Aguardando estabilização do loop de polling...")
                    time.sleep(5)
                    
                    if success:
                        return True, f"Máquina {machine_name} configurada com agrupamento de DBs"
                    else:
                        return True, f"Máquina {machine_name} configurada com método legado"
                else:
                    print(f"[OPTIMIZED_PLC] ❌ Falha ao conectar à máquina {machine_name}")
                    return False, f"Falha ao conectar à máquina {machine_name}"
                    
            except Exception as e:
                print(f"[OPTIMIZED_PLC] ❌ Erro ao configurar máquina: {e}")
                return False, f"Erro ao configurar máquina: {e}"
    
    def _optimized_poll_loop(self):
        """Loop otimizado de polling que usa cache do driver"""
        print("[OPTIMIZED_PLC] 🔄 Iniciando loop de polling otimizado")
        print("[OPTIMIZED_PLC] 🔍 Driver disponível:", self._driver is not None)
        print("[OPTIMIZED_PLC] 🔍 Driver type:", type(self._driver))
        loop_count = 0
        
        # Aguarda um pouco para o driver se estabilizar
        time.sleep(2)
        
        while not self._stop_event.is_set():
            try:
                current_time = time.time()
                loop_count += 1
                
                # Log a cada 10 iterações para debug (mais frequente)
                if loop_count % 10 == 0:
                    print(f"[OPTIMIZED_PLC] 🔄 Loop otimizado ativo - iteração {loop_count}")
                
                # Circuit breaker: verifica se está aberto
                if self._circuit_breaker_open:
                    if current_time - self._circuit_breaker_reset_time > self._circuit_breaker_timeout:
                        print("[OPTIMIZED_PLC] 🔄 Circuit breaker: tentando reset")
                        self._circuit_breaker_open = False
                        self._circuit_breaker_failures = 0
                    else:
                        time.sleep(1.0)
                        continue
                
                # Throttling: verifica se pode fazer leitura
                if current_time - self._last_read_time < self._min_read_interval:
                    time.sleep(0.5)
                    continue
                
                # Verifica se está conectado
                if not self._driver or not self._driver.is_connected():
                    print(f"[OPTIMIZED_PLC] ⚠️ Driver não conectado na iteração {loop_count}, tentando reconectar...")
                    if self._driver and self._driver.connect():
                        print("[OPTIMIZED_PLC] ✅ Reconectado com sucesso")
                        # Reinicia leitura otimizada
                        if hasattr(self._driver, 'start_optimized_reading'):
                            machine_name = self._active_machine.get('name', 'Unknown')
                            comm_map = self._comm_map_by_machine.get(machine_name, [])
                            if comm_map:
                                self._driver.start_optimized_reading(comm_map, interval=0.5)
                    else:
                        print(f"[OPTIMIZED_PLC] ❌ Falha na reconexão na iteração {loop_count}")
                        time.sleep(1)
                        continue
                
                # Atualiza telemetria e alarmes do cache
                print(f"[OPTIMIZED_PLC] 🔄 Atualizando telemetria do cache na iteração {loop_count}")
                self._update_telemetry_from_cache()
                self._update_alarms_from_cache()
                
                # Reset do circuit breaker se tudo está funcionando
                if self._circuit_breaker_failures > 0:
                    self._circuit_breaker_failures = 0
                    print("[OPTIMIZED_PLC] ✅ Reset do circuit breaker - conexão estabilizada")
                
                # Atualiza timestamp da última leitura
                self._last_read_time = current_time
                
                # Atualiza monitor de saúde da conexão
                self._update_health_monitor()
                
                # Limpa cache antigo
                self._cleanup_cache()
                
            except Exception as e:
                print(f"[OPTIMIZED_PLC] ❌ Erro no loop otimizado (iteração {loop_count}): {e}")
                print(f"[OPTIMIZED_PLC] 🔍 Tipo do erro: {type(e).__name__}")
                
                # Circuit breaker: incrementa falhas
                self._circuit_breaker_failures += 1
                if self._circuit_breaker_failures >= self._max_circuit_breaker_failures:
                    self._circuit_breaker_open = True
                    self._circuit_breaker_reset_time = time.time()
                    print(f"[OPTIMIZED_PLC] 🚨 Circuit breaker ATIVADO após {self._circuit_breaker_failures} falhas")
                
                import traceback
                print(f"[OPTIMIZED_PLC] 🔍 Traceback: {traceback.format_exc()}")
                time.sleep(2)
    
    def _poll_loop(self):
        """Loop principal de polling com throttling inteligente (método legado)"""
        print("[OPTIMIZED_PLC] 🔄 Iniciando loop de polling legado")
        loop_count = 0
        
        while not self._stop_event.is_set():
            try:
                current_time = time.time()
                loop_count += 1
                
                # Log a cada 100 iterações para debug
                if loop_count % 100 == 0:
                    print(f"[OPTIMIZED_PLC] 🔄 Loop de polling ativo - iteração {loop_count}")
                
                # Circuit breaker: verifica se está aberto
                if self._circuit_breaker_open:
                    if current_time - self._circuit_breaker_reset_time > self._circuit_breaker_timeout:
                        print("[OPTIMIZED_PLC] 🔄 Circuit breaker: tentando reset")
                        self._circuit_breaker_open = False
                        self._circuit_breaker_failures = 0
                    else:
                        time.sleep(1.0)
                        continue
                
                # Throttling: verifica se pode fazer leitura
                if current_time - self._last_read_time < self._min_read_interval:
                    time.sleep(0.5)  # Aumentado de 0.1 para 0.5
                    continue
                
                # Verifica se está conectado
                if not self._driver:
                    print(f"[OPTIMIZED_PLC] ❌ Driver não existe na iteração {loop_count}")
                    time.sleep(1)
                    continue
                    
                if not self._driver.is_connected():
                    print(f"[OPTIMIZED_PLC] ⚠️ Driver não conectado na iteração {loop_count}, tentando reconectar...")
                    if self._driver.connect():
                        print("[OPTIMIZED_PLC] ✅ Reconectado com sucesso")
                    else:
                        print(f"[OPTIMIZED_PLC] ❌ Falha na reconexão na iteração {loop_count}")
                        time.sleep(1)
                        continue
                else:
                    print(f"[OPTIMIZED_PLC] ✅ Driver conectado na iteração {loop_count}")
                
                # Verifica backoff por "Job pending"
                if (self._job_pending_count >= self._max_job_pending and 
                    current_time - self._last_job_pending_time < self._job_pending_backoff):
                    time.sleep(0.5)
                    continue
                
                # Executa leitura
                print(f"[OPTIMIZED_PLC] 🔍 Executando leitura na iteração {loop_count}")
                self._read_telemetry()
                self._read_alarms()
                print(f"[OPTIMIZED_PLC] ✅ Leitura concluída na iteração {loop_count}")
                
                # Reset do backoff se leitura foi bem-sucedida
                if self._job_pending_count > 0:
                    self._job_pending_count = 0
                    self._job_pending_backoff = 2.0  # Reset para valor inicial
                    print("[OPTIMIZED_PLC] ✅ Reset do backoff - conexão estabilizada")
                
                # Reset do circuit breaker se leitura foi bem-sucedida
                if self._circuit_breaker_failures > 0:
                    self._circuit_breaker_failures = 0
                    print("[OPTIMIZED_PLC] ✅ Reset do circuit breaker - conexão estabilizada")
                
                # Atualiza timestamp da última leitura
                self._last_read_time = current_time
                
                # Atualiza monitor de saúde da conexão
                self._update_health_monitor()
                
                # Limpa cache antigo
                self._cleanup_cache()
                
                # Aguarda antes da próxima iteração para não sobrecarregar
                time.sleep(0.1)
                
            except Exception as e:
                print(f"[OPTIMIZED_PLC] ❌ Erro no loop de polling (iteração {loop_count}): {e}")
                print(f"[OPTIMIZED_PLC] 🔍 Tipo do erro: {type(e).__name__}")
                
                # Circuit breaker: incrementa falhas
                self._circuit_breaker_failures += 1
                if self._circuit_breaker_failures >= self._max_circuit_breaker_failures:
                    self._circuit_breaker_open = True
                    self._circuit_breaker_reset_time = time.time()
                    print(f"[OPTIMIZED_PLC] 🚨 Circuit breaker ATIVADO após {self._circuit_breaker_failures} falhas")
                
                import traceback
                print(f"[OPTIMIZED_PLC] 🔍 Traceback: {traceback.format_exc()}")
                time.sleep(2)  # Aumentado de 1 para 2 segundos
    
    def _read_telemetry(self):
        """Lê dados de telemetria (inclui alarmes e extras) com cache inteligente.
        Unifica leituras para reduzir chamadas ao PLC e evitar 'Job pending'.
        """
        if not self._active_machine:
            print("[OPTIMIZED_PLC] ⚠️ Nenhuma máquina ativa")
            return
        
        current_time = time.time()
        
        # Verifica se precisa atualizar telemetria
        if current_time - self._last_telemetry_update < self._telemetry_interval:
            print(f"[OPTIMIZED_PLC] ⏰ Aguardando intervalo de telemetria ({self._telemetry_interval}s)")
            return
        
        try:
            machine_name = self._active_machine.get('name', 'Unknown')
            comm_map = self._comm_map_by_machine.get(machine_name, [])
            
            print(f"[OPTIMIZED_PLC] 🔍 Iniciando leitura de telemetria para {machine_name}")
            print(f"[OPTIMIZED_PLC] 📊 Comm_map contém {len(comm_map)} tags")
            
            if not comm_map:
                print(f"[OPTIMIZED_PLC] ❌ Nenhum comm_map encontrado para {machine_name}")
                return
            
            # Index por nome
            defs_by_name = {t.get('name'): t for t in comm_map if isinstance(t, dict) and 'name' in t}

            # Round-robin de DBs: críticos + DBs das tags subscritas + DBs de extras + fatia atual
            chosen_dbs = set(self._critical_dbs)
            # DBs das tags subscritas (tela atual)
            subscribed_names = self.get_subscribed_tags()
            if subscribed_names:
                print(f"[OPTIMIZED_PLC] 📋 Tags subscritas: {subscribed_names}")
                for n in subscribed_names:
                    td = defs_by_name.get(n)
                    if td and (td.get('area') or '').upper() == 'DB':
                        try:
                            chosen_dbs.add(int(td.get('db') or 0))
                            if 'VELOC_PROG' in n:
                                print(f"[OPTIMIZED_PLC] ✅ Tag de velocidade programada encontrada nas subscrições: {n}")
                        except Exception:
                            pass
            # DBs das tags extras
            if self._extra_read_tags:
                for n in list(self._extra_read_tags):
                    td = defs_by_name.get(n)
                    if td and (td.get('area') or '').upper() == 'DB':
                        try:
                            chosen_dbs.add(int(td.get('db') or 0))
                        except Exception:
                            pass
            # Fatia do round-robin
            if self._db_list:
                end = self._db_index + self._dbs_per_cycle
                if end <= len(self._db_list):
                    slice_dbs = self._db_list[self._db_index:end]
                else:
                    slice_dbs = self._db_list[self._db_index:] + self._db_list[:(end % len(self._db_list))]
                chosen_dbs.update(slice_dbs)
                # avança índice
                self._db_index = (self._db_index + self._dbs_per_cycle) % max(1, len(self._db_list))

            # Seleciona definições pelas DBs escolhidas
            def _in_chosen_db(tag_def):
                if not isinstance(tag_def, dict):
                    return False
                if (tag_def.get('area') or '').upper() != 'DB':
                    return False
                try:
                    return int(tag_def.get('db') or 0) in chosen_dbs
                except Exception:
                    return False

            # Telemetria (não alarmes) APENAS das tags subscritas nas DBs escolhidas
            telemetry_defs = []
            if subscribed_names:
                for n in subscribed_names:
                    td = defs_by_name.get(n)
                    if td and not self._is_alarm_tag(td) and _in_chosen_db(td):
                        telemetry_defs.append(td)
                        # Debug para velocidade programada
                        if 'VELOC_PROG' in n:
                            print(f"[OPTIMIZED_PLC] ✅ Incluindo tag de velocidade programada: {n}")
            # Alarmes das DBs escolhidas
            alarm_defs = [t for t in comm_map if self._is_alarm_tag(t) and _in_chosen_db(t)]
            # Extras definidos por nome
            extra_names = list(self._extra_read_tags)
            extra_defs = [defs_by_name[n] for n in extra_names if n in defs_by_name and _in_chosen_db(defs_by_name[n])]

            batch_defs = telemetry_defs + alarm_defs + extra_defs
            if not batch_defs:
                return

            # Lê tags do PLC em um único chamado
            print(f"[OPTIMIZED_PLC] 🔍 Lendo {len(batch_defs)} tags do PLC...")
            data = self._driver.read_tags(batch_defs)
            
            if data is None:
                print("[OPTIMIZED_PLC] ❌ Driver retornou None - Job pending")
                # Trata erro "Job pending"
                self._handle_job_pending()
                return
            
            print(f"[OPTIMIZED_PLC] ✅ Driver retornou {len(data)} valores")
            
            # Atualiza cache
            self._cache.update(data)
            self._cache['_timestamp'] = current_time
            
            # Atualiza telemetria
            self._telemetry_data = data
            self._last_telemetry_update = current_time
            
            # Envia via Socket.IO
            print(f"[OPTIMIZED_PLC] 📡 Emitindo telemetria via Socket.IO: {len(data)} tags")
            self.socketio.emit('telemetry', {
                'machine': machine_name,
                'timestamp': current_time,
                'plc_connected': True,
                **data  # Adiciona todas as tags diretamente no objeto principal
            })
            print(f"[OPTIMIZED_PLC] 📡 Telemetria emitida com sucesso")
            
            
            # Limpa buffer de extras após leitura
            if self._extra_read_tags:
                self._extra_read_tags.clear()

            print(f"[OPTIMIZED_PLC] 📊 Telemetria/Alarmes atualizados em lote: {len(data)} tags (DBs: {sorted(list(chosen_dbs))})")
            
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro ao ler telemetria: {e}")

    def read_tags(self, names=None):
        """Lê tags específicas via API apenas do cache e agenda para o próximo ciclo.
        - names: lista de nomes de tags a ler. Se None, retorna {}
        Retorna dict {name: value} com valores em cache; valores faltantes serão None
        e as tags serão priorizadas no próximo ciclo unificado de leitura.
        """
        if not self._active_machine or not self._driver:
            return {} if not names else {n: None for n in names}
        if not names:
            return {}
        try:
            machine_name = self._active_machine.get('name', 'Unknown')
            comm_map = self._comm_map_by_machine.get(machine_name, []) or []
            defs_by_name = {t.get('name'): t for t in comm_map if isinstance(t, dict) and 'name' in t}

            # Lê do cache
            out = {}
            current_time = time.time()
            for n in names:
                entry = self._cache.get(n)
                if isinstance(entry, (int, float, str, bool)):
                    out[n] = entry
                elif isinstance(entry, dict):
                    ts = entry.get('_timestamp') or entry.get('timestamp')
                    if ts is not None and current_time - ts <= self._cache_ttl:
                        out[n] = entry.get('value', None)
                        if out[n] is not None:
                            pass
                    else:
                        out[n] = None
                else:
                    out[n] = None

            # Agenda para próximo ciclo as tags sem valor em cache válido
            missing = [n for n, v in out.items() if v is None and n in defs_by_name]
            if missing:
                self._extra_read_tags.update(missing)
                

            return out
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro em read_tags (cache-only): {e}")
            return {n: None for n in (names or [])}
    
    def _read_alarms(self):
        """Processa alarmes a partir do cache para evitar segunda leitura no ciclo"""
        if not self._active_machine:
            return
        current_time = time.time()
        if current_time - self._last_alarm_update < self._alarm_interval:
            return
        try:
            machine_name = self._active_machine.get('name', 'Unknown')
            comm_map = self._comm_map_by_machine.get(machine_name, [])
            if not comm_map:
                return
            # Coleta valores de alarme do cache
            alarm_names = [t.get('name') for t in comm_map if self._is_alarm_tag(t) and isinstance(t, dict) and 'name' in t]
            data = {}
            ct = time.time()
            for n in alarm_names:
                entry = self._cache.get(n)
                if isinstance(entry, (int, float, str, bool)):
                    data[n] = entry
                elif isinstance(entry, dict):
                    ts = entry.get('_timestamp') or entry.get('timestamp')
                    if ts is not None and ct - ts <= self._cache_ttl:
                        data[n] = entry.get('value', None)
                    else:
                        data[n] = None
                else:
                    data[n] = None
            # Processa alarmes
            print(f"[OPTIMIZED_PLC] 🔍 Processando alarmes para {machine_name} com {len(data)} tags")
            alarms = alarm_processor.process_alarm_data(data, machine_name)
            alarm_summary = alarm_processor.get_alarm_summary(alarms)
            print(f"[OPTIMIZED_PLC] 📊 Alarmes processados: {len(alarms)} alarmes, resumo: {alarm_summary}")
            self._alarm_data = {
                'alarms': alarms,
                'summary': alarm_summary,
                'timestamp': current_time
            }
            self._last_alarm_update = current_time
            self.socketio.emit('alarm_update', {
                'machine': machine_name,
                'alarms': alarms,
                'summary': alarm_summary,
                'timestamp': current_time
            })
            print(f"[OPTIMIZED_PLC] 🚨 Alarmes atualizados: {alarm_summary['total']} total (cache)")
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro ao processar alarmes do cache: {e}")
    
    def _is_alarm_tag(self, tag):
        """Verifica se uma tag é de alarme"""
        tag_name = tag.get('name', '').upper()
        return 'ALARME' in tag_name or 'ALARM' in tag_name
    
    def _is_telemetry_tag(self, tag):
        """Verifica se uma tag é de telemetria (não é alarme)"""
        return not self._is_alarm_tag(tag)
    
    def _handle_job_pending(self):
        """Trata erros de 'Job pending' com backoff"""
        self._job_pending_count += 1
        self._last_job_pending_time = time.time()
        
        if self._job_pending_count >= self._max_job_pending:
            print(f"[OPTIMIZED_PLC] ⚠️ Muitos erros 'Job pending' ({self._job_pending_count}), ativando backoff")
            # Aumenta o backoff exponencialmente
            self._job_pending_backoff = min(self._job_pending_backoff * 1.5, 10.0)
        else:
            print(f"[OPTIMIZED_PLC] ⚠️ Erro 'Job pending' ({self._job_pending_count}/{self._max_job_pending})")
    
    def _cleanup_cache(self):
        """Limpa cache antigo"""
        current_time = time.time()
        
        if current_time - self._last_cache_cleanup < 10.0:  # Limpa a cada 10 segundos
            return
        
        # Remove entradas antigas do cache
        expired_keys = []
        for key, value in self._cache.items():
            if key != '_timestamp' and isinstance(value, dict) and '_timestamp' in value:
                if current_time - value['_timestamp'] > self._cache_ttl:
                    expired_keys.append(key)
        
        for key in expired_keys:
            del self._cache[key]
        
        self._last_cache_cleanup = current_time
    
    def get_telemetry_data(self):
        """Retorna dados de telemetria atuais"""
        with self._lock:
            return self._telemetry_data.copy()
    
    def get_alarm_data(self):
        """Retorna dados de alarme atuais"""
        with self._lock:
            return self._alarm_data.copy()
    
    def write_tags(self, tag_values):
        """Escreve valores nas tags do PLC"""
        if not self._driver or not self._driver.is_connected():
            return False
        
        try:
            ok = self._driver.write_tags(tag_values)
            if ok:
                # Invalida cache e prioriza leitura das tags escritas
                try:
                    for n in tag_values.keys():
                        if n in self._cache:
                            try:
                                del self._cache[n]
                            except Exception:
                                self._cache[n] = None
                        self._extra_read_tags.add(n)
                except Exception:
                    pass
            return ok
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro ao escrever tags: {e}")
            return False
    
    def _check_connection_health(self, ip):
        """Verifica saúde da conexão com monitoramento de score"""
        try:
            if ip not in self._connection_pool:
                self._connection_health_score = max(0, self._connection_health_score - 20)
                return False
                
            driver = self._connection_pool[ip]
            if not driver.is_connected():
                self._connection_health_score = max(0, self._connection_health_score - 15)
                return False
                
            # Verifica se a conexão ainda está ativa
            is_connected = driver._client.get_connected()
            if is_connected:
                # Melhora o score se conexão está boa
                self._connection_health_score = min(100, self._connection_health_score + 5)
            else:
                self._connection_health_score = max(0, self._connection_health_score - 10)
                
            return is_connected
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro ao verificar saúde da conexão {ip}: {e}")
            self._connection_health_score = max(0, self._connection_health_score - 25)
            return False
    
    def _update_telemetry_from_cache(self):
        """Atualiza telemetria a partir do cache do driver"""
        if not self._active_machine or not self._driver:
            return
            
        current_time = time.time()
        
        # Verifica se precisa atualizar telemetria
        if current_time - self._last_telemetry_update < self._telemetry_interval:
            return
        
        try:
            machine_name = self._active_machine.get('name', 'Unknown')
            comm_map = self._comm_map_by_machine.get(machine_name, [])
            
            if not comm_map:
                print(f"[OPTIMIZED_PLC] ⚠️ Nenhum comm_map encontrado para {machine_name}")
                return
            
            # Obtém dados do cache do driver
            if hasattr(self._driver, 'get_all_cached_values'):
                cached_data = self._driver.get_all_cached_values()
                print(f"[OPTIMIZED_PLC] 📊 Cache do driver contém {len(cached_data)} entradas")
                
                # Mostra estatísticas do cache se disponível
                if hasattr(self._driver, 'get_cache_stats'):
                    stats = self._driver.get_cache_stats()
                    print(f"[OPTIMIZED_PLC] 📈 Estatísticas do cache: {stats['optimized_entries']}/{stats['total_entries']} otimizadas, running={stats['is_running']}")
            else:
                print(f"[OPTIMIZED_PLC] ⚠️ Driver não tem método get_all_cached_values")
                return
            
            # Processa tags de telemetria (todas as tags que não são alarmes)
            telemetry_tags = [t for t in comm_map if isinstance(t, dict) and 'name' in t and not self._is_alarm_tag(t)]
            print(f"[OPTIMIZED_PLC] 📊 Processando {len(telemetry_tags)} tags de telemetria")
            
            # Debug: mostra algumas tags de exemplo
            sample_tags = telemetry_tags[:5]
            for tag in sample_tags:
                print(f"[OPTIMIZED_PLC] 🔍 Tag de exemplo: {tag.get('name')} (tipo: {tag.get('type')})")
            
            # Debug: procura tags importantes especificamente
            important_tags = [t for t in telemetry_tags if 'VELOC_REAL' in t.get('name', '') or 'VELOC_PROG' in t.get('name', '')]
            print(f"[OPTIMIZED_PLC] 🔍 Tags importantes encontradas: {len(important_tags)}")
            for tag in important_tags:
                print(f"[OPTIMIZED_PLC] 🔍   {tag.get('name')} (tipo: {tag.get('type')})")
            
            data = {}
            valid_tags = 0
            
            for tag in telemetry_tags:
                tag_name = tag.get('name')
                if not tag_name:
                    continue
                    
                # Busca no cache
                cached_entry = cached_data.get(tag_name)
                if cached_entry and isinstance(cached_entry, dict):
                    value = cached_entry.get('value')
                    timestamp = cached_entry.get('timestamp', 0)
                    
                    # Verifica se o dado não está muito antigo (máximo 60 segundos)
                    if current_time - timestamp <= 60:
                        data[tag_name] = value
                        valid_tags += 1
                        
                        # Log para tags importantes
                        if 'VELOC_REAL' in tag_name or 'VELOC_PROG' in tag_name:
                            print(f"[OPTIMIZED_PLC] 📊 {tag_name} = {value} (timestamp: {timestamp})")
                    else:
                        data[tag_name] = None
                        print(f"[OPTIMIZED_PLC] ⚠️ Tag {tag_name} expirada (idade: {current_time - timestamp:.1f}s)")
                else:
                    data[tag_name] = None
                    # Log apenas a cada 100 tags para não poluir o terminal
                    if len(data) % 100 == 0:
                        print(f"[OPTIMIZED_PLC] ⚠️ Tag {tag_name} não encontrada no cache")
            
            print(f"[OPTIMIZED_PLC] 📊 {valid_tags}/{len(telemetry_tags)} tags válidas do cache")
            
            # Se não há tags válidas, não emite telemetria
            if valid_tags == 0:
                print(f"[OPTIMIZED_PLC] ⚠️ Nenhuma tag válida no cache - aguardando população...")
                return
            
            # Atualiza cache interno
            for tag_name, value in data.items():
                self._cache[tag_name] = {
                    'value': value,
                    'timestamp': current_time,
                    'source': 'optimized_cache'
                }
            
            # Emite telemetria via Socket.IO
            print(f"[OPTIMIZED_PLC] 📡 Emitindo evento 'telemetry' via Socket.IO")
            
            # Estrutura compatível com o frontend - dados diretamente no objeto principal
            telemetry_data = {
                'machine': machine_name,
                'timestamp': current_time,
                'source': 'optimized_cache',
                'plc_connected': True  # Indica que PLC está conectado
            }
            
            # Adiciona todos os dados de tags diretamente no objeto principal
            telemetry_data.update(data)
            
            self.socketio.emit('telemetry', telemetry_data)
            print(f"[OPTIMIZED_PLC] 📡 Evento 'telemetry' emitido com sucesso")
            
            # Debug: mostra algumas chaves dos dados emitidos
            data_keys = list(telemetry_data.keys())
            print(f"[OPTIMIZED_PLC] 🔍 Chaves dos dados emitidos: {len(data_keys)}")
            if len(data_keys) > 0:
                print(f"[OPTIMIZED_PLC] 🔍 Primeiras 5 chaves: {data_keys[:5]}")
                # Verifica se tem tags importantes
                important_keys = [k for k in data_keys if 'VELOC' in k or 'ALARME' in k or 'NOME_DINAMICO' in k]
                print(f"[OPTIMIZED_PLC] 🔍 Chaves importantes: {len(important_keys)}")
                if important_keys:
                    print(f"[OPTIMIZED_PLC] 🔍 Primeiras 3 importantes: {important_keys[:3]}")
            
            self._last_telemetry_update = current_time
            print(f"[OPTIMIZED_PLC] 📊 Telemetria emitida: {len(data)} tags")
            
            # Log de algumas tags importantes para debug
            important_tags = ['XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL', 
                           'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG']
            for tag_name in important_tags:
                if tag_name in data:
                    value = data[tag_name]
                    print(f"[OPTIMIZED_PLC] 📊 Emitindo {tag_name} = {value}")
                else:
                    print(f"[OPTIMIZED_PLC] ⚠️ Tag {tag_name} não encontrada nos dados emitidos")
            
            # Log de algumas tags de classe para debug
            class_tags = [t for t in data.keys() if 'NOME_DINAMICO' in t or 'TIPO_OVO' in t]
            if class_tags:
                print(f"[OPTIMIZED_PLC] 📊 Tags de classe encontradas: {len(class_tags)}")
                for tag in class_tags[:3]:  # Mostra apenas as primeiras 3
                    print(f"[OPTIMIZED_PLC] 📊   {tag} = {data[tag]}")
            else:
                print(f"[OPTIMIZED_PLC] ⚠️ Nenhuma tag de classe encontrada")
            
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro ao atualizar telemetria do cache: {e}")
            import traceback
            print(f"[OPTIMIZED_PLC] 🔍 Traceback: {traceback.format_exc()}")
    
    def _update_alarms_from_cache(self):
        """Atualiza alarmes a partir do cache do driver"""
        if not self._active_machine or not self._driver:
            return
            
        current_time = time.time()
        
        # Verifica se precisa atualizar alarmes
        if current_time - self._last_alarm_update < self._alarm_interval:
            return
        
        try:
            machine_name = self._active_machine.get('name', 'Unknown')
            comm_map = self._comm_map_by_machine.get(machine_name, [])
            
            if not comm_map:
                return
            
            # Obtém dados do cache do driver
            if hasattr(self._driver, 'get_all_cached_values'):
                cached_data = self._driver.get_all_cached_values()
            else:
                return
            
            # Processa tags de alarme
            alarm_tags = [t for t in comm_map if self._is_alarm_tag(t)]
            print(f"[OPTIMIZED_PLC] 🔍 Tags de alarme encontradas: {len(alarm_tags)}")
            if alarm_tags:
                print(f"[OPTIMIZED_PLC] 🔍 Primeiras 3 tags de alarme:")
                for tag in alarm_tags[:3]:
                    print(f"[OPTIMIZED_PLC] 🔍   {tag.get('name')}")
            data = {}
            
            for tag in alarm_tags:
                tag_name = tag.get('name')
                if not tag_name:
                    continue
                    
                # Busca no cache
                cached_entry = cached_data.get(tag_name)
                if cached_entry and isinstance(cached_entry, dict):
                    value = cached_entry.get('value')
                    timestamp = cached_entry.get('timestamp', 0)
                    
                    # Verifica se o dado não está muito antigo (máximo 60 segundos)
                    if current_time - timestamp <= 60:
                        data[tag_name] = value
                        # Log para algumas tags de alarme importantes
                        if 'ALARME' in tag_name and len(data) <= 3:
                            print(f"[OPTIMIZED_PLC] 🔍 Tag de alarme {tag_name} = {value}")
                    else:
                        data[tag_name] = None
                else:
                    data[tag_name] = None
            
            # Processa alarmes
            print(f"[OPTIMIZED_PLC] 🔍 Processando alarmes para {machine_name} com {len(data)} tags")
            alarms = alarm_processor.process_alarm_data(data, machine_name)
            alarm_summary = alarm_processor.get_alarm_summary(alarms)
            print(f"[OPTIMIZED_PLC] 📊 Alarmes processados: {len(alarms)} alarmes, resumo: {alarm_summary}")
            
            self._alarm_data = {
                'alarms': alarms,
                'summary': alarm_summary,
                'timestamp': current_time
            }
            
            # Emite alarmes via Socket.IO
            self.socketio.emit('alarm_update', {
                'machine': machine_name,
                'alarms': alarms,
                'summary': alarm_summary,
                'timestamp': current_time,
                'source': 'optimized_cache'
            })
            
            self._last_alarm_update = current_time
            print(f"[OPTIMIZED_PLC] 🚨 Alarmes atualizados do cache: {alarm_summary['total']} total")
            
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro ao atualizar alarmes do cache: {e}")

    def _update_health_monitor(self):
        """Atualiza monitor de saúde da conexão"""
        now = time.time()
        if now - self._last_health_check < self._health_check_interval:
            return
            
        self._last_health_check = now
        
        # Log do score de saúde
        if self._connection_health_score < 50:
            print(f"[OPTIMIZED_PLC] ⚠️ Saúde da conexão baixa: {self._connection_health_score}/100")
        elif self._connection_health_score < 80:
            print(f"[OPTIMIZED_PLC] ℹ️ Saúde da conexão moderada: {self._connection_health_score}/100")
        else:
            print(f"[OPTIMIZED_PLC] ✅ Saúde da conexão boa: {self._connection_health_score}/100")

    def test_communication(self):
        """Testa comunicação básica com o PLC"""
        print("[OPTIMIZED_PLC] 🧪 Testando comunicação com PLC...")
        
        if not self._driver:
            print("[OPTIMIZED_PLC] ❌ Nenhum driver disponível")
            return False
            
        if not self._driver.is_connected():
            print("[OPTIMIZED_PLC] ⚠️ Driver não conectado, tentando conectar...")
            if not self._driver.connect():
                print("[OPTIMIZED_PLC] ❌ Falha ao conectar")
                return False
        
        try:
            # Testa leitura de uma tag simples
            machine_name = self._active_machine.get('name', 'Unknown')
            comm_map = self._comm_map_by_machine.get(machine_name, [])
            
            if not comm_map:
                print("[OPTIMIZED_PLC] ❌ Nenhum comm_map disponível")
                return False
            
            # Busca uma tag de teste (primeira tag DB encontrada)
            test_tag = None
            for tag in comm_map:
                if isinstance(tag, dict) and tag.get('area', '').upper() == 'DB':
                    test_tag = tag
                    break
            
            if not test_tag:
                print("[OPTIMIZED_PLC] ❌ Nenhuma tag DB encontrada para teste")
                return False
            
            print(f"[OPTIMIZED_PLC] 🧪 Testando tag: {test_tag['name']}")
            
            # Tenta ler a tag
            result = self._driver.read_tags([test_tag])
            
            if result and test_tag['name'] in result:
                value = result[test_tag['name']]
                print(f"[OPTIMIZED_PLC] ✅ Teste bem-sucedido! {test_tag['name']} = {value}")
                return True
            else:
                print(f"[OPTIMIZED_PLC] ❌ Falha no teste - nenhum valor retornado")
                return False
                
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro no teste de comunicação: {e}")
            import traceback
            print(f"[OPTIMIZED_PLC] 🔍 Traceback: {traceback.format_exc()}")
            return False
    
    def test_optimized_cache(self):
        """Testa se o cache otimizado está funcionando"""
        print("[OPTIMIZED_PLC] 🧪 Testando cache otimizado...")
        
        if not self._driver or not hasattr(self._driver, 'get_all_cached_values'):
            print("[OPTIMIZED_PLC] ❌ Driver não suporta cache otimizado")
            return False
        
        try:
            # Obtém dados do cache
            cached_data = self._driver.get_all_cached_values()
            print(f"[OPTIMIZED_PLC] 📊 Cache contém {len(cached_data)} entradas")
            
            # Verifica tags importantes
            important_tags = ['XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL', 
                           'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG']
            
            for tag_name in important_tags:
                if tag_name in cached_data:
                    entry = cached_data[tag_name]
                    if isinstance(entry, dict):
                        value = entry.get('value', 'N/A')
                        timestamp = entry.get('timestamp', 0)
                        age = time.time() - timestamp
                        print(f"[OPTIMIZED_PLC] ✅ {tag_name} = {value} (idade: {age:.1f}s)")
                    else:
                        print(f"[OPTIMIZED_PLC] ⚠️ {tag_name} = {entry} (formato inesperado)")
                else:
                    print(f"[OPTIMIZED_PLC] ❌ {tag_name} não encontrada no cache")
            
            # Mostra estatísticas
            if hasattr(self._driver, 'get_cache_stats'):
                stats = self._driver.get_cache_stats()
                print(f"[OPTIMIZED_PLC] 📈 Estatísticas: {stats}")
            
            return len(cached_data) > 0
            
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro ao testar cache otimizado: {e}")
            return False
    
    def test_socketio_emission(self):
        """Testa se o Socket.IO está funcionando"""
        print("[OPTIMIZED_PLC] 🧪 Testando emissão Socket.IO...")
        
        try:
            # Emite um evento de teste
            test_data = {
                'machine': 'TEST',
                'timestamp': time.time(),
                'source': 'test',
                'plc_connected': True,
                'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_REAL': 123.45,
                'XLCLASS_DB1_PRINCIPAL_REFERENCIAS_VELOC_PROG': 100.0
            }
            
            self.socketio.emit('telemetry', test_data)
            print("[OPTIMIZED_PLC] ✅ Evento de teste emitido via Socket.IO")
            return True
            
        except Exception as e:
            print(f"[OPTIMIZED_PLC] ❌ Erro ao emitir evento de teste: {e}")
            return False

    def stop(self):
        """Para o controlador"""
        print("[OPTIMIZED_PLC] 🛑 Parando controlador")
        
        self._stop_event.set()
        
        # Para leitura otimizada no driver
        if self._driver and hasattr(self._driver, 'stop_optimized_reading'):
            self._driver.stop_optimized_reading()
            print("[OPTIMIZED_PLC] 🛑 Leitura otimizada parada")
        
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=2)
        
        if self._driver:
            try:
                self._driver.disconnect()
            except Exception:
                pass
        
        print("[OPTIMIZED_PLC] ✅ Controlador parado")

