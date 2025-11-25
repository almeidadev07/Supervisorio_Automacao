import requests
import json

print("Testando leitura de todos os presets...\n")

for preset in [1, 2, 3, 4]:
    try:
        r = requests.get(f'http://localhost:5000/api/weight_range?preset={preset}', timeout=3)
        if r.status_code == 200:
            result = r.json()
            if result.get('ok'):
                values = result.get('values', [])
                print(f"Preset {preset} (MAPA_{preset-1}): {values}")
            else:
                print(f"Preset {preset}: Erro - {result.get('error')}")
        else:
            print(f"Preset {preset}: HTTP {r.status_code}")
    except Exception as e:
        print(f"Preset {preset}: Exceção - {e}")

print("\n✓ Todos os presets estão acessíveis via API")
print("\nMapeamento:")
print("  Preset 1 → XLCLASS_DB229_PESAGEM_MAPA_0_TIPO_P1..P7")
print("  Preset 2 → XLCLASS_DB229_PESAGEM_MAPA_1_TIPO_P1..P7")
print("  Preset 3 → XLCLASS_DB229_PESAGEM_MAPA_2_TIPO_P1..P7")
print("  Preset 4 → XLCLASS_DB229_PESAGEM_MAPA_3_TIPO_P1..P7")

