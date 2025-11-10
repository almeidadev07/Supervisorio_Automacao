#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de teste rápido para o DataHub
Verifica se todas as funcionalidades estão operacionais
"""

import requests
import time
import sys
from datetime import datetime

# Cores para terminal
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_header(text):
    """Imprime cabeçalho colorido."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text:^60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")

def print_success(text):
    """Imprime mensagem de sucesso."""
    print(f"{Colors.GREEN}✓{Colors.RESET} {text}")

def print_error(text):
    """Imprime mensagem de erro."""
    print(f"{Colors.RED}✗{Colors.RESET} {text}")

def print_warning(text):
    """Imprime mensagem de aviso."""
    print(f"{Colors.YELLOW}⚠{Colors.RESET} {text}")

def print_info(text):
    """Imprime mensagem informativa."""
    print(f"{Colors.BLUE}ℹ{Colors.RESET} {text}")

# Configuração
DATAHUB_URL = "http://localhost:8000"
TIMEOUT = 5

# Contadores
tests_passed = 0
tests_failed = 0
tests_total = 0

def run_test(name, func):
    """Executa um teste e registra resultado."""
    global tests_passed, tests_failed, tests_total
    tests_total += 1
    
    print_info(f"Teste {tests_total}: {name}")
    try:
        func()
        tests_passed += 1
        print_success(f"Teste {tests_total} passou!\n")
        return True
    except AssertionError as e:
        tests_failed += 1
        print_error(f"Teste {tests_total} falhou: {e}\n")
        return False
    except Exception as e:
        tests_failed += 1
        print_error(f"Teste {tests_total} erro: {e}\n")
        return False

# ============================================================================
# TESTES
# ============================================================================

def test_servidor_rodando():
    """Testa se o servidor está respondendo."""
    response = requests.get(DATAHUB_URL, timeout=TIMEOUT)
    assert response.status_code == 200, "Servidor não respondeu com status 200"
    data = response.json()
    assert data['service'] == 'DataHub PLC', "Resposta incorreta do servidor"
    print(f"   Servidor: {data['service']} v{data['version']}")

def test_endpoint_status():
    """Testa endpoint /api/status."""
    response = requests.get(f"{DATAHUB_URL}/api/status", timeout=TIMEOUT)
    assert response.status_code == 200, "Endpoint status não respondeu"
    
    data = response.json()
    assert 'connected' in data, "Campo 'connected' ausente"
    assert 'machine_name' in data, "Campo 'machine_name' ausente"
    assert 'read_count' in data, "Campo 'read_count' ausente"
    
    print(f"   Conectado: {data['connected']}")
    if data['connected']:
        print(f"   Máquina: {data['machine_name']} ({data['machine_ip']})")
        print(f"   Tempo ativo: {data['uptime_seconds']:.1f}s")
        print(f"   Leituras: {data['read_count']}")
        print(f"   Erros: {data['error_count']}")

def test_endpoint_data_all():
    """Testa endpoint /api/data."""
    response = requests.get(f"{DATAHUB_URL}/api/data", timeout=TIMEOUT)
    assert response.status_code == 200, "Endpoint data não respondeu"
    
    data = response.json()
    assert 'timestamp' in data, "Campo 'timestamp' ausente"
    assert 'data' in data, "Campo 'data' ausente"
    
    dbs = list(data['data'].keys())
    print(f"   DBs disponíveis: {dbs}")
    print(f"   Total de DBs: {len(dbs)}")

def test_endpoint_data_db1():
    """Testa endpoint /api/data/1."""
    response = requests.get(f"{DATAHUB_URL}/api/data/1", timeout=TIMEOUT)
    assert response.status_code == 200, "Endpoint data/1 não respondeu"
    
    data = response.json()
    assert 'db' in data, "Campo 'db' ausente"
    
    db = data['db']
    assert 'db' in db, "Campo 'db' ausente no objeto db"
    assert 'size' in db, "Campo 'size' ausente"
    assert 'data' in db, "Campo 'data' ausente"
    
    print(f"   DB{db['db']} - Tamanho: {db['size']} bytes")
    if db['size'] > 0:
        print(f"   Primeiros bytes: {db['data'][:10]}")
    else:
        print(f"   ⚠️  DB vazia (PLC não conectado)")
        if 'warning' in data:
            print(f"   Aviso: {data['warning']}")

def test_endpoint_docs():
    """Testa se a documentação está acessível."""
    response = requests.get(f"{DATAHUB_URL}/docs", timeout=TIMEOUT)
    assert response.status_code == 200, "Documentação não acessível"
    print("   Documentação disponível em /docs")

def test_latencia_leitura():
    """Testa latência das leituras."""
    # Verifica se está conectado primeiro
    status = requests.get(f"{DATAHUB_URL}/api/status", timeout=TIMEOUT).json()
    
    latencias = []
    
    for i in range(5):
        start = time.time()
        response = requests.get(f"{DATAHUB_URL}/api/data/1", timeout=TIMEOUT)
        latencia = (time.time() - start) * 1000  # em ms
        latencias.append(latencia)
        assert response.status_code == 200, f"Falha na leitura {i+1}"
    
    latencia_media = sum(latencias) / len(latencias)
    latencia_min = min(latencias)
    latencia_max = max(latencias)
    
    print(f"   Latência média: {latencia_media:.1f}ms")
    print(f"   Latência min: {latencia_min:.1f}ms")
    print(f"   Latência max: {latencia_max:.1f}ms")
    
    if status['connected']:
        # Quando conectado, espera latência baixa
        assert latencia_media < 1000, f"Latência muito alta: {latencia_media:.1f}ms"
    else:
        # Quando desconectado, aceita qualquer latência
        print(f"   ⚠️  PLC não conectado - latências podem ser maiores")

