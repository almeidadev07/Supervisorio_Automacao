#!/usr/bin/env python3
"""
Script para testar leitura e escrita da tag XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03
com foco no bit 0
"""
import json
import requests
import time

def check_bit_0(value):
    """Verifica se o bit 0 está ativo (valor ímpar)"""
    if value is None:
        return False, "Valor nulo"
    try:
        int_val = int(value)
        bit_0_active = (int_val & 1) == 1
        return bit_0_active, f"Valor: {int_val} (0x{int_val:04X}) - Bit 0: {'ATIVO' if bit_0_active else 'INATIVO'}"
    except:
        return False, f"Erro ao converter valor: {value}"

def test_tag_bit0():
    base_url = "http://127.0.0.1:5000"
    tag_name = "XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03"
    
    print("=== TESTE DA TAG XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03 (BIT 0) ===\n")
    
    # 1. Verificar se o servidor está rodando
    try:
        r = requests.get(f"{base_url}/api/current", timeout=5)
        print(f"✅ Servidor respondendo - Status: {r.status_code}")
        current = r.json()
        print(f"   Máquina ativa: {current.get('machine', 'N/A')}")
        print(f"   Conectado: {current.get('connected', 'N/A')}")
        if not current.get('connected'):
            print("⚠️  ATENÇÃO: PLC não está conectado!")
    except Exception as e:
        print(f"❌ Servidor não está rodando: {e}")
        print("   Inicie o servidor com: python app.py ou F5 no VS Code")
        return
    
    # 2. Ler valor atual da tag
    print(f"\n📖 LENDO VALOR ATUAL DA TAG: {tag_name}")
    try:
        r = requests.get(f"{base_url}/api/read_tags?names={tag_name}")
        print(f"   Status da leitura: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            print(f"   Resposta completa: {data}")
            
            if data.get('ok') and 'values' in data:
                values = data['values']
                if tag_name in values:
                    current_value = values[tag_name]
                    bit_0_active, description = check_bit_0(current_value)
                    print(f"   {description}")
                else:
                    print(f"   ❌ Tag {tag_name} não encontrada na resposta")
            else:
                print(f"   ❌ Erro na resposta: {data}")
        else:
            print(f"   ❌ Erro HTTP: {r.text}")
    except Exception as e:
        print(f"   ❌ Erro na leitura: {e}")
    
    # 3. Testar escrita para ativar bit 0 (valor 1)
    print(f"\n📝 TESTANDO ESCRITA - ATIVAR BIT 0 (valor 1)")
    try:
        payload = {tag_name: 1}  # Enviar diretamente as tags, não dentro de "tag_values"
        r = requests.post(f"{base_url}/api/write_tags", json=payload, timeout=10)
        print(f"   Status da escrita: {r.status_code}")
        print(f"   Resposta: {r.text}")
        
        if r.status_code == 200:
            print("   ✅ Escrita enviada com sucesso")
        else:
            print("   ❌ Erro na escrita")
    except Exception as e:
        print(f"   ❌ Erro na escrita: {e}")
    
    # 4. Aguardar e ler novamente para confirmar
    print(f"\n⏳ Aguardando 2 segundos...")
    time.sleep(2)
    
    print(f"📖 LENDO VALOR APÓS ESCRITA")
    try:
        r = requests.get(f"{base_url}/api/read_tags?names={tag_name}")
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and 'values' in data:
                values = data['values']
                if tag_name in values:
                    new_value = values[tag_name]
                    bit_0_active, description = check_bit_0(new_value)
                    print(f"   {description}")
                    
                    if bit_0_active:
                        print("   ✅ SUCESSO: Bit 0 foi ativado no PLC!")
                    else:
                        print("   ⚠️  Bit 0 não foi ativado - verifique conexão PLC")
                else:
                    print(f"   ❌ Tag não encontrada após escrita")
            else:
                print(f"   ❌ Erro na resposta: {data}")
        else:
            print(f"   ❌ Erro HTTP: {r.text}")
    except Exception as e:
        print(f"   ❌ Erro na leitura final: {e}")
    
    # 5. Testar escrita para desativar bit 0 (valor 0)
    print(f"\n📝 TESTANDO ESCRITA - DESATIVAR BIT 0 (valor 0)")
    try:
        payload = {tag_name: 0}  # Enviar diretamente as tags, não dentro de "tag_values"
        r = requests.post(f"{base_url}/api/write_tags", json=payload, timeout=10)
        print(f"   Status da escrita: {r.status_code}")
        print(f"   Resposta: {r.text}")
    except Exception as e:
        print(f"   ❌ Erro na escrita: {e}")
    
    # 6. Leitura final
    print(f"\n⏳ Aguardando 2 segundos...")
    time.sleep(2)
    
    print(f"📖 LEITURA FINAL")
    try:
        r = requests.get(f"{base_url}/api/read_tags?names={tag_name}")
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and 'values' in data:
                values = data['values']
                if tag_name in values:
                    final_value = values[tag_name]
                    bit_0_active, description = check_bit_0(final_value)
                    print(f"   {description}")
                else:
                    print(f"   ❌ Tag não encontrada na leitura final")
            else:
                print(f"   ❌ Erro na resposta: {data}")
        else:
            print(f"   ❌ Erro HTTP: {r.text}")
    except Exception as e:
        print(f"   ❌ Erro na leitura final: {e}")

if __name__ == "__main__":
    test_tag_bit0()
