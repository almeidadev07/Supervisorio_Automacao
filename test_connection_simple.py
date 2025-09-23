#!/usr/bin/env python3
"""
Script de teste simplificado para verificar conectividade de rede
"""
import time
import json
import os
import sys
import platform
import subprocess
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

def test_network_connectivity():
    """Testa conectividade de rede básica"""
    print("=" * 60)
    print("🌐 TESTE DE CONECTIVIDADE DE REDE")
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
    
    # Testa conectividade básica
    reachable = []
    for machine in machines:
        ip = machine.get('default_plc_ip')
        name = machine.get('name', 'Unknown')
        
        if not ip:
            print(f"⚠️ {name}: Sem IP configurado")
            continue
        
        print(f"🔍 Testando {name} ({ip})...")
        if ping_ip(ip, timeout_ms=2000):  # Timeout maior para teste
            reachable.append({'name': name, 'ip': ip})
            print(f"✅ {name} ({ip}) está alcançável")
        else:
            print(f"❌ {name} ({ip}) não está alcançável")
    
    print(f"\n📊 Resultado da conectividade:")
    print(f"  - IPs alcançáveis: {len(reachable)}")
    
    if reachable:
        print("  - Lista de IPs alcançáveis:")
        for plc in reachable:
            print(f"    * {plc['name']} ({plc['ip']})")
        return True
    else:
        print("  - Nenhum IP alcançável encontrado")
        return False

def test_connection_stability(ip, duration_minutes=2):
    """Testa estabilidade da conexão por um período"""
    print("=" * 60)
    print(f"🔄 TESTE DE ESTABILIDADE - {ip} ({duration_minutes} minutos)")
    print("=" * 60)
    
    start_time = time.time()
    end_time = start_time + (duration_minutes * 60)
    ping_count = 0
    success_count = 0
    failure_count = 0
    
    print(f"⏰ Iniciando teste às {datetime.now().strftime('%H:%M:%S')}")
    print(f"⏰ Teste terminará às {datetime.fromtimestamp(end_time).strftime('%H:%M:%S')}")
    
    while time.time() < end_time:
        ping_count += 1
        success = ping_ip(ip, timeout_ms=1000)
        
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
    print("🚀 INICIANDO TESTES DE CONECTIVIDADE")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Teste 1: Conectividade básica
    connectivity_ok = test_network_connectivity()
    
    if not connectivity_ok:
        print("\n❌ Teste de conectividade falhou - não é possível continuar")
        return False
    
    # Teste 2: Estabilidade da conexão (se houver IPs alcançáveis)
    config_path = os.path.join('app', 'data', 'machines_config.json')
    with open(config_path, 'r') as f:
        machines = json.load(f)
    
    # Encontra o primeiro IP alcançável para teste
    test_ip = None
    for machine in machines:
        ip = machine.get('default_plc_ip')
        if ip and ping_ip(ip, timeout_ms=2000):
            test_ip = ip
            break
    
    if test_ip:
        print(f"\n🎯 Testando estabilidade com IP: {test_ip}")
        stability_ok = test_connection_stability(test_ip, duration_minutes=1)  # Teste de 1 minuto
    else:
        print("\n⚠️ Nenhum IP alcançável encontrado para teste de estabilidade")
        stability_ok = True  # Considera OK se não há IPs para testar
    
    # Resultado final
    print("\n" + "=" * 60)
    print("📋 RESULTADO FINAL DOS TESTES")
    print("=" * 60)
    
    if connectivity_ok and stability_ok:
        print("✅ TODOS OS TESTES PASSARAM - Conectividade OK")
        return True
    else:
        print("❌ ALGUNS TESTES FALHARAM - Verificar configurações de rede")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
