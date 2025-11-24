#!/usr/bin/env python3
"""
Script de teste para verificar o sistema de fila de escrita
"""
import requests
import json
import time

# Configurações
BASE_URL = "http://localhost:5000"

def test_write_bit():
    """Testa escrita de um bit"""
    print("=" * 60)
    print("🧪 Teste: Escrita de bit no PLC")
    print("=" * 60)
    
    # Payload para escrever bit 8 da XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03
    payload = {
        "name": "XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03",
        "bit": 8,
        "mode": "state",
        "value": 1,
        "pure": False
    }
    
    print(f"\n📤 Enviando requisição:")
    print(f"   URL: {BASE_URL}/api/write_word_bit")
    print(f"   Payload: {json.dumps(payload, indent=2)}")
    
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/write_word_bit",
            json=payload,
            timeout=35  # 30s de processamento + 5s de margem
        )
        elapsed = time.time() - start
        
        print(f"\n📥 Resposta recebida em {elapsed:.2f}s:")
        print(f"   Status: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ Sucesso!")
            print(f"   Resposta: {json.dumps(data, indent=2)}")
            
            if data.get('ok'):
                written = data.get('written', 0)
                bit_val = data.get('value', -1)
                print(f"\n🎯 Resultado:")
                print(f"   WORD escrito: 0x{written:04X} ({written})")
                print(f"   Bit {payload['bit']}: {bit_val}")
                
                # Lista bits setados
                bits_on = [i for i in range(16) if ((written >> i) & 1) == 1]
                print(f"   Bits ligados: {bits_on}")
        else:
            print(f"\n❌ Erro HTTP {response.status_code}")
            print(f"   Resposta: {response.text}")
            
    except requests.exceptions.Timeout:
        print(f"\n⏱️ TIMEOUT: Requisição demorou mais de 35s!")
    except Exception as e:
        print(f"\n❌ Erro: {e}")

def test_read_tag():
    """Lê o valor atual da tag"""
    print("\n" + "=" * 60)
    print("🔍 Teste: Leitura da tag")
    print("=" * 60)
    
    tag_name = "XLCLASS_DB1_PRINCIPAL_COMANDO_STATUS_03"
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/read_tags",
            params={"names": tag_name},
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') and tag_name in data.get('values', {}):
                value = data['values'][tag_name]
                print(f"\n✅ Tag {tag_name}:")
                print(f"   Valor: {value} (0x{value:04X})")
                
                # Lista bits setados
                bits_on = [i for i in range(16) if ((value >> i) & 1) == 1]
                print(f"   Bits ligados: {bits_on}")
            else:
                print(f"\n⚠️ Tag não encontrada na resposta")
        else:
            print(f"\n❌ Erro HTTP {response.status_code}")
            
    except Exception as e:
        print(f"\n❌ Erro: {e}")

if __name__ == "__main__":
    print("\n🚀 Iniciando testes do sistema de fila de escrita\n")
    
    # Lê valor atual
    test_read_tag()
    
    # Aguarda um pouco
    print("\n⏳ Aguardando 2s...")
    time.sleep(2)
    
    # Testa escrita
    test_write_bit()
    
    # Aguarda processar
    print("\n⏳ Aguardando 3s para PLC processar...")
    time.sleep(3)
    
    # Lê novamente para confirmar
    test_read_tag()
    
    print("\n✨ Testes concluídos!")

