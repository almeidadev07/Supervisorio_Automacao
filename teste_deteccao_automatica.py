#!/usr/bin/env python3
"""
Script de teste para detecção automática de PLCs
Simula o cenário: servidor inicia com PLC desligado, depois PLC é ligado
"""

import requests
import time
import json

def test_automatic_detection():
    """Testa a detecção automática de PLCs"""
    base_url = "http://localhost:5000/api"
    
    print("=== Teste de Detecção Automática de PLCs ===")
    print()
    
    # 1. Verifica máquina atual
    print("1. Verificando máquina atual...")
    try:
        response = requests.get(f"{base_url}/current")
        if response.status_code == 200:
            data = response.json()
            print(f"   Máquina atual: {data.get('machine', 'N/A')}")
            print(f"   IP: {data.get('ip', 'N/A')}")
            print(f"   Conectado: {data.get('connected', False)}")
        else:
            print(f"   Erro ao obter máquina atual: {response.status_code}")
    except Exception as e:
        print(f"   Erro na requisição: {e}")
    
    print()
    
    # 2. Força detecção de PLCs
    print("2. Forçando detecção de PLCs disponíveis...")
    try:
        response = requests.post(f"{base_url}/detect_plcs")
        if response.status_code == 200:
            data = response.json()
            print(f"   Resultado: {data.get('message', 'N/A')}")
        else:
            print(f"   Erro na detecção: {response.status_code}")
    except Exception as e:
        print(f"   Erro na requisição: {e}")
    
    print()
    
    # 3. Verifica se houve mudança
    print("3. Verificando se houve mudança de máquina...")
    try:
        response = requests.get(f"{base_url}/current")
        if response.status_code == 200:
            data = response.json()
            print(f"   Nova máquina: {data.get('machine', 'N/A')}")
            print(f"   Novo IP: {data.get('ip', 'N/A')}")
            print(f"   Conectado: {data.get('connected', False)}")
        else:
            print(f"   Erro ao obter máquina atual: {response.status_code}")
    except Exception as e:
        print(f"   Erro na requisição: {e}")
    
    print()
    
    # 4. Lista todas as máquinas disponíveis
    print("4. Listando todas as máquinas configuradas...")
    try:
        response = requests.get(f"{base_url}/machines")
        if response.status_code == 200:
            machines = response.json()
            for machine in machines:
                print(f"   - {machine.get('name', 'N/A')}: {machine.get('embaladoras', 0)} embaladoras")
        else:
            print(f"   Erro ao listar máquinas: {response.status_code}")
    except Exception as e:
        print(f"   Erro na requisição: {e}")
    
    print()
    
    # 5. Testa detecção por IP
    print("5. Testando detecção por IP específico...")
    test_ips = ["100.70.0.10", "100.40.0.10", "192.168.1.100"]
    
    for ip in test_ips:
        try:
            response = requests.get(f"{base_url}/detect_by_ip_only", params={"ip": ip})
            if response.status_code == 200:
                data = response.json()
                detected = data.get('detected', 'Nenhuma')
                print(f"   IP {ip}: {detected}")
            else:
                print(f"   IP {ip}: Erro {response.status_code}")
        except Exception as e:
            print(f"   IP {ip}: Erro na requisição: {e}")
    
    print()
    print("=== Fim do Teste ===")
    print()
    print("💡 Instruções para teste completo:")
    print("   1. Execute o servidor: python app.py")
    print("   2. Com o PLC desligado, observe que usa um driver mock")
    print("   3. Ligue o PLC real")
    print("   4. Execute este script: python teste_deteccao_automatica.py")
    print("   5. Ou aguarde até 20 segundos para detecção automática")

def test_connection_status():
    """Testa o status de conexão atual"""
    base_url = "http://localhost:5000/api"
    
    print("=== Status de Conexão Atual ===")
    
    try:
        response = requests.get(f"{base_url}/current")
        if response.status_code == 200:
            data = response.json()
            print(f"Máquina: {data.get('machine', 'N/A')}")
            print(f"IP: {data.get('ip', 'N/A')}")
            print(f"Conectado: {'✅' if data.get('connected') else '❌'}")
            print(f"Embaladoras: {data.get('embaladoras', 0)}")
        else:
            print(f"Erro: {response.status_code}")
    except Exception as e:
        print(f"Erro: {e}")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "status":
        test_connection_status()
    else:
        test_automatic_detection()
