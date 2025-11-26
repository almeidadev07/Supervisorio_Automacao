#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DataHub - Sistema de comunicação robusto com PLC Siemens via Snap7
Autor: Sistema de Automação Industrial
Versão: 1.0.0

Características:
- Auto-detecção de PLC ativo
- Conexão persistente e única
- Leitura cíclica otimizada por blocos
- Cache em tempo real
- API REST e WebSocket
- Reconexão automática
"""

import snap7
from snap7.util import *
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import threading
import time
import json
import subprocess
import platform
from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
import logging
from collections import defaultdict

# ============================================================================
# CONFIGURAÇÕES
# ============================================================================

# Lista de PLCs possíveis (ordem de prioridade)
# IMPORTANTE: 700CX tem prioridade 1 (será testado primeiro)
PLC_CONFIGS = [
    {"name": "700CX", "ip": "100.70.0.10", "rack": 0, "slot": 1},
    {"name": "400CX", "ip": "100.40.0.10", "rack": 0, "slot": 1},
    {"name": "200CX", "ip": "100.20.0.10", "rack": 0, "slot": 1},
]

# DBs a serem lidas (TAMANHOS REAIS DO SEU PLC 700CX)
# Descobertos automaticamente em 2025-11-06
DBS = [
    # DBs Principais
    {"id": 1, "size": 200},    # DB1: Principal (velocidades, alarmes)
    {"id": 3, "size": 256},    # DB3: Controle de velocidade dinâmica
    {"id": 4, "size": 50},     # DB4: Principal emergência
    # {"id": 6, "size": 50},     # DB6: Auxiliar indexação - NAO ACESSIVEL
    # {"id": 7, "size": 50},     # DB7: Index cap janelas - NAO ACESSIVEL
    {"id": 10, "size": 10},    # DB10: Ventiladores
    # {"id": 20, "size": 50},    # DB20: Alarmes - ❌ REMOVIDA DO PLC
    # {"id": 40, "size": 50},    # DB40: Alarmes - ❌ REMOVIDA DO PLC
    # {"id": 50, "size": 50},    # DB50: Alarmes - ❌ REMOVIDA DO PLC
    
    # DBs Info e Status
    {"id": 101, "size": 500},  # DB101: Info
    {"id": 103, "size": 500},  # DB103: Drives
    {"id": 104, "size": 10},   # DB104: Info dispositivos
    {"id": 181, "size": 10},   # DB181: Comm alimentador
    
    # DBs Classificação
    {"id": 200, "size": 500},  # DB200: Classificação
    {"id": 201, "size": 500},  # DB201: Classificação
    {"id": 202, "size": 2000}, # DB202: Nome dinâmico
    {"id": 209, "size": 2000}, # DB209: Visib tipo ovo
    
    # DBs Predição Branco (P1-P7, Visio, Crack)
    {"id": 210, "size": 100},  # DB210: Pred Branco P1
    {"id": 211, "size": 100},  # DB211: Pred Branco P2
    {"id": 212, "size": 100},  # DB212: Pred Branco P3
    {"id": 213, "size": 100},  # DB213: Pred Branco P4
    {"id": 214, "size": 100},  # DB214: Pred Branco P5
    {"id": 215, "size": 100},  # DB215: Pred Branco P6
    {"id": 216, "size": 100},  # DB216: Pred Branco P7
    {"id": 217, "size": 10},   # DB217: Pred Branco Visio
    {"id": 218, "size": 100},  # DB218: Pred Branco Crack
    
    # DB Pesagem
    {"id": 229, "size": 1000}, # DB229: Pesagem (alarmes calibração)
    
    # DBs Esteira Inline (Acumuladora / Dosificadora / Escovas)
    # {"id": 901, "size": 20},   # DB901: Esteira Inline - ❌ REMOVIDA DO PLC
    # {"id": 911, "size": 20},   # DB911: Dosificadora Inline - ❌ REMOVIDA DO PLC
    {"id": 921, "size": 20},   # DB921: Escovas (comandos, velocidades)
    
    # DBs Predição Vermelho (P1-P7)
    {"id": 360, "size": 100},  # DB360: Pred Vermelho P1
    {"id": 361, "size": 100},  # DB361: Pred Vermelho P2
    {"id": 362, "size": 100},  # DB362: Pred Vermelho P3
    {"id": 363, "size": 100},  # DB363: Pred Vermelho P4
    {"id": 364, "size": 100},  # DB364: Pred Vermelho P5
    {"id": 365, "size": 100},  # DB365: Pred Vermelho P6
    {"id": 366, "size": 100},  # DB366: Pred Vermelho P7
    
    # DB Solenoide
    {"id": 400, "size": 5000}, # DB400: Solenoide (muitos alarmes)
]

# Configurações de timing
# ✅ CORREÇÃO: Aumentado de 0.2s para 0.5s para reduzir carga no PLC
POLLING_INTERVAL = 0.5  # 500ms entre leituras (era 200ms)
RECONNECT_INTERVAL = 5.0  # 5s entre tentativas de reconexão
PING_TIMEOUT = 1  # 1s timeout para ping

# Forçar PLC específico (deixe None para auto-detecção)
# Exemplo: FORCE_PLC_IP = "100.70.0.10"  # Força usar 700CX
FORCE_PLC_IP = None  # None = auto-detecção

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ============================================================================
# MODELOS PYDANTIC
# ============================================================================

class StatusResponse(BaseModel):
    connected: bool
    machine_name: Optional[str]
    machine_ip: Optional[str]
    uptime_seconds: float
    last_read: Optional[str]
    read_count: int
    error_count: int


class AlarmEvent(BaseModel):
    tag: str
    db: int
    offset: int
    bit: int
    value: bool
    timestamp: str


# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================

def ping_ip(ip: str, timeout: int = PING_TIMEOUT) -> bool:
    """
    Verifica se um IP responde ao ping.
    
    Args:
        ip: Endereço IP a testar
        timeout: Tempo limite em segundos
        
    Returns:
        True se o IP responder, False caso contrário
    """
    try:
        # Detecta o sistema operacional
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
        
        # Comando ping com 1 pacote
        command = ['ping', param, '1', timeout_param, str(timeout * 1000 if platform.system().lower() == 'windows' else timeout), ip]
        
        # Executa ping
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout + 1
        )
        
        return result.returncode == 0
    except Exception as e:
        logger.debug(f"Erro ao fazer ping em {ip}: {e}")
        return False


def test_snap7_connection(plc_config: Dict, timeout: int = 3) -> bool:
    """
    Testa se consegue conectar via Snap7.
    
    Args:
        plc_config: Configuração do PLC
        timeout: Timeout em segundos
        
    Returns:
        True se conectou com sucesso
    """
    test_client = None
    try:
        # Cria novo cliente para teste
        test_client = snap7.client.Client()
        
        # Conecta diretamente sem alterar parâmetros
        test_client.connect(plc_config['ip'], plc_config['rack'], plc_config['slot'])
        
        # Verifica se conectou
        if test_client.get_connected():
            return True
        return False
    except Exception as e:
        logger.debug(f"   Snap7 test falhou: {e}")
        return False
    finally:
        # Garante que desconecta
        if test_client:
            try:
                test_client.disconnect()
                test_client.destroy()
            except:
                pass


def detect_active_plc(plc_list: List[Dict]) -> Optional[Dict]:
    """
    Detecta qual PLC está ativo através de ping E teste Snap7.
    
    Args:
        plc_list: Lista de configurações de PLCs
        
    Returns:
        Dicionário com configuração do PLC ativo ou None
    """
    # Se FORCE_PLC_IP está definido, usa apenas ele
    if FORCE_PLC_IP:
        logger.info(f"🎯 Forçando conexão com IP: {FORCE_PLC_IP}")
        for plc in plc_list:
            if plc['ip'] == FORCE_PLC_IP:
                logger.info(f"   Usando {plc['name']} ({plc['ip']})...")
                return plc
        logger.error(f"❌ IP forçado {FORCE_PLC_IP} não encontrado na configuração!")
        return None
    
    logger.info("🔍 Procurando PLC ativo...")
    
    for plc in plc_list:
        logger.info(f"   Testando {plc['name']} ({plc['ip']})...")
        
        # Teste 1: Ping (rápido)
        if not ping_ip(plc['ip']):
            logger.info(f"      ❌ Ping falhou")
            continue
        
        logger.info(f"      ✓ Ping OK")
        
        # Teste 2: Conexão Snap7 (mais confiável)
        logger.info(f"      Testando conexão Snap7...")
        if test_snap7_connection(plc):
            logger.info(f"✅ PLC encontrado e acessível: {plc['name']} ({plc['ip']})")
            return plc
        else:
            logger.warning(f"      ⚠️  Ping OK mas Snap7 falhou (porta 102 bloqueada?)")
    
    logger.warning("❌ Nenhum PLC acessível via Snap7")
    return None


# ============================================================================
# CLASSE SNAP7 HANDLER
# ============================================================================

class Snap7Handler:
    """
    Gerencia a conexão Snap7 com o PLC.
    Responsável por conectar, ler, escrever e reconectar.
    """
    
    def __init__(self):
        self.client = snap7.client.Client()
        self.connected = False
        self.current_plc = None
        self.connection_time = None
        self.last_error = None
        self._io_lock = threading.Lock()  # Lock para operações I/O
        self.last_successful_read = None  # ✅ Heartbeat: timestamp da última leitura OK
        
    def connect(self, plc_config: Dict) -> bool:
        """
        Conecta ao PLC especificado.
        
        Args:
            plc_config: Dicionário com ip, rack, slot
            
        Returns:
            True se conectou com sucesso
        """
        try:
            # Desconecta e destrói cliente antigo se existir
            if self.connected:
                self.disconnect()
            
            # IMPORTANTE: Recria o cliente a cada conexão
            # Isso evita o erro "Cannot change this param now"
            try:
                if self.client:
                    self.client.destroy()
            except:
                pass
            
            self.client = snap7.client.Client()
            
            # Tenta conectar
            self.client.connect(
                plc_config['ip'],
                plc_config['rack'],
                plc_config['slot']
            )
            
            # Verifica se conectou
            if self.client.get_connected():
                self.connected = True
                self.current_plc = plc_config
                self.connection_time = time.time()
                logger.info(f"✅ Conectado à máquina {plc_config['name']} ({plc_config['ip']})")
                return True
            else:
                logger.error(f"❌ Falha ao conectar em {plc_config['ip']}")
                return False
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"❌ Erro ao conectar: {e}")
            self.connected = False
            return False
    
    def disconnect(self):
        """Desconecta do PLC."""
        try:
            if self.client.get_connected():
                self.client.disconnect()
            self.connected = False
            logger.info("🔌 Desconectado do PLC")
        except Exception as e:
            logger.error(f"Erro ao desconectar: {e}")
    
    def read_db(self, db_number: int, start: int, size: int) -> Optional[bytearray]:
        """
        Lê um bloco de dados da DB.
        
        Args:
            db_number: Número da DB
            start: Offset inicial
            size: Tamanho em bytes
            
        Returns:
            bytearray com os dados ou None em caso de erro
        """
        try:
            if not self.connected:
                return None
            
            with self._io_lock:  # Sincroniza com escritas
                data = self.client.db_read(db_number, start, size)
            
            # ✅ Atualiza heartbeat após leitura bem-sucedida
            self.last_successful_read = time.time()
            return data
            
        except Exception as e:
            self.last_error = str(e)
            error_msg = str(e)
            
            # ✅ MELHORIA: Não marca conexão como perdida se a DB simplesmente não existe
            # Apenas loga o erro e retorna None
            if "Item not available" in error_msg:
                # DB não existe no PLC - não é erro de conexão
                logger.warning(f"⚠️ DB{db_number} não disponível no PLC: {error_msg}")
            else:
                # Outros erros podem indicar perda de conexão
                logger.error(f"❌ Erro ao ler DB{db_number}: {e}")
                self.connected = False
            
            return None
    
    def write_db(self, db_number: int, start: int, data: bytearray) -> bool:
        """
        Escreve dados na DB.
        
        Args:
            db_number: Número da DB
            start: Offset inicial
            data: Dados a escrever
            
        Returns:
            True se escreveu com sucesso
        """
        try:
            if not self.connected:
                return False
            
            with self._io_lock:  # Sincroniza com leituras
                self.client.db_write(db_number, start, data)
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"❌ Erro ao escrever DB{db_number}: {e}")
            self.connected = False
            return False
    
    def get_uptime(self) -> float:
        """Retorna o tempo de conexão em segundos."""
        if self.connection_time:
            return time.time() - self.connection_time
        return 0.0


# ============================================================================
# CLASSE DATAHUB
# ============================================================================

class DataHub:
    """
    Gerenciador central de dados do PLC.
    Mantém cache, gerencia leitura cíclica e fornece interface para API.
    """
    
    def __init__(self, plc_configs: List[Dict], dbs: List[Dict]):
        self.plc_configs = plc_configs
        self.dbs = dbs
        self.snap7_handler = Snap7Handler()
        
        # PLC ativo
        self.active_machine = None
        
        # Cache de dados: {db_id: bytearray}
        self.cache: Dict[int, bytearray] = {}
        
        # Cache anterior para detecção de mudanças
        self.previous_cache: Dict[int, bytearray] = {}
        
        # Estatísticas
        self.read_count = 0
        self.error_count = 0
        self.last_read_time = None
        
        # Controle de threads
        self.running = False
        self.read_thread = None
        
        # WebSocket connections
        self.ws_connections: List[WebSocket] = []
        
        # Lock para acesso seguro ao cache
        self.cache_lock = threading.Lock()
    
    def start(self):
        """Inicia o DataHub."""
        logger.info("🚀 Iniciando DataHub...")
        
        # Detecta e conecta ao PLC
        if not self._initial_connection():
            logger.warning("⚠️  Iniciando em modo desconectado - tentará reconectar...")
        
        # Inicia thread de leitura
        self.running = True
        self.read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self.read_thread.start()
        
        logger.info("✅ DataHub iniciado com sucesso")
    
    def stop(self):
        """Para o DataHub."""
        logger.info("🛑 Parando DataHub...")
        self.running = False
        
        if self.read_thread:
            self.read_thread.join(timeout=2)
        
        self.snap7_handler.disconnect()
        logger.info("✅ DataHub parado")
    
    def _initial_connection(self) -> bool:
        """Estabelece conexão inicial com PLC."""
        plc = detect_active_plc(self.plc_configs)
        if plc:
            self.active_machine = plc.get("name")
            return self.snap7_handler.connect(plc)
        return False
    
    def _read_loop(self):
        """Loop principal de leitura cíclica."""
        logger.info(f"📡 Iniciando leitura cíclica (intervalo: {POLLING_INTERVAL}s)")
        
        reconnect_attempts = 0
        max_reconnect_attempts = 3
        last_heartbeat_check = time.time()
        
        while self.running:
            try:
                # ✅ HEARTBEAT CHECK: Verifica se houve leitura bem-sucedida nos últimos 30s
                # Se não houver, força reconexão (possível deadlock ou freeze)
                now = time.time()
                if (now - last_heartbeat_check) > 30:  # Checa a cada 30s
                    last_heartbeat_check = now
                    if self.snap7_handler.last_successful_read:
                        time_since_last_read = now - self.snap7_handler.last_successful_read
                        if time_since_last_read > 60:  # 60s sem leitura OK
                            logger.warning(f"⚠️ HEARTBEAT FAIL: {time_since_last_read:.1f}s sem leitura bem-sucedida - forçando reconexão")
                            self.snap7_handler.connected = False
                
                # Verifica se está conectado
                if not self.snap7_handler.connected:
                    reconnect_attempts += 1
                    logger.warning(f"❌ Conexão perdida - tentativa {reconnect_attempts}/{max_reconnect_attempts}")
                    
                    # Tenta reconectar ao mesmo PLC
                    if self.snap7_handler.current_plc:
                        success = self.snap7_handler.connect(self.snap7_handler.current_plc)
                        if success:
                            reconnect_attempts = 0
                            continue
                    
                    # Se falhou várias vezes, tenta detectar outro PLC
                    if reconnect_attempts >= max_reconnect_attempts:
                        logger.info("🔄 Procurando outro PLC disponível...")
                        self._initial_connection()
                        reconnect_attempts = 0
                    
                    time.sleep(RECONNECT_INTERVAL)
                    continue
                
                # Lê todas as DBs
                self._read_all_dbs()
                
                # Aguarda próximo ciclo
                time.sleep(POLLING_INTERVAL)
                
            except Exception as e:
                logger.error(f"❌ Erro no loop de leitura: {e}")
                import traceback
                traceback.print_exc()
                self.error_count += 1
                time.sleep(1)
    
    def _read_all_dbs(self):
        """
        Lê todas as DBs configuradas.
        
        CORREÇÃO CRÍTICA: Atualiza cache apenas se leitura completa bem-sucedida
        para evitar mix de dados novos com antigos (causa oscilação na UI).
        """
        try:
            # Salva cache anterior para detecção de mudanças
            with self.cache_lock:
                self.previous_cache = self.cache.copy()
            
            # ✅ LOG DE DIAGNÓSTICO: Mostra a cada 100 leituras
            if self.read_count > 0 and self.read_count % 100 == 0:
                uptime = time.time() - self.snap7_handler.connection_time if self.snap7_handler.connection_time else 0
                success_rate = (self.read_count / (self.read_count + self.error_count)) * 100 if (self.read_count + self.error_count) > 0 else 0
                logger.info(f"[DATAHUB] 📊 Stats: {self.read_count} leituras OK, {self.error_count} erros ({success_rate:.1f}% sucesso), uptime: {uptime/60:.1f}min")
            
            # Lê cada DB
            new_cache = {}
            failed_dbs = []
            
            for db_config in self.dbs:
                db_id = db_config['id']
                size = db_config['size']
                
                data = self.snap7_handler.read_db(db_id, 0, size)
                if data is not None:
                    new_cache[db_id] = data
                else:
                    failed_dbs.append(db_id)
            
            # DBs CRÍTICAS que devem estar sempre disponíveis
            # Estas DBs contêm dados essenciais (velocidades, alarmes principais, status)
            # NOTA: DBs 101 e 200 removidas da lista crítica para não bloquear leitura
            critical_dbs = [1, 3, 4, 10]  # ✅ Apenas DBs principais confirmadas
            critical_failed = [db for db in failed_dbs if db in critical_dbs]
            non_critical_failed = [db for db in failed_dbs if db not in critical_dbs]
            
            # ✅ CORREÇÃO: Só atualiza cache se DBs críticas foram lidas com sucesso
            # Isso garante que não vamos misturar dados novos com dados antigos
            if not critical_failed and len(new_cache) >= len(critical_dbs):
                # Atualização completa - SUBSTITUI cache inteiro (não usa .update()!)
                with self.cache_lock:
                    self.cache = new_cache  # ✅ Substitui completamente
                    self.last_read_time = datetime.now()
                
                self.read_count += 1
                
                # Detecta mudanças e notifica WebSockets
                self._detect_and_notify_changes()
                
                # Log DBs não críticas que falharam (apenas a cada 50 leituras)
                if non_critical_failed and self.read_count % 50 == 0:
                    logger.info(f"ℹ️ DBs não críticas indisponíveis: {non_critical_failed}")
                
                # Log sucesso apenas a cada 50 leituras para não poluir
                if self.read_count % 50 == 0:
                    logger.debug(f"✓ {self.read_count} leituras bem-sucedidas")
            
            elif critical_failed:
                # DBs críticas falharam - mantém cache anterior consistente
                logger.warning(f"⚠️ DBs críticas falharam: {critical_failed} - mantendo cache anterior")
                if non_critical_failed:
                    logger.info(f"ℹ️ DBs não críticas também falharam: {non_critical_failed}")
                self.error_count += 1
            
            else:
                # Sem dados - mantém cache anterior
                logger.warning(f"⚠️ Nenhuma DB lida - mantendo cache anterior")
                self.error_count += 1
                
        except Exception as e:
            logger.error(f"❌ Erro ao ler DBs: {e}")
            import traceback
            traceback.print_exc()
            self.error_count += 1
    
    def _detect_and_notify_changes(self):
        """Detecta mudanças nos bits e notifica clientes WebSocket."""
        if not self.ws_connections:
            return
        
        changes = []
        
        with self.cache_lock:
            for db_id in self.cache:
                if db_id not in self.previous_cache:
                    continue
                
                current = self.cache[db_id]
                previous = self.previous_cache[db_id]
                
                # Compara byte por byte
                for offset in range(min(len(current), len(previous))):
                    if current[offset] != previous[offset]:
                        # Detecta quais bits mudaram
                        for bit in range(8):
                            current_bit = bool(current[offset] & (1 << bit))
                            previous_bit = bool(previous[offset] & (1 << bit))
                            
                            if current_bit != previous_bit:
                                changes.append({
                                    'tag': f'DB{db_id}.DBX{offset}.{bit}',
                                    'db': db_id,
                                    'offset': offset,
                                    'bit': bit,
                                    'value': current_bit,
                                    'timestamp': datetime.now().isoformat()
                                })
        
        # Notifica mudanças via WebSocket
        if changes:
            asyncio.run(self._broadcast_changes(changes))
    
    async def _broadcast_changes(self, changes: List[Dict]):
        """Envia mudanças para todos os clientes WebSocket."""
        if not self.ws_connections:
            return
        
        message = json.dumps({
            'type': 'alarm_changes',
            'changes': changes,
            'count': len(changes)
        })
        
        # Remove conexões fechadas
        disconnected = []
        for ws in self.ws_connections:
            try:
                await ws.send_text(message)
            except:
                disconnected.append(ws)
        
        for ws in disconnected:
            self.ws_connections.remove(ws)
    
    def get_cache_snapshot(self) -> Dict:
        """Retorna snapshot do cache atual."""
        with self.cache_lock:
            return {
                f'db{db_id}': {
                    'size': len(data),
                    'data': list(data)  # Converte bytearray para lista
                }
                for db_id, data in self.cache.items()
            }
    
    def get_db_data(self, db_id: int) -> Optional[Dict]:
        """Retorna dados de uma DB específica."""
        with self.cache_lock:
            if db_id in self.cache:
                data = self.cache[db_id]
                return {
                    'db': db_id,
                    'size': len(data),
                    'data': list(data)
                }
        return None
    
    def get_status(self) -> Dict:
        """Retorna status do DataHub."""
        plc = self.snap7_handler.current_plc
        return {
            'connected': self.snap7_handler.connected,
            'machine_name': plc['name'] if plc else None,
            'machine_ip': plc['ip'] if plc else None,
            'uptime_seconds': self.snap7_handler.get_uptime(),
            'last_read': self.last_read_time.isoformat() if self.last_read_time else None,
            'read_count': self.read_count,
            'error_count': self.error_count,
            'ws_clients': len(self.ws_connections)
        }
    
    def add_ws_connection(self, ws: WebSocket):
        """Adiciona conexão WebSocket."""
        self.ws_connections.append(ws)
        logger.info(f"➕ Cliente WebSocket conectado (total: {len(self.ws_connections)})")
    
    def remove_ws_connection(self, ws: WebSocket):
        """Remove conexão WebSocket."""
        if ws in self.ws_connections:
            self.ws_connections.remove(ws)
            logger.info(f"➖ Cliente WebSocket desconectado (total: {len(self.ws_connections)})")


# ============================================================================
# INSTÂNCIA GLOBAL DO DATAHUB
# ============================================================================

datahub = DataHub(PLC_CONFIGS, DBS)


# ============================================================================
# FASTAPI APPLICATION
# ============================================================================

app = FastAPI(
    title="DataHub PLC",
    description="Sistema de comunicação robusto com PLC Siemens via Snap7",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# ENDPOINTS REST
# ============================================================================

@app.get("/")
async def root():
    """Endpoint raiz."""
    return {
        "service": "DataHub PLC",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/api/status", response_model=StatusResponse)
async def get_status():
    """Retorna status do DataHub."""
    status = datahub.get_status()
    return StatusResponse(**status)


@app.get("/api/data")
async def get_all_data():
    """Retorna todos os dados em cache."""
    return {
        "timestamp": datetime.now().isoformat(),
        "data": datahub.get_cache_snapshot()
    }


@app.get("/api/data/{db_id}")
async def get_db_data(db_id: int):
    """Retorna dados de uma DB específica."""
    data = datahub.get_db_data(db_id)
    if data:
        return {
            "timestamp": datetime.now().isoformat(),
            "db": data
        }
    # Retorna estrutura vazia se DB não está em cache
    return {
        "timestamp": datetime.now().isoformat(),
        "db": {
            "db": db_id,
            "size": 0,
            "data": []
        },
        "warning": f"DB {db_id} não disponível no cache",
        "available_dbs": list(datahub.cache.keys()),
        "connected": datahub.snap7_handler.connected
    }


@app.post("/api/write/{db_id}")
async def write_data(db_id: int, offset: int, data_type: str = "INT", request: Request = None, value: str = Query(None)):
    """
    Escreve dados em uma DB específica.
    
    Args:
        db_id: Número da DB
        offset: Offset na DB  
        value: Valor a escrever (int, float ou string para STRING) - pode vir via query param ou JSON body
        data_type: Tipo de dado (BOOL, BYTE, INT, WORD, DINT, DWORD, REAL, STRING)
    
    Exemplo: POST /api/write/1?offset=124&value=500.5&data_type=REAL
    Exemplo: POST /api/write/202?offset=0&data_type=STRING com JSON body {"value": "Classe1"}
    """
    import struct
    
    try:
        # ✅ Tenta obter valor do JSON body primeiro (para STRING), senão usa query param
        if request and request.headers.get("content-type", "").startswith("application/json"):
            try:
                body = await request.json()
                if "value" in body:
                    value = body["value"]
            except:
                pass  # Se não conseguir ler JSON, usa query param
        
        if value is None:
            return {
                "success": False,
                "error": "Valor não fornecido (use query param 'value' ou JSON body {'value': ...})"
            }
        # Converte valor para bytearray conforme tipo
        if data_type == "BOOL":
            # Para BOOL, value deve ser o bit number
            bit = int(value) if value < 8 else 0
            # Lê byte atual, modifica bit, escreve de volta
            current = datahub.cache.get(f"db{db_id}", {}).get("data", bytearray())
            if offset < len(current):
                byte_val = current[offset]
                if bit:
                    byte_val |= (1 << bit)
                else:
                    byte_val &= ~(1 << bit)
                data = bytearray([byte_val])
            else:
                data = bytearray([1 if value else 0])
        
        elif data_type in ["BYTE", "USINT"]:
            data = bytearray([int(value) & 0xFF])
        
        elif data_type in ["INT", "SINT"]:
            # 16-bit signed integer, big-endian
            data = bytearray(struct.pack('>h', int(value)))
        
        elif data_type in ["WORD", "UINT"]:
            # 16-bit unsigned integer, big-endian
            data = bytearray(struct.pack('>H', int(value)))
        
        elif data_type in ["DINT"]:
            # 32-bit signed integer, big-endian
            data = bytearray(struct.pack('>i', int(value)))
        
        elif data_type in ["DWORD", "UDINT"]:
            # 32-bit unsigned integer, big-endian
            data = bytearray(struct.pack('>I', int(value)))
        
        elif data_type == "REAL":
            # 32-bit float, big-endian
            data = bytearray(struct.pack('>f', float(value)))
        
        elif data_type == "STRING":
            # STRING no S7-1200/1500:
            # - Byte 0 (offset): tamanho máximo (geralmente 254 para STRING[254])
            # - Byte 1 (offset+1): tamanho atual (quantos caracteres estão sendo usados)
            # - Bytes 2+ (offset+2 até offset+1+current_length): os caracteres
            str_value = str(value) if value is not None else ""
            str_bytes = str_value.encode('utf-8')
            current_length = min(len(str_bytes), 254)  # Limita a 254 bytes
            
            # Lê o tamanho máximo atual da DB (se disponível)
            current_db_data = datahub.cache.get(f"db{db_id}", {}).get("data", bytearray())
            max_length = 254  # Default
            if offset < len(current_db_data):
                max_length = current_db_data[offset]
                if max_length == 0:
                    max_length = 254  # Fallback
            
            # Limita o tamanho atual ao máximo permitido
            current_length = min(current_length, max_length)
            
            # Monta o bytearray: [max_length, current_length, ...bytes...]
            data = bytearray([max_length, current_length]) + str_bytes[:current_length]
            # Preenche com zeros até o tamanho máximo + 2 (max_length + current_length + dados)
            total_size = max_length + 2
            if len(data) < total_size:
                data.extend(bytearray(total_size - len(data)))
        
        else:
            # Default: trata como byte
            data = bytearray([int(value) & 0xFF])
        
        # DEBUG: Verificar status de conexão
        logger.info(f"[WRITE] Tentando escrever DB{db_id}.{offset} = {value} ({data_type})")
        logger.info(f"[WRITE] Handler conectado: {datahub.snap7_handler.connected}")
        logger.info(f"[WRITE] DataHub ativo: {datahub.active_machine}")
        
        success = datahub.snap7_handler.write_db(db_id, offset, data)
        
        if success:
            logger.info(f"[WRITE] Sucesso ao escrever DB{db_id}.{offset}")
            return {
                "success": True,
                "message": f"Escrito {data_type} valor {value} em DB{db_id}.{offset}"
            }
        else:
            logger.error(f"[WRITE] Falha ao escrever DB{db_id}.{offset}")
            logger.error(f"[WRITE] Último erro: {datahub.snap7_handler.last_error}")
            return {
                "success": False,
                "error": f"Falha ao escrever - Handler conectado: {datahub.snap7_handler.connected}, Erro: {datahub.snap7_handler.last_error}"
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# ============================================================================
# WEBSOCKET
# ============================================================================

@app.websocket("/ws/alarms")
async def websocket_alarms(websocket: WebSocket):
    """
    WebSocket para notificações de mudanças em tempo real.
    Envia apenas quando há mudanças de estado.
    """
    await websocket.accept()
    datahub.add_ws_connection(websocket)
    
    try:
        # Envia status inicial
        await websocket.send_json({
            "type": "connected",
            "message": "Conectado ao DataHub",
            "status": datahub.get_status()
        })
        
        # Mantém conexão aberta
        while True:
            # Recebe mensagens (para manter conexão viva)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                # Pode processar comandos aqui se necessário
            except asyncio.TimeoutError:
                # Envia ping para manter conexão viva
                await websocket.send_json({"type": "ping"})
            
    except WebSocketDisconnect:
        datahub.remove_ws_connection(websocket)
    except Exception as e:
        logger.error(f"Erro no WebSocket: {e}")
        datahub.remove_ws_connection(websocket)


# ============================================================================
# EVENTOS DE LIFECYCLE
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Evento de inicialização do FastAPI."""
    logger.info("=" * 60)
    logger.info("🚀 INICIANDO DATAHUB PLC")
    logger.info("=" * 60)
    datahub.start()


