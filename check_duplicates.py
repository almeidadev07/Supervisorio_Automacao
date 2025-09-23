# Read the file and look for duplicate keys manually
with open('alarmes/tipos_overrides.json', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Extract all keys
keys = []
for i, line in enumerate(lines):
    if line.strip().startswith('"') and ':' in line:
        key = line.strip().split(':')[0].strip().strip('"')
        keys.append((i+1, key))

# Find duplicates
seen = {}
duplicates = []
for line_num, key in keys:
    if key in seen:
        duplicates.append((key, seen[key], line_num))
    else:
        seen[key] = line_num

print(f'Total lines: {len(lines)}')
print(f'Total keys found: {len(keys)}')
print(f'Unique keys: {len(seen)}')
print(f'Duplicates found: {len(duplicates)}')

if duplicates:
    print('\nDuplicate entries:')
    for key, first_line, dup_line in duplicates[:10]:  # Show first 10
        print(f'  {key}: first at line {first_line}, duplicate at line {dup_line}')
else:
    print('\nNo duplicates found in the file.')

