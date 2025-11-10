import json

# Carrega comm_map
with open('config/comm_map/700CX.json', encoding='utf-8') as f:
    data = json.load(f)

# Velocidades
print("=" * 70)
print("TAGS DE VELOCIDADE")
print("=" * 70)
vel_tags = [t for t in data if 'VEL' in t.get('name', '').upper()]
for t in vel_tags[:20]:
    print(f"{t['name']}: DB{t.get('db')}.{t.get('offset')} ({t.get('type')})")

# Alarmes
print("\n" + "=" * 70)
print("TAGS DE ALARMES")
print("=" * 70)
alarm_tags = [t for t in data if 'ALARM' in t.get('name', '').upper()]
for t in alarm_tags[:20]:
    print(f"{t['name']}: DB{t.get('db')}.{t.get('offset')}.{t.get('bit', '')} ({t.get('type')})")

