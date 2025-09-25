#!/usr/bin/env python3
"""
Teste de escrita de tags no PLC
Testa especificamente a tag XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03
"""

import requests
import json
import time

def test_read_tag():
    """Testa a leitura da tag"""
    try:
        response = requests.get('http://localhost:5000/api/read_tags?names=XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03')
        data = response.json()
        print(f"Leitura da tag: {data}")
        return data.get('ok', False), data.get('values', {}).get('XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03', 0)
    except Exception as e:
        print(f"Erro na leitura: {e}")
        return False, 0

def test_write_tag(value):
    """Testa a escrita da tag"""
    try:
        payload = {"XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03": value}
        response = requests.post('http://localhost:5000/api/write_tags', 
                               json=payload,
                               headers={'Content-Type': 'application/json'})
        data = response.json()
        print(f"Escrita da tag com valor {value}: {data}")
        return data.get('ok', False)
    except Exception as e:
        print(f"Erro na escrita: {e}")
        return False

def test_bit_operations():
    """Testa operações de bit na tag"""
    print("=== Teste de Operações de Bit ===")
    
    # Lê valor atual
    success, current_value = test_read_tag()
    if not success:
        print("❌ Falha na leitura inicial")
        return
    
    print(f"Valor atual da tag: {current_value} (0x{current_value:04X})")
    
    # Testa bit 0 (solenoide)
    print("\n--- Testando Bit 0 (Solenoide) ---")
    new_value = current_value | (1 << 0)  # Set bit 0
    if test_write_tag(new_value):
        time.sleep(0.5)
        success, read_value = test_read_tag()
        if success and (read_value & (1 << 0)):
            print("✅ Bit 0 (solenoide) ativado com sucesso")
        else:
            print("❌ Falha ao ativar bit 0")
    
    time.sleep(1)
    
    # Desativa bit 0
    new_value = current_value & ~(1 << 0)  # Clear bit 0
    if test_write_tag(new_value):
        time.sleep(0.5)
        success, read_value = test_read_tag()
        if success and not (read_value & (1 << 0)):
            print("✅ Bit 0 (solenoide) desativado com sucesso")
        else:
            print("❌ Falha ao desativar bit 0")
    
    time.sleep(1)
    
    # Testa bit 1 (balanças)
    print("\n--- Testando Bit 1 (Balanças) ---")
    new_value = current_value | (1 << 1)  # Set bit 1
    if test_write_tag(new_value):
        time.sleep(0.5)
        success, read_value = test_read_tag()
        if success and (read_value & (1 << 1)):
            print("✅ Bit 1 (balanças) ativado com sucesso")
        else:
            print("❌ Falha ao ativar bit 1")
    
    time.sleep(1)
    
    # Desativa bit 1
    new_value = current_value & ~(1 << 1)  # Clear bit 1
    if test_write_tag(new_value):
        time.sleep(0.5)
        success, read_value = test_read_tag()
        if success and not (read_value & (1 << 1)):
            print("✅ Bit 1 (balanças) desativado com sucesso")
        else:
            print("❌ Falha ao desativar bit 1")

if __name__ == "__main__":
    print("Teste de comunicação com PLC - Tag XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03")
    print("=" * 70)
    
    # Verifica se o servidor está rodando
    try:
        response = requests.get('http://localhost:5000/api/current')
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Servidor conectado - Máquina: {data.get('machine', 'N/A')}")
            print(f"   Conectado: {data.get('connected', False)}")
            print(f"   IP: {data.get('ip', 'N/A')}")
        else:
            print("❌ Servidor não está respondendo corretamente")
            exit(1)
    except Exception as e:
        print(f"❌ Erro ao conectar com servidor: {e}")
        exit(1)
    
    # Executa os testes
    test_bit_operations()
    
    print("\n=== Teste Concluído ===")
