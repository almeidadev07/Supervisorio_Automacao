#!/usr/bin/env python3
"""
Script de teste para verificar a estabilidade das conexões PLC
"""
import time
import json
import os
import sys
from datetime import datetime

# Adiciona o diretório do projeto ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importa diretamente as funções necessárias
import socket
import ipaddress
import platform
import subprocess
import json
import os
import sys
from datetime import datetime

def ping_ip(ip_address: str, timeout_ms: int = 1000) -> bool:
    """Ping an IP address once. Returns True if reachable."""
    try:
        system_name = platform.system().lower()
        if 'windows' in system_name:
            result = subprocess.run(['ping', '-n', '1', '-w', str(timeout_ms), ip_address],
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL,
                                    timeout=timeout_ms/1000 + 5)
        else:
            sec = max(1, int(timeout_ms / 1000))
            result = subprocess.run(['ping', '-c', '1', '-W', str(sec), ip_address],
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL,
                                    timeout=sec + 5)
        return result.returncode == 0
    except Exception as e:
        print(f"[PING] Erro ao fazer ping em {ip_address}: {e}")
        return False

def _is_real_plc(ip):
    """Verifica se um IP é realmente um PLC tentando conectar via snap7"""
    try:
        import snap7
        client = snap7.client.Client()
        
        configs = [(0, 1), (0, 2)]  # S7-1500 e S7-300/400
        
        for rack, slot in configs:
            try:
                print(f"[DETECT] 🔌 Tentando conectar em {ip} rack={rack} slot={slot}...")
                client.connect(ip, rack, slot)
                connected = client.get_connected()
                if connected:
                    print(f"[DETECT] ✅ PLC válido encontrado em {ip} rack={rack} slot={slot}")
                    client.disconnect()
                    return True
                else:
                    print(f"[DETECT] ❌ Conexão falhou em {ip} rack={rack} slot={slot}")
                client.disconnect()
            except Exception as e:
                print(f"[DETECT] ❌ Erro ao conectar em {ip} rack={rack} slot={slot}: {e}")
                try:
                    client.disconnect()
                except:
                    pass
                continue
        
        print(f"[DETECT] ❌ {ip} não é um PLC válido")
        return False
        
    except Exception as e:
        print(f"[DETECT] ❌ Erro ao verificar PLC em {ip}: {e}")
        return False

def detect_by_reachable_plc(configs):
    """Ping known PLC IPs from configs and return first reachable config name and list of reachable."""
    reachable = []
    print(f"[DETECT] 🔍 Verificando {len(configs)} configurações de PLC...")
    
    for c in configs or []:
        ip = c.get('default_plc_ip')
        name = c.get('name', 'Unknown')
        
        if not ip:
            print(f"[DETECT] ⚠️ {name}: Sem IP configurado")
            continue
        
        print(f"[DETECT] 🔍 Verificando {name} ({ip})...")
        
        ping_ok = ping_ip(ip, timeout_ms=1000)
        
        if ping_ok:
            print(f"[DETECT] ✅ {name} ({ip}) responde ao ping")
        else:
            print(f"[DETECT] ⚠️ {name} ({ip}) não responde ao ping, tentando conectar diretamente...")
        
        if _is_real_plc(ip):
            reachable.append({'name': name, 'ip': ip})
            print(f"[DETECT] ✅ {name} ({ip}) é um PLC válido")
        elif ping_ok:
            print(f"[DETECT] ❌ {name} ({ip}) responde ao ping mas não é um PLC válido")
        else:
            print(f"[DETECT] ❌ {name} ({ip}) não é um PLC válido")
    
    priority_order = ['700CX', '400CX', '200CX']
    detected = None
    
    print(f"[DETECT] 📊 {len(reachable)} PLCs alcançáveis encontrados: {[r['name'] for r in reachable]}")
    
    for priority_name in priority_order:
        for r in reachable:
            if r['name'] == priority_name:
                detected = r['name']
                print(f"[DETECT] 🎯 PLC prioritário detectado: {detected}")
                break
        if detected:
            break
    
    if not detected:
        for r in reachable:
            if not r['name'].lower().startswith('mock'):
                detected = r['name']
                print(f"[DETECT] 🎯 PLC real detectado: {detected}")
                break
    
    if not detected and reachable:
        detected = reachable[0]['name']
        print(f"[DETECT] 🎯 Primeiro PLC disponível detectado: {detected}")
    
    if not reachable:
        detected = None
        print("[DETECT] ❌ Nenhum PLC alcançável encontrado")
    
    return detected, reachable

