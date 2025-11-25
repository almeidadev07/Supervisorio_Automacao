import requests
import json
import time

print("Testando escrita em todos os presets...\n")

for preset in [1, 2, 3, 4]:
    # Valores de teste diferentes para cada preset
    values = [float(preset * 10 + i) for i in range(1, 8)]
    
    payload = {
        'preset': preset,
        'values': values
    }
    
    print(f"Preset {preset}: Escrevendo valores {values}")
    
    try:
        # Escreve
        r = requests.post('http://localhost:5000/api/weight_range', json=payload, timeout=10)
        
        if r.status_code == 200:
            result = r.json()
            if result.get('ok'):
                print(f"  ✓ Escrita OK")
            else:
                print(f"  ✗ Erro: {result.get('error')}")
        else:
            print(f"  ✗ HTTP {r.status_code}: {r.text}")
        
        # Aguarda um pouco
        time.sleep(1)
        
        # Lê de volta
        r2 = requests.get(f'http://localhost:5000/api/weight_range?preset={preset}', timeout=3)
        if r2.status_code == 200:
            result2 = r2.json()
            if result2.get('ok'):
                read_values = result2.get('values', [])
                print(f"  Lido de volta: {read_values}")
                
                # Compara valores (com tolerância para float)
                matches = all(abs(v1 - v2) < 0.1 for v1, v2 in zip(values, read_values))
                if matches:
                    print(f"  ✓ Valores conferem!")
                else:
                    print(f"  ✗ VALORES DIFERENTES!")
            else:
                print(f"  ✗ Erro na leitura: {result2.get('error')}")
    
    except Exception as e:
        print(f"  ✗ Exceção: {e}")
    
    print()

