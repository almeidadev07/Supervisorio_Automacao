#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Exemplo de uso do DataHub
Demonstra como integrar o DataHub com sua aplicação existente
"""

import requests
import json
import time
from typing import Dict, Any

# ============================================================================
# CONFIGURAÇÕES
# ============================================================================

DATAHUB_URL = "http://localhost:8000"
API_DATA = f"{DATAHUB_URL}/api/data"
API_STATUS = f"{DATAHUB_URL}/api/status"

# ============================================================================
# FUNÇÕES DE INTEGRAÇÃO
# ============================================================================

def get_plc_status() -> Dict[str, Any]:
    """
    Obtém o status atual do DataHub.
    
    Returns:
        Dicionário com status da conexão
    """
    try:
        response = requests.get(API_STATUS, timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Status code: {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}


def get_all_plc_data() -> Dict[str, Any]:
    """
    Obtém todos os dados em cache do PLC.
    
    Returns:
        Dicionário com todos os dados
    """
    try:
        response = requests.get(API_DATA, timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Status code: {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}


def get_db_data(db_id: int) -> Dict[str, Any]:
    """
    Obtém dados de uma DB específica.
    
    Args:
        db_id: Número da DB (1, 2, 10, 20, etc)
        
    Returns:
        Dicionário com dados da DB
    """
    try:
        response = requests.get(f"{API_DATA}/{db_id}", timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Status code: {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}


def write_byte_to_plc(db_id: int, offset: int, value: int) -> Dict[str, Any]:
    """
    Escreve um byte no PLC.
    
    Args:
        db_id: Número da DB
        offset: Offset (posição) do byte
        value: Valor a escrever (0-255)
        
    Returns:
        Resultado da operação
    """
    try:
        response = requests.post(
            f"{DATAHUB_URL}/api/write/{db_id}",
            params={"offset": offset, "value": value},
            timeout=5
        )
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Status code: {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}


def read_bit_from_cache(db_data: bytearray, offset: int, bit: int) -> bool:
    """
    Lê um bit específico de um bytearray.
    
    Args:
        db_data: Dados da DB (bytearray ou list)
        offset: Offset do byte
        bit: Número do bit (0-7)
        
    Returns:
        True ou False
    """
    if isinstance(db_data, list):
        db_data = bytearray(db_data)
    
    if offset >= len(db_data):
        return False
    
    byte_value = db_data[offset]
    return bool(byte_value & (1 << bit))


def read_word_from_cache(db_data: bytearray, offset: int) -> int:
    """
    Lê uma WORD (16 bits) de um bytearray.
    
    Args:
        db_data: Dados da DB (bytearray ou list)
        offset: Offset inicial
        
    Returns:
        Valor da WORD (0-65535)
    """
    if isinstance(db_data, list):
        db_data = bytearray(db_data)
    
    if offset + 1 >= len(db_data):
        return 0
    
    # Big-endian (padrão Siemens)
    return (db_data[offset] << 8) | db_data[offset + 1]


def read_dword_from_cache(db_data: bytearray, offset: int) -> int:
    """
    Lê uma DWORD (32 bits) de um bytearray.
    
    Args:
        db_data: Dados da DB (bytearray ou list)
        offset: Offset inicial
        
    Returns:
        Valor da DWORD (0-4294967295)
    """
    if isinstance(db_data, list):
        db_data = bytearray(db_data)
    
    if offset + 3 >= len(db_data):
        return 0
    
    # Big-endian (padrão Siemens)
    return (db_data[offset] << 24) | (db_data[offset + 1] << 16) | \
           (db_data[offset + 2] << 8) | db_data[offset + 3]


# ============================================================================
# EXEMPLOS DE USO
# ============================================================================

def exemplo_1_verificar_status():
    """Exemplo 1: Verificar status da conexão."""
    print("\n" + "=" * 60)
    print("EXEMPLO 1: Verificar Status")
    print("=" * 60)
    
    status = get_plc_status()
    
    if "error" in status:
        print(f"❌ Erro: {status['error']}")
        return
    
    print(f"✅ Conectado: {status['connected']}")
    if status['connected']:
        print(f"   Máquina: {status['machine_name']} ({status['machine_ip']})")
        print(f"   Tempo ativo: {status['uptime_seconds']:.1f}s")
        print(f"   Leituras: {status['read_count']}")
        print(f"   Erros: {status['error_count']}")


def exemplo_2_ler_todos_dados():
    """Exemplo 2: Ler todos os dados."""
    print("\n" + "=" * 60)
    print("EXEMPLO 2: Ler Todos os Dados")
    print("=" * 60)
    
    result = get_all_plc_data()
    
    if "error" in result:
        print(f"❌ Erro: {result['error']}")
        return
    
    print(f"📅 Timestamp: {result['timestamp']}")
    print(f"📊 DBs disponíveis: {list(result['data'].keys())}")
    
    for db_name, db_info in result['data'].items():
        print(f"\n   {db_name.upper()}:")
        print(f"   - Tamanho: {db_info['size']} bytes")
        print(f"   - Primeiros bytes: {db_info['data'][:10]}...")


def exemplo_3_ler_db_especifica():
    """Exemplo 3: Ler DB específica."""
    print("\n" + "=" * 60)
    print("EXEMPLO 3: Ler DB Específica (DB1)")
    print("=" * 60)
    
    result = get_db_data(1)
    
    if "error" in result:
        print(f"❌ Erro: {result['error']}")
        return
    
    db = result['db']
    db_data = bytearray(db['data'])
    
    print(f"📊 DB{db['db']} - Tamanho: {db['size']} bytes")
    print(f"\nExemplos de leitura:")
    print(f"   - Bit DB1.DBX0.0: {read_bit_from_cache(db_data, 0, 0)}")
    print(f"   - Bit DB1.DBX0.7: {read_bit_from_cache(db_data, 0, 7)}")
    print(f"   - Word DB1.DBW0: {read_word_from_cache(db_data, 0)}")
    print(f"   - DWord DB1.DBD0: {read_dword_from_cache(db_data, 0)}")


def exemplo_4_monitorar_mudancas():
    """Exemplo 4: Monitorar mudanças (polling simples)."""
    print("\n" + "=" * 60)
    print("EXEMPLO 4: Monitorar Mudanças (10 segundos)")
    print("=" * 60)
    print("Pressione Ctrl+C para parar...")
    
    previous_data = None
    
    try:
        for i in range(10):
            result = get_db_data(1)
            
            if "error" not in result:
                current_data = result['db']['data']
                
                if previous_data and current_data != previous_data:
                    print(f"⚡ Mudança detectada no ciclo {i+1}!")
                else:
                    print(f"✓ Ciclo {i+1} - Sem mudanças")
                
                previous_data = current_data
            else:
                print(f"❌ Erro no ciclo {i+1}: {result['error']}")
            
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n⚠️  Monitoramento interrompido")


def exemplo_5_escrever_valor():
    """Exemplo 5: Escrever valor no PLC."""
    print("\n" + "=" * 60)
    print("EXEMPLO 5: Escrever Valor no PLC")
    print("=" * 60)
    
    # Escreve valor 100 na DB1, offset 10
    result = write_byte_to_plc(db_id=1, offset=10, value=100)
    
    if "error" in result:
        print(f"❌ Erro: {result['error']}")
        return
    
    if result.get('success'):
        print(f"✅ {result['message']}")
    else:
        print(f"❌ Falha: {result.get('error', 'Erro desconhecido')}")


def exemplo_6_integrar_com_flask():
    """Exemplo 6: Como integrar com Flask/outro framework."""
    print("\n" + "=" * 60)
    print("EXEMPLO 6: Integração com Flask")
    print("=" * 60)
    
    codigo = '''
# No seu app Flask:

from flask import Flask, jsonify
import requests

app = Flask(__name__)
DATAHUB_URL = "http://localhost:8000"

@app.route('/minha-rota/status')
def meu_status():
    """Rota que usa dados do DataHub."""
    try:
        # Obtém status do DataHub
        response = requests.get(f"{DATAHUB_URL}/api/status", timeout=5)
        datahub_status = response.json()
        
        # Obtém dados do PLC
        response = requests.get(f"{DATAHUB_URL}/api/data/1", timeout=5)
        plc_data = response.json()
        
        # Processa e retorna
        return jsonify({
            "conectado": datahub_status["connected"],
            "maquina": datahub_status["machine_name"],
            "dados_processados": processar_dados(plc_data)
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

def processar_dados(plc_data):
    """Processa dados do PLC conforme necessário."""
    # Sua lógica aqui
    return {"processado": True}
'''
    
    print(codigo)


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Executa todos os exemplos."""
    print("\n")
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 10 + "EXEMPLOS DE USO DO DATAHUB" + " " * 22 + "║")
    print("╚" + "═" * 58 + "╝")
    
    # Verifica se DataHub está rodando
    print("\n🔍 Verificando se DataHub está rodando...")
    try:
        response = requests.get(DATAHUB_URL, timeout=2)
        if response.status_code == 200:
            print("✅ DataHub está rodando!")
        else:
            print("⚠️  DataHub respondeu, mas com status inesperado")
    except Exception as e:
        print(f"❌ DataHub não está rodando!")
        print(f"   Erro: {e}")
        print(f"\n💡 Inicie o DataHub com: python datahub.py")
        return
    
    # Executa exemplos
    exemplo_1_verificar_status()
    time.sleep(1)
    
    exemplo_2_ler_todos_dados()
    time.sleep(1)
    
    exemplo_3_ler_db_especifica()
    time.sleep(1)
    
    exemplo_5_escrever_valor()
    time.sleep(1)
    
    exemplo_6_integrar_com_flask()
    
    # Exemplo 4 é interativo, deixar por último se desejar
    # exemplo_4_monitorar_mudancas()
    
    print("\n" + "=" * 60)
    print("✅ Exemplos concluídos!")
    print("=" * 60)
    print("\n💡 Dicas:")
    print("   - Use /api/status para verificar conexão")
    print("   - Use /api/data para obter todos os dados")
    print("   - Use /api/data/{db_id} para DB específica")
    print("   - Use WebSocket ws://localhost:8000/ws/alarms para tempo real")
    print("   - Acesse http://localhost:8000/docs para documentação interativa")
    print()


if __name__ == "__main__":
    main()