def test_plc_detection():
    """Testa a detecção de PLCs"""
    print("=" * 60)
    print("🔍 TESTE DE DETECÇÃO DE PLCs")
    print("=" * 60)
    
    # Carrega configurações das máquinas
    config_path = os.path.join('app', 'data', 'machines_config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            machines = json.load(f)
    else:
        print("❌ Arquivo machines_config.json não encontrado")
        return False
    
    print(f"📋 Configurações carregadas: {len(machines)} máquinas")
    for machine in machines:
        print(f"  - {machine['name']}: {machine.get('default_plc_ip', 'N/A')}")
    
    # Testa detecção
    detected_name, reachable = detect_by_reachable_plc(machines)
    
    print(f"\n📊 Resultado da detecção:")
    print(f"  - PLC detectado: {detected_name}")
    print(f"  - PLCs alcançáveis: {len(reachable)}")
    
    if reachable:
        print("  - Lista de PLCs alcançáveis:")
        for plc in reachable:
            print(f"    * {plc['name']} ({plc['ip']})")
    
    return detected_name is not None

def test_connection_stability(duration_minutes=5):
    """Testa a estabilidade da conexão por um período"""
    print("=" * 60)
    print(f"🔄 TESTE DE ESTABILIDADE ({duration_minutes} minutos)")
    print("=" * 60)
    
    # Carrega configurações
    config_path = os.path.join('app', 'data', 'machines_config.json')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            machines = json.load(f)
    else:
        print("❌ Arquivo machines_config.json não encontrado")
        return False
    
    # Encontra um PLC para testar
    detected_name, reachable = detect_by_reachable_plc(machines)
    if not detected_name:
        print("❌ Nenhum PLC detectado para teste")
        return False
    
    # Encontra a configuração do PLC detectado
    test_machine = next((m for m in machines if m['name'] == detected_name), None)
    if not test_machine:
        print(f"❌ Configuração não encontrada para {detected_name}")
        return False
    
    test_ip = test_machine['default_plc_ip']
    print(f"🎯 Testando estabilidade com {detected_name} ({test_ip})")
    
    # Testa ping contínuo
    start_time = time.time()
    end_time = start_time + (duration_minutes * 60)
    ping_count = 0
    success_count = 0
    failure_count = 0
    
    print(f"⏰ Iniciando teste às {datetime.now().strftime('%H:%M:%S')}")
    print(f"⏰ Teste terminará às {datetime.fromtimestamp(end_time).strftime('%H:%M:%S')}")
    
    while time.time() < end_time:
        ping_count += 1
        success = ping_ip(test_ip, timeout_ms=1000)
        
        if success:
            success_count += 1
            status = "✅"
        else:
            failure_count += 1
            status = "❌"
        
        # Mostra progresso a cada 30 segundos
        if ping_count % 30 == 0:
            elapsed = time.time() - start_time
            success_rate = (success_count / ping_count) * 100
            print(f"{status} [{elapsed:.0f}s] Ping {ping_count}: {success_count} sucessos, {failure_count} falhas ({success_rate:.1f}%)")
        
        time.sleep(1)  # Ping a cada segundo
    
    # Resultados finais
    total_time = time.time() - start_time
    success_rate = (success_count / ping_count) * 100
    
    print(f"\n📊 RESULTADOS FINAIS:")
    print(f"  - Tempo total: {total_time:.1f} segundos")
    print(f"  - Total de pings: {ping_count}")
    print(f"  - Sucessos: {success_count}")
    print(f"  - Falhas: {failure_count}")
    print(f"  - Taxa de sucesso: {success_rate:.1f}%")
    
    if success_rate >= 95:
        print("✅ CONEXÃO ESTÁVEL - Taxa de sucesso >= 95%")
        return True
    elif success_rate >= 80:
        print("⚠️ CONEXÃO MODERADAMENTE ESTÁVEL - Taxa de sucesso >= 80%")
        return True
    else:
        print("❌ CONEXÃO INSTÁVEL - Taxa de sucesso < 80%")
        return False

def main():
    """Função principal do teste"""
    print("🚀 INICIANDO TESTES DE CONEXÃO PLC")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Teste 1: Detecção de PLCs
    detection_ok = test_plc_detection()
    
    if not detection_ok:
        print("\n❌ Teste de detecção falhou - não é possível continuar")
        return False
    
    # Teste 2: Estabilidade da conexão
    print("\n" + "=" * 60)
    stability_ok = test_connection_stability(duration_minutes=2)  # Teste de 2 minutos
    
    # Resultado final
    print("\n" + "=" * 60)
    print("📋 RESULTADO FINAL DOS TESTES")
    print("=" * 60)
    
    if detection_ok and stability_ok:
        print("✅ TODOS OS TESTES PASSARAM - Sistema estável")
        return True
    else:
        print("❌ ALGUNS TESTES FALHARAM - Verificar configurações")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