def test_dados_consistentes():
    """Testa se os dados são consistentes entre leituras."""
    # Lê duas vezes rapidamente
    response1 = requests.get(f"{DATAHUB_URL}/api/data/1", timeout=TIMEOUT)
    time.sleep(0.1)
    response2 = requests.get(f"{DATAHUB_URL}/api/data/1", timeout=TIMEOUT)
    
    assert response1.status_code == 200, "Primeira leitura falhou"
    assert response2.status_code == 200, "Segunda leitura falhou"
    
    json1 = response1.json()
    json2 = response2.json()
    
    assert 'db' in json1, "Campo 'db' ausente na primeira leitura"
    assert 'db' in json2, "Campo 'db' ausente na segunda leitura"
    
    data1 = json1['db']['data']
    data2 = json2['db']['data']
    
    assert len(data1) == len(data2), "Tamanhos diferentes entre leituras"
    
    if len(data1) > 0:
        print(f"   Tamanho consistente: {len(data1)} bytes")
    else:
        print(f"   Tamanho consistente: 0 bytes (PLC não conectado)")

def test_status_uptime():
    """Testa se o uptime está aumentando."""
    response1 = requests.get(f"{DATAHUB_URL}/api/status", timeout=TIMEOUT)
    time.sleep(1)
    response2 = requests.get(f"{DATAHUB_URL}/api/status", timeout=TIMEOUT)
    
    uptime1 = response1.json()['uptime_seconds']
    uptime2 = response2.json()['uptime_seconds']
    
    # Pode ser 0 se não conectado
    if uptime1 > 0:
        assert uptime2 > uptime1, "Uptime não está aumentando"
        print(f"   Uptime aumentou de {uptime1:.1f}s para {uptime2:.1f}s")
    else:
        print("   PLC não conectado - uptime é 0")

def test_write_endpoint():
    """Testa endpoint de escrita (se conectado)."""
    # Primeiro verifica se está conectado
    status = requests.get(f"{DATAHUB_URL}/api/status", timeout=TIMEOUT).json()
    
    if not status['connected']:
        print("   ⚠️  PLC não conectado - pulando teste de escrita")
        return
    
    # Tenta escrever (valor fictício)
    response = requests.post(
        f"{DATAHUB_URL}/api/write/1",
        params={"offset": 100, "value": 42},
        timeout=TIMEOUT
    )
    
    assert response.status_code == 200, "Endpoint write não respondeu"
    data = response.json()
    
    print(f"   Resposta de escrita: {data.get('success', False)}")
    if not data.get('success'):
        print(f"   Motivo: {data.get('error', 'Desconhecido')}")

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Executa todos os testes."""
    print_header("TESTE DO DATAHUB PLC")
    
    print_info(f"URL do DataHub: {DATAHUB_URL}")
    print_info(f"Timeout: {TIMEOUT}s")
    print_info(f"Data/Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Verifica se servidor está rodando
    print("\n" + "-" * 60)
    print("Verificando se DataHub está rodando...")
    print("-" * 60)
    
    try:
        response = requests.get(DATAHUB_URL, timeout=2)
        print_success("DataHub está rodando!")
    except requests.exceptions.ConnectionError:
        print_error("DataHub não está rodando!")
        print_warning("Execute 'python datahub.py' em outro terminal")
        sys.exit(1)
    except Exception as e:
        print_error(f"Erro ao conectar: {e}")
        sys.exit(1)
    
    # Executa testes
    print("\n" + "-" * 60)
    print("Executando testes...")
    print("-" * 60 + "\n")
    
    run_test("Servidor respondendo", test_servidor_rodando)
    run_test("Endpoint /api/status", test_endpoint_status)
    run_test("Endpoint /api/data", test_endpoint_data_all)
    run_test("Endpoint /api/data/1", test_endpoint_data_db1)
    run_test("Documentação /docs", test_endpoint_docs)
    run_test("Latência de leitura", test_latencia_leitura)
    run_test("Consistência de dados", test_dados_consistentes)
    run_test("Uptime crescente", test_status_uptime)
    run_test("Endpoint de escrita", test_write_endpoint)
    
    # Resultados
    print("\n" + "=" * 60)
    print_header("RESULTADOS")
    
    print(f"Total de testes: {tests_total}")
    print_success(f"Testes passados: {tests_passed}")
    if tests_failed > 0:
        print_error(f"Testes falhados: {tests_failed}")
    
    percentage = (tests_passed / tests_total) * 100 if tests_total > 0 else 0
    
    print(f"\nSucesso: {percentage:.1f}%")
    
    if tests_failed == 0:
        print(f"\n{Colors.GREEN}{Colors.BOLD}✓ TODOS OS TESTES PASSARAM!{Colors.RESET}")
        print(f"{Colors.GREEN}DataHub está funcionando corretamente.{Colors.RESET}")
    else:
        print(f"\n{Colors.YELLOW}{Colors.BOLD}⚠ ALGUNS TESTES FALHARAM{Colors.RESET}")
        print(f"{Colors.YELLOW}Verifique os logs acima para detalhes.{Colors.RESET}")
    
    print("\n" + "=" * 60)
    
    # Dicas finais
    print(f"\n{Colors.BLUE}💡 Dicas:{Colors.RESET}")
    print("   - Acesse http://localhost:8000/docs para documentação interativa")
    print("   - Execute 'python exemplo_uso_datahub.py' para exemplos práticos")
    print("   - Veja MANUAL_DATAHUB.md para documentação completa")
    print()
    
    return 0 if tests_failed == 0 else 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}⚠ Testes interrompidos pelo usuário{Colors.RESET}")
        sys.exit(130)

