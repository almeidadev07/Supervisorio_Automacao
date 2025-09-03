#!/usr/bin/env python3
"""
Script de teste para o novo comportamento: sem driver inicial
Testa o cenário onde o servidor inicia sem PLC ligado e detecta automaticamente quando ligado
"""

import requests
import time
import json

def test_no_initial_driver():
    """Testa o comportamento sem driver inicial"""
    base_url = "http://localhost:5000/api"
    
    print("=== Teste: Sem Driver Inicial ===")
    print()
    
    # 1. Verifica se não há driver inicial
    print("1. Verificando se não há driver inicial...")
    try:
        response = requests.get(f"{base_url}/current")
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                print(f"   ❌ ERRO: Driver foi criado inicialmente!")
                print(f"   Máquina: {data.get('machine', 'N/A')}")
                print(f"   IP: {data.get('ip', 'N/A')}")
                print(f"   Conectado: {data.get('connected', False)}")
            else:
                print(f"   ✅ OK: Nenhum driver inicial criado")
                print(f"   Erro: {data.get('error', 'N/A')}")
        else:
            print(f"   ✅ OK: Nenhum driver inicial (status {response.status_code})")
    except Exception as e:
        print(f"   ✅ OK: Nenhum driver inicial (erro esperado: {e})")
    
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
    
    # 3. Verifica se driver foi criado após detecção
    print("3. Verificando se driver foi criado após detecção...")
    try:
        response = requests.get(f"{base_url}/current")
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                print(f"   ✅ OK: Driver criado após detecção!")
                print(f"   Máquina: {data.get('machine', 'N/A')}")
                print(f"   IP: {data.get('ip', 'N/A')}")
                print(f"   Conectado: {data.get('connected', False)}")
            else:
                print(f"   ⚠️  Ainda sem driver: {data.get('error', 'N/A')}")
        else:
            print(f"   ⚠️  Ainda sem driver (status {response.status_code})")
    except Exception as e:
        print(f"   ⚠️  Ainda sem driver (erro: {e})")
    
    print()
    
    # 4. Lista máquinas disponíveis
    print("4. Listando máquinas configuradas...")
    try:
        response = requests.get(f"{base_url}/machines")
        if response.status_code == 200:
            machines = response.json()
            print(f"   Total de máquinas: {len(machines)}")
            for machine in machines:
                name = machine.get('name', 'N/A')
                ip_ranges = machine.get('ip_ranges', [])
                print(f"   - {name}: {len(ip_ranges)} faixas de IP")
        else:
            print(f"   Erro ao listar máquinas: {response.status_code}")
    except Exception as e:
        print(f"   Erro na requisição: {e}")
    
    print()
    
    # 5. Testa detecção por IP específico
    print("5. Testando detecção por IP específico...")
    test_ips = ["100.70.0.10", "100.40.0.10"]
    
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
    print("💡 Comportamento esperado:")
    print("   1. Servidor inicia SEM driver quando PLC está desligado")
    print("   2. Quando PLC é ligado, sistema detecta automaticamente em 5s")
    print("   3. Driver é criado automaticamente para o PLC detectado")
    print("   4. Não há mais 'fixação' em drivers mock ou padrão")

def monitor_detection():
    """Monitora a detecção automática em tempo real"""
    base_url = "http://localhost:5000/api"
    
    print("=== Monitor de Detecção Automática ===")
    print("Pressione Ctrl+C para parar")
    print()
    
    last_status = None
    detection_count = 0
    
    try:
        while True:
            try:
                response = requests.get(f"{base_url}/current")
                if response.status_code == 200:
                    data = response.json()
                    if data.get('ok'):
                        current_status = f"{data.get('machine', 'N/A')} ({data.get('ip', 'N/A')})"
                        connected = data.get('connected', False)
                        status_icon = "✅" if connected else "❌"
                    else:
                        current_status = "Sem driver"
                        status_icon = "⏳"
                    
                    if current_status != last_status:
                        detection_count += 1
                        timestamp = time.strftime("%H:%M:%S")
                        print(f"[{timestamp}] #{detection_count} - {status_icon} {current_status}")
                        last_status = current_status
                
            except Exception as e:
                print(f"Erro na monitoração: {e}")
            
            time.sleep(2)  # Verifica a cada 2 segundos
            
    except KeyboardInterrupt:
        print("\nMonitor interrompido pelo usuário")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "monitor":
        monitor_detection()
    else:
        test_no_initial_driver()
