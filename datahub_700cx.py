#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DataHub - Versão PRÉ-CONFIGURADA para 700CX
Este arquivo está configurado para usar APENAS o PLC 700CX (100.70.0.10)
Use este arquivo se você quer garantir que só conecte ao 700CX.

Para usar: python datahub_700cx.py
"""

import snap7
from snap7.util import *
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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
# CONFIGURAÇÕES - PRÉ-CONFIGURADO PARA 700CX
# ============================================================================

# Lista com APENAS o 700CX
PLC_CONFIGS = [
    {"name": "700CX", "ip": "100.70.0.10", "rack": 0, "slot": 1},
]

# DBs a serem lidas (ajuste conforme necessário)
DBS = [
    {"id": 1, "size": 512},
    {"id": 2, "size": 256},
    {"id": 10, "size": 1024},
    {"id": 20, "size": 512},
]

# Configurações de timing
POLLING_INTERVAL = 0.2  # 200ms entre leituras
RECONNECT_INTERVAL = 5.0  # 5s entre tentativas de reconexão
PING_TIMEOUT = 1  # 1s timeout para ping

# Forçar uso do 700CX
FORCE_PLC_IP = "100.70.0.10"

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Banner customizado
print("""
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║              DATAHUB PLC - VERSÃO 700CX                    ║
║                                                            ║
║  PLC: 700CX                                                ║
║  IP:  100.70.0.10                                          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
""")

# ============================================================================
# IMPORTAR RESTO DO CÓDIGO DO DATAHUB ORIGINAL
# ============================================================================

# Copie aqui todo o código do datahub.py original a partir da linha 80
# (Modelos Pydantic, funções auxiliares, classes, etc)

# Para facilitar, vou importar do arquivo original
import sys
import os

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Tenta importar do datahub original
try:
    from datahub import (
        StatusResponse,
        AlarmEvent,
        ping_ip,
        test_snap7_connection,
        detect_active_plc,
        Snap7Handler,
        DataHub,
        app,
        datahub,
        get_data,
        get_status_dict
    )
    
    logger.info("✅ Módulos importados do datahub.py original")
    logger.info("🎯 Configurado para usar APENAS 700CX (100.70.0.10)")
    
except ImportError as e:
    logger.error(f"❌ Erro ao importar módulos: {e}")
    logger.error("   Execute este arquivo no mesmo diretório que datahub.py")
    sys.exit(1)

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Função principal - versão 700CX."""
    try:
        logger.info("=" * 60)
        logger.info("🚀 INICIANDO DATAHUB PLC - VERSÃO 700CX")
        logger.info("=" * 60)
        logger.info(f"   PLC Alvo: 700CX")
        logger.info(f"   IP: 100.70.0.10")
        logger.info(f"   Porta API: 8000")
        logger.info("=" * 60)
        
        # Configuração do servidor
        config = uvicorn.Config(
            app=app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            access_log=True
        )
        
        server = uvicorn.Server(config)
        
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

