import json

# Read the raw file content
with open('alarmes/tipos_overrides.json', 'r', encoding='utf-8') as f:
    content = f.read()

# Count occurrences of specific duplicate patterns I saw in the file
duplicate_patterns = [
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB01',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB02', 
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB03',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB04',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB05',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB06',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB07',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB08',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB09',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB10',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB11',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB12',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB13',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB14',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB15',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB16',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB17',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB18',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB19',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB20',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB21',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB22',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB23',
    'XLCLASS_DB04_PRINCIPAL_EMERG_EMB24'
]

print('Checking for duplicate patterns:')
duplicates_found = 0
for pattern in duplicate_patterns:
    count = content.count('"' + pattern + '"')
    if count > 1:
        print(f'{pattern}: {count} occurrences')
        duplicates_found += count - 1

print(f'\nTotal duplicate entries found: {duplicates_found}')

# Now let's parse the JSON and remove duplicates
data = json.loads(content)

# Track seen keys and create new dict without duplicates
seen_keys = set()
cleaned_data = {}
duplicates_removed = 0

for key, value in data.items():
    if key not in seen_keys:
        cleaned_data[key] = value
        seen_keys.add(key)
    else:
        duplicates_removed += 1
        print(f'Removed duplicate: {key}')

print(f'\nDuplicates removed during JSON processing: {duplicates_removed}')
print(f'Original entries: {len(data)}')
print(f'Cleaned entries: {len(cleaned_data)}')

# Write the cleaned data back to file
with open('alarmes/tipos_overrides.json', 'w', encoding='utf-8') as f:
    json.dump(cleaned_data, f, indent=2, ensure_ascii=False)

print('File cleaned and saved successfully!')