@app.on_event("shutdown")
async def shutdown_event():
    """Evento de encerramento do FastAPI."""
    logger.info("=" * 60)
    logger.info("🛑 ENCERRANDO DATAHUB PLC")
    logger.info("=" * 60)
    datahub.stop()


# ============================================================================
# FUNÇÕES DE INTEGRAÇÃO
# ============================================================================

def get_data() -> Dict:
    """
    Função de conveniência para integração externa.
    Retorna snapshot do cache.
    """
    return datahub.get_cache_snapshot()


def get_status_dict() -> Dict:
    """
    Função de conveniência para integração externa.
    Retorna status do DataHub.
    """
    return datahub.get_status()


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Função principal."""
    try:
        # Configuração do servidor
        config = uvicorn.Config(
            app=app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            access_log=True
        )
        
        server = uvicorn.Server(config)
        
        logger.info("=" * 60)
        logger.info("🌐 Servidor disponível em:")
        logger.info("   REST API: http://0.0.0.0:8000")
        logger.info("   WebSocket: ws://0.0.0.0:8000/ws/alarms")
        logger.info("   Docs: http://0.0.0.0:8000/docs")
        logger.info("=" * 60)
        
        server.run()
        
    except KeyboardInterrupt:
        logger.info("\n⚠️  Interrompido pelo usuário")
    except Exception as e:
        logger.error(f"❌ Erro fatal: {e}")
        raise


if __name__ == "__main__":
    main()

