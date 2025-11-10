#!/usr/bin/env python3
"""
Script para testar o endpoint de alarmes
"""

import requests
import json

def testar_alarmes():
    """Testa o endpoint /api/alarms"""
    
    print("=" * 80)
    print("TESTE DO ENDPOINT /api/alarms")
    print("=" * 80)
    
    try:
        # Faz requisição
        print("\n1. Fazendo requisição para http://localhost:5000/api/alarms...")
        response = requests.get('http://localhost:5000/api/alarms', timeout=5)
        
        print(f"   Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"   ❌ ERRO: Status {response.status_code}")
            print(f"   Resposta: {response.text}")
            return
        
        # Parse JSON
        data = response.json()
        
        print("\n2. Verificando estrutura da resposta...")
        print(f"   ✓ ok: {data.get('ok')}")
        print(f"   ✓ machine: {data.get('machine')}")
        
        # Verifica alarmes ativos
        active_alarms = data.get('active_alarms', [])
        print(f"\n3. Alarmes ativos: {len(active_alarms)}")
        
        if active_alarms:
            print("\n   Primeiros 5 alarmes:")
            for i, alarm in enumerate(active_alarms[:5], 1):
                print(f"   [{i}] {alarm.get('description')}")
                print(f"       Tipo: {alarm.get('type')}, Prioridade: {alarm.get('priority')}")
                print(f"       Data: {alarm.get('date')} {alarm.get('timestamp')}")
        else:
            print("   ℹ️  Nenhum alarme ativo no momento")
        
        # Verifica resumo
        alarm_summary = data.get('alarm_summary', {})
        print(f"\n4. Resumo de alarmes (alarm_summary):")
        
        if alarm_summary:
            print(f"   ✓ emergency: {alarm_summary.get('emergency', 0)}")
            print(f"   ✓ nr12: {alarm_summary.get('nr12', 0)}")
            print(f"   ✓ drives: {alarm_summary.get('drives', 0)}")
            print(f"   ✓ thermal: {alarm_summary.get('thermal', 0)}")
            print(f"   ✓ hardware: {alarm_summary.get('hardware', 0)}")
            print(f"   ✓ process: {alarm_summary.get('process', 0)}")
            print(f"   ✓ total: {alarm_summary.get('total', 0)}")
        else:
            print("   ❌ ERRO: alarm_summary está vazio ou ausente!")
        
        # Mostra JSON completo
        print("\n5. JSON completo da resposta:")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
        print("\n" + "=" * 80)
        print("RESUMO:")
        
        if data.get('ok'):
            print("✓ Endpoint funcionando corretamente")
            
            if len(active_alarms) > 0:
                print(f"✓ {len(active_alarms)} alarmes ativos detectados")
            else:
                print("ℹ️  Nenhum alarme ativo (sistema normal)")
            
            if alarm_summary and alarm_summary.get('total', 0) >= 0:
                print("✓ alarm_summary presente e válido")
            else:
                print("❌ alarm_summary inválido ou ausente")
        else:
            print("❌ Endpoint retornou ok=False")
            print(f"   Erro: {data.get('error')}")
        
        print("=" * 80)
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ERRO: Não foi possível conectar ao servidor")
        print("   Verifique se o servidor está rodando em http://localhost:5000")
    except requests.exceptions.Timeout:
        print("\n❌ ERRO: Timeout ao conectar ao servidor")
    except json.JSONDecodeError as e:
        print(f"\n❌ ERRO ao fazer parse do JSON: {e}")
        print(f"   Resposta recebida: {response.text}")
    except Exception as e:
        print(f"\n❌ ERRO inesperado: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    testar_alarmes()

