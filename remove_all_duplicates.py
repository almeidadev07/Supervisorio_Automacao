import json

# Read the file and manually process to remove duplicates
with open('alarmes/tipos_overrides.json', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Process line by line to remove duplicates
seen_keys = set()
cleaned_lines = []
duplicates_removed = 0

for i, line in enumerate(lines):
    if line.strip().startswith('"') and ':' in line and not line.strip().startswith('//'):
        # Extract the key
        key = line.strip().split(':')[0].strip().strip('"')
        
        if key not in seen_keys:
            # First occurrence - keep it
            seen_keys.add(key)
            cleaned_lines.append(line)
        else:
            # Duplicate - skip it
            duplicates_removed += 1
            print(f'Removing duplicate at line {i+1}: {key}')
    else:
        # Not a key line - keep it
        cleaned_lines.append(line)

print(f'\nTotal duplicates removed: {duplicates_removed}')
print(f'Original lines: {len(lines)}')
print(f'Cleaned lines: {len(cleaned_lines)}')

# Write the cleaned content back to file
with open('alarmes/tipos_overrides.json', 'w', encoding='utf-8') as f:
    f.writelines(cleaned_lines)

print('File cleaned and saved successfully!')

# Verify the result
with open('alarmes/tipos_overrides.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f'Final JSON entries: {len(data)}')

